# Rich Components, Visual Previews & Generic Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the component library with rich editorial blocks inspired by NYT/Reuters scrollytelling, add visual previews to the picker and Claude-generation modal, and decouple Claude prompts from the source page so newly-generated components no longer "steal" motifs (pyramid imagery, year-prefixed lines) from the original journalism site.

**Architecture:** Three coordinated changes touching the same content-pipeline files. (1) The server-side Claude prompt builder is rewritten to be domain-neutral with abstract structural examples; the user's request becomes the sole subject-matter source. (2) Five new component types (one per task) are added end-to-end — each ships its server schema, render function, admin form, CSS, and palette preview together. (3) The admin palette renders a small visual mockup of each component so users see what they're about to add. All work stays in the same vanilla-HTML/JS stack — no new dependencies.

**Tech Stack:** Node + Express (server), vanilla ES modules (renderer), vanilla DOM (admin UI). No build step, no test framework, no new dependencies. Verification is via curl scripts + Chrome MCP screenshots.

**Reference: scrollytelling components in NYT, Reuters, Washington Post that we WILL add:**
- BigNumber inline + Stat-row block (huge stats with labels — used in every NYT data story)
- Timeline block (vertical dated events — common in NYT history pieces)
- Callout inline + Aside block (highlighted notes — NYT "Sidebar", Reuters "Note")
- DropCap inline (large initial of first paragraph — classic editorial)
- List inline (bulleted / numbered)

**Reference: NYT/Reuters components we are NOT adding now (scope cut):**
- Embedded maps (heavy, off-scope for this storytelling site)
- AnnotatedImage with positioned hotspots (defer — needs coordinate UI)
- VideoEmbed (defer — adds upload + format concerns)
- AuthorByline (defer — meta concern, not core to scrolly storytelling)

---

## File Structure

| Path | Role | Change |
|---|---|---|
| `admin/server.js` | Express server + Claude prompt builder | Rewrite `buildClaudePrompt`. Expand `BLOCK_GUIDES` with new types. |
| `js/render.js` | JSON → DOM hydrator | Add render functions for new block types. Add inline-item handlers in editorial. Inject `COMPONENT_CSS` at first render. |
| `admin/ui/app.js` | Admin SPA | Add `BLOCK_SCHEMAS` entries, `EDITORIAL_ITEM_KINDS` entries, `EDITORIAL_ITEM_FRIENDLY` entries, default data, palette previews. |
| `admin/ui/styles.css` | Admin dashboard styles | Add `.palette-card` preview styling. |
| (no new files) | | Component CSS is injected by `js/render.js` to keep all component-style coupled with the renderer. |

---

## Task 1: Decouple Claude prompts from the original content

**Files:**
- Modify: `admin/server.js:172-260` (BLOCK_GUIDES and buildClaudePrompt)

**Problem:** Today's prompt tells Claude *"this is a serious, narrative German-language scrollytelling about the history of journalism"* and shows a concrete journalism-themed Editorial sample. When the user asks Claude to generate a block about *any* topic (e.g. Watergate, climate, AI), Claude leaks those motifs (pyramid imagery, year-prefixed lines, journalism jargon) because they look like "house style". The fix is: zero domain framing, abstract structural examples, explicit anti-leak instruction. The user's prompt becomes the only subject-matter source.

- [ ] **Step 1: Replace `BLOCK_GUIDES` with domain-neutral examples**

In `admin/server.js`, replace the `const BLOCK_GUIDES = { ... }` block (currently ~lines 172-220) with:

```js
const BLOCK_GUIDES = {
  Hero: `A "Hero" intro block at the very top of a page. data shape:
{
  "brand": string,                  // small uppercase label at the very top (e.g. publisher / series name)
  "titleHtml": string,              // main title; wrap a word in <span>…</span> to color-accent it; <br> allowed
  "subtitle": string,               // one-line subtitle under the title
  "scrollCueText": string,          // text next to the down-arrow cue (e.g. "Scroll", "Read on")
  "lines": [                        // OPTIONAL narrative lines that fade in one-by-one BEFORE the title
    { "cls": "cin-l1", "text": string }   // 0..6 items; if you set this, keep each line under 90 characters
  ]
}
"lines" is optional and most pages leave it empty (omit or use []). Only fill it when the user explicitly asks for
animated intro lines. Never invent year-prefixed lines or thematic motifs that the user did not ask for.`,

  VizPanel: `A "VizPanel" block sets the initial label of a shared interactive chart that lives in the page background.
{ "initialTitle": string, "initialSub": string }`,

  Editorial: `An "Editorial" long-form section. data shape:
{ "content": [ <inline items in order> ] }

Each item has a "kind" field. Available kinds:
- { "kind": "kicker",        "text": string }                   // small caps lead-in label
- { "kind": "h2",            "text": string }                   // section heading
- { "kind": "lead",          "text": string }                   // larger opening paragraph
- { "kind": "dropcap",       "html": string }                   // a paragraph rendered with a large drop-capital
- { "kind": "p",             "html": string }                   // paragraph; <em>…</em> allowed
- { "kind": "list",          "ordered": boolean, "items": [string, ...] }   // ordered=true for 1.2.3., false for bullets
- { "kind": "bigNumber",     "value": string, "label": string, "context": string? }   // inline big stat
- { "kind": "callout",       "tone": "info"|"note"|"warning", "title": string?, "body": string }
- { "kind": "pullquote",     "text": "\\"…\\"", "cite": "— Author, Year" }
- { "kind": "separator" }
- { "kind": "figureSingle",  "src": "images/…", "alt": string, "caption": string?, "italic": boolean? }
- { "kind": "figurePair",    "images": [{ "src":"images/…", "alt":string, "flex":1, "minWidth":140 }, {...}] }
- { "kind": "captionInline", "text": string }
- { "kind": "captionCenter", "text": string }

Typical opening pattern: kicker + h2 + lead, then any mix of paragraphs / figures / quotes / lists / stats.
Dropcap is usually used at most once per section, on the first body paragraph.`,

  Scrolly: `A "Scrolly" sticky-chart section with stepped narrative on the side. data shape:
{
  "scrollyId": "scrolly-X",          // auto-managed; the admin sets this
  "stepsId":   "steps-X",            // auto-managed; the admin sets this
  "steps": [
    { "stepIndex": number,           // auto-managed
      "badgeKind": "pyramid"|"data"|"explain"|"future"|"voice",
      // NOTE: badgeKind values are color keys only:
      //   pyramid = orange, data = blue, explain = purple, future = green, voice = pink
      // They are NOT topic keywords. Do not treat "pyramid" as a content theme.
      "badgeLabel": string,          // 1–3 words shown inside the colored chip
      "body": string }               // 1–2 sentences for the step
  ]
}
Generate 3–5 steps unless the user specifies a number.`,

  Outro: `An "Outro" closing section. data shape:
{ "h2": string, "paragraphs": [string, ...], "finalLine": string, "sourcesHtml": string }
sourcesHtml is plain text with " · " separators for citations; <br> allowed.`,

  Timeline: `A "Timeline" vertical-events block. data shape:
{
  "title": string,                    // optional heading above the timeline
  "events": [
    { "when": string,                 // a short date or period label, e.g. "1969" or "March 2020"
      "title": string,                // short event title
      "body": string }                // 1–2 sentences of context
  ]
}
Generate 4–8 events unless the user specifies a number.`,

  StatRow: `A "StatRow" block — a horizontal row of 2–4 large statistics. data shape:
{
  "title": string,                    // optional heading above the row
  "stats": [
    { "value": string,                // big visible value, e.g. "67%" or "8,527" or "3×"
      "label": string,                // 1-line label under the value
      "context": string }             // 1-line tiny grey context line (optional)
  ]
}
Generate 2–4 stats per row.`,

  Aside: `An "Aside" full-width highlighted callout block (heavier than an inline callout). data shape:
{ "tone": "info"|"note"|"warning",
  "title": string?,
  "body": string }                    // 1–3 short paragraphs separated by \\n\\n`,
};
```

- [ ] **Step 2: Rewrite `buildClaudePrompt` to be content-agnostic**

Replace the existing `function buildClaudePrompt({ type, userPrompt, images, currentData, mode, doc })` body with:

```js
function buildClaudePrompt({ type, userPrompt, images, currentData, mode, doc }) {
  const guide = BLOCK_GUIDES[type] || `A "${type}" block. Output JSON for its data field.`;

  // Domain-neutral style guidance. We deliberately give NO topical context from the
  // existing page so Claude does not borrow motifs (pyramid, year-prefixed lines, etc.).
  const lang = (doc && doc.lang) || 'en';
  const style = `
Output language: ${lang}.
Tone: clean, factual longform editorial prose. Match a serious newspaper voice (NYT / Reuters / The Atlantic).
Avoid filler, avoid clichés, avoid em-dashes used as ornament.
Sentence length varies but stays readable.`;

  const imgs = (images && images.length)
    ? `\nThe user uploaded these images. Use the EXACT paths as the "src" field of any image item. Do not invent new image paths:\n` +
      images.map(p => `  - ${p}`).join('\n')
    : `\n(No images uploaded. Do not invent image paths. If you would normally include an image, omit it.)`;

  const ctx = (currentData)
    ? `\nThe current data of THIS block (you are rewriting it):\n` + JSON.stringify(currentData, null, 2)
    : '';

  const action = mode === 'improve'
    ? `Rewrite the current block according to the user's request. Preserve images unless the user asks otherwise.`
    : `Generate a brand-new block from scratch matching the user's request.`;

  return `You are a content-generation assistant for a CMS that powers longform scrolling stories.

${action}

Block type: ${type}
${guide}
${style}
${imgs}
${ctx}

User request (THIS IS THE ONLY SUBJECT-MATTER SOURCE):
"""
${userPrompt}
"""

CRITICAL RULES:
1. The user's request is the SOLE source of subject matter. Write about exactly what they asked for and nothing else.
2. Do NOT invent or borrow themes, names, dates, numbers, locations, or imagery that the user did not mention or that are not necessary common knowledge for the subject they asked about.
3. Do NOT add year-prefixed historical lines, pyramid imagery, journalism-history motifs, or any "house style" topical framing — those belong only to other pages of this site, not this block.
4. If a field is optional (e.g. Hero "lines"), omit it unless the user clearly wants it.
5. Numbers and dates must be factually accurate for the user's topic, or omitted.

Respond with ONLY a single valid JSON object — no markdown fences, no commentary, no preamble. The JSON must match the "data" shape for a ${type} block exactly. Do not include outer "type" or "id" fields; only the data shape.`;
}
```

- [ ] **Step 3: Pass the doc language to the prompt builder**

In `admin/server.js`, find the `/admin/api/generate` handler (around the bottom of the Claude section). Locate the `buildClaudePrompt({ type, userPrompt:..., images, currentData, mode, })` call. Update it to pass `doc` (load the current page document so language is correct):

```js
app.post('/admin/api/generate', requireAuth, async (req, res) => {
  try {
    const { type, prompt, images, currentData, mode, pageId } = req.body || {};
    if (!type || !BLOCK_GUIDES[type]) return res.status(400).json({ error: `unknown block type: ${type}` });
    if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    if (prompt.length > 4000) return res.status(400).json({ error: 'prompt too long (max 4000 chars)' });

    // Load the page doc (if pageId provided) just to pass language. We deliberately
    // do NOT pass any blocks/content from the page to Claude — see anti-leak rules.
    let pageDoc = null;
    if (pageId && /^[A-Za-z0-9_-]+$/.test(pageId)) {
      try {
        const raw = await fsp.readFile(pagePath(pageId), 'utf8');
        const full = JSON.parse(raw);
        pageDoc = { lang: full.lang || 'en' };
      } catch {}
    }

    const fullPrompt = buildClaudePrompt({
      type, userPrompt: prompt.trim(), images, currentData, mode, doc: pageDoc,
    });
    const raw = await runClaude(fullPrompt);
    const data = extractJson(raw);
    res.json({ ok: true, data });
  } catch (e) {
    console.error('generate failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});
```

- [ ] **Step 4: Update the client to send pageId**

In `admin/ui/app.js`, locate the `genBtn.addEventListener('click', async () => { ... })` inside `openClaudeModal`. Update the API call body to include `pageId: state.currentPageId`:

```js
const r = await api('POST', '/admin/api/generate', {
  type,
  prompt,
  images: uploadedImages,
  currentData: isImprove ? opts.block.data : null,
  mode: isImprove ? 'improve' : 'create',
  pageId: state.currentPageId,
});
```

- [ ] **Step 5: Restart server, run anti-leak verification**

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login \
  -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null

# Generate something far from the journalism domain
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"Hero","prompt":"A page about backyard astronomy for beginners","mode":"create","pageId":"index"}' \
  | tee /tmp/test1.json
echo
# Verify: NO pyramid words, NO journalism words, NO year-prefixed lines copied from index
node -e "
  const d = JSON.parse(require('fs').readFileSync('/tmp/test1.json','utf8')).data;
  const flat = JSON.stringify(d).toLowerCase();
  const leaks = ['pyramide','journalist','nachrichten','marinos','1924','1605','wer? was? wann?','umgekehrte'];
  const found = leaks.filter(w => flat.includes(w));
  console.log('lines len:', (d.lines||[]).length);
  console.log('title:', d.titleHtml);
  console.log('LEAKS DETECTED:', found.length ? found : 'none');
  process.exit(found.length ? 1 : 0);
"
```

Expected: exit code 0, "LEAKS DETECTED: none". If any leak words show up, the prompt is still biasing — re-read step 2.

- [ ] **Step 6: Commit**

```bash
git add admin/server.js admin/ui/app.js
git commit -m "fix(admin): decouple Claude generation from original content

Rewrite buildClaudePrompt to be domain-neutral. Remove journalism-specific
framing and inline examples. Add explicit anti-leak rules so Claude treats
the user's prompt as the only subject-matter source.

The Hero 'lines' field is now optional with explicit instruction not to
invent year-prefixed historical lines. Scrolly badgeKind values are
clarified as color keys, not topic keywords.

Pages now pass only lang (not blocks) to the prompt builder."
```

---

## Task 2: Component CSS injection mechanism

**Files:**
- Modify: `js/render.js` (add `COMPONENT_CSS` constant + auto-inject)

**Why:** New components (BigNumber, Timeline, Callout, etc.) need styling. The current site keeps CSS inline in `index.rendered.html`. Adding it there would mean editing every rendered shell — and shells for new pages don't exist yet. Cleaner: ship the new-component CSS *with* the renderer. The renderer injects a `<style>` tag on first call.

- [ ] **Step 1: Add the CSS injector at the top of render.js**

In `js/render.js`, just below the imports/intro comment, add:

```js
// CSS for components introduced after the original site. Injected once on first render
// so every page that uses render.js automatically picks up the new component styles.
const COMPONENT_CSS = `
/* ── DropCap ── */
.editorial p.has-dropcap::first-letter{float:left;font-family:'Source Serif 4',serif;font-size:4.2rem;line-height:.95;padding:.3rem .55rem .1rem 0;color:var(--accent);font-weight:700}

/* ── Inline Callout (inside Editorial) ── */
.callout{border-left:4px solid var(--accent);background:#fff8f1;border-radius:0 8px 8px 0;padding:.9rem 1.1rem .95rem;margin:1.6rem 0;font-family:'DM Sans',sans-serif;color:var(--text);font-size:1rem;line-height:1.6}
.callout-note{background:#f1f6fb;border-left-color:#3d7a94}
.callout-warning{background:#fdf2eb;border-left-color:#c45b5b}
.callout-title{font-weight:600;margin-bottom:.25rem;font-size:.95rem;color:var(--text)}

/* ── BigNumber (inline stat inside Editorial) ── */
.bignumber{display:block;text-align:center;margin:2rem 0;font-family:'DM Sans',sans-serif}
.bignumber-value{font-family:'Source Serif 4',serif;font-size:clamp(2.6rem,6vw,4.6rem);font-weight:700;color:var(--accent);line-height:1;letter-spacing:-.02em}
.bignumber-label{font-size:.95rem;color:var(--text);margin-top:.4rem;font-weight:500}
.bignumber-context{font-size:.78rem;color:var(--muted);margin-top:.25rem;font-style:italic}

/* ── List (ordered / unordered, inside Editorial) ── */
.editorial ul.ed-list,.editorial ol.ed-list{margin:1.2rem 0 1.8rem;padding-left:1.4rem;font-family:'Source Serif 4',serif;font-size:1.15rem;line-height:1.85;color:var(--text)}
.editorial ul.ed-list li,.editorial ol.ed-list li{margin-bottom:.6rem}
.editorial ul.ed-list li::marker{color:var(--accent)}

/* ── Timeline block ── */
.timeline-block{max-width:720px;margin:0 auto;padding:3rem 2rem;position:relative;z-index:3;background:var(--bg)}
.timeline-block h3{font-family:'Source Serif 4',serif;font-size:1.6rem;font-weight:700;margin-bottom:1.6rem;letter-spacing:-.02em}
.timeline-list{position:relative;padding-left:1.6rem}
.timeline-list::before{content:'';position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:#e6e1da}
.timeline-event{position:relative;margin-bottom:1.4rem}
.timeline-event::before{content:'';position:absolute;left:-1.6rem;top:.45rem;width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--bg)}
.timeline-when{font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.15rem}
.timeline-title{font-family:'Source Serif 4',serif;font-size:1.2rem;font-weight:700;line-height:1.3;margin-bottom:.25rem}
.timeline-body{font-family:'Source Serif 4',serif;font-size:1rem;line-height:1.6;color:var(--text)}

/* ── StatRow block ── */
.statrow-block{max-width:1100px;margin:0 auto;padding:3rem 2rem;position:relative;z-index:3;background:var(--bg)}
.statrow-block h3{font-family:'Source Serif 4',serif;font-size:1.6rem;font-weight:700;margin-bottom:1.6rem;letter-spacing:-.02em;text-align:center}
.statrow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1.6rem;text-align:center}
.statrow-cell .v{font-family:'Source Serif 4',serif;font-size:clamp(2.4rem,5vw,3.6rem);font-weight:700;color:var(--accent);line-height:1;letter-spacing:-.02em}
.statrow-cell .l{font-family:'DM Sans',sans-serif;font-size:.95rem;color:var(--text);margin-top:.5rem;font-weight:500}
.statrow-cell .c{font-family:'DM Sans',sans-serif;font-size:.78rem;color:var(--muted);margin-top:.25rem;font-style:italic}

/* ── Aside block ── */
.aside-block{max-width:720px;margin:2.5rem auto;padding:1.4rem 1.6rem;border-radius:10px;background:#fff8f1;border-left:4px solid var(--accent);font-family:'DM Sans',sans-serif;position:relative;z-index:3}
.aside-block.tone-note{background:#f1f6fb;border-left-color:#3d7a94}
.aside-block.tone-warning{background:#fdf2eb;border-left-color:#c45b5b}
.aside-block h3{font-family:'Source Serif 4',serif;font-size:1.1rem;font-weight:700;margin-bottom:.4rem}
.aside-block p{font-size:1rem;line-height:1.65;color:var(--text);margin-bottom:.6rem}
.aside-block p:last-child{margin-bottom:0}

@media(max-width:900px){
  .timeline-block,.statrow-block{padding:2.5rem 1.25rem}
  .aside-block{margin:2rem 1.25rem}
}
`;

function injectComponentCSS() {
  if (document.getElementById('__component_css__')) return;
  const tag = document.createElement('style');
  tag.id = '__component_css__';
  tag.textContent = COMPONENT_CSS;
  document.head.appendChild(tag);
}
```

- [ ] **Step 2: Call `injectComponentCSS()` at the start of `render()`**

In `js/render.js`, in the `export async function render(...)` body, add a call right at the top:

```js
export async function render(jsonUrl, rootSelector = '#page-root') {
  injectComponentCSS();
  if (!jsonUrl) jsonUrl = defaultContentUrl();
  // ...rest unchanged
```

- [ ] **Step 3: Verify CSS is injected**

Start the server (`./start-admin.sh` in a separate terminal — or `lsof -ti :4000 | xargs kill 2>/dev/null; ADMIN_PASSWORD=test1234 node admin/server.js > /tmp/admin.log 2>&1 &; sleep 2`).

```bash
curl -s -o /dev/null -w "GET / → %{http_code}\n" http://localhost:4000/
```

Then in Chrome via the preview MCP:
```js
mcp__Claude_Preview__preview_eval({
  serverId: '...',
  expression: "!!document.getElementById('__component_css__')"
})
```
Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add js/render.js
git commit -m "feat(renderer): inject component CSS on first render

Add COMPONENT_CSS constant containing styles for new components
(DropCap, Callout, BigNumber, List, Timeline, StatRow, Aside).
Injected once on first render call so every page picks up the
new styles without modifying the rendered shell."
```

---

## Task 3: BigNumber inline + StatRow block

**Files:**
- Modify: `admin/server.js` (BLOCK_GUIDES already has BigNumber + StatRow from Task 1)
- Modify: `js/render.js` (add `renderEditorialItem` cases + `renderStatRow`)
- Modify: `admin/ui/app.js` (BLOCK_SCHEMAS.StatRow, editorialFieldsFor cases, default data, palette entry, friendly map)

- [ ] **Step 1: Add `bigNumber` editorial item renderer**

In `js/render.js`, inside the `renderEditorialItem` function's switch, add this case (right above the default):

```js
    case 'bigNumber': {
      const wrap = el('div', { class: 'bignumber' });
      wrap.appendChild(el('div', { class: 'bignumber-value' }, item.value ?? ''));
      if (item.label)   wrap.appendChild(el('div', { class: 'bignumber-label' },   item.label));
      if (item.context) wrap.appendChild(el('div', { class: 'bignumber-context' }, item.context));
      return wrap;
    }
```

- [ ] **Step 2: Add `renderStatRow` block renderer**

In `js/render.js`, just below `renderOutro`, add:

```js
function renderStatRow(d) {
  const sec = el('section', { class: 'statrow-block' });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  const grid = el('div', { class: 'statrow-grid' });
  (d.stats || []).forEach(s => {
    const cell = el('div', { class: 'statrow-cell' });
    cell.appendChild(el('div', { class: 'v' }, s.value ?? ''));
    if (s.label)   cell.appendChild(el('div', { class: 'l' }, s.label));
    if (s.context) cell.appendChild(el('div', { class: 'c' }, s.context));
    grid.appendChild(cell);
  });
  sec.appendChild(grid);
  return sec;
}
```

And register it in `BLOCK_RENDERERS` (top of the file):

```js
const BLOCK_RENDERERS = {
  Hero:       renderHero,
  VizPanel:   renderVizPanel,
  Editorial:  renderEditorial,
  Scrolly:    renderScrolly,
  Outro:      renderOutro,
  StatRow:    renderStatRow,    // ← new
};
```

- [ ] **Step 3: Add the StatRow form to the admin**

In `admin/ui/app.js`, append a new entry inside `BLOCK_SCHEMAS`:

```js
  StatRow: {
    name: 'Stat row',
    description: 'A horizontal row of 2–4 large numbers with labels',
    fields: [
      { key: 'title', label: 'Heading (optional)', kind: 'text' },
      { key: 'stats', label: 'Stats',              kind: 'stat_list' },
    ],
  },
```

Then add a new field renderer case for `stat_list` inside `renderField`, right next to `scrolly_steps`:

```js
    case 'stat_list': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((stat, i) => wrap.appendChild(statRowEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add stat';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ value: '', label: '', context: '' }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
```

And add `statRowEditor` right next to `scrollyStepEditor`:

```js
function statRowEditor(list, i, onChange) {
  const stat = list[i];
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="subitem-kind">Stat ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">Value</label>    <input type="text" data-k="value"   value="${escapeAttr(stat.value||'')}"   placeholder="e.g. 67% or 8,527 or 3×">
    <label class="field-label">Label</label>    <input type="text" data-k="label"   value="${escapeAttr(stat.label||'')}"   placeholder="what the number means">
    <label class="field-label">Context</label>  <input type="text" data-k="context" value="${escapeAttr(stat.context||'')}" placeholder="optional sub-line">`;
  row.appendChild(grid);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input', () => { stat[el.dataset.k] = el.value; onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)              { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1)  { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}
```

- [ ] **Step 4: Add BigNumber to editorial palette + StatRow to block palette**

In `admin/ui/app.js`, update `EDITORIAL_ITEM_KINDS` (add bigNumber near other "structural" kinds):

```js
const EDITORIAL_ITEM_KINDS = [
  { kind: 'h2',            label: 'Heading' },
  { kind: 'kicker',        label: 'Kicker' },
  { kind: 'lead',          label: 'Lead' },
  { kind: 'p',             label: 'Paragraph' },
  { kind: 'dropcap',       label: 'Drop-cap paragraph' },     // new — Task 5
  { kind: 'list',          label: 'List' },                    // new — Task 6
  { kind: 'bigNumber',     label: 'Big number' },              // new — this task
  { kind: 'callout',       label: 'Callout' },                 // new — Task 4
  { kind: 'pullquote',     label: 'Pull quote' },
  { kind: 'figureSingle',  label: 'Image' },
  { kind: 'figurePair',    label: 'Image pair' },
  { kind: 'captionInline', label: 'Caption' },
  { kind: 'captionCenter', label: 'Caption (centered)' },
  { kind: 'separator',     label: 'Separator' },
  { kind: 'whatsappCard',  label: 'WhatsApp card' },
];
```

Add the matching `EDITORIAL_ITEM_FRIENDLY` entry:
```js
  bigNumber:     { label: 'Big number',     hint: 'large stat with label' },
```

Add `editorialFieldsFor` case:
```js
    case 'bigNumber':
      return [
        { key: 'value',   label: 'Value',   kind: 'text' },
        { key: 'label',   label: 'Label',   kind: 'text' },
        { key: 'context', label: 'Context (optional small line)', kind: 'text' },
      ];
```

Add `defaultItemFor` case:
```js
    case 'bigNumber':      return { kind, value: '0', label: 'label', context: '' };
```

Append StatRow to `PALETTE_BLOCKS`:
```js
const PALETTE_BLOCKS = [
  { type: 'Hero',      desc: 'Title section at the top of a page' },
  { type: 'Editorial', desc: 'Long-form text with paragraphs, images, quotes' },
  { type: 'Scrolly',   desc: 'Scroll-driven stepped narrative with a sticky chart' },
  { type: 'Timeline',  desc: 'Vertical dated events' },           // new — Task 4
  { type: 'StatRow',   desc: 'Row of 2–4 large statistics' },     // new — this task
  { type: 'Aside',     desc: 'Highlighted callout box' },         // new — Task 4
  { type: 'Outro',     desc: 'Closing section with paragraphs and sources' },
  { type: 'VizPanel',  desc: 'Advanced — visualization container' },
];
```

Add `defaultDataFor` case:
```js
    case 'StatRow':   return { title: '', stats: [{value:'',label:'',context:''}, {value:'',label:'',context:''}, {value:'',label:'',context:''}] };
```

- [ ] **Step 5: Verify**

Restart the server. Open the admin, click `+ Add → StatRow`, click `Skip — add empty block`. Confirm a StatRow form renders with 3 stat rows. Fill in one stat (`67%` / `of newsrooms`), Save & Publish, and confirm the live preview shows a big "67%" with label.

Then in the Editorial editor, add a `Big number` inline item with value="100", label="years", confirm it renders large+orange in preview.

- [ ] **Step 6: Commit**

```bash
git add admin/server.js admin/ui/app.js js/render.js
git commit -m "feat(components): BigNumber inline + StatRow block

NYT-style stat presentation. BigNumber is an inline editorial item
for highlighting a single stat mid-text. StatRow is a top-level block
for a horizontal grid of 2–4 stats with optional heading.

CSS already in COMPONENT_CSS injected by render.js."
```

---

## Task 4: Timeline block + Aside block + Callout inline item

**Files:**
- Modify: `js/render.js` (renderTimeline, renderAside, callout case in renderEditorialItem)
- Modify: `admin/ui/app.js` (BLOCK_SCHEMAS.Timeline + .Aside, defaults, editorial fields for callout, friendly map)

- [ ] **Step 1: Add the renderers**

In `js/render.js`, register in `BLOCK_RENDERERS`:
```js
const BLOCK_RENDERERS = {
  Hero:       renderHero,
  VizPanel:   renderVizPanel,
  Editorial:  renderEditorial,
  Scrolly:    renderScrolly,
  Outro:      renderOutro,
  StatRow:    renderStatRow,
  Timeline:   renderTimeline,
  Aside:      renderAside,
};
```

Below `renderStatRow`, add:
```js
function renderTimeline(d) {
  const sec = el('section', { class: 'timeline-block' });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  const list = el('div', { class: 'timeline-list' });
  (d.events || []).forEach(ev => {
    const item = el('div', { class: 'timeline-event' });
    if (ev.when)  item.appendChild(el('div', { class: 'timeline-when' },  ev.when));
    if (ev.title) item.appendChild(el('div', { class: 'timeline-title' }, ev.title));
    if (ev.body) {
      const body = el('div', { class: 'timeline-body' });
      body.innerHTML = ev.body;  // allow inline <em>
      item.appendChild(body);
    }
    list.appendChild(item);
  });
  sec.appendChild(list);
  return sec;
}

function renderAside(d) {
  const sec = el('aside', { class: `aside-block tone-${d.tone || 'info'}` });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  (String(d.body || '').split(/\n\n+/)).forEach(p => {
    if (!p.trim()) return;
    const para = el('p');
    para.innerHTML = p;
    sec.appendChild(para);
  });
  return sec;
}
```

Add the `callout` case inside the `renderEditorialItem` switch (before default):
```js
    case 'callout': {
      const wrap = el('div', { class: `callout callout-${item.tone || 'info'}` });
      if (item.title) wrap.appendChild(el('div', { class: 'callout-title' }, item.title));
      const body = el('div');
      body.innerHTML = item.body || '';
      wrap.appendChild(body);
      return wrap;
    }
```

- [ ] **Step 2: Add Timeline + Aside schemas to admin**

In `admin/ui/app.js`, append inside `BLOCK_SCHEMAS`:
```js
  Timeline: {
    name: 'Timeline',
    description: 'Vertical timeline — dated events with title and body',
    fields: [
      { key: 'title',  label: 'Heading (optional)', kind: 'text' },
      { key: 'events', label: 'Events',             kind: 'timeline_events' },
    ],
  },
  Aside: {
    name: 'Aside',
    description: 'Full-width highlighted callout box',
    fields: [
      { key: 'tone',  label: 'Tone', kind: 'tone_select' },
      { key: 'title', label: 'Title (optional)', kind: 'text' },
      { key: 'body',  label: 'Body (separate paragraphs with a blank line)', kind: 'textarea' },
    ],
  },
```

Add field renderers in `renderField`:
```js
    case 'tone_select': {
      const sel = document.createElement('select');
      ['info','note','warning'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if ((val||'info') === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { data[field.key] = sel.value; onChange(); });
      wrap.appendChild(sel);
      break;
    }
    case 'timeline_events': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((ev, i) => wrap.appendChild(timelineEventEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add event';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ when:'', title:'', body:'' }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
```

Add the event editor:
```js
function timelineEventEditor(list, i, onChange) {
  const ev = list[i];
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="subitem-kind">Event ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">When</label>  <input type="text" data-k="when"  value="${escapeAttr(ev.when||'')}"  placeholder="e.g. 1969 or March 2020">
    <label class="field-label">Title</label> <input type="text" data-k="title" value="${escapeAttr(ev.title||'')}" placeholder="short event title">
    <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
    <textarea data-k="body" rows="2">${escapeText(ev.body||'')}</textarea>`;
  row.appendChild(grid);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input', () => { ev[el.dataset.k] = el.value; onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}
```

Add defaults:
```js
    case 'Timeline':  return { title: '', events: [{when:'',title:'',body:''}, {when:'',title:'',body:''}, {when:'',title:'',body:''}] };
    case 'Aside':     return { tone: 'info', title: '', body: '' };
```

Add inline `callout` to `editorialFieldsFor`, `defaultItemFor`, `EDITORIAL_ITEM_FRIENDLY`:
```js
// editorialFieldsFor:
    case 'callout':
      return [
        { key: 'tone',  label: 'Tone', kind: 'tone_select' },
        { key: 'title', label: 'Title (optional)', kind: 'text' },
        { key: 'body',  label: 'Body', kind: 'textarea' },
      ];

// defaultItemFor:
    case 'callout':        return { kind, tone: 'info', title: '', body: 'A short callout.' };

// EDITORIAL_ITEM_FRIENDLY:
  callout:       { label: 'Callout', hint: 'highlighted box' },
```

Note: `tone_select` is shared with the Aside field, so `simpleField` (used by editorial items) needs to handle it too. Add this case to `simpleField`'s switch:
```js
    case 'tone_select': {
      const sel = document.createElement('select');
      ['info','note','warning'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if ((getVal()||'info') === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => setVal(sel.value));
      wrap.appendChild(sel);
      break;
    }
```

- [ ] **Step 3: Verify**

Restart server. Add a Timeline block with 3 events filled in. Save & Publish. Confirm preview shows a vertical line with 3 orange dots and dated entries.

Add an Aside block with tone="warning", title="Caveat", body="One paragraph.". Save. Confirm preview shows a red-bordered box.

In an Editorial, add an inline Callout with tone="note", body="A note.". Save. Confirm preview shows a blue-bordered inline box.

- [ ] **Step 4: Commit**

```bash
git add admin/server.js admin/ui/app.js js/render.js
git commit -m "feat(components): Timeline + Aside blocks + Callout inline

Adds three NYT-style components:
- Timeline: vertical dated events with orange-dot markers
- Aside: full-width highlighted block (info / note / warning)
- Callout: inline highlighted box inside Editorial

All share a tone selector. Renderers in js/render.js, schemas and forms
in admin/ui/app.js."
```

---

## Task 5: DropCap inline item

**Files:**
- Modify: `js/render.js` (dropcap case in renderEditorialItem)
- Modify: `admin/ui/app.js` (EDITORIAL_ITEM_FRIENDLY, defaultItemFor, editorialFieldsFor)

- [ ] **Step 1: Add the `dropcap` renderer case**

In `js/render.js`, inside `renderEditorialItem` switch (before default):
```js
    case 'dropcap': {
      const p = el('p', { class: 'has-dropcap' });
      p.innerHTML = item.html ?? item.text ?? '';
      return p;
    }
```

- [ ] **Step 2: Wire it into the admin**

In `admin/ui/app.js`:

`EDITORIAL_ITEM_FRIENDLY` — add:
```js
  dropcap:       { label: 'Drop-cap paragraph', hint: 'paragraph with large initial letter' },
```

`editorialFieldsFor` — add:
```js
    case 'dropcap':
      return [{ key: 'html', label: 'Text', kind: 'textarea' }];
```

`defaultItemFor` — add:
```js
    case 'dropcap':        return { kind, html: 'A first paragraph with a large drop-capital initial.' };
```

(`EDITORIAL_ITEM_KINDS` already lists `dropcap` from Task 3.)

- [ ] **Step 3: Verify**

Add a Drop-cap paragraph as the first content item of any Editorial. Save. Confirm preview shows the first character enlarged, orange, hanging into the left margin.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): DropCap inline editorial item

Classic editorial drop-capital. Pairs well as the first body paragraph
of a section."
```

---

## Task 6: List inline item (ordered / unordered)

**Files:**
- Modify: `js/render.js` (list case in renderEditorialItem)
- Modify: `admin/ui/app.js` (friendly entry, fieldsFor, default, plus string_list field reuse)

- [ ] **Step 1: Add the `list` renderer case**

In `js/render.js`:
```js
    case 'list': {
      const tag = item.ordered ? 'ol' : 'ul';
      const list = el(tag, { class: 'ed-list' });
      (item.items || []).forEach(text => {
        const li = el('li');
        li.innerHTML = text;
        list.appendChild(li);
      });
      return list;
    }
```

- [ ] **Step 2: Wire it into the admin**

`EDITORIAL_ITEM_FRIENDLY`:
```js
  list:          { label: 'List', hint: 'bulleted or numbered' },
```

`editorialFieldsFor`:
```js
    case 'list':
      return [
        { key: 'ordered', label: 'Numbered list (uncheck for bullets)', kind: 'bool' },
        { key: 'items',   label: 'Items',                                kind: 'string_list_inline' },
      ];
```

`defaultItemFor`:
```js
    case 'list':           return { kind, ordered: false, items: ['First item', 'Second item'] };
```

Add a `string_list_inline` case to `simpleField` (so it works inside editorial items, which use `simpleField` not `renderField`):
```js
    case 'string_list_inline': {
      const arr = Array.isArray(getVal()) ? getVal() : [];
      if (!Array.isArray(getVal())) setVal(arr);
      arr.forEach((str, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin-bottom:4px;';
        const ta = document.createElement('textarea');
        ta.rows = 1;
        ta.value = str;
        ta.style.flex = '1';
        ta.addEventListener('input', () => { arr[i] = ta.value; onChange(); });
        const del = document.createElement('button');
        del.textContent = '✕';
        del.className = 'small';
        del.addEventListener('click', (e) => { e.preventDefault(); arr.splice(i,1); onChange(); renderEditor(); });
        row.appendChild(ta);
        row.appendChild(del);
        wrap.appendChild(row);
      });
      const add = document.createElement('button');
      add.textContent = '+ Add item';
      add.className = 'small';
      add.addEventListener('click', (e) => { e.preventDefault(); arr.push(''); onChange(); renderEditor(); });
      wrap.appendChild(add);
      break;
    }
```

- [ ] **Step 3: Verify**

Add a List inline item with 3 entries, leave Numbered unchecked. Save. Confirm preview shows orange bullets with the items. Toggle Numbered → confirm 1. 2. 3.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): list inline editorial item

Bulleted or numbered list (toggle). Items styled with orange markers
to match the rest of the site."
```

---

## Task 7: Visual previews in the picker palette & Claude modal

**Files:**
- Modify: `admin/ui/app.js` (add `BLOCK_PREVIEWS` map, update `renderPalette`, update `openClaudeModal` modal body)
- Modify: `admin/ui/styles.css` (palette card preview styling)

- [ ] **Step 1: Add the preview HTML map**

In `admin/ui/app.js`, just below `PALETTE_BLOCKS`, add:

```js
// Tiny inline mockups shown inside the palette cards and at the top of the
// Claude-generation modal so the user sees what the component looks like
// before generating. Each is plain HTML using common admin colors — NOT the
// rendered component itself.
const BLOCK_PREVIEWS = {
  Hero: `
    <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.18em;color:#8c8078;text-transform:uppercase;">BRAND</div>
    <div style="font:700 18px 'Source Serif 4',serif;line-height:1.05;margin-top:6px;color:#2a2320;">Title <span style="color:#c06830;">word</span></div>
    <div style="font:400 9px 'DM Sans',sans-serif;color:#8c8078;margin-top:3px;">subtitle</div>`,
  Editorial: `
    <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.1em;color:#c06830;text-transform:uppercase;">KICKER</div>
    <div style="font:700 13px 'Source Serif 4',serif;color:#2a2320;line-height:1.2;margin-top:4px;">Heading text</div>
    <div style="margin-top:6px;height:5px;background:#eaeef2;border-radius:2px;"></div>
    <div style="margin-top:3px;height:5px;background:#eaeef2;border-radius:2px;width:85%;"></div>
    <div style="margin-top:3px;height:5px;background:#eaeef2;border-radius:2px;width:60%;"></div>`,
  Scrolly: `
    <div style="display:flex;gap:8px;">
      <div style="flex:1;background:#fde8d8;border-radius:4px;height:48px;display:flex;align-items:center;justify-content:center;font:700 10px 'DM Sans',sans-serif;color:#c06830;">CHART</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
        <div style="background:#fff;border:1px solid #d4c5ff;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#6639ba;">STEP 1</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#8c8078;opacity:.6;">STEP 2</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#8c8078;opacity:.6;">STEP 3</div>
      </div>
    </div>`,
  Timeline: `
    <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px;border-left:2px solid #eaeef2;position:relative;">
      ${[1,2,3].map(i => `
        <div style="display:flex;align-items:flex-start;gap:6px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#c06830;margin-left:-12px;margin-top:3px;flex-shrink:0;"></div>
          <div>
            <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.08em;color:#c06830;text-transform:uppercase;">1969</div>
            <div style="font:700 9px 'Source Serif 4',serif;color:#2a2320;">Event ${i}</div>
          </div>
        </div>`).join('')}
    </div>`,
  StatRow: `
    <div style="display:flex;gap:6px;justify-content:space-around;text-align:center;">
      ${[{v:'67%',l:'label'}, {v:'8.5k',l:'items'}, {v:'3×',l:'more'}].map(s => `
        <div>
          <div style="font:700 18px 'Source Serif 4',serif;color:#c06830;line-height:1;">${s.v}</div>
          <div style="font:500 7px 'DM Sans',sans-serif;color:#2a2320;margin-top:3px;">${s.l}</div>
        </div>`).join('')}
    </div>`,
  Aside: `
    <div style="border-left:3px solid #c06830;background:#fff8f1;border-radius:0 4px 4px 0;padding:6px 8px;">
      <div style="font:700 9px 'Source Serif 4',serif;color:#2a2320;margin-bottom:3px;">Aside title</div>
      <div style="font:400 8px 'DM Sans',sans-serif;color:#2a2320;line-height:1.4;">Highlighted side note.</div>
    </div>`,
  Outro: `
    <div style="font:700 12px 'Source Serif 4',serif;color:#2a2320;">Closing</div>
    <div style="margin-top:5px;height:4px;background:#eaeef2;border-radius:2px;"></div>
    <div style="margin-top:3px;height:4px;background:#eaeef2;border-radius:2px;width:80%;"></div>
    <div style="margin-top:8px;font:600 italic 9px 'Source Serif 4',serif;color:#c06830;">Final emphasized line.</div>`,
  VizPanel: `
    <div style="background:#fde8d8;border-radius:4px;height:48px;display:flex;align-items:center;justify-content:center;font:700 11px 'DM Sans',sans-serif;color:#c06830;letter-spacing:.05em;">VIZ</div>`,
};
```

- [ ] **Step 2: Update `renderPalette` to show previews on each card**

In `admin/ui/app.js`, replace `renderPalette` with:

```js
function renderPalette(body) {
  body.innerHTML = '';
  const intro = document.createElement('p');
  intro.style.cssText = 'margin-bottom:14px;color:#57606a;font-size:12.5px;';
  intro.textContent = 'Pick the kind of section you want to add. Claude will write the content for you on the next step.';
  body.appendChild(intro);
  const grid = document.createElement('div');
  grid.className = 'palette-grid';
  PALETTE_BLOCKS.forEach(({ type, desc }) => {
    const card = document.createElement('button');
    card.className = 'palette-card with-preview';
    card.innerHTML = `
      <div class="palette-preview">${BLOCK_PREVIEWS[type] || ''}</div>
      <span class="name">${type}</span>
      <span class="desc">${desc}</span>`;
    card.addEventListener('click', () => {
      closeModal();
      openClaudeModal({ mode: 'create', type });
    });
    grid.appendChild(card);
  });
  body.appendChild(grid);
}
```

- [ ] **Step 3: Show preview at the top of the Claude generation modal**

In `admin/ui/app.js`, inside `openClaudeModal`, right after `body.innerHTML = '';` and BEFORE the `hint` paragraph, add:

```js
    if (BLOCK_PREVIEWS[type]) {
      const previewBox = document.createElement('div');
      previewBox.style.cssText = 'border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:14px;background:#faf7f2;';
      const previewLabel = document.createElement('div');
      previewLabel.style.cssText = 'font-size:10px;font-weight:600;color:#8c959f;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;';
      previewLabel.textContent = `${type} preview (rough mock)`;
      const previewMock = document.createElement('div');
      previewMock.style.cssText = 'max-width:280px;margin:0 auto;';
      previewMock.innerHTML = BLOCK_PREVIEWS[type];
      previewBox.appendChild(previewLabel);
      previewBox.appendChild(previewMock);
      body.appendChild(previewBox);
    }
```

- [ ] **Step 4: Add palette-card styles**

In `admin/ui/styles.css`, append:
```css
.palette-card.with-preview { padding: 10px 12px 12px; }
.palette-preview {
  margin-bottom: 10px; padding: 10px 12px;
  background: #faf7f2;
  border: 1px solid #eaeef2;
  border-radius: 6px;
  min-height: 80px;
  display: flex; flex-direction: column; justify-content: center;
  overflow: hidden;
}
.palette-card.with-preview .name { margin-top: 2px; }
.palette-grid { gap: 10px; }
```

- [ ] **Step 5: Verify visually**

Restart server. Open admin, click `+ Add`. Confirm each palette card now shows a small preview at the top (Hero → BRAND + title mock; Timeline → 3 dots with dates; StatRow → 3 stats; etc.).

Click Hero → confirm the Claude modal opens with the Hero preview displayed at the top.

Take a screenshot via `mcp__Claude_Preview__preview_screenshot` for confirmation.

- [ ] **Step 6: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(admin): visual previews in palette + Claude modal

Each component type now ships a small inline HTML mockup shown:
- as a preview at the top of each card in the + Add palette
- at the top of the Describe-with-Claude modal

Lets users visually anticipate what they're about to add."
```

---

## Task 8: Diverse-topic smoke test (anti-leak final verification)

**Files:** none — verification only.

This task verifies the Task 1 prompt-decoupling really works across multiple unrelated domains and across all major component types.

- [ ] **Step 1: Ensure server is running**

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login \
  -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null
```

- [ ] **Step 2: Generate one of each new type across unrelated topics**

```bash
declare -a TESTS=(
  '{"type":"Hero","prompt":"A page about beekeeping for hobbyists","pageId":"index"}'
  '{"type":"Editorial","prompt":"A short editorial about why public libraries matter","pageId":"index"}'
  '{"type":"Scrolly","prompt":"3 steps explaining the phases of the Apollo 11 mission","pageId":"index"}'
  '{"type":"Timeline","prompt":"5 events in the history of solar panels","pageId":"index"}'
  '{"type":"StatRow","prompt":"3 stats about renewable energy adoption in Europe in 2024","pageId":"index"}'
  '{"type":"Aside","prompt":"A note clarifying what carbon offsets are and are not","pageId":"index"}'
)

for body in "${TESTS[@]}"; do
  echo "=== $(echo "$body" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).type, '·', JSON.parse(s).prompt.slice(0,50)))") ==="
  curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
    -H "Content-Type: application/json" -d "$body" | tee "/tmp/gen-$(echo "$body" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).type))").json" | head -c 300
  echo; echo
done
```

- [ ] **Step 3: Run leak-detection over all outputs**

```bash
node -e '
const fs = require("fs");
const path = require("path");
const banned = ["pyramide","umgekehrte","marinos","1924","1605","schudson","jahrhunderterfindung","wer? was?","journalismus"];
let total = 0, leaks = 0;
for (const f of fs.readdirSync("/tmp").filter(f => /^gen-.*\.json$/.test(f))) {
  total++;
  const txt = JSON.stringify(JSON.parse(fs.readFileSync(path.join("/tmp", f), "utf8")).data).toLowerCase();
  const hits = banned.filter(w => txt.includes(w));
  console.log(f, hits.length ? "LEAK: " + hits.join(",") : "clean");
  if (hits.length) leaks++;
}
console.log("---");
console.log(`${total - leaks}/${total} clean`);
process.exit(leaks ? 1 : 0);
'
```

Expected: `6/6 clean`, exit code 0.

If anything leaks: re-open Task 1 step 2, strengthen the CRITICAL RULES section of the prompt, repeat.

- [ ] **Step 4: Visual smoke test of each new component**

```bash
# Save the most relevant generated blocks to a scratch page named "smoketest"
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/pages \
  -H "Content-Type: application/json" \
  -d '{"id":"smoketest","title":"Smoke Test"}'

# Build a doc combining one of each block type from the generations above
node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync("content/smoketest.json","utf8"));
doc.blocks = [
  { id:"b1", type:"Hero",      data: JSON.parse(fs.readFileSync("/tmp/gen-Hero.json","utf8")).data },
  { id:"b2", type:"Editorial", data: JSON.parse(fs.readFileSync("/tmp/gen-Editorial.json","utf8")).data },
  { id:"b3", type:"Scrolly",   data: JSON.parse(fs.readFileSync("/tmp/gen-Scrolly.json","utf8")).data },
  { id:"b4", type:"Timeline",  data: JSON.parse(fs.readFileSync("/tmp/gen-Timeline.json","utf8")).data },
  { id:"b5", type:"StatRow",   data: JSON.parse(fs.readFileSync("/tmp/gen-StatRow.json","utf8")).data },
  { id:"b6", type:"Aside",     data: JSON.parse(fs.readFileSync("/tmp/gen-Aside.json","utf8")).data },
];
doc.version++;
doc.updatedAt = new Date().toISOString();
fs.writeFileSync("content/smoketest.json", JSON.stringify(doc, null, 2));
console.log("smoketest page assembled with", doc.blocks.length, "blocks");
'
```

Then via Chrome MCP:
```js
mcp__Claude_Preview__preview_start({ name: 'admin' })
mcp__Claude_Preview__preview_eval({ expression: "location.href='http://localhost:4000/smoketest'" })
// scroll, screenshot
```

Visually confirm:
- Hero renders with title + subtitle, no pyramid/journalism words
- Editorial renders with paragraphs
- Scrolly renders with side cards
- Timeline shows orange dots + dated events
- StatRow shows 3 big numbers
- Aside shows colored box

- [ ] **Step 5: Clean up smoketest page**

```bash
curl -s -b /tmp/cookies.txt -X DELETE http://localhost:4000/admin/api/pages/smoketest
```

- [ ] **Step 6: Commit**

If no code changes during this verification, no commit needed. If you fixed any leak by strengthening the prompt, commit those changes alongside Task 1.

---

## Self-Review

**Spec coverage:**
- ✅ Rich components from NYT/Reuters: BigNumber (T3), StatRow (T3), Timeline (T4), Aside (T4), Callout inline (T4), DropCap (T5), List (T6). Five new editorial inline kinds + three new top-level block types = eight new component capabilities.
- ✅ Visual preview at component-picking time: Task 7 adds previews to both the `+ Add` palette and the Claude-generate modal.
- ✅ Anti-"stealing-from-original" — the user's #1 priority: Task 1 rewrites the Claude prompt to be domain-neutral and adds explicit CRITICAL RULES. Task 8 verifies across six unrelated topics. Hero's `lines` field is explicitly marked optional with anti-leak guidance.

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N". Every code step shows the full code to type. Verification steps state expected outputs.

**Type consistency:**
- `BLOCK_RENDERERS` map is extended consistently across tasks: 5 base entries + StatRow (T3) + Timeline + Aside (T4).
- `BLOCK_SCHEMAS` extended in matching tasks: StatRow (T3), Timeline + Aside (T4).
- `PALETTE_BLOCKS` ordering finalized in T3 step 4, additions wired into the preview map in T7.
- `EDITORIAL_ITEM_KINDS` finalized in T3 step 4 (includes future entries to avoid array-shuffle across tasks); `EDITORIAL_ITEM_FRIENDLY`, `editorialFieldsFor`, `defaultItemFor` are updated in each task that adds an item kind (bigNumber T3, callout T4, dropcap T5, list T6).
- `tone_select` field kind is defined for both `renderField` (top-level blocks) and `simpleField` (editorial sub-items) in T4 — handled.
- `statRowEditor`, `timelineEventEditor`, `string_list_inline` all have consistent signatures and event wiring.

Plan is complete and self-consistent.
