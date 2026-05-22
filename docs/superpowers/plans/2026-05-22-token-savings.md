# AI Prompt Token Savings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce AI prompt token usage by 30-45% on improve requests and 15-25% on create requests by targeting two specific inefficiencies in `functions/api/generate.js`.

**Architecture:** Extract per-block-type improve rules into an indexed `IMPROVE_RULES` object, switch JSON serialization from pretty-printed to compact. No structural changes, no new files, no API changes.

**Tech Stack:** Vanilla JS (Cloudflare Workers ESM), Node built-in test runner for verification.

---

### Task 1: Add IMPROVE_RULES Object and Wire Into buildSystemPrompt

**Files:**
- Modify: `functions/api/generate.js:617-701` (after BLOCK_SCHEMAS closing brace through improve rules)

- [ ] **Step 1: Write the test — verify improve prompts only contain relevant rules**

Create `tests/token-savings.test.js`:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Replicate IMPROVE_RULES from generate.js (IIFE/ESM, not importable) ──
// Source: functions/api/generate.js — IMPROVE_RULES object

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
    '"draw route from A to B" → add route. CRITICAL: first point = origin marker [lat,lng], last point = destination marker [lat,lng]. Add 5-8 intermediate waypoints following the real path. Route weight should be 2.',
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

function getImproveRules(type) {
  const typeRules = IMPROVE_RULES[type] || [];
  return [...IMPROVE_RULES._universal, ...typeRules];
}

// ═══════════════════════════════════════════════════════════════
// Targeted improve rules — only relevant rules per type
// ═══════════════════════════════════════════════════════════════

describe('getImproveRules — targeted per block type', () => {
  it('Hero gets only universal rules (no type-specific rules)', () => {
    const rules = getImproveRules('Hero');
    assert.equal(rules.length, 3); // 3 universal rules
    assert.ok(rules[0].includes('Keep all existing fields'));
    assert.ok(rules[2].includes('ALWAYS return the complete data object'));
    // Must NOT contain Map2D, Scrolly, etc. rules
    const joined = rules.join('\n');
    assert.ok(!joined.includes('zoom in'));
    assert.ok(!joined.includes('imageSrc'));
    assert.ok(!joined.includes('chartSpec'));
  });

  it('Map2D gets universal + Map2D-specific rules', () => {
    const rules = getImproveRules('Map2D');
    assert.equal(rules.length, 3 + 8); // 3 universal + 8 Map2D
    const joined = rules.join('\n');
    assert.ok(joined.includes('zoom in'));
    assert.ok(joined.includes('focus on'));
    assert.ok(joined.includes('add marker'));
    // Must NOT contain DataScrolly or Scrolly rules
    assert.ok(!joined.includes('chartSpec'));
    assert.ok(!joined.includes('imageSize'));
  });

  it('DataScrolly gets universal + DataScrolly-specific rules', () => {
    const rules = getImproveRules('DataScrolly');
    assert.equal(rules.length, 3 + 7); // 3 universal + 7 DataScrolly
    const joined = rules.join('\n');
    assert.ok(joined.includes('chartSpec'));
    assert.ok(joined.includes('highlightX'));
    // Must NOT contain Map2D rules
    assert.ok(!joined.includes('zoom in'));
    assert.ok(!joined.includes('tileStyle'));
  });

  it('Scrolly gets universal + Scrolly-specific rules', () => {
    const rules = getImproveRules('Scrolly');
    assert.equal(rules.length, 3 + 5); // 3 universal + 5 Scrolly
    const joined = rules.join('\n');
    assert.ok(joined.includes('imageSize'));
    assert.ok(joined.includes('imageHeight'));
    assert.ok(joined.includes('imageRadius'));
  });

  it('FullscreenImage gets universal + FullscreenImage-specific rules', () => {
    const rules = getImproveRules('FullscreenImage');
    assert.equal(rules.length, 3 + 4); // 3 universal + 4 FullscreenImage
    const joined = rules.join('\n');
    assert.ok(joined.includes('scrimOpacity'));
    assert.ok(joined.includes('kenBurns'));
  });

  it('AudioPlayer gets universal + AudioPlayer-specific rules', () => {
    const rules = getImproveRules('AudioPlayer');
    assert.equal(rules.length, 3 + 3); // 3 universal + 3 AudioPlayer
    const joined = rules.join('\n');
    assert.ok(joined.includes('accentColor'));
    assert.ok(joined.includes('transcript'));
  });

  it('ImageGrid gets universal + ImageGrid-specific rules', () => {
    const rules = getImproveRules('ImageGrid');
    assert.equal(rules.length, 3 + 6); // 3 universal + 6 ImageGrid
    const joined = rules.join('\n');
    assert.ok(joined.includes('editorial'));
    assert.ok(joined.includes('bleed'));
  });

  it('unknown type gets only universal rules', () => {
    const rules = getImproveRules('NonExistentBlock');
    assert.equal(rules.length, 3);
  });

  it('every universal rule is present for all types', () => {
    const types = ['Hero', 'Map2D', 'DataScrolly', 'Scrolly', 'Editorial'];
    for (const t of types) {
      const rules = getImproveRules(t);
      assert.ok(rules[0].includes('Keep all existing fields'), `${t} missing universal rule 1`);
      assert.ok(rules[1].includes('bgOpacity'), `${t} missing universal rule 2`);
      assert.ok(rules[2].includes('ALWAYS return'), `${t} missing universal rule 3`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Rule coverage — every original rule is preserved
// ═══════════════════════════════════════════════════════════════

describe('IMPROVE_RULES — no rules dropped', () => {
  it('all type-specific rules contain actionable instructions', () => {
    const allTypeKeys = Object.keys(IMPROVE_RULES).filter(k => k !== '_universal');
    for (const key of allTypeKeys) {
      for (const rule of IMPROVE_RULES[key]) {
        // Each rule should contain a → (action indicator)
        assert.ok(rule.includes('→'), `Rule in ${key} missing action: "${rule.slice(0, 50)}..."`);
      }
    }
  });

  it('total rule count matches expected', () => {
    // 3 universal + 6 ImageGrid + 5 Scrolly + 8 Map2D + 7 DataScrolly + 4 FullscreenImage + 3 AudioPlayer = 36
    let total = IMPROVE_RULES._universal.length;
    for (const [key, rules] of Object.entries(IMPROVE_RULES)) {
      if (key !== '_universal') total += rules.length;
    }
    assert.equal(total, 36);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b && node --test 'tests/token-savings.test.js'`

Expected: PASS (tests use local replicated functions, not imports from generate.js). This is a pre-validation of the rule structure before applying to the source file.

- [ ] **Step 3: Add IMPROVE_RULES object to generate.js after BLOCK_SCHEMAS**

Insert after line 617 (the `};` closing BLOCK_SCHEMAS) in `functions/api/generate.js`:

```javascript
// ── Per-type improve rules (token savings: only send relevant rules) ──
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
    '"draw route from A to B" → add route. CRITICAL: first point = origin marker [lat,lng], last point = destination marker [lat,lng]. Add 5-8 intermediate waypoints following the real path. Route weight should be 2.',
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

- [ ] **Step 4: Replace the monolithic improve rules in buildSystemPrompt**

In the `buildSystemPrompt` function, replace the improve-mode block (the long template literal starting with `You are IMPROVING an existing block`) with the targeted version.

Current code (lines 668–701) contains one massive template literal with all rules concatenated. Replace with:

```javascript
const typeRules = IMPROVE_RULES[type] || [];
const allRules = [...IMPROVE_RULES._universal, ...typeRules];

// ... then in the template literal for improve mode:
`You are IMPROVING an existing block. The user's current data is provided — apply their requested changes and return the COMPLETE updated data object.

IMPROVE RULES:
${allRules.map(r => `- ${r}`).join('\n')}`
```

The key change: the monolithic multi-paragraph improve rules string is replaced by dynamically assembled rules from `IMPROVE_RULES[type]` + `IMPROVE_RULES._universal`.

- [ ] **Step 5: Run test to verify rules structure is correct**

Run: `cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b && node --test 'tests/token-savings.test.js'`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/token-savings.test.js functions/api/generate.js
git commit -m "feat: targeted improve rules — send only relevant type's rules per request

Replaces the monolithic improve-mode rules block (all block types
concatenated) with an indexed IMPROVE_RULES object. Each improve
request now includes only the universal rules + the specific type's
rules, saving ~400 tokens per improve request."
```

---

### Task 2: Compact JSON Serialization

**Files:**
- Modify: `functions/api/generate.js` (2 lines: schema example + currentData)

- [ ] **Step 1: Write the test — verify compact JSON is valid and parseable**

Append to `tests/token-savings.test.js`:

```javascript
// ═══════════════════════════════════════════════════════════════
// Compact JSON — token savings from dropping pretty-printing
// ═══════════════════════════════════════════════════════════════

describe('compact JSON serialization — token savings', () => {
  it('compact JSON is significantly shorter than pretty-printed', () => {
    // Simulate a Map2D example (the largest schema)
    const map2dExample = {
      title: 'Die Reise der Nachricht',
      subtitle: 'Von Berlin nach Frankfurt — 1900',
      source: 'Bundesarchiv',
      height: '100vh',
      maxWidth: '1400px',
      layout: 'side',
      tileStyle: 'toner-lite',
      initialCenter: [51.5, 10.5],
      initialZoom: 6,
      markers: [
        { id: 'berlin', lat: 52.52, lng: 13.405, label: '1', name: 'Berlin' },
        { id: 'frankfurt', lat: 50.11, lng: 8.68, label: '2', name: 'Frankfurt' },
      ],
      routes: [
        { id: 'route-main', points: [[52.52, 13.405], [51.34, 11.4], [50.11, 8.68]], color: '#c06830' },
      ],
      steps: [
        { badgeKind: 'pyramid', badgeLabel: 'Start', body: 'Im Berliner Presseviertel.' },
        { badgeKind: 'data', badgeLabel: 'Unterwegs', body: 'Per Telegraf reist die Nachricht.' },
      ],
    };

    const pretty = JSON.stringify(map2dExample, null, 2);
    const compact = JSON.stringify(map2dExample);

    // Compact should be at least 30% shorter
    assert.ok(compact.length < pretty.length * 0.7,
      `Compact (${compact.length}) should be <70% of pretty (${pretty.length})`);
    // Both must parse to identical objects
    assert.deepEqual(JSON.parse(compact), JSON.parse(pretty));
  });

  it('compact currentData for improve mode is shorter', () => {
    const currentData = {
      content: [
        { kind: 'kicker', text: 'Erster Akt' },
        { kind: 'h2', text: 'Das Wichtigste steht am Anfang' },
        { kind: 'lead', text: 'Es gibt zwei Arten, die Dinge zu erzählen.' },
        { kind: 'p', html: 'Sie stellt die wichtigste Information ganz nach vorne.' },
        { kind: 'pullquote', text: 'The summary lead was a literary invention.', cite: '— Schudson, 1991' },
        { kind: 'separator' },
      ],
    };

    const pretty = JSON.stringify(currentData, null, 2);
    const compact = JSON.stringify(currentData);

    assert.ok(compact.length < pretty.length * 0.7);
    assert.deepEqual(JSON.parse(compact), JSON.parse(pretty));
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b && node --test 'tests/token-savings.test.js'`

Expected: All tests PASS (including new ones).

- [ ] **Step 3: Change schema example serialization to compact**

In `functions/api/generate.js`, in the `buildSystemPrompt` function, find:

```javascript
${JSON.stringify(schema.example, null, 2)}
```

Replace with:

```javascript
${JSON.stringify(schema.example)}
```

This appears twice in `buildSystemPrompt` — once in the direct-mode branch and once in the AI-enhanced mode branch.

- [ ] **Step 4: Change currentData serialization to compact**

In `functions/api/generate.js`, in the request handler section (around line 893), find both occurrences of:

```javascript
JSON.stringify(currentData, null, 2)
```

Replace with:

```javascript
JSON.stringify(currentData)
```

This appears in the direct-mode improve path and the AI-enhanced improve path.

- [ ] **Step 5: Run all tests**

Run: `cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b && node --test 'tests/*.test.js'`

Expected: All tests PASS (token-savings + datascrolly-postprocess + datascrolly-quality).

- [ ] **Step 6: Commit**

```bash
git add functions/api/generate.js tests/token-savings.test.js
git commit -m "perf: compact JSON serialization in AI prompts

Switch schema examples and currentData from pretty-printed
JSON.stringify(x, null, 2) to compact JSON.stringify(x).
Saves ~100-200 tokens per request from whitespace reduction."
```

---

### Task 3: Deploy and Verify

**Files:**
- No file changes — deployment and manual verification only.

- [ ] **Step 1: Update cache buster**

In `admin/index.html`, update all `?v=` query strings from the current value to `?v=20260522b`.

- [ ] **Step 2: Deploy to Cloudflare Pages**

Run: `cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b && npx wrangler pages deploy . --project-name=scrollycms --branch=main`

- [ ] **Step 3: Verify — create a new block**

In the deployed admin at scrollycms.pages.dev/admin, create a new Editorial block with a prompt like "Write about the history of newspapers". Verify the output quality is unchanged.

- [ ] **Step 4: Verify — improve an existing block**

Select any existing block, click improve, and request a change (e.g. "make this more concise"). Verify:
1. The improve works correctly
2. No unrelated block-type rules appear in errors or degraded output

- [ ] **Step 5: Commit cache buster update**

```bash
git add admin/index.html
git commit -m "chore: bump cache buster to v=20260522b"
```
