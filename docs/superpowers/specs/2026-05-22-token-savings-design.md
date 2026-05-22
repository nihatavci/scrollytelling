# AI Prompt Token Savings — Design Spec

## Problem

`functions/api/generate.js` sends oversized system prompts to CF Workers AI (Llama 3.3 70B). Two specific issues waste tokens on every request:

1. **Improve-mode rules are monolithic.** Lines 668–701 concatenate improve rules for ALL block types into one string. Improving a Hero block still sends 15+ lines of Map2D route editing rules, DataScrolly chart rules, AudioPlayer rules, etc. ~600 tokens of rules where ~50–100 are relevant.

2. **JSON serialization is pretty-printed.** Both `schema.example` and `currentData` use `JSON.stringify(x, null, 2)`, adding whitespace tokens that Llama doesn't need. A Map2D example goes from ~200 tokens (compact) to ~500 tokens (pretty).

Combined: **30–45% token reduction on improve requests, 15–25% on create requests.**

## Change A: Targeted Improve Rules

### Current State

`buildSystemPrompt()` for improve mode appends a single block of text (lines 668–701) containing rules for every block type:

```
- Keep all existing fields unless the user explicitly asks to change them
- If the user says "make images smaller" or "smaller layout" → change layout to "editorial"
- For Scrolly blocks: if they say "remove images" → clear imageSrc fields...
- For Scrolly blocks: "make images shorter"...
- For Map2D blocks: "zoom in" → increase initialZoom...
- For Map2D blocks: "focus on [city]"...
- For Map2D blocks: "add marker at [place]"...
- For DataScrolly blocks: "more data"...
- For FullscreenImage blocks: "darker overlay"...
- For AudioPlayer blocks: "change color"...
- Universal: every block supports "bgOpacity"...
- ALWAYS return the complete data object with ALL fields
```

### Target State

An `IMPROVE_RULES` object indexed by block type. Each type lists only its own rules. Universal rules apply to all types.

```javascript
const IMPROVE_RULES = {
  _universal: [
    'Keep all existing fields unless the user explicitly asks to change them',
    'Every block supports "bgOpacity" (number 0-1) to control page background image visibility. "show background" → bgOpacity 0.3. "hide background" → bgOpacity 0. "strong background" → bgOpacity 0.5-0.8.',
    'ALWAYS return the complete data object with ALL fields, not just the changed ones',
  ],
  ImageGrid: [
    '"make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)',
    '"bigger" or "wider" or "full width" → layout "bleed" or "full"',
    '"2 grid" or "3 columns" etc → set layout field accordingly',
    '"remove image 2" or "swap images" → modify images array',
    '"add caption" or "change credit" → update those fields',
    '"make the image half size" → layout "editorial" for narrow',
  ],
  Scrolly: [
    '"remove images" → clear imageSrc fields. "add image to step 3" → set imageSrc on that step',
    '"make images smaller" → imageSize "small" (35%). "bigger" → "large" (65%). "medium" → "medium" (50%). "full width" → "full". Or exact values like "40%".',
    '"make images shorter" or "less tall" → imageHeight "60vh" or "70vh". "taller" → "100vh".',
    '"round corners" → imageRadius "12px" or "24px". "sharp" or "no radius" → "0".',
    '"narrower layout" → reduce maxWidth (e.g. "1100px"). "wider" → increase (e.g. "1600px").',
  ],
  Map2D: [
    '"zoom in" → increase initialZoom or step mapState.zoom by 2. "zoom out" → decrease by 2.',
    '"focus on [city]" → change initialCenter to that city\'s real coordinates and set initialZoom to 13.',
    '"add marker at [place]" → add to markers array with real lat/lng, unique id, and add id to relevant step\'s showMarkers.',
    '"draw route from A to B" → add route. CRITICAL: first point = origin marker [lat,lng], last point = destination marker [lat,lng]. Add 5-8 intermediate waypoints following the real geographic path. Route weight should be 2.',
    '"dark map" → tileStyle "dark". "watercolor" → "watercolor". "b&w" → "toner". "clean" → "toner-lite".',
    '"behind layout" or "fullscreen" → layout "behind". "side layout" → "side".',
    'When editing routes, ALWAYS verify route start/end points match the connected markers\' exact lat/lng coordinates.',
    '"thinner lines" → reduce route weight (min 1). "thicker" → increase (max 4). "dashed" → dashArray "8,5".',
  ],
  DataScrolly: [
    '"more data" or "add data points" → add more entries to chartSpec.data (minimum 6 total, aim for 8-12).',
    '"better data" or "use real data" → replace generic values with realistic, specific numbers. Update source field.',
    '"add step" → add a new step with unique vizState (highlight a different data point, morph chart type, or add filter).',
    '"bar chart" → chartSpec.kind "bar" and reset chartType overrides. "line chart" → "line". "area" → "area". "scatter" → "scatter".',
    '"fix labels" or "better labels" → update xLabel and yLabel to be descriptive with units in parentheses.',
    '"add source" → set a plausible academic/institutional source citation.',
    'ALWAYS ensure every highlightX in steps matches an xField value in the data, and every number mentioned in step body text exists in the data.',
  ],
  FullscreenImage: [
    '"darker overlay" or "darker" → increase scrimOpacity. "lighter" → decrease.',
    '"center text" → overlayPosition "center". "top-left" → overlayPosition "top-left".',
    '"add kicker" → set kicker field. "no animation" → kenBurns false.',
    '"scroll indicator" or "scroll cue" → scrollCue true. "no scrim" → scrimOpacity 0.',
  ],
  AudioPlayer: [
    '"change color" → update accentColor and waveformColor.',
    '"add transcript" → set transcript text. "shorter description" → trim description.',
    '"remove cover" → clear coverSrc. "add cover" → set coverSrc.',
  ],
};
```

**Usage in `buildSystemPrompt`:**

```javascript
// Replace the monolithic improve rules string with:
const typeRules = IMPROVE_RULES[type] || [];
const allRules = [...IMPROVE_RULES._universal, ...typeRules];
const improveSection = `You are IMPROVING an existing block. The user's current data is provided — apply their requested changes and return the COMPLETE updated data object.

IMPROVE RULES:
${allRules.map(r => `- ${r}`).join('\n')}`;
```

### Token Savings Estimate

| Block type | Current improve rules | After filtering | Saved |
|---|---|---|---|
| Hero (no specific rules) | ~600 tokens | ~80 tokens (universal only) | ~520 |
| Map2D | ~600 tokens | ~250 tokens | ~350 |
| DataScrolly | ~600 tokens | ~220 tokens | ~380 |
| Scrolly | ~600 tokens | ~200 tokens | ~400 |
| Editorial (no specific rules) | ~600 tokens | ~80 tokens | ~520 |

Average saving per improve request: **~400 tokens.**

## Change B: Compact JSON Serialization

### Current State

Two locations use pretty-printed JSON:

1. **Schema example** (line 666): `JSON.stringify(schema.example, null, 2)`
2. **currentData in improve mode** (line 893): `JSON.stringify(currentData, null, 2)`

### Target State

Replace with compact serialization:

1. `JSON.stringify(schema.example)` — no indentation
2. `JSON.stringify(currentData)` — no indentation

### Token Savings Estimate

Pretty-printing adds ~40–60% more whitespace tokens for nested JSON objects.

| Component | Pretty tokens (est.) | Compact tokens (est.) | Saved |
|---|---|---|---|
| Map2D example | ~500 | ~300 | ~200 |
| DataScrolly example | ~350 | ~200 | ~150 |
| Scrolly example | ~250 | ~150 | ~100 |
| Simple block example | ~80 | ~50 | ~30 |
| currentData (avg improve) | ~300 | ~180 | ~120 |

Average saving per request: **~100–200 tokens** (schema example) + **~120 tokens** (currentData, improve only).

## Combined Impact

| Request type | Before (est.) | After (est.) | Reduction |
|---|---|---|---|
| Create (simple block) | ~900 tokens | ~750 tokens | ~17% |
| Create (complex block) | ~1800 tokens | ~1500 tokens | ~17% |
| Improve (simple block) | ~1800 tokens | ~1050 tokens | ~42% |
| Improve (complex block) | ~2800 tokens | ~2000 tokens | ~29% |

## Files Changed

| File | Change |
|---|---|
| `functions/api/generate.js` | Add `IMPROVE_RULES` object, update `buildSystemPrompt` to use it, compact JSON serialization |

One file. No new files. No new dependencies. No API changes. No behavior changes visible to the end user.

## Verification

1. **Functional test:** Generate a block of each type (create + improve modes). Verify output quality is unchanged.
2. **Token count comparison:** Log system prompt length before/after for each block type. Confirm savings match estimates.
3. **Regression check:** The improve rules for each type must be complete — no rule accidentally dropped during the split.

## Out of Scope

- Condensing VOICE_GUIDE prose (potential future optimization)
- Schema description rewrites (risk quality regression)
- Architectural changes (caching, two-stage generation)
- Response token limits (already set appropriately: 4096/6144)
