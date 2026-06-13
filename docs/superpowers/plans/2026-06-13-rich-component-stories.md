# Rich-Component Story Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI Full Article Builder generate complex stories that correctly use the rich components — `Map2D`, `DataScrolly`, `Scene3D`, `AudioPlayer` — and harden their output through a recursive generate→render→fix loop until each clears a per-type quality bar.

**Architecture:** Extend the shared engine from the prior plan (`functions/api/_shared/*`). Add the rich types to the planner menu (with gating + grounding rules), enrich/add their schemas, add structural validators + media injection + quality checks. A key-gated `/api/article-test` endpoint runs the real pipeline server-side so the loop is self-serve; a dev render harness shows results for screenshot inspection. Both removed at the end.

**Tech Stack:** Cloudflare Pages Functions (ESM), Workers AI + DeepSeek, `node --test`. Spec: `docs/superpowers/specs/2026-06-13-rich-component-stories-design.md`.

**Key facts (verified against the codebase):**
- `Map2D` / `DataScrolly` / `AudioPlayer` already have rich `BLOCK_SCHEMAS` examples. `Scene3D` has **none** (must add).
- `validateBlockData` returns `string | null` (null = valid). Required-fields already: `Map2D:['steps']`, `DataScrolly:['steps']`, `AudioPlayer:['audioSrc']`.
- `AVAILABLE_BLOCK_TYPES` (in `functions/api/article-builder.js`) currently lacks Map2D/Scene3D/AudioPlayer.
- `injectMedia`, `assessBlockQuality`, `validateBlockData`, `buildPlanPrompt` live in `functions/api/_shared/{media,quality,blocks,plan}.js`.
- Mock assets exist: `/assets/mock/object.glb` (3D), `/assets/mock/mesh-*.svg`, `/assets/mock/portrait.svg`.

---

## File Structure

- **Modify** `functions/api/_shared/blocks.js` — add `Scene3D` to `BLOCK_SCHEMAS`; add structural checks to `validateBlockData` for Map2D/DataScrolly.
- **Modify** `functions/api/_shared/plan.js` — add rich-component gating rules to `buildPlanPrompt`.
- **Modify** `functions/api/_shared/media.js` — `injectMedia` handles `Scene3D` + `AudioPlayer`.
- **Modify** `functions/api/_shared/quality.js` — `assessBlockQuality` per-type checks.
- **Modify** `functions/api/article-builder.js` — extend `AVAILABLE_BLOCK_TYPES`; add `factShape.hasPlaces`; relax AudioPlayer audioSrc in the generate path; **export** `runAnalyze`/`runGenerateBlock` core fns.
- **Create** `functions/api/article-test.js` — key-gated end-to-end pipeline endpoint (deleted in Task 10).
- **Create** `_story_test.html` — dev render harness (deleted in Task 10).
- **Modify** the `.test.mjs` suites for the changed shared modules.

---

### Task 1: Add rich types to the planner menu + a Scene3D schema

**Files:** Modify `functions/api/article-builder.js`, `functions/api/_shared/blocks.js`; Test `functions/api/_shared/blocks.test.mjs`.

- [ ] **Step 1: Add a failing test** for the Scene3D schema in `blocks.test.mjs`:
```js
test('Scene3D schema exists with scenes that carry heading + body', () => {
  const ex = BLOCK_SCHEMAS.Scene3D?.example;
  assert.ok(ex, 'Scene3D schema missing');
  assert.ok(Array.isArray(ex.scenes) && ex.scenes.length >= 1);
  assert.ok(ex.scenes.every(s => 'heading' in s && 'body' in s));
});
```
Run `node --test functions/api/_shared/blocks.test.mjs` → FAIL.

- [ ] **Step 2: Add the Scene3D schema** to `BLOCK_SCHEMAS` in `functions/api/_shared/blocks.js` (place it near the other media block schemas):
```js
  Scene3D: {
    description: `3D model scrollytelling — a sticky 3D object the reader scrolls through; the camera moves between saved viewpoints ("scenes"), each with a heading + body card.

CRITICAL RULES:
- "glbUrl" MUST be left as an empty string "" — the platform supplies the 3D model asset. Never invent a URL.
- "scenes" is an array of 2–4 viewpoints. Each scene: { camera:{x,y,z}, target:{x,y,z}, fov, heading, body }. The heading + body are NARRATIVE (what this view reveals), not "Scene 1".
- Use sensible camera values (distance 2–4 from origin); the platform re-frames automatically, so approximate is fine.
- bg: "dark" | "studio" | "page". light: "studio" | "sun". glowIntensity: "1" | "1.5" | "2".`,
    example: {
      glbUrl: '',
      bg: 'dark', light: 'studio', glowIntensity: '1.5', draggable: 'false', textMode: 'cards',
      scenes: [
        { camera: { x: 1.6, y: 1.2, z: 3.2 }, target: { x: 0, y: 0, z: 0 }, fov: 45, heading: 'The whole form', body: 'Seen head-on, the object reads as a single sculpted mass — the starting point of the story.' },
        { camera: { x: -2.4, y: 0.6, z: 2.2 }, target: { x: 0, y: 0, z: 0 }, fov: 40, heading: 'A hidden seam', body: 'Rotate to the flank and the construction reveals itself — where two surfaces meet, the detail that changes everything.' },
      ],
    },
  },
```

- [ ] **Step 3: Run the test** → PASS.

- [ ] **Step 4: Extend `AVAILABLE_BLOCK_TYPES`** in `functions/api/article-builder.js` — add these three entries (after the `DataScrolly` entry):
```js
  { type: 'Map2D', use: 'Map scrollytelling — sticky interactive map; camera flies between real places as the reader scrolls. ONLY for stories with a strong geographic/route/location dimension. Needs real place names.' },
  { type: 'Scene3D', use: 'Interactive 3D object the reader scrolls through. ONLY for stories centered on a physical object, artifact, building, or product.' },
  { type: 'AudioPlayer', use: 'Audio player with cover art. ONLY when the story has voice/audio material (an interview, podcast, recording, oral history).' },
```

- [ ] **Step 5: Verify** `node --input-type=module --check < functions/api/article-builder.js` (ESM-OK) and `node --test functions/api/_shared/blocks.test.mjs` (all pass).

- [ ] **Step 6: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/article-builder.js functions/api/_shared/blocks.js functions/api/_shared/blocks.test.mjs && git commit -m "feat(ai): add Map2D/Scene3D/AudioPlayer to planner menu + Scene3D schema"
```

---

### Task 2: Planner gating rules + factShape.hasPlaces

**Files:** Modify `functions/api/_shared/plan.js`, `functions/api/article-builder.js`; Test `functions/api/_shared/plan.test.mjs`.

- [ ] **Step 1: Add gating rules to `buildPlanPrompt`** in `functions/api/_shared/plan.js` — extend the "Hard rules" section with:
```
- Map2D: include ONLY if the story is strongly geographic (a journey, route, locations, spread). Then place real places with their well-known coordinates.
- DataScrolly: include ONLY if the sources contain a real numeric series over time/category (≥2 data points). Never fabricate numbers.
- Scene3D: include ONLY if the story centers on a physical object/artifact/building/product.
- AudioPlayer: include ONLY if there is real voice/audio material (interview, recording, podcast).
- Choosing a rich component when the content does not justify it is a failure — prefer Editorial/Quote/StatRow when unsure.
```
(Append these lines inside the existing template literal's hard-rules list.)

- [ ] **Step 2: Add a `hasPlaces` test** to `plan.test.mjs` is not applicable (hasPlaces lives in article-builder). Instead, in `functions/api/article-builder.js`, the fact extraction already flags facts. Add `'location'` to the allowed flags in the `summarizeChunk` system prompt (find the `flag` enum line `null | "extreme_number" | ...` and add `| "location"`). Then compute `hasPlaces`.

- [ ] **Step 3: Compute `factShape.hasPlaces`** in `handleAnalyze` (where `factShape` is built):
```js
const factShape = {
  hasNumbers: allFacts.some(f => f.flag === 'statistic' || f.flag === 'extreme_number'),
  hasQuotes:  allFacts.some(f => f.flag === 'direct_quote'),
  hasDates:   allFacts.some(f => f.flag === 'historical_date'),
  hasPlaces:  allFacts.some(f => f.flag === 'location'),
};
```
(`repairPlanStructure(plan, factShape)` already receives this; no signature change needed — it's available for future deterministic gating.)

- [ ] **Step 4: Verify** `node --input-type=module --check < functions/api/article-builder.js` and `node --test functions/api/_shared/plan.test.mjs` (existing tests still pass).

- [ ] **Step 5: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/_shared/plan.js functions/api/article-builder.js && git commit -m "feat(ai): planner gating rules for rich components + hasPlaces fact signal"
```

---

### Task 3: Structural validators (Map2D coords, DataScrolly data) + AudioPlayer relax

**Files:** Modify `functions/api/_shared/blocks.js`, `functions/api/article-builder.js`; Test `functions/api/_shared/blocks.test.mjs`.

- [ ] **Step 1: Add failing tests** to `blocks.test.mjs`:
```js
test('validateBlockData rejects Map2D with out-of-range coordinates', () => {
  const bad = { steps: [{ body: 'x' }], markers: [{ lat: 999, lng: 0 }] };
  assert.ok(validateBlockData('Map2D', bad)); // returns an error string
});
test('validateBlockData accepts Map2D with in-range markers', () => {
  const ok = { steps: [{ body: 'x', mapState: {} }], markers: [{ id:'a', lat: 52.5, lng: 13.4, label:'1', name:'Berlin' }] };
  assert.equal(validateBlockData('Map2D', ok), null);
});
test('validateBlockData rejects DataScrolly with <2 numeric points', () => {
  const bad = { steps: [{ body:'x' }], chartSpec: { yField: 'v', data: [{ year:'2000', v: 5 }] } };
  assert.ok(validateBlockData('DataScrolly', bad));
});
test('validateBlockData accepts DataScrolly with >=2 numeric points', () => {
  const ok = { steps: [{ body:'x' }], chartSpec: { yField: 'v', data: [{ year:'2000', v: 5 }, { year:'2010', v: 9 }] } };
  assert.equal(validateBlockData('DataScrolly', ok), null);
});
```
Run → the new ones FAIL.

- [ ] **Step 2: Add the structural checks** inside `validateBlockData` in `functions/api/_shared/blocks.js`, AFTER the existing required-fields + array-fields checks and BEFORE the final `return null`:
```js
  if (type === 'Map2D') {
    const markers = Array.isArray(data.markers) ? data.markers : [];
    const inRange = markers.filter(m => Number.isFinite(+m.lat) && Number.isFinite(+m.lng) && Math.abs(+m.lat) <= 90 && Math.abs(+m.lng) <= 180);
    if (inRange.length < 1) return 'Map2D needs at least one marker with valid lat/lng coordinates';
  }
  if (type === 'DataScrolly') {
    const cs = data.chartSpec || {};
    const yf = cs.yField;
    const pts = Array.isArray(cs.data) ? cs.data : [];
    const numeric = pts.filter(p => p && yf && Number.isFinite(+p[yf]));
    if (numeric.length < 2) return 'DataScrolly needs chartSpec.data with at least 2 numeric points';
  }
```
> Read the current `validateBlockData` body first to place these correctly relative to its existing `return` statements (it returns an error string on the first failure, or `null` at the end).

- [ ] **Step 3: Run the tests** → all pass.

- [ ] **Step 4: Relax AudioPlayer audioSrc in the article generation path.** In `functions/api/article-builder.js`, in `handleGenerateBlock`, change the validation so a missing `audioSrc` on AudioPlayer is NOT treated as invalid (cover-only is the valid mock state). Replace `const err = validateBlockData(type, data);` with:
```js
let err = validateBlockData(type, data);
if (err && type === 'AudioPlayer' && /audioSrc/i.test(err)) err = null; // cover-only mock state is acceptable
```

- [ ] **Step 5: Verify** `node --input-type=module --check < functions/api/article-builder.js` + `node --test functions/api/_shared/blocks.test.mjs`.

- [ ] **Step 6: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/_shared/blocks.js functions/api/_shared/blocks.test.mjs functions/api/article-builder.js && git commit -m "feat(ai): structural validators for Map2D coords + DataScrolly data; relax AudioPlayer audioSrc"
```

---

### Task 4: Media injection for Scene3D + AudioPlayer

**Files:** Modify `functions/api/_shared/media.js`, `functions/api/_shared/media.test.mjs`.

- [ ] **Step 1: Add failing tests** to `media.test.mjs`:
```js
test('Scene3D with empty glbUrl gets the mock object + scene camera defaults', () => {
  const out = injectMedia('Scene3D', { glbUrl: '', scenes: [{ heading: 'h', body: 'b' }] }, 0);
  assert.equal(out.glbUrl, '/assets/mock/object.glb');
  assert.ok(out.scenes[0].camera && out.scenes[0].target && out.scenes[0].fov);
});
test('AudioPlayer with empty coverSrc gets mock art, audioSrc left empty', () => {
  const out = injectMedia('AudioPlayer', { coverSrc: '', audioSrc: '', title: 't' }, 0);
  assert.match(out.coverSrc, /\/assets\/mock\//);
  assert.equal(out.audioSrc, '');
});
```
Run → FAIL.

- [ ] **Step 2: Extend `injectMedia`** in `functions/api/_shared/media.js` — add these cases to the `switch (type)`:
```js
    case 'Scene3D':
      if (empty(d.glbUrl)) d.glbUrl = '/assets/mock/object.glb';
      if (Array.isArray(d.scenes)) d.scenes = d.scenes.map(s => ({
        camera: s.camera || { x: 1.6, y: 1.2, z: 3.2 },
        target: s.target || { x: 0, y: 0, z: 0 },
        fov: s.fov || 45,
        ...s,
      }));
      break;
    case 'AudioPlayer':
      if (empty(d.coverSrc)) d.coverSrc = pick(beatIndex);
      break;
```
> Note: the spread `...s` after the defaults means real values in `s` override the defaults while guaranteeing the keys exist. Confirm `pick` and `empty` are already defined in the module (they are, from the prior plan).

- [ ] **Step 3: Run the tests** → pass.

- [ ] **Step 4: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/_shared/media.js functions/api/_shared/media.test.mjs && git commit -m "feat(ai): inject mock 3D object + audio cover for Scene3D/AudioPlayer"
```

---

### Task 5: Per-type quality checks

**Files:** Modify `functions/api/_shared/quality.js`, `functions/api/_shared/quality.test.mjs`.

- [ ] **Step 1: Add failing tests** to `quality.test.mjs`:
```js
test('Map2D with no in-range marker is flagged', () => {
  const r = assessBlockQuality('Map2D', { steps:[{body:'x'}], markers: [] });
  assert.equal(r.ok, false);
});
test('Scene3D with a scene missing body is flagged', () => {
  const r = assessBlockQuality('Scene3D', { scenes: [{ heading: 'h' }] });
  assert.equal(r.ok, false);
});
test('DataScrolly with <2 numeric points is flagged', () => {
  const r = assessBlockQuality('DataScrolly', { chartSpec: { yField:'v', data:[{v:1}] }, steps:[{body:'x'}] });
  assert.equal(r.ok, false);
});
```
Run → FAIL.

- [ ] **Step 2: Extend `assessBlockQuality`** in `functions/api/_shared/quality.js` — add before the final `return`:
```js
  if (type === 'Map2D') {
    const ms = Array.isArray(data?.markers) ? data.markers : [];
    if (!ms.some(m => Number.isFinite(+m?.lat) && Number.isFinite(+m?.lng) && Math.abs(+m.lat) <= 90 && Math.abs(+m.lng) <= 180)) issues.push('Map2D has no valid in-range marker');
  }
  if (type === 'DataScrolly') {
    const cs = data?.chartSpec || {}; const yf = cs.yField;
    const numeric = (Array.isArray(cs.data) ? cs.data : []).filter(p => p && yf && Number.isFinite(+p[yf]));
    if (numeric.length < 2) issues.push('DataScrolly chart has fewer than 2 numeric points');
  }
  if (type === 'Scene3D') {
    const sc = Array.isArray(data?.scenes) ? data.scenes : [];
    if (sc.length < 1 || !sc.every(s => s && s.heading && s.body)) issues.push('Scene3D scenes are missing heading/body');
  }
  if (type === 'AudioPlayer') {
    if (!data?.title || !data?.description) issues.push('AudioPlayer missing title/description');
  }
```

- [ ] **Step 3: Run the tests** → pass.

- [ ] **Step 4: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/_shared/quality.js functions/api/_shared/quality.test.mjs && git commit -m "feat(ai): per-type quality checks for Map2D/DataScrolly/Scene3D/AudioPlayer"
```

---

### Task 6: Extract pipeline core + key-gated test endpoint

**Files:** Modify `functions/api/article-builder.js`; Create `functions/api/article-test.js`.

- [ ] **Step 1: Export the core orchestration from `article-builder.js`.** Its `handleAnalyze(env, body)` and `handleGenerateBlock(env, body)` currently return `Response` objects. Refactor each into a pure core that returns a plain object, with the HTTP handler wrapping it:
  - Add `export async function runAnalyze(env, body)` returning `{ facts, plan, throughLine, chunks, warnings }` (move the logic; the existing `handleAnalyze` becomes `const r = await runAnalyze(env, body); return new Response(JSON.stringify(r), {...})`, preserving its current error responses for the missing-sources / all-parse-failed cases — those can stay in `handleAnalyze` before calling `runAnalyze`, or `runAnalyze` can throw and `handleAnalyze` catches).
  - Add `export async function runGenerateBlock(env, body)` returning `{ data, confidence, lead, quality, sourceRefs }` (move the logic; `handleGenerateBlock` wraps it in a Response).
  - Keep behavior identical for the existing `/api/article-builder` route.

- [ ] **Step 2: Create `functions/api/article-test.js`** — a key-gated endpoint that runs the whole pipeline:
```js
// DEV-ONLY end-to-end pipeline runner for the recursive test loop. Gated by TEST_KEY.
// DELETE THIS FILE before final ship (Task 10).
import { runAnalyze, runGenerateBlock } from './article-builder.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.TEST_KEY || request.headers.get('X-Test-Key') !== env.TEST_KEY) return json({ error: 'forbidden' }, 403);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const analysis = await runAnalyze(env, { sources: body.sources, lang: body.lang || 'en', tone: body.tone || 'feature' });
  const plan = analysis.plan || [];
  const blocks = [];
  let prevLead = '';
  for (let i = 0; i < plan.length; i++) {
    const planItem = plan[i];
    const res = await runGenerateBlock(env, {
      type: planItem.type, planItem, chunks: analysis.chunks, facts: analysis.facts,
      articleContext: { title: plan[0]?.headline || 'Article', tone: body.tone || 'feature', lang: body.lang || 'en', throughLine: analysis.throughLine, narrativeBeat: planItem.narrativeBeat, blockIndex: i, totalBlocks: plan.length, prevLead },
      lang: body.lang || 'en',
    });
    prevLead = res.lead || '';
    blocks.push({ id: 'b_' + i, type: planItem.type, data: res.data, _quality: res.quality, _beat: planItem.narrativeBeat });
  }
  return json({ meta: { title: plan[0]?.headline || 'Article', throughLine: analysis.throughLine }, plan, blocks, warnings: analysis.warnings }, 200);
}
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Test-Key' }; }
function json(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...cors() } }); }
```

- [ ] **Step 3: Verify** ESM parse of both files; confirm exports resolve:
```bash
cd /Users/nihat/DevS/Thomas && node --input-type=module --check < functions/api/article-builder.js && node --input-type=module --check < functions/api/article-test.js && echo OK
```

- [ ] **Step 4: Set the secret + deploy.** (Controller does this — needs Cloudflare access.) Set `TEST_KEY` and `DEEPSEEK_API_KEY` as Pages secrets, then `npm run deploy`. Smoke-test:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://scrollycms.pages.dev/api/article-test   # 403 (no key)
```

- [ ] **Step 5: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add functions/api/article-builder.js functions/api/article-test.js && git commit -m "feat(ai,dev): export pipeline core + key-gated /api/article-test endpoint"
```

---

### Task 7: Dev render harness

**Files:** Create `_story_test.html`.

- [ ] **Step 1: Create `/_story_test.html`** (repo root):
```html
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head>
<body><div id="page-root"></div>
<script type="module">
  // Paste a doc from /api/article-test into window.__DOC__ (or fetch it), then render.
  const stored = sessionStorage.getItem('storyDoc');
  window.__PAGE_DATA__ = window.__DOC__ || (stored ? JSON.parse(stored) : { id:'t', version:1, lang:'en', meta:{title:'empty'}, blocks: [] });
  if (!window.__PAGE_DATA__.id) window.__PAGE_DATA__.id = 't';
  import('./js/render.js?v=' + Date.now()).then(({ render }) => render().then(() => { window.__DONE__ = true; })).catch(e => { window.__ERR__ = String(e); });
</script></body></html>
```

- [ ] **Step 2: Commit**
```bash
cd /Users/nihat/DevS/Thomas && git add _story_test.html && git commit -m "chore(dev): story render harness for the recursive test loop"
```
> Note: the doc's `blocks` come from `/api/article-test`; the harness injects via `sessionStorage.storyDoc` (set with `preview_eval`) or `window.__DOC__`.

---

### Task 8: Recursive loop — Pass 1: Map2D + DataScrolly

**Files:** Create `docs/superpowers/test-stories/` source texts; fix files as breakage is found.

This task is iterative verification. Repeat the cycle below until BOTH stories clear their quality bars; commit each fix atomically with a message describing the defect fixed.

- [ ] **Step 1: Author two curated sources** (controller writes these) under `docs/superpowers/test-stories/`:
  - `geo-route.md` — a 600–1000-word piece with a strong route/geography (e.g. an expedition or a supply chain across named real cities, with distances). Engineered to trigger Map2D.
  - `data-trend.md` — a 600–1000-word piece built around one real numeric series over time (e.g. a measurable metric across years, with the numbers in the text). Engineered to trigger DataScrolly.

- [ ] **Step 2: Generate** each via the test endpoint:
```bash
curl -s -X POST https://scrollycms.pages.dev/api/article-test -H "Content-Type: application/json" -H "X-Test-Key: $TEST_KEY" \
  -d "$(node -e "console.log(JSON.stringify({sources:[{label:'geo',content:require('fs').readFileSync('docs/superpowers/test-stories/geo-route.md','utf8')}],lang:'en',tone:'feature'}))")" > /tmp/geo-doc.json
```
Confirm the doc includes a `Map2D` block (and the data story a `DataScrolly`). If the planner didn't choose it, tighten the gating rule / source until it does.

- [ ] **Step 3: Render + screenshot.** Push the doc into the harness and screenshot:
```
preview_eval: sessionStorage.setItem('storyDoc', <doc json>); location.href='/_story_test.html?v='+Date.now()
preview_screenshot
```
Scroll through the Map2D / DataScrolly block specifically.

- [ ] **Step 4: Catalogue breakage** against the quality bars:
  - **Map2D:** map renders; ≥2 markers at plausible in-range coords near the named real places; steps fly between them; step text is narrative. Watch for: missing/empty map, markers at (0,0) or wrong continent (hallucinated coords), steps with no `mapState`, captions instead of narrative.
  - **DataScrolly:** chart renders with ≥2 real points traceable to the source numbers; steps annotate real points; axis labels correct. Watch for: empty/flat chart, fabricated numbers, `vizState.highlightX` not matching a data point.

- [ ] **Step 5: Fix the root cause** in the appropriate file (schema example wording in `blocks.js`, grounding text in `generateBlock`'s prompt, validator/quality threshold, gating rule in `plan.js`). Redeploy. Re-run Steps 2–4 for the SAME story. Confirm the specific defect is gone and the other story didn't regress. Commit the fix.

- [ ] **Step 6: Done when** both stories clear their bars with a screenshot as evidence. Record the final screenshots' observations in the commit message of the last fix (or a short note in `docs/superpowers/test-stories/RESULTS.md`).

---

### Task 9: Recursive loop — Pass 2: Scene3D + AudioPlayer

Same protocol as Task 8 for two more curated sources:
- [ ] **Step 1:** Author `docs/superpowers/test-stories/artifact-3d.md` (story centered on a physical object/artifact → Scene3D) and `oral-history.md` (interview/recording-based → AudioPlayer).
- [ ] **Step 2–5:** Generate → render → screenshot → catalogue → fix → repeat.
  - **Scene3D bar:** the mock object renders; 2–4 scenes each with a real heading + body that advance the narrative; the block isn't blank. Watch for: empty `scenes`, "Scene 1"/placeholder headings, `glbUrl` the AI invented (should be `''` → injected mock).
  - **AudioPlayer bar:** renders mock cover + real title + description; reads as "ready for audio", not broken. Watch for: blank cover, missing description, the planner choosing it for a non-audio story.
- [ ] **Step 6:** Done when both clear their bars with screenshots.

---

### Task 10: Cleanup + ship

**Files:** Delete `functions/api/article-test.js`, `_story_test.html`.

- [ ] **Step 1: Run the full unit suite** → all green:
```bash
cd /Users/nihat/DevS/Thomas && node --test functions/api/_shared/*.test.mjs
```

- [ ] **Step 2: Remove the dev test scaffolding:**
```bash
cd /Users/nihat/DevS/Thomas && git rm functions/api/article-test.js _story_test.html
```
(The `runAnalyze`/`runGenerateBlock` exports stay — they're now clean reusable cores. The curated test stories under `docs/superpowers/test-stories/` stay as regression fixtures.)

- [ ] **Step 3: Unset the `TEST_KEY` secret** in Cloudflare Pages (controller). Deploy:
```bash
cd /Users/nihat/DevS/Thomas && npm run deploy
```

- [ ] **Step 4: Confirm the test endpoint is gone:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://scrollycms.pages.dev/api/article-test   # 404
```

- [ ] **Step 5: Final commit**
```bash
cd /Users/nihat/DevS/Thomas && git add -A && git commit -m "chore(ai): remove dev test scaffolding; keep pipeline cores + test-story fixtures"
```

---

## Self-Review

**1. Spec coverage:**
- Add Map2D/Scene3D/AudioPlayer to planner + Scene3D schema → Task 1. ✓
- Gating rules + hasPlaces → Task 2. ✓
- Grounding + structural validators (coords/data) + AudioPlayer relax → Task 3. ✓
- injectMedia Scene3D/AudioPlayer → Task 4. ✓
- Per-type quality → Task 5. ✓
- Key-gated test endpoint + pipeline-core export → Task 6. ✓
- Render harness → Task 7. ✓
- Recursive loop Map2D+DataScrolly → Task 8; Scene3D+AudioPlayer → Task 9. ✓
- Cleanup/remove scaffolding/security → Task 10. ✓
- Per-component quality bars → embedded in Tasks 8/9. ✓

**2. Placeholder scan:** Two `>` callouts instruct reading existing code before editing (placement of validator checks; confirming `pick`/`empty` exist) — verify-against-source, not deferred work. Tasks 8/9 are intentionally iterative (the recursive loop) with concrete acceptance bars + fix-categories rather than fixed code, because the fixes are discovered by inspection — this is the explicitly-approved working method, not vagueness. No TBD/TODO.

**3. Type consistency:** `validateBlockData` used as `string|null` throughout (Task 3 relax logic, Task 1/3 tests). `factShape` keys (`hasNumbers/hasQuotes/hasDates/hasPlaces`) consistent with the prior plan's usage. `runAnalyze`/`runGenerateBlock` return shapes match what `article-test.js` consumes (`{facts,plan,throughLine,chunks,warnings}` and `{data,confidence,lead,quality,sourceRefs}`). `injectMedia(type, data, beatIndex)` and `assessBlockQuality(type, data)` signatures match their call sites and the prior plan. Mock paths (`/assets/mock/object.glb`, `mesh-*`) verified to exist.

**Controller-only steps** (need Cloudflare secret access / live deploy / browser screenshots): Task 6 Step 4, Task 8–9 (the loop), Task 10 Steps 3–4. Implementer subagents handle the code + unit tests; the controller runs deploy/secret/loop steps.
