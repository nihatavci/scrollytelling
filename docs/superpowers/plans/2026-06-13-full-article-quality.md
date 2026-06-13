# Full Article Builder — "Aha" Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Full Article generation produce a complete, on-brand, narratively-structured scrollytelling article — real text in the right fields, images present, a Freytag dramatic arc — so a reader says "aha," not "meh."

**Architecture:** The block-generation engine already exists in `functions/api/generate.js` (`BLOCK_SCHEMAS` + `buildSystemPrompt` + `validateBlockData` + a `deepseek-v4-pro` path) but the article builder reinvented generation *without* the schema. We extract that engine into a shared module, then rebuild the article builder's three weak spots on top of it: (1) **schema-grounded** per-block generation, (2) **retrieval** so each block sees only its relevant source chunks (kills the context overflow), (3) a **Freytag-aware planner** that lays out a real dramatic arc. Images come from the existing on-brand mock library (`/assets/mock/*`) with AI-written alt/caption. Prose is written by `deepseek-v4-pro`.

**Tech Stack:** Cloudflare Pages Functions (ESM), Workers AI (`env.AI`) + DeepSeek API (`env.DEEPSEEK_API_KEY`), vanilla-JS admin SPA. Tests: Node built-in test runner (`node --test`, zero-dep) for deterministic modules; stubbed-model fixtures for generation shape.

**Key decisions (locked):** Images = on-brand mock art + AI caption/alt (no external image API this round). Prose model = `deepseek-v4-pro` (already wired in generate.js).

**Acceptance ("aha") criteria — the whole plan is judged against these:**
1. Every generated block renders with **real text in the correct schema fields** (no empty Editorial, no mis-keyed data).
2. Every **media block has an image** (mock art) + a meaningful alt/caption.
3. The article follows a **dramatic arc** (hook → context → rising → turn → resolution), not a flat list; no 3 identical block types in a row.
4. **No context-overflow failures** on long sources; each block generation stays within a fixed char budget.
5. Prose has **continuity** (each section builds on the last; no repetition) and a single through-line.
6. Manual end-to-end run on a real ~3000-word source produces an article a creative director would call "aha."

---

## File Structure

- **Create** `functions/api/_shared/blocks.js` — single source of truth for `BLOCK_SCHEMAS`, `VOICE_GUIDE`, `IMPROVE_RULES`, `buildSystemPrompt`, `validateBlockData`, `parseAIResponse`, and a new `callModel()` model abstraction. (`_shared` is underscore-prefixed → Cloudflare excludes it from routing.)
- **Create** `functions/api/_shared/retrieval.js` — `chunkText`, `selectRelevantChunks(chunks, query, charBudget)`.
- **Create** `functions/api/_shared/plan.js` — `validatePlanStructure(plan)`, `repairPlanStructure(plan, facts)`, the Freytag planner prompt builder `buildPlanPrompt()`.
- **Create** `functions/api/_shared/media.js` — server-side `MOCK` map + `injectMedia(type, data, beatIndex)`.
- **Create** `functions/api/_shared/quality.js` — `assessBlockQuality(type, data)`.
- **Create** `functions/api/_shared/*.test.mjs` — Node `--test` suites for the deterministic modules.
- **Modify** `functions/api/generate.js` — import the shared engine instead of its local copies (no behavior change).
- **Modify** `functions/api/article-builder.js` — reuse shared engine; rewrite `proposePlan`/`generateBlock`/`handleAnalyze`/`handleGenerateBlock` around retrieval + Freytag + schema-grounding + deepseek + media + quality.
- **Modify** `admin/ui/article-builder.js` — pass `throughLine`, `narrativeBeat`, previous-block lead text; surface quality flags in Phase 4.

Each task below is self-contained and ends green.

---

### Task 1: Extract the shared block engine

**Files:**
- Create: `functions/api/_shared/blocks.js`
- Create: `functions/api/_shared/blocks.test.mjs`
- Modify: `functions/api/generate.js` (replace local copies with imports)

- [ ] **Step 1: Create the shared module by moving the existing engine out of generate.js.** Cut `BLOCK_SCHEMAS`, `VOICE_GUIDE`, `IMPROVE_RULES`, `buildSystemPrompt`, `validateBlockData` (and the `parseAIResponse` repair fn — copy the superior one from `article-builder.js:191-291`) **verbatim** into `functions/api/_shared/blocks.js`, and `export` each. Append the model abstraction:

```js
// functions/api/_shared/blocks.js  (top: the moved BLOCK_SCHEMAS / VOICE_GUIDE / IMPROVE_RULES /
// buildSystemPrompt / validateBlockData / parseAIResponse, each `export`ed)

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEEPSEEK_API_MODELS = new Set(['deepseek-v4-pro']);

// One entry point for every model call. Routes deepseek-* to the DeepSeek API, everything
// else to Workers AI. Returns the raw assistant text. Throws on hard failure.
export async function callModel(env, { model, system, user, maxTokens = 2048, temperature = 0.4 }) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  if (DEEPSEEK_API_MODELS.has(model)) {
    if (!env.DEEPSEEK_API_KEY) { // graceful fallback so prose still generates
      const r = await env.AI.run(DEFAULT_MODEL, { messages, max_tokens: maxTokens, temperature });
      return r?.response ?? r;
    }
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: maxTokens, temperature, stream: false }),
    });
    if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? '';
  }
  const r = await env.AI.run(model || DEFAULT_MODEL, { messages, max_tokens: maxTokens, temperature });
  return r?.response ?? r;
}
```
> NOTE: confirm the real DeepSeek endpoint/model id against `functions/api/generate.js:974-990` (the existing branch) and copy its exact URL, model id, and auth header so this matches production.

- [ ] **Step 2: Write the test** (`functions/api/_shared/blocks.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMAS, buildSystemPrompt, validateBlockData, callModel } from './blocks.js';

test('every article block type has a schema with an example', () => {
  for (const t of ['Hero','Editorial','StatRow','Quote','Aside','Timeline','ChapterDivider','Outro','ImageGrid','Scrolly']) {
    assert.ok(BLOCK_SCHEMAS[t], `missing schema: ${t}`);
    assert.ok(BLOCK_SCHEMAS[t].example, `missing example: ${t}`);
  }
});

test('buildSystemPrompt injects the schema example for the type', () => {
  const p = buildSystemPrompt('Editorial', 'create', 'en', false);
  assert.match(p, /Editorial|content/);
  assert.ok(p.includes(JSON.stringify(BLOCK_SCHEMAS.Editorial.example).slice(0, 20)));
});

test('validateBlockData rejects an Editorial with no content array', () => {
  const res = validateBlockData('Editorial', { content: [] });
  assert.equal(res.valid, false);
});

test('callModel routes to Workers AI when model is not deepseek', async () => {
  const env = { AI: { run: async (_m, _o) => ({ response: 'ok' }) } };
  const out = await callModel(env, { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', system: 's', user: 'u' });
  assert.equal(out, 'ok');
});
```
> If `validateBlockData` currently returns a boolean rather than `{valid}`, adapt the assertion to the real signature (read it before writing the test).

- [ ] **Step 3: Run the test — expect FAIL** (module not yet wired / signature mismatch):

Run: `node --test functions/api/_shared/blocks.test.mjs`
Expected: failures until Step 1's exports match the assertions.

- [ ] **Step 4: Make generate.js import the shared module.** In `functions/api/generate.js`, delete the now-moved definitions and add at top:

```js
import { BLOCK_SCHEMAS, VOICE_GUIDE, IMPROVE_RULES, buildSystemPrompt, validateBlockData, parseAIResponse, callModel, DEFAULT_MODEL, DEEPSEEK_API_MODELS } from './_shared/blocks.js';
```
Keep `generate.js`'s request handler and `assessDataScrollyQuality` local. Replace its inline DeepSeek/Workers branches in `onRequest` with `callModel(...)`.

- [ ] **Step 5: Run tests + a manual generate sanity check.**

Run: `node --test functions/api/_shared/blocks.test.mjs` → expect PASS.
Then manually: in the admin, use the existing per-block AI "Enhance" on an Editorial block and confirm it still works (no regression).

- [ ] **Step 6: Commit**

```bash
git add functions/api/_shared/blocks.js functions/api/_shared/blocks.test.mjs functions/api/generate.js
git commit -m "refactor(ai): extract shared block engine (schemas, prompts, callModel)"
```

---

### Task 2: Retrieval — per-block relevant chunk selection

**Files:**
- Create: `functions/api/_shared/retrieval.js`
- Create: `functions/api/_shared/retrieval.test.mjs`

- [ ] **Step 1: Write the failing test** (`retrieval.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, selectRelevantChunks } from './retrieval.js';

test('chunkText splits long text on sentence boundaries with overlap', () => {
  const text = 'A. '.repeat(5000); // ~15k chars
  const chunks = chunkText(text, 8000, 200);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(c => c.length <= 8200));
});

test('selectRelevantChunks ranks by query overlap and respects the char budget', () => {
  const chunks = [
    'The river flooded the village in 1998 causing damage.',
    'Quarterly revenue rose to 4.2 million dollars last year.',
    'Unrelated text about gardening and tomatoes.',
  ];
  const picked = selectRelevantChunks(chunks, 'flood village damage 1998', 60);
  assert.ok(picked[0].includes('flooded'));
  assert.ok(picked.join('').length <= 60);
});
```

Run: `node --test functions/api/_shared/retrieval.test.mjs` → FAIL (module missing).

- [ ] **Step 2: Implement** `functions/api/_shared/retrieval.js`:

```js
// Lightweight lexical retrieval — no embeddings. Good enough to keep each block's prompt
// focused on its own source material and within a hard char budget (fixes context overflow).
export function chunkText(text, size = 8000, overlap = 200) {
  if (text.length <= size) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + size * 0.7) end = lastPeriod + 2;
    }
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  return chunks;
}

const STOP = new Set('the a an and or of to in on at for with is are was were be it this that as by from'.split(' '));
function tokens(s) { return (s.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/gi) || []).filter(w => !STOP.has(w)); }

export function selectRelevantChunks(chunks, query, charBudget = 9000) {
  const q = new Set(tokens(query));
  const scored = chunks.map((c, i) => {
    const ts = tokens(c);
    let hits = 0; for (const t of ts) if (q.has(t)) hits++;
    return { c, i, score: hits / Math.sqrt(ts.length + 1) };
  }).sort((a, b) => b.score - a.score || a.i - b.i);
  const out = [];
  let used = 0;
  for (const { c } of scored) {
    if (used >= charBudget) break;
    const slice = c.slice(0, Math.max(0, charBudget - used));
    if (!slice) break;
    out.push(slice); used += slice.length;
  }
  return out.length ? out : (chunks[0] ? [chunks[0].slice(0, charBudget)] : []);
}
```

- [ ] **Step 3: Run the test** → expect PASS. `node --test functions/api/_shared/retrieval.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add functions/api/_shared/retrieval.js functions/api/_shared/retrieval.test.mjs
git commit -m "feat(ai): lexical retrieval + char-budgeted chunk selection"
```

---

### Task 3: Freytag-aware planner + structure validation

**Files:**
- Create: `functions/api/_shared/plan.js`
- Create: `functions/api/_shared/plan.test.mjs`

- [ ] **Step 1: Write the failing test** (`plan.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanStructure, repairPlanStructure } from './plan.js';

test('validatePlanStructure flags a flat all-Editorial plan', () => {
  const plan = Array.from({length:5}, () => ({ type: 'Editorial' }));
  const r = validatePlanStructure(plan);
  assert.equal(r.valid, false);
  assert.ok(r.problems.some(p => /Hero/.test(p)));        // must start Hero
  assert.ok(r.problems.some(p => /identical|repeat/i.test(p))); // 3-in-a-row
});

test('repairPlanStructure yields a valid arc: Hero first, Outro last, a chapter divider, a beat on each', () => {
  const fixed = repairPlanStructure([{type:'Editorial'},{type:'Editorial'},{type:'Editorial'}], { hasNumbers:true, hasQuotes:true });
  assert.equal(fixed[0].type, 'Hero');
  assert.equal(fixed[fixed.length-1].type, 'Outro');
  assert.ok(fixed.some(b => b.type === 'ChapterDivider'));
  assert.ok(fixed.every(b => b.narrativeBeat)); // every block tagged with a Freytag beat
  assert.equal(validatePlanStructure(fixed).valid, true);
});
```

Run: `node --test functions/api/_shared/plan.test.mjs` → FAIL.

- [ ] **Step 2: Implement** `functions/api/_shared/plan.js`:

```js
export const BEATS = ['exposition', 'rising', 'climax', 'falling', 'resolution'];

// The planner prompt: forces a dramatic arc, not a flat list. Used by handleAnalyze.
export function buildPlanPrompt(blockList, tone, lang) {
  return `You are a senior editorial architect for a scrollytelling platform. Design an article as a DRAMATIC ARC (Freytag), not a flat list.

Available block types:
${blockList}

Shape the arc across these beats and tag each block with "narrativeBeat":
- exposition: a Hero hook + just enough context to set stakes.
- rising: escalating sections that build tension/evidence; ChapterDivider to open a new act.
- climax: the turn — the most important revelation, contrast, or number. Often a Quote, StatRow, or a strong Editorial.
- falling: implications, complications, counterpoints.
- resolution: an Outro that lands the through-line.

Hard rules:
- First block Hero (exposition). Last block Outro (resolution).
- 1–3 ChapterDividers separating acts.
- Never 3 identical block types in a row — vary rhythm (text → visual → text).
- Include at least one visual block (ImageGrid / Scrolly / FullscreenImage).
- Use StatRow only if real numbers exist; Quote only if real quotes exist; Timeline only for 3+ dated events.
- 8–18 blocks depending on source depth. Tone: ${tone || 'investigative'}.
- Each item: { "type", "headline", "narrativeBeat", "rationale", "sourceRefs": [...] }.

Also return a one-paragraph "throughLine": the single argument/spine the whole article serves.

Return ONLY valid JSON: { "throughLine": "...", "plan": [...], "warnings": [...] }.
Language: ${lang || 'same as the source'}.`;
}

export function validatePlanStructure(plan) {
  const problems = [];
  if (!Array.isArray(plan) || plan.length < 3) problems.push('plan too short');
  if (plan[0]?.type !== 'Hero') problems.push('must start with a Hero');
  if (plan[plan.length - 1]?.type !== 'Outro') problems.push('must end with an Outro');
  if (!plan.some(b => b.type === 'ChapterDivider')) problems.push('needs at least one ChapterDivider');
  if (!plan.some(b => ['ImageGrid','Scrolly','FullscreenImage'].includes(b.type))) problems.push('needs a visual block');
  for (let i = 2; i < plan.length; i++) {
    if (plan[i].type === plan[i-1].type && plan[i].type === plan[i-2].type) { problems.push('3 identical block types repeat'); break; }
  }
  return { valid: problems.length === 0, problems };
}

// Deterministic safety net when the model returns a weak plan. Builds/normalizes to a valid arc.
export function repairPlanStructure(plan, facts = {}) {
  let p = Array.isArray(plan) ? plan.filter(b => b && b.type) : [];
  if (p[0]?.type !== 'Hero') p.unshift({ type: 'Hero', headline: p[0]?.headline || 'Untitled' });
  if (p[p.length - 1]?.type !== 'Outro') p.push({ type: 'Outro', headline: 'Conclusion' });
  // ensure a chapter divider after the opening
  if (!p.some(b => b.type === 'ChapterDivider') && p.length > 3) p.splice(2, 0, { type: 'ChapterDivider', headline: '' });
  // ensure a visual block mid-article
  if (!p.some(b => ['ImageGrid','Scrolly','FullscreenImage'].includes(b.type))) p.splice(Math.floor(p.length/2), 0, { type: 'ImageGrid', headline: '' });
  // break 3-in-a-row by inserting an Aside
  for (let i = 2; i < p.length; i++) {
    if (p[i].type === p[i-1].type && p[i].type === p[i-2].type) { p.splice(i, 0, { type: 'Aside', headline: '' }); i++; }
  }
  // tag beats by position
  p.forEach((b, i) => {
    if (!b.narrativeBeat) {
      const r = i / Math.max(1, p.length - 1);
      b.narrativeBeat = r === 0 ? 'exposition' : r < 0.45 ? 'rising' : r < 0.6 ? 'climax' : r < 0.9 ? 'falling' : 'resolution';
    }
  });
  return p;
}
```

- [ ] **Step 3: Run the test** → PASS. `node --test functions/api/_shared/plan.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add functions/api/_shared/plan.js functions/api/_shared/plan.test.mjs
git commit -m "feat(ai): Freytag-aware planner prompt + structure validation/repair"
```

---

### Task 4: Server-side media injection (mock assets)

**Files:**
- Create: `functions/api/_shared/media.js`
- Create: `functions/api/_shared/media.test.mjs`

- [ ] **Step 1: Write the failing test** (`media.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectMedia } from './media.js';

test('FullscreenImage with empty imageSrc gets a mock + keeps AI alt', () => {
  const out = injectMedia('FullscreenImage', { imageSrc: '', imageAlt: 'a flooded street' }, 0);
  assert.match(out.imageSrc, /\/assets\/mock\/mesh-/);
  assert.equal(out.imageAlt, 'a flooded street');
});

test('ImageGrid fills every empty item src and rotates art', () => {
  const out = injectMedia('ImageGrid', { images: [{src:'',caption:'x'},{src:'',caption:'y'}] }, 1);
  assert.ok(out.images.every(im => /\/assets\/mock\//.test(im.src)));
  assert.notEqual(out.images[0].src, out.images[1].src);
});

test('non-media block passes through unchanged', () => {
  const data = { content: [{kind:'p', html:'hi'}] };
  assert.deepEqual(injectMedia('Editorial', data, 0), data);
});
```

Run: `node --test functions/api/_shared/media.test.mjs` → FAIL.

- [ ] **Step 2: Implement** `functions/api/_shared/media.js` (mirror the client `MOCK` map in `admin/ui/app.js`):

```js
const ART = ['/assets/mock/mesh-aurora.svg', '/assets/mock/mesh-ember.svg', '/assets/mock/mesh-tide.svg'];
const pick = (n) => ART[((n % ART.length) + ART.length) % ART.length];

// Fill empty image slots on generated media blocks so nothing renders blank. AI-written
// alt/caption is preserved (it describes the ideal photo to drop in later).
export function injectMedia(type, data, beatIndex = 0) {
  const d = { ...data };
  const empty = (v) => v == null || v === '';
  switch (type) {
    case 'FullscreenImage': if (empty(d.imageSrc)) d.imageSrc = pick(beatIndex); break;
    case 'FullBleed':       if (empty(d.mediaSrc)) d.mediaSrc = pick(beatIndex); break;
    case 'Quote':           if (empty(d.portraitSrc)) d.portraitSrc = '/assets/mock/portrait.svg'; break;
    case 'ImageCompare':    if (empty(d.beforeSrc)) d.beforeSrc = '/assets/mock/compare-before.svg';
                            if (empty(d.afterSrc))  d.afterSrc  = '/assets/mock/compare-after.svg'; break;
    case 'ImageGrid':
      if (Array.isArray(d.images)) d.images = d.images.map((im, i) => empty(im.src) ? { ...im, src: pick(beatIndex + i) } : im);
      break;
    case 'Scrolly':
      if (Array.isArray(d.steps)) d.steps = d.steps.map((s, i) => empty(s.imageSrc) ? { ...s, imageSrc: pick(beatIndex + i) } : s);
      break;
  }
  return d;
}
```

- [ ] **Step 3: Run the test** → PASS. `node --test functions/api/_shared/media.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add functions/api/_shared/media.js functions/api/_shared/media.test.mjs
git commit -m "feat(ai): inject on-brand mock art into generated media blocks"
```

---

### Task 5: Quality gate

**Files:**
- Create: `functions/api/_shared/quality.js`
- Create: `functions/api/_shared/quality.test.mjs`

- [ ] **Step 1: Write the failing test** (`quality.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessBlockQuality } from './quality.js';

test('flags [NEEDS SOURCE] placeholder', () => {
  const r = assessBlockQuality('Editorial', { content: [{ kind:'p', html:'It rose to [NEEDS SOURCE].' }] });
  assert.ok(r.issues.some(i => /NEEDS SOURCE/.test(i)));
});
test('flags an empty Editorial', () => {
  const r = assessBlockQuality('Editorial', { content: [] });
  assert.equal(r.ok, false);
});
test('passes a substantive Editorial', () => {
  const r = assessBlockQuality('Editorial', { content: [{kind:'h2',text:'A real heading'},{kind:'p',html:'A paragraph long enough to read as real prose, not filler text at all here.'}] });
  assert.equal(r.ok, true);
});
```

Run → FAIL.

- [ ] **Step 2: Implement** `functions/api/_shared/quality.js`:

```js
export function assessBlockQuality(type, data) {
  const issues = [];
  const flat = JSON.stringify(data || {});
  if (/\[NEEDS SOURCE\]/i.test(flat)) issues.push('contains [NEEDS SOURCE] placeholder');
  const text = (data ? Object.values(data) : []).map(v => typeof v === 'string' ? v : '').join(' ');
  const words = (flat.replace(/<[^>]+>/g, ' ').match(/[a-zà-ÿ0-9]+/gi) || []).length;
  const TEXTY = ['Editorial','Hero','Quote','Outro','Aside','ChapterDivider'];
  if (TEXTY.includes(type) && words < 6) issues.push(`${type} has almost no text`);
  if (type === 'Editorial' && (!Array.isArray(data?.content) || data.content.length === 0)) issues.push('Editorial has no content items');
  return { ok: issues.length === 0, issues };
}
```

- [ ] **Step 3: Run the test** → PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/api/_shared/quality.js functions/api/_shared/quality.test.mjs
git commit -m "feat(ai): per-block quality assessment for the review phase"
```

---

### Task 6: Rebuild `handleAnalyze` around Freytag planning + through-line

**Files:**
- Modify: `functions/api/article-builder.js` (`handleAnalyze`, `proposePlan`, imports)

- [ ] **Step 1: Import shared modules** at the top of `functions/api/article-builder.js`:

```js
import { callModel, parseAIResponse } from './_shared/blocks.js';
import { chunkText } from './_shared/retrieval.js';
import { buildPlanPrompt, repairPlanStructure, validatePlanStructure } from './_shared/plan.js';
```
Delete the local `chunkText` and `parseAIResponse` copies (now imported).

- [ ] **Step 2: Replace `proposePlan`** to use the Freytag prompt + return a through-line:

```js
async function proposePlan(env, factSummaries, lang, tone, factShape) {
  const blockList = AVAILABLE_BLOCK_TYPES.map(b => `- ${b.type}: ${b.use}`).join('\n');
  const raw = await callModel(env, {
    model: 'deepseek-v4-pro',
    system: buildPlanPrompt(blockList, tone, lang),
    user: `Extracted facts and summaries:\n\n${factSummaries}`,
    maxTokens: 3000, temperature: 0.5,
  });
  let parsed; try { parsed = parseAIResponse(raw); } catch { parsed = {}; }
  parsed.plan = repairPlanStructure(parsed.plan, factShape); // always valid arc
  return parsed; // { throughLine, plan, warnings }
}
```

- [ ] **Step 3: Update `handleAnalyze`** to compute `factShape`, keep the chunks for retrieval, and return `throughLine` + `chunks`:

In `handleAnalyze`, after building `allFacts`, add:
```js
const factShape = {
  hasNumbers: allFacts.some(f => f.flag === 'statistic' || f.flag === 'extreme_number'),
  hasQuotes:  allFacts.some(f => f.flag === 'direct_quote'),
  hasDates:   allFacts.some(f => f.flag === 'historical_date'),
};
const planParsed = await proposePlan(env, factSummaryText, lang, tone, factShape);
```
Change the final response to include `throughLine` and the chunked sources so generation can retrieve from them:
```js
return new Response(JSON.stringify({
  facts: allFacts,
  plan: planParsed.plan || [],
  throughLine: planParsed.throughLine || '',
  chunks,                       // pass the analyzed chunks back for per-block retrieval
  warnings,
}), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
```
> Remove the old `proposePlan` fallback try/catch block in `handleAnalyze` — `repairPlanStructure` now guarantees a valid plan, so the basic-3-block fallback is dead code.

- [ ] **Step 4: Manual verification.** Deploy to a preview (`npm run deploy`), run Analyze on a ~1500-word paste in the admin. Confirm the returned plan starts Hero / ends Outro, has a ChapterDivider + a visual block, no 3-in-a-row, and each item has a `narrativeBeat`. Confirm `throughLine` is a real sentence.

- [ ] **Step 5: Commit**

```bash
git add functions/api/article-builder.js
git commit -m "feat(ai): Freytag planning + through-line in article analyze phase"
```

---

### Task 7: Rebuild `handleGenerateBlock` — schema-grounded, retrieved, deepseek, media + quality

**Files:**
- Modify: `functions/api/article-builder.js` (`generateBlock`, `handleGenerateBlock`, imports)

- [ ] **Step 1: Import the rest of the engine** at the top of `article-builder.js`:

```js
import { buildSystemPrompt, validateBlockData } from './_shared/blocks.js';
import { selectRelevantChunks } from './_shared/retrieval.js';
import { injectMedia } from './_shared/media.js';
import { assessBlockQuality } from './_shared/quality.js';
```

- [ ] **Step 2: Replace `generateBlock`** so the model receives the REAL schema (via `buildSystemPrompt`) plus tight article context, and only the relevant chunks:

```js
async function generateBlock(env, planItem, relevantChunks, facts, ctx, lang) {
  const schemaPrompt = buildSystemPrompt(planItem.type, 'create', lang, false); // injects schema + example + VOICE_GUIDE
  const system = `${schemaPrompt}

ARTICLE CONTEXT (write this block as part of a larger narrative):
- Through-line (the article's spine): ${ctx.throughLine || '(none)'}
- This block's narrative beat: ${planItem.narrativeBeat || 'rising'} (exposition=set up, rising=build, climax=the turn, falling=implications, resolution=land it)
- Tone: ${ctx.tone}; block ${ctx.blockIndex + 1} of ${ctx.totalBlocks}.
- Previous section ended with: "${ctx.prevLead || '(this is the opening)'}" — continue from it; do NOT repeat earlier points.

SOURCE GROUNDING: use only facts present in the provided source excerpts; do not invent names/dates/numbers/quotes. If a needed fact is absent, omit it rather than writing [NEEDS SOURCE]. For any image field, leave it empty and instead write a vivid alt/caption describing the ideal photo.

Return ONLY valid JSON: { "data": { ...matches the schema above... }, "lead": "the first ~12 words of this block's main text", "confidence": "high|medium|low" }.`;
  const user = `Headline to realize: ${planItem.headline || '(none)'}
Rationale: ${planItem.rationale || ''}

Relevant source excerpts:
${relevantChunks.join('\n\n---\n\n')}

Relevant facts:
${facts.map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n')}`;
  const raw = await callModel(env, { model: 'deepseek-v4-pro', system, user, maxTokens: 4096, temperature: 0.6 });
  return parseAIResponse(raw);
}
```

- [ ] **Step 3: Rewrite `handleGenerateBlock`** to retrieve, validate, repair, inject media, and assess quality:

```js
async function handleGenerateBlock(env, body) {
  const { type, planItem, chunks, facts, articleContext, lang } = body;
  if (!type || !planItem) return new Response(JSON.stringify({ error: 'Missing type or planItem' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const query = [planItem.headline, planItem.rationale, ...(planItem.sourceRefs || [])].filter(Boolean).join(' ');
  const relevant = selectRelevantChunks(chunks || [], query, 9000); // bounded context → no overflow

  let parsed = await generateBlock(env, { ...planItem, type }, relevant, facts || [], articleContext || {}, lang || 'de');
  let data = parsed.data || parsed;

  // schema validation → one repair retry if invalid
  let check = validateBlockData(type, data);
  if (!check.valid) {
    const retry = await generateBlock(env, { ...planItem, type, rationale: (planItem.rationale || '') + ` (previous output was invalid: ${check.errors?.join(', ')}. Match the schema exactly.)` }, relevant, facts || [], articleContext || {}, lang || 'de');
    const retryData = retry.data || retry;
    if (validateBlockData(type, retryData).valid) { data = retryData; parsed = retry; }
  }

  data = injectMedia(type, data, articleContext?.blockIndex || 0); // never blank media
  const quality = assessBlockQuality(type, data);
  data._confidence = parsed.confidence || 'medium';

  return new Response(JSON.stringify({
    data,
    confidence: parsed.confidence || 'medium',
    lead: parsed.lead || '',
    quality,                       // { ok, issues } → shown in Phase 4
    sourceRefs: planItem.sourceRefs || [],
  }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
```
> Confirm `validateBlockData`'s return shape (`{valid, errors}` vs boolean) from Task 1 and adjust the `.errors`/`.valid` access accordingly.

- [ ] **Step 4: Manual verification.** Deploy preview. Generate one Editorial and one ImageGrid via the builder. Confirm: Editorial renders real paragraphs in `content[]` (not empty); ImageGrid shows mock art + AI captions; no `[NEEDS SOURCE]`; the prompt did not overflow (no 500 / timeout on a long source).

- [ ] **Step 5: Commit**

```bash
git add functions/api/article-builder.js
git commit -m "feat(ai): schema-grounded block generation with retrieval, deepseek, media, quality"
```

---

### Task 8: Wire the admin builder — continuity, chunks, quality surfacing

**Files:**
- Modify: `admin/ui/article-builder.js` (Phase 1 analyze handler, Phase 3 generate loop, Phase 4 review)

- [ ] **Step 1: Store `throughLine` + `chunks` from analyze.** In `renderPhase1`'s analyze handler, after `builderState.plan = result.plan`:

```js
builderState.throughLine = result.throughLine || '';
builderState.chunks = result.chunks || builderState.sources.map(s => s.content);
```
And add `throughLine: '', chunks: []` to `resetState()`.

- [ ] **Step 2: Pass continuity + chunks (not all raw sources) in Phase 3.** Replace the `apiFetch('/api/article-builder', {...})` body inside `generateAll()` with:

```js
const result = await apiFetch('/api/article-builder', {
  action: 'generate-block',
  type: planItem.type,
  planItem,
  chunks: builderState.chunks,                 // server retrieves the relevant ones per block
  facts: builderState.facts,
  articleContext: {
    title: builderState.plan[0]?.headline || 'Article',
    tone: builderState.tone,
    lang: builderState.lang,
    throughLine: builderState.throughLine,
    narrativeBeat: planItem.narrativeBeat,
    blockIndex: i,
    totalBlocks: total,
    prevLead: previousSummaries[previousSummaries.length - 1] || '',
  },
  lang: builderState.lang,
});
```
And change the continuity push from a headline to the real lead:
```js
previousSummaries.push(result.lead || planItem.headline || '');
```
Store quality on the generated entry: add `quality: result.quality` to the `builderState.generated.push({...})` object.

- [ ] **Step 3: Surface quality in Phase 4.** In `renderPhase4`, for each `g` with `g.quality && !g.quality.ok`, render its issues under the row:

```js
if (g.quality && !g.quality.ok) {
  row.appendChild(el('div', { className: 'ab-review-issues', textContent: '⚠ ' + g.quality.issues.join(' · ') }));
}
```

- [ ] **Step 4: Manual end-to-end.** Deploy preview. Paste a real ~3000-word article, run all four phases, Insert into page. Verify against the acceptance criteria at the top: real text everywhere, images present, arc reads, continuity holds, no overflow errors.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/article-builder.js
git commit -m "feat(ai): article builder passes through-line + continuity + chunks; shows quality flags"
```

---

### Task 9: End-to-end verification + ship

- [ ] **Step 1: Run all shared unit tests.**

Run: `node --test functions/api/_shared/*.test.mjs`
Expected: all PASS.

- [ ] **Step 2: Full manual run against the "aha" criteria.** Use a real source (a 2–4k word feature). Walk all 4 phases. Open the inserted article in the preview. Score it against each of the 6 acceptance criteria; note any that fail.

- [ ] **Step 3: Fix any failing criterion** (most likely: a block type whose schema example is thin → enrich `BLOCK_SCHEMAS[type].example` in `_shared/blocks.js`; or a beat that reads flat → tighten `buildPlanPrompt`). Re-run Step 2.

- [ ] **Step 4: Deploy + verify live.**

```bash
npm run deploy
curl -s https://scrollycms.pages.dev/api/article-builder -X OPTIONS -o /dev/null -w "%{http_code}\n"  # 204
```
Then run one real article end-to-end on production.

- [ ] **Step 5: Final commit (if any fixes in Step 3).**

```bash
git add -A && git commit -m "polish(ai): tune schemas/prompts to clear the aha bar"
```

---

## Self-Review

**1. Spec coverage:**
- "no text" → Task 1 (shared schema engine) + Task 7 (schema-grounded generation + validate/repair). ✓
- "context length problem" → Task 2 (retrieval + char budget) + Task 7 (per-block relevant chunks only). ✓
- "no image" → Task 4 (mock media injection) + Task 7 (applied per block). ✓
- "makes sense structure / Freytag" → Task 3 (planner + validate/repair) + Task 6 (through-line). ✓
- "output quality / aha" → deepseek-v4-pro prose (Tasks 1/6/7), continuity (Task 8), quality gate (Task 5), final acceptance run (Task 9). ✓
- "only section recoms" → Tasks 7+8 make generation actually produce + insert real block data. ✓

**2. Placeholder scan:** Two `> NOTE/confirm` callouts (DeepSeek endpoint id; `validateBlockData` return shape) are deliberate verify-against-source instructions, not deferred work — they tell the engineer to read the existing code before copying. All code steps include real code. No TBD/TODO.

**3. Type consistency:** `chunks` flows analyze→state→generate-block consistently. `throughLine`, `narrativeBeat`, `prevLead`, `lead`, `quality{ok,issues}` are named identically across server (Tasks 6/7) and client (Task 8). `selectRelevantChunks`, `injectMedia`, `validatePlanStructure`, `repairPlanStructure`, `assessBlockQuality`, `callModel` signatures match their call sites. One flagged dependency: `validateBlockData`'s real return shape — Task 1 Step 2 and Task 7 Step 3 both instruct confirming it; resolve once in Task 1 and the rest follow.

**Scope note:** This is one coherent subsystem (the article builder) delivered incrementally — each task ends green and is independently valuable. Real external-image search and a Claude-tier model are explicit future upgrades, out of scope per the locked decisions.
