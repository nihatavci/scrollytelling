# Admin Editor Redesign — Design Spec

**Date:** 2026-05-28  
**Status:** Approved for implementation

---

## Goal

Replace the current form-dump block editor with a tabbed, AI-native editor where:

1. Block names are edited inline by clicking them (no dialog, no pencil button)
2. Every setting is a visual chip / picker — zero raw CSS inputs
3. AI opens every block, analyses its content and images, pre-selects the right settings, and shows its reasoning
4. Applies to all block types — not just Immersive

---

## Architecture

### What changes

| File | What changes |
|---|---|
| `admin/ui/app.js` | `renderBlockList` (inline name edit), `renderEditor` (full rewrite → tabs), `renderField` (replaced by typed renderers), new `analyseBlockWithAI()` function, `FIELD_PRESETS` map |
| `admin/ui/styles.css` | All new editor styles: tab bar, chips, height cards, scrim swatches, position grid, filmstrip, AI bar |
| `admin/ui/index.html` + `admin/index.html` | Version bump only |

### What does NOT change

- The data model (blocks store raw values: `"100vh"`, `0.65`, `"bottom-left"`)
- The Supabase client, save/publish flow, preview frame
- The block creation modal (Add block)
- `render.js` (public renderer) — this redesign is admin-only

---

## 1. Inline Block Name Editing

**Current:** Block header has a `✎` pencil button that opens `prompt()`.

**New behaviour:**

- The block name `<span>` becomes `contenteditable` when the block is active (open accordion)
- Clicking the name puts focus on it — cursor appears, no extra click needed
- `Enter` or `blur` saves to `block.data._label`, calls `setDirty(true)` and `renderBlockList()`
- `Escape` cancels (restores previous value)
- Inactive blocks show the name as plain text (not editable, can't accidentally edit while scrolling)
- The `✎` button is removed entirely
- CSS: `border-bottom: 1.5px solid #000` on focus only; no outline

---

## 2. Tab Structure

Every block editor replaces the current grouped accordion with **4 tabs**:

```
[ Media ]  [ Settings ]  [ Content ]  [ ✦ AI ]
```

Tab visibility rules (YAGNI — only show tabs that have fields):
- **Media** — shown if block schema has any `group: 'media'` fields
- **Content** — shown if block schema has any `group: 'content'` fields
- **Settings** — shown if block schema has any `group: 'layout'`, `'style'`, `'meta'`, or `'advanced'` fields
- **✦ AI** — always shown

Default open tab:
- If block has media fields → open **Media**
- Else if block has content fields → open **Content**
- Else → **Settings**

After AI analysis completes → switch to **Settings** tab (where AI picks are most visible).

Each tab body starts with the **AI command bar** (see §4).

---

## 3. Visual Field Renderers (zero raw inputs)

The existing `renderField()` switch is extended with new renderer types. Raw `kind` values in BLOCK_SCHEMAS are supplemented by a `FIELD_PRESETS` map that knows how to render them visually.

### 3a. Chip selector (`kind: 'select'`)

Replaces every `<select>` dropdown. Options become horizontal pill chips.

```
[ Full screen ]  [ ¾ screen ]  [ Half ]
```

Selected chip: `background:#000; color:#fff`. AI-selected chip: `background:#6639ba; color:#fff; ::before content:'✦ '`.

If >5 options, overflow into a second row (wrap).

**Preset label maps** — translate raw values to human labels:

```javascript
const FIELD_PRESETS = {
  height: {
    '100vh': 'Full screen',
    '75vh':  '¾ screen',
    '50vh':  'Half',
  },
  overlayPosition: {
    'bottom-left':  'bottom-left',   // shown in 3×3 grid (see §3c)
    'bottom-right': 'bottom-right',
    'center':       'center',
    'top-left':     'top-left',
  },
  scrimOpacity: {
    0:    'None',
    0.25: 'Light',
    0.45: 'Medium',
    0.65: 'Heavy',
    0.85: 'Dark',
  },
  mediaType: {
    'image': 'Image',
    'video': 'Video',
    'loop':  'Loop',
  },
  slideShuffle: {
    'yes': 'Shuffle',
    'no':  'In order',
  },
};
```

For fields with a `FIELD_PRESETS` entry, chips show human labels; the raw value is still stored in `block.data`.

### 3b. Height picker (`key: 'height'`)

3 visual cards showing proportional black bars:

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ ████████ │  │ ██████   │  │ ████     │
│          │  │ ░░░░░░   │  │ ░░░░░░   │
│Full screen│  │ ¾ screen │  │   Half   │
└──────────┘  └──────────┘  └──────────┘
```

Selected card: `border: 2px solid #000`. AI-selected: `border: 2px solid #6639ba`.

### 3c. Position picker (`key: 'overlayPosition'`)

3×3 grid of cells. Each cell shows a small text-position indicator (a short coloured bar at the position the text would appear). Selected cell is filled black. AI-selected cell is filled `#6639ba`.

Maps to: `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left` ✓, `bottom-center`, `bottom-right`.

Note: current schema only has 4 options — the grid will still show 9 cells but only 4 are selectable (others are visually muted). This future-proofs the control.

### 3d. Scrim picker (`key: 'scrimOpacity'`)

5 gradient swatches (None → Dark), each showing a real gradient preview from transparent to the opacity value. Selected: `border: 2px solid #6639ba`.

### 3e. Interval chips (`key: 'slideInterval'`)

Preset chips: `3s  4s  6s  8s  10s  15s  custom…`

`custom…` opens an inline text input. Raw numeric value stored as seconds.

### 3f. Filmstrip (`key: 'mediaSrc'` + `mediaSrc2/3/4`)

4 thumbnail slots in a 2×2 or 1×4 row. Clicking a slot selects it (shows upload/browse for that slot). Empty slots show a `+` dashed box. Active/first slide gets a border ring.

### 3g. Text / textarea fields (unchanged)

`kind: 'text'` and `kind: 'textarea'` render as borderless inline inputs with a bottom border on focus only (Notion-style). Cleaner than full-border inputs.

### 3h. Context-aware field visibility

Fields are only rendered when relevant:

| Field | Hidden when |
|---|---|
| `slideInterval`, `slideFadeSec`, `slideShuffle` | `mediaSrc2` is empty |
| `videoSrc`, `posterSrc` | `mediaType` is not `video` or `loop` |

This is implemented as a `shouldShowField(field, blockData)` predicate called before rendering each field.

---

## 4. AI Command Bar

Every tab body starts with the AI command bar:

```
┌─────────────────────────────────────────┐
│ ✦  Describe what you want…              │
│    [make it cinematic] [slower] [center] │
└─────────────────────────────────────────┘
```

- Text input + quick-prompt chips below
- Chips are tab-specific (Media tab: `"suggest more images"`, `"darker mood"`; Settings tab: `"more cinematic"`, `"text centered"`; Content tab: `"write title from article"`, `"make it punchier"`)
- Submitting the input (Enter or chip click) calls `analyseBlockWithAI(block, prompt)` and applies results

---

## 5. AI Analysis (`analyseBlockWithAI`)

### When triggered

- **Automatically** when a block is first opened (selected), if `block.data._aiAnalysed !== true`
- **Manually** via the command bar or ✦ AI tab
- Result cached in `block.data._aiPicks` and `block.data._aiReasoning` — not sent to DB (ephemeral per session)

### What it sends to Claude

```json
{
  "blockType": "FullBleed",
  "blockName": "Hero Moment",
  "fields": {
    "mediaSrc": "images/hero.jpg",
    "mediaSrc2": "images/night.jpg",
    "title": "The Story That Changed Everything",
    "height": "100vh",
    "overlayPosition": "bottom-left",
    "scrimOpacity": 0.4
  },
  "schema": ["height options: 100vh/75vh/50vh", "overlayPosition options: bottom-left/bottom-right/center/top-left", "scrimOpacity range: 0-1"],
  "userPrompt": ""
}
```

### What Claude returns (JSON)

```json
{
  "picks": {
    "height": "100vh",
    "overlayPosition": "bottom-left",
    "scrimOpacity": 0.65,
    "slideInterval": "6"
  },
  "reasoning": "Dark images need heavy scrim to keep text readable. Full-screen height is most dramatic for an opening scene. Bottom-left text position is the cinematic standard.",
  "suggestions": [
    "Your title could be stronger — try \"The Moment Everything Changed\"",
    "Add a 4th image — this sequence benefits from variety",
    "Speed up to 4s — dark images feel more tense at a faster interval"
  ]
}
```

### How picks are applied

- `block.data._aiPicks = picks` (stored ephemerally, not saved to DB)
- `block.data._aiReasoning = reasoning`
- `block.data._aiSuggestions = suggestions`
- UI re-renders: fields where `block.data[key] === picks[key]` show the `✦` AI-selected style
- Reasoning banner shown at top of Settings tab
- Suggestions shown in ✦ AI tab with Apply buttons

### Applying a suggestion

Each suggestion in the AI tab has an **Apply** button. Clicking it calls `analyseBlockWithAI(block, suggestion)` to re-run with that as the user prompt, OR for structural suggestions (like "add 4th image") opens the relevant tab directly.

### Fallback

If Claude API call fails, the UI renders normally with no AI highlights. No error shown to user (silent fail — this is enhancement, not core).

---

## 6. ✦ AI Tab

Dedicated tab showing:

1. **Reasoning banner** — full text of `_aiReasoning`
2. **Suggestion cards** — one card per suggestion, with an Apply button
3. **Re-analyse button** — "Re-analyse" triggers fresh `analyseBlockWithAI()` call

---

## 7. Action Bar

Replaces current `block-actions` toolbar. Sits at the bottom of the open block, outside the tab body:

```
[ Duplicate ]  ─────────────────  [ Delete ]
```

Two-click confirm pattern on Delete (unchanged from current).

---

## 8. Styling Notes

All new CSS goes into `styles.css`. Key new classes:

```
.tab-bar          horizontal tab row
.tab              individual tab
.tab.active       selected tab
.tab.ai-tab       ✦ AI tab (purple)
.tab-body         tab content panel
.chip             pill chip option
.chip.selected    user-selected chip (black)
.chip.ai-pick     AI-selected chip (purple, ✦ prefix)
.height-picker    3-card height grid
.height-opt       individual height card
.scrim-picker     5-swatch scrim row
.scrim-opt        individual scrim swatch
.pos-grid         3×3 position grid
.pos-cell         individual grid cell
.filmstrip        image slot row
.film-slot        individual image slot
.ai-bar           command bar container
.ai-chip          command bar prompt chip
.ai-reasoning     AI reasoning banner (left purple border)
.inline-field     borderless Notion-style text input
```

Existing `.editor-group`, `.editor-group-header`, `.editor-group-body` classes are removed (replaced by tabs).

---

## 9. Claude API call — implementation detail

The existing codebase has `openClaudeModal()` for user-triggered AI. The new `analyseBlockWithAI()` is a separate function that calls `SB.generate({ type, prompt, mode: 'analyse-settings', ... })` — the same Cloudflare Worker endpoint (`/api/generate`) used by all other AI features. It does NOT open a modal. It runs silently in the background and updates the block's ephemeral AI state, then calls `renderEditor()` to re-render with highlights.

The Cloudflare Worker (`functions/api/generate.js`) needs a new `mode: 'analyse-settings'` branch that returns structured JSON (picks + reasoning + suggestions) instead of block data.

System prompt:

```
You are a CMS editor assistant. Given a content block's type, field values, and available options, return JSON with three keys:
- "picks": an object mapping field keys to the best value for each setting
- "reasoning": 1-2 sentence explanation of the key choices (shown to the editor)
- "suggestions": array of 2-3 specific, actionable improvement suggestions (shown as cards with Apply buttons)

Be opinionated. Always pick something. Return only valid JSON.
```

---

## Scope / YAGNI

**In scope:**
- All items above
- Works on all existing block types (chips generated from schema options)
- Mobile-responsive (tabs scroll horizontally on small screens)

**Out of scope:**
- Drag reorder within filmstrip (use existing block-level drag)
- Undo/redo system
- AI image search / generation (suggest URLs only)
- Per-block AI memory across sessions (ephemeral only)
