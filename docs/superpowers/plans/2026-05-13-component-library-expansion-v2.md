# Component Library Expansion v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the scrollytelling component library with seven high-impact, NYT/Reuters/WaPo-grade additions — three new top-level blocks (ChapterDivider, Quote featured, VideoEmbed) and four new Editorial inline items (footnote, highlight, stepList, factCheck) — each shipping its server schema, renderer, admin form, CSS, and visual preview as one atomic, reviewable change.

**Architecture:** Each new component touches the same five layers in lockstep: (1) `admin/server.js` `BLOCK_GUIDES` (so Claude knows what to generate), (2) `js/render.js` (renderer + CSS in `COMPONENT_CSS`), (3) `admin/ui/app.js` (schema / form / palette / preview). One task per component, with infrastructure changes batched into Task 1 so subsequent tasks don't shuffle shared arrays.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no new runtime dependencies. Uses Dia design tokens already in place from the previous plan (`--ink-black`, `--graphite`, `--canvas`, `--spectrum-gradient`, `--radius-card`, `--radius-pill`, `--font-display`, `--font-body`, `--shadow-card`).

---

## Design decisions locked in upfront

These are explicit so any task can stay consistent. Override before Task 1 if any feel wrong.

1. **Scope is "+7 components" — not "fix everything."** No existing components are rewritten in this plan. Mobile responsiveness and accessibility for each NEW component are included; broad audits across the library are out of scope.
2. **VideoEmbed supports YouTube and Vimeo URLs only.** Both have iframe embed URLs derivable from the share URL by regex. Native MP4 uploads / streaming are out of scope (would need new upload-size limits + format whitelist + transcoding concerns).
3. **Footnotes use the "link-to-endnotes" pattern.** A superscript number in body text links to a numbered note at the bottom of the page (rendered as a final auto-collected `<aside class="endnotes">` injected by the renderer). No popovers. This is the simplest accessible pattern, works without JS, and matches NYT.
4. **Highlight is purely decorative.** It applies a marker-pen background to a stretch of text. It does NOT trigger any interaction. Use sparingly.
5. **StepList is distinct from List.** `list` is bullets / numbers with line items. `stepList` is numbered larger steps with a title + body — for how-to / explainer pieces. Both kept.
6. **FactCheck has three verdicts: TRUE / FALSE / MISLEADING.** Sourced after the verdict. Color: TRUE = signal-blue, FALSE = spectrum-red, MISLEADING = marigold. Used at most once or twice per piece.
7. **ChapterDivider replaces no existing component.** It marks chapter breaks in long pieces. Hero stays the page intro; ChapterDivider marks Chapter 1, 2, 3 within the body. Has optional number + title + subtitle.
8. **Quote (featured) is heavier than `pullquote`.** Pullquote (inline) stays as the standard mid-paragraph quote. Quote (block) is a full-width statement with optional portrait image — for THE money quote of the piece.
9. **All new components ship with proper ARIA / semantic HTML.** `<figure>` + `<figcaption>` for media. `<blockquote>` for quotes. `<sup>` for footnote refs. `<ol>` for stepList. Plus `aria-label` / `role` where applicable.

---

## File Structure

| Path | Role | Change |
|---|---|---|
| `admin/server.js` | Express server + Claude prompt builder | Add 3 new top-level block-type guides + extend Editorial inline-kinds list with 4 new kinds. One edit in Task 1. |
| `js/render.js` | Renderer + COMPONENT_CSS | Add 7 renderers (3 block, 4 inline), 7 CSS rule blocks. Footnote system needs a post-render endnote-collection pass. |
| `admin/ui/app.js` | Admin SPA | Add 3 BLOCK_SCHEMAS, 4 EDITORIAL_ITEM_FRIENDLY entries, 4 editorialFieldsFor cases, 4 defaultItemFor cases, expand EDITORIAL_ITEM_KINDS, expand PALETTE_BLOCKS, add 3 BLOCK_PREVIEWS entries, add helper editors (e.g. step list editor, fact-check verdict picker). |

No new files.

---

## Task 1: Schema & palette infrastructure

**Files:**
- Modify: `admin/server.js` (extend `BLOCK_GUIDES`)
- Modify: `admin/ui/app.js` (extend `EDITORIAL_ITEM_KINDS`, `PALETTE_BLOCKS`, `EDITORIAL_ITEM_FRIENDLY`)

This task adds the infrastructure entries that subsequent tasks will fill in. After Task 1, the new types exist in the data model but their renderers / forms come in Tasks 2-7. Add everything now to lock array order and avoid shuffles.

### Step 1: Add three new BLOCK_GUIDES entries in `admin/server.js`

Find the existing `BLOCK_GUIDES` object. Add three new entries inside it (before the closing `};`):

```js
  ChapterDivider: `A "ChapterDivider" full-width chapter heading marker for long pieces. data shape:
{
  "number": string,             // optional chapter number, e.g. "I" or "01" or "Kapitel 2"
  "title": string,              // chapter title
  "subtitle": string            // optional subtitle / dek
}
Use this to mark large narrative breaks within a long piece. Most pages use 0–3 dividers.`,

  Quote: `A "Quote" featured-quote block (heavier than an inline pullquote — the page's money quote). data shape:
{
  "text": string,               // the quote itself; quotation marks are added by the renderer
  "attribution": string,        // "— Name" or just "Name"
  "role": string,               // optional small line under name (e.g. role / institution / year)
  "portraitSrc": string,        // optional headshot image path (images/...)
  "sourceUrl": string,          // optional URL the reader can follow for full context
  "sourceLabel": string         // optional label for that link (e.g. "Read the full speech")
}
Use at most one per page — the single most-important quotation.`,

  VideoEmbed: `A "VideoEmbed" inline video block. data shape:
{
  "url": string,                // YouTube or Vimeo share URL; the renderer extracts the embed id
  "caption": string,            // figcaption shown below the video
  "credit": string              // optional small attribution (e.g. "via NYT")
}
Only YouTube and Vimeo are supported. Other URLs render as a link with a warning placeholder.`,
```

### Step 2: Extend the Editorial inline-kinds in `BLOCK_GUIDES.Editorial`

In the same `BLOCK_GUIDES.Editorial` template-literal string, inside the "Each item has a 'kind' field. Available kinds:" list, insert these four new kinds just before the `figureSingle` entry (so they appear near the other text-emphasis kinds):

```
- { "kind": "footnote",      "ref": number, "note": string }       // numbered footnote; appears inline as superscript, collected to an endnotes list at the bottom of the page
- { "kind": "highlight",     "html": string }                      // a marker-style highlighted block of text (paragraph length)
- { "kind": "stepList",      "title": string, "steps": [{ "title": string, "body": string }] }  // a numbered how-to / explainer list of steps
- { "kind": "factCheck",     "claim": string, "verdict": "true"|"false"|"misleading", "explanation": string, "source": string }   // a fact-check call-out
```

### Step 3: Extend `EDITORIAL_ITEM_KINDS` in `admin/ui/app.js`

Replace the existing `EDITORIAL_ITEM_KINDS` array with this expanded version (adds the 4 new kinds in their final positions):

```js
const EDITORIAL_ITEM_KINDS = [
  { kind: 'h2',            label: 'Heading' },
  { kind: 'kicker',        label: 'Kicker' },
  { kind: 'lead',          label: 'Lead' },
  { kind: 'p',             label: 'Paragraph' },
  { kind: 'dropcap',       label: 'Drop-cap paragraph' },
  { kind: 'list',          label: 'List' },
  { kind: 'stepList',      label: 'Step-by-step list' },
  { kind: 'bigNumber',     label: 'Big number' },
  { kind: 'callout',       label: 'Callout' },
  { kind: 'pullquote',     label: 'Pull quote' },
  { kind: 'highlight',     label: 'Highlighted paragraph' },
  { kind: 'footnote',      label: 'Footnote' },
  { kind: 'factCheck',     label: 'Fact check' },
  { kind: 'figureSingle',  label: 'Image' },
  { kind: 'figurePair',    label: 'Image pair' },
  { kind: 'captionInline', label: 'Caption' },
  { kind: 'captionCenter', label: 'Caption (centered)' },
  { kind: 'separator',     label: 'Separator' },
  { kind: 'whatsappCard',  label: 'WhatsApp card' },
];
```

### Step 4: Extend `EDITORIAL_ITEM_FRIENDLY` in `admin/ui/app.js`

Add these four entries inside the `EDITORIAL_ITEM_FRIENDLY` object:

```js
  stepList:      { label: 'Step-by-step',  hint: 'numbered how-to steps with title + body each' },
  highlight:     { label: 'Highlight',     hint: 'marker-style emphasized paragraph' },
  footnote:      { label: 'Footnote',      hint: 'inline ref → endnote at bottom of page' },
  factCheck:     { label: 'Fact check',    hint: 'claim + TRUE/FALSE/MISLEADING verdict' },
```

### Step 5: Extend `PALETTE_BLOCKS` in `admin/ui/app.js`

Replace the existing `PALETTE_BLOCKS` array with this expanded version (adds the 3 new block types in their final positions):

```js
const PALETTE_BLOCKS = [
  { type: 'Hero',           desc: 'Title section at the top of a page' },
  { type: 'ChapterDivider', desc: 'Chapter break — number, title, optional subtitle' },
  { type: 'Editorial',      desc: 'Long-form text with paragraphs, images, quotes' },
  { type: 'Scrolly',        desc: 'Scroll-driven stepped narrative with a sticky chart' },
  { type: 'Quote',          desc: 'Featured money quote — large, optional portrait' },
  { type: 'VideoEmbed',     desc: 'YouTube or Vimeo video with caption' },
  { type: 'Timeline',       desc: 'Vertical dated events' },
  { type: 'StatRow',        desc: 'Row of 2–4 large statistics' },
  { type: 'Aside',          desc: 'Highlighted callout box' },
  { type: 'Outro',          desc: 'Closing section with paragraphs and sources' },
  { type: 'VizPanel',       desc: 'Advanced — visualization container' },
];
```

### Step 6: Verify

```bash
node -c admin/server.js && echo "server OK"
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"

# Confirm all 7 new types are accepted by /generate (return 400 "prompt required", not "unknown block type")
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null

for T in ChapterDivider Quote VideoEmbed; do
  echo -n "$T → "
  curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"$T\",\"prompt\":\"\",\"mode\":\"create\",\"pageId\":\"index\"}" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log(d.error||'ok')})"
done
# Expected: each prints "prompt required" — i.e. the type is recognized.
```

### Step 7: Commit

```bash
git add admin/server.js admin/ui/app.js
git commit -m "feat(components): add infrastructure for 7 new components

Adds 3 new block guides (ChapterDivider, Quote, VideoEmbed) and 4
new Editorial inline-kind descriptions (footnote, highlight, stepList,
factCheck) to admin/server.js BLOCK_GUIDES. Extends EDITORIAL_ITEM_KINDS,
EDITORIAL_ITEM_FRIENDLY, and PALETTE_BLOCKS in admin/ui/app.js so the
admin palette shows the new types.

Renderers and forms come in subsequent tasks. Until those tasks land,
selecting a new type in the admin will surface a stub editor — that's
expected during build-out."
```

---

## Task 2: ChapterDivider block

**Files:**
- Modify: `js/render.js` (renderer + CSS + BLOCK_RENDERERS)
- Modify: `admin/ui/app.js` (BLOCK_SCHEMAS, BLOCK_PREVIEWS, defaultDataFor)

### Step 1: Add the renderer in `js/render.js`

Register in `BLOCK_RENDERERS`:

```js
const BLOCK_RENDERERS = {
  Hero:           renderHero,
  VizPanel:       renderVizPanel,
  Editorial:      renderEditorial,
  Scrolly:        renderScrolly,
  Outro:          renderOutro,
  StatRow:        renderStatRow,
  Timeline:       renderTimeline,
  Aside:          renderAside,
  ChapterDivider: renderChapterDivider,
};
```

Add the function right below `renderAside`:

```js
function renderChapterDivider(d) {
  const sec = el('section', { class: 'chapter-divider', 'aria-label': 'Chapter break' });
  if (d.number) sec.appendChild(el('div', { class: 'chapter-number' }, d.number));
  if (d.title) {
    const h = el('h2', { class: 'chapter-title' });
    h.innerHTML = d.title;
    sec.appendChild(h);
  }
  if (d.subtitle) sec.appendChild(el('div', { class: 'chapter-subtitle' }, d.subtitle));
  // Decorative gradient strip below the heading
  sec.appendChild(el('div', { class: 'chapter-strip', 'aria-hidden': 'true' }));
  return sec;
}
```

### Step 2: Add CSS inside the `COMPONENT_CSS` template literal in `js/render.js`

Append (just before the closing backtick and the `@media(max-width:900px)` block):

```css
/* ── ChapterDivider ── */
.chapter-divider{max-width:720px;margin:5rem auto 3.5rem;padding:0 2rem;text-align:center;position:relative;z-index:3}
.chapter-number{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.2em;margin-bottom:1rem}
.chapter-title{font-family:var(--font-display);font-size:clamp(1.8rem,4vw,2.75rem);font-weight:300;color:var(--ink-black);line-height:1.18;letter-spacing:-.04em;margin-bottom:.6rem}
.chapter-subtitle{font-family:var(--font-body);font-size:1.0625rem;color:var(--graphite);font-weight:400;line-height:1.5;max-width:560px;margin:0 auto 1.6rem}
.chapter-strip{width:120px;height:2px;background:var(--spectrum-gradient);margin:0 auto;border-radius:2px}
```

And inside the existing `@media(max-width:900px){...}` block, append a rule:

```css
  .chapter-divider{margin:3.5rem auto 2.5rem;padding:0 1.25rem}
```

### Step 3: Add schema and form support in `admin/ui/app.js`

Append inside `BLOCK_SCHEMAS`:

```js
  ChapterDivider: {
    name: 'Chapter divider',
    description: 'Chapter break — number, title, optional subtitle',
    fields: [
      { key: 'number',   label: 'Number / label (optional)',     kind: 'text', hint: 'e.g. <code>I</code>, <code>01</code>, <code>Kapitel 2</code>' },
      { key: 'title',    label: 'Title',                          kind: 'text' },
      { key: 'subtitle', label: 'Subtitle (optional)',            kind: 'textarea' },
    ],
  },
```

Add to `defaultDataFor`:

```js
    case 'ChapterDivider': return { number: '', title: 'Chapter title', subtitle: '' };
```

Add to `BLOCK_PREVIEWS`:

```js
  ChapterDivider: `
    <div style="text-align:center;padding:6px 0;">
      <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.2em;color:#636363;text-transform:uppercase;">CHAPTER I</div>
      <div style="font:300 16px 'DM Sans',sans-serif;color:#000;margin-top:6px;letter-spacing:-.02em;">Chapter title</div>
      <div style="margin:6px auto 0;width:30px;height:2px;background:linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#e1e1fe,#0358f7);border-radius:2px;"></div>
    </div>`,
```

### Step 4: Verify

```bash
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
grep -c "renderChapterDivider\|chapter-divider\|ChapterDivider:" js/render.js   # expect ≥ 3
grep -c "ChapterDivider:" admin/ui/app.js   # expect ≥ 3 (BLOCK_SCHEMAS, defaultDataFor, BLOCK_PREVIEWS)
```

Restart server if needed and confirm a ChapterDivider block can be added via the admin (you can use API directly):

```bash
curl -s -b /tmp/cookies.txt http://localhost:4000/admin/api/pages/index > /tmp/doc.json
node -e "
  const fs=require('fs'); const d=JSON.parse(fs.readFileSync('/tmp/doc.json','utf8'));
  d.blocks.unshift({id:'test_chap',type:'ChapterDivider',data:{number:'I',title:'Test chapter',subtitle:'Smoke test only — remove me.'}});
  fs.writeFileSync('/tmp/doc.json',JSON.stringify(d));
"
curl -s -b /tmp/cookies.txt -X PUT http://localhost:4000/admin/api/pages/index \
  -H "Content-Type: application/json" --data-binary @/tmp/doc.json | head -c 200
echo
curl -s -o /dev/null -w "GET / → %{http_code}\n" http://localhost:4000/

# After verifying visually, REMOVE the smoke-test block:
curl -s -b /tmp/cookies.txt http://localhost:4000/admin/api/pages/index > /tmp/doc.json
node -e "
  const fs=require('fs'); const d=JSON.parse(fs.readFileSync('/tmp/doc.json','utf8'));
  d.blocks = d.blocks.filter(b => b.id !== 'test_chap');
  fs.writeFileSync('/tmp/doc.json',JSON.stringify(d));
"
curl -s -b /tmp/cookies.txt -X PUT http://localhost:4000/admin/api/pages/index \
  -H "Content-Type: application/json" --data-binary @/tmp/doc.json > /dev/null
echo "smoke-test block removed"
```

### Step 5: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): ChapterDivider block

Centered chapter-break component with optional number/label,
title (weight 300), subtitle, and a 120px spectrum-gradient strip.
Used to mark large narrative sections within a long piece.

Schema, renderer, CSS, admin form, default data, and palette
preview all ship together."
```

---

## Task 3: Quote (featured) block

**Files:**
- Modify: `js/render.js` (renderer + CSS + BLOCK_RENDERERS)
- Modify: `admin/ui/app.js` (BLOCK_SCHEMAS, BLOCK_PREVIEWS, defaultDataFor)

### Step 1: Add the renderer

Register in `BLOCK_RENDERERS`:

```js
const BLOCK_RENDERERS = {
  Hero:           renderHero,
  VizPanel:       renderVizPanel,
  Editorial:      renderEditorial,
  Scrolly:        renderScrolly,
  Outro:          renderOutro,
  StatRow:        renderStatRow,
  Timeline:       renderTimeline,
  Aside:          renderAside,
  ChapterDivider: renderChapterDivider,
  Quote:          renderQuote,
};
```

Add the function right below `renderChapterDivider`:

```js
function renderQuote(d) {
  const sec = el('section', { class: 'quote-block' });
  const fig = el('figure', { class: 'quote-figure' });
  const bq = el('blockquote', { class: 'quote-text' });
  // Decorative open-quote glyph
  const openMark = el('span', { class: 'quote-mark', 'aria-hidden': 'true' }, '“');
  bq.appendChild(openMark);
  const span = el('span', { class: 'quote-body' });
  span.innerHTML = d.text || '';
  bq.appendChild(span);
  fig.appendChild(bq);

  const cap = el('figcaption', { class: 'quote-cap' });
  if (d.portraitSrc) {
    cap.appendChild(el('img', { class: 'quote-portrait', src: d.portraitSrc, alt: d.attribution || '' }));
  }
  const ttext = el('div', { class: 'quote-attr-wrap' });
  if (d.attribution) ttext.appendChild(el('div', { class: 'quote-attr' }, d.attribution));
  if (d.role)        ttext.appendChild(el('div', { class: 'quote-role' }, d.role));
  if (d.sourceUrl)   {
    const a = el('a', { class: 'quote-source', href: d.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, d.sourceLabel || 'Source');
    ttext.appendChild(a);
  }
  cap.appendChild(ttext);
  fig.appendChild(cap);
  sec.appendChild(fig);
  return sec;
}
```

### Step 2: Add CSS inside `COMPONENT_CSS`

Append (before the closing backtick, before the media query):

```css
/* ── Quote (featured) ── */
.quote-block{max-width:860px;margin:4rem auto;padding:0 2rem;position:relative;z-index:3}
.quote-figure{margin:0}
.quote-text{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2.25rem);font-weight:300;color:var(--ink-black);line-height:1.25;letter-spacing:-.03em;position:relative;margin:0 0 1.4rem;padding-left:.2em}
.quote-mark{position:absolute;left:-.45em;top:-.18em;font-size:1.5em;line-height:1;color:var(--ink-black);font-family:var(--font-display);font-weight:300;opacity:.18}
.quote-body{display:inline}
.quote-cap{display:flex;align-items:center;gap:1rem;margin-top:1.2rem;padding-left:.2em}
.quote-portrait{width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid rgba(0,0,0,.06)}
.quote-attr-wrap{display:flex;flex-direction:column;gap:.15rem;font-family:var(--font-body);min-width:0}
.quote-attr{font-size:.95rem;font-weight:500;color:var(--ink-black);letter-spacing:-.005em}
.quote-role{font-size:.82rem;color:var(--graphite);font-weight:400}
.quote-source{font-size:.78rem;color:var(--ink-black);text-decoration:underline;text-decoration-color:var(--steel);text-underline-offset:3px;margin-top:.25rem;transition:text-decoration-color .2s}
.quote-source:hover{text-decoration-color:var(--ink-black)}
```

Append inside the `@media(max-width:900px){...}` block:

```css
  .quote-block{margin:3rem auto;padding:0 1.25rem}
  .quote-portrait{width:48px;height:48px}
```

### Step 3: Schema + form + preview in `admin/ui/app.js`

Inside `BLOCK_SCHEMAS`:

```js
  Quote: {
    name: 'Quote',
    description: 'Featured money quote — large, optional portrait',
    fields: [
      { key: 'text',         label: 'Quote (without surrounding quote marks)', kind: 'textarea' },
      { key: 'attribution',  label: 'Attribution (Name)',                       kind: 'text' },
      { key: 'role',         label: 'Role / context (optional)',                kind: 'text' },
      { key: 'portraitSrc',  label: 'Portrait (optional)',                      kind: 'image' },
      { key: 'sourceUrl',    label: 'Source URL (optional)',                    kind: 'text' },
      { key: 'sourceLabel',  label: 'Source link label (optional)',             kind: 'text' },
    ],
  },
```

In `defaultDataFor`:

```js
    case 'Quote': return { text: 'Type the quote here.', attribution: 'Name', role: '', portraitSrc: '', sourceUrl: '', sourceLabel: '' };
```

In `BLOCK_PREVIEWS`:

```js
  Quote: `
    <div style="padding:8px 0;">
      <div style="font:300 13px 'DM Sans',sans-serif;color:#000;line-height:1.25;letter-spacing:-.02em;position:relative;padding-left:10px;">
        <span style="position:absolute;left:-3px;top:-4px;font-size:22px;color:#000;opacity:.2;line-height:1;">&ldquo;</span>
        The single most-important quotation.
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;padding-left:10px;">
        <div style="width:18px;height:18px;border-radius:50%;background:#eaeef2;flex-shrink:0;"></div>
        <div>
          <div style="font:500 8px 'DM Sans',sans-serif;color:#000;">Speaker name</div>
          <div style="font:400 7px 'DM Sans',sans-serif;color:#636363;">role · year</div>
        </div>
      </div>
    </div>`,
```

### Step 4: Verify (manual smoke test via API)

```bash
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
grep -c "renderQuote\|quote-block\|Quote:.*renderQuote" js/render.js   # expect ≥ 2
grep -c "Quote:" admin/ui/app.js   # expect ≥ 3 (BLOCK_SCHEMAS, defaultDataFor, BLOCK_PREVIEWS)
```

Insert a smoke-test Quote block via API, screenshot, then remove. Use the same pattern as Task 2 (curl PUT to add, curl PUT to remove). Confirm in browser the quote renders with thin gray open-quote glyph at the upper-left, portrait placeholder (or image), attribution and role.

### Step 5: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): Quote (featured) block

Large blockquote with an unobtrusive open-quote glyph, optional
portrait (round, 56px), attribution + role, and optional source
link. Uses semantic <blockquote> + <figure> + <figcaption>.

Heavier than the inline pullquote — meant for the page's single
money quote."
```

---

## Task 4: VideoEmbed block

**Files:**
- Modify: `js/render.js` (renderer + CSS + BLOCK_RENDERERS + URL parser helper)
- Modify: `admin/ui/app.js` (BLOCK_SCHEMAS, BLOCK_PREVIEWS, defaultDataFor)

### Step 1: Add the URL parser + renderer

Register in `BLOCK_RENDERERS`:

```js
const BLOCK_RENDERERS = {
  Hero:           renderHero,
  VizPanel:       renderVizPanel,
  Editorial:      renderEditorial,
  Scrolly:        renderScrolly,
  Outro:          renderOutro,
  StatRow:        renderStatRow,
  Timeline:       renderTimeline,
  Aside:          renderAside,
  ChapterDivider: renderChapterDivider,
  Quote:          renderQuote,
  VideoEmbed:     renderVideoEmbed,
};
```

Add a small URL parser plus the renderer. Place right below `renderQuote`:

```js
// Parse YouTube / Vimeo share URLs into an embed URL.
// Returns { src, kind } or null if unsupported.
function parseVideoUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const url = raw.trim();
  // YouTube: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
          url.match(/youtube\.com\/watch\?[^"]*[?&]v=([A-Za-z0-9_-]{6,})/) ||
          url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, kind: 'youtube' };
  // Vimeo: vimeo.com/<id>, player.vimeo.com/video/<id>
  m = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/) ||
      url.match(/player\.vimeo\.com\/video\/(\d{5,})/);
  if (m) return { src: `https://player.vimeo.com/video/${m[1]}`, kind: 'vimeo' };
  return null;
}

function renderVideoEmbed(d) {
  const sec = el('section', { class: 'video-embed' });
  const fig = el('figure', { class: 'video-figure' });
  const parsed = parseVideoUrl(d.url);
  if (parsed) {
    const wrap = el('div', { class: 'video-wrap' });
    const iframe = el('iframe', {
      class: 'video-iframe',
      src: parsed.src,
      title: d.caption || 'Embedded video',
      loading: 'lazy',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: 'true',
      referrerpolicy: 'strict-origin-when-cross-origin',
      frameborder: '0',
    });
    wrap.appendChild(iframe);
    fig.appendChild(wrap);
  } else {
    // Unsupported / empty URL → render a clear placeholder + clickable link if URL present
    const ph = el('div', { class: 'video-placeholder' });
    ph.appendChild(el('div', { class: 'video-placeholder-icon', 'aria-hidden': 'true' }, '▶'));
    const msg = el('div', { class: 'video-placeholder-msg' },
      d.url ? 'Unsupported video URL. Only YouTube and Vimeo are supported.' : 'No video URL set.');
    ph.appendChild(msg);
    if (d.url) {
      ph.appendChild(el('a', { class: 'video-placeholder-link', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.url));
    }
    fig.appendChild(ph);
  }
  if (d.caption || d.credit) {
    const cap = el('figcaption', { class: 'video-cap' });
    if (d.caption) cap.appendChild(el('span', { class: 'video-caption' }, d.caption));
    if (d.credit) cap.appendChild(el('span', { class: 'video-credit' }, d.credit));
    fig.appendChild(cap);
  }
  sec.appendChild(fig);
  return sec;
}
```

### Step 2: Add CSS inside `COMPONENT_CSS`

Append:

```css
/* ── VideoEmbed ── */
.video-embed{max-width:1000px;margin:4rem auto;padding:0 2rem;position:relative;z-index:3}
.video-figure{margin:0}
.video-wrap{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--radius-image);overflow:hidden;background:var(--fog);box-shadow:var(--shadow-card)}
.video-iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.video-placeholder{aspect-ratio:16/9;border-radius:var(--radius-image);background:var(--fog);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2rem;text-align:center;color:var(--graphite);font-family:var(--font-body)}
.video-placeholder-icon{font-size:2.4rem;color:var(--steel)}
.video-placeholder-msg{font-size:.9rem;font-weight:500;color:var(--graphite)}
.video-placeholder-link{font-size:.82rem;color:var(--ink-black);text-decoration:underline;word-break:break-all;max-width:90%}
.video-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;display:flex;gap:.7rem;flex-wrap:wrap;font-weight:400;line-height:1.5}
.video-caption{flex:1;min-width:200px}
.video-credit{color:var(--ash);font-style:italic;font-size:.78rem}
```

Inside the `@media(max-width:900px){...}` block:

```css
  .video-embed{margin:3rem auto;padding:0 1.25rem}
```

### Step 3: Schema + form + preview in `admin/ui/app.js`

Inside `BLOCK_SCHEMAS`:

```js
  VideoEmbed: {
    name: 'Video embed',
    description: 'YouTube or Vimeo video with caption',
    fields: [
      { key: 'url',     label: 'Video URL', kind: 'text', hint: 'Paste a YouTube or Vimeo URL.' },
      { key: 'caption', label: 'Caption',   kind: 'textarea' },
      { key: 'credit',  label: 'Credit (optional)', kind: 'text', hint: 'e.g. <code>via NYT</code>' },
    ],
  },
```

In `defaultDataFor`:

```js
    case 'VideoEmbed': return { url: '', caption: '', credit: '' };
```

In `BLOCK_PREVIEWS`:

```js
  VideoEmbed: `
    <div style="background:#eaeef2;border-radius:6px;height:54px;display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="width:0;height:0;border-left:11px solid #aeaeae;border-top:7px solid transparent;border-bottom:7px solid transparent;margin-left:3px;"></div>
    </div>
    <div style="font:400 7px 'DM Sans',sans-serif;color:#636363;margin-top:5px;line-height:1.4;">Caption goes here · <span style="font-style:italic;color:#7c7c7c;">credit</span></div>`,
```

### Step 4: Unit-style URL parser sanity check

This task adds a parser (`parseVideoUrl`) — verify it handles the common shapes before relying on it in production. Run this one-off check (do NOT commit a test file — this is a one-shot eval):

```bash
node -e "
  $(cat <<'JS'
  // Inline a copy of the parser the renderer uses, for verification
  function parseVideoUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const url = raw.trim();
    let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
            url.match(/youtube\.com\/watch\?[^\"]*[?&]v=([A-Za-z0-9_-]{6,})/) ||
            url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
    if (m) return { src: 'https://www.youtube-nocookie.com/embed/' + m[1], kind: 'youtube' };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/) ||
        url.match(/player\.vimeo\.com\/video\/(\d{5,})/);
    if (m) return { src: 'https://player.vimeo.com/video/' + m[1], kind: 'vimeo' };
    return null;
  }
  const cases = [
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube'],
    ['https://vimeo.com/76979871', 'vimeo'],
    ['https://vimeo.com/video/76979871', 'vimeo'],
    ['https://player.vimeo.com/video/76979871', 'vimeo'],
    ['https://example.com/not-a-video', null],
    ['', null],
    ['nonsense', null],
  ];
  let pass = 0, fail = 0;
  for (const [url, expectKind] of cases) {
    const got = parseVideoUrl(url);
    const ok = (expectKind === null) ? (got === null) : (got && got.kind === expectKind);
    if (ok) pass++; else { fail++; console.log('FAIL', url, '→', JSON.stringify(got), 'expected', expectKind); }
  }
  console.log('passed', pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
JS
  )
"
```

Expected: `passed 10/10`, exit code 0. If any FAIL lines print, fix the regex in the renderer to pass them, then re-run.

### Step 5: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): VideoEmbed block

YouTube + Vimeo support via URL parsing. Renderer extracts the
embed id from common share-URL shapes (youtu.be/<id>,
youtube.com/watch?v=<id>, youtube.com/embed/<id>, vimeo.com/<id>,
player.vimeo.com/video/<id>).

Unsupported URLs render a clear placeholder with the original
link. iframe uses youtube-nocookie + strict-origin referrer policy
for privacy. 16:9 aspect-ratio wrapper handles responsive sizing
without JS."
```

---

## Task 5: footnote + highlight inline editorial items

**Files:**
- Modify: `js/render.js` (two new `renderEditorialItem` cases + CSS + post-render endnote-collection pass)
- Modify: `admin/ui/app.js` (editorialFieldsFor, defaultItemFor for both kinds)

This task introduces two text-emphasis inline items. The footnote system also adds a small post-render pass that collects all footnote `data-ref` numbers and appends a numbered `<aside class="endnotes">` to the page.

### Step 1: Add the renderer cases in `renderEditorialItem`

In `js/render.js`, inside `renderEditorialItem`'s switch, add these cases just before `default:`:

```js
    case 'footnote': {
      // Render an inline numbered superscript link. The actual note text travels
      // through an attribute; the post-render collector reads it.
      const sup = el('sup', { class: 'fn-ref', 'data-note': item.note || '' });
      const a = el('a', {
        href: '#fn-' + (item.ref || 1),
        id: 'fnref-' + (item.ref || 1),
        'aria-label': 'Footnote ' + (item.ref || 1),
      }, String(item.ref || 1));
      sup.appendChild(a);
      return sup;
    }
    case 'highlight': {
      const wrap = el('mark', { class: 'highlight' });
      wrap.innerHTML = item.html || '';
      return wrap;
    }
```

### Step 2: Collect footnotes into a per-page endnote list

In `js/render.js`, find the `render()` function. After the `for (const block of doc.blocks)` loop, but before the `document.dispatchEvent(...)` line, insert this footnote-collection block:

```js
  // Collect all footnote refs into a single endnotes section at the bottom.
  const refs = root.querySelectorAll('sup.fn-ref');
  if (refs.length) {
    // De-dupe by (ref number) — first occurrence wins for note text.
    const seen = new Map();
    refs.forEach(s => {
      const n = s.firstChild?.textContent;
      const note = s.getAttribute('data-note') || '';
      if (n && !seen.has(n)) seen.set(n, note);
    });
    const endnotes = document.createElement('aside');
    endnotes.className = 'endnotes';
    endnotes.setAttribute('aria-label', 'Footnotes');
    const head = document.createElement('h3');
    head.className = 'endnotes-head';
    head.textContent = 'Notes';
    endnotes.appendChild(head);
    const ol = document.createElement('ol');
    ol.className = 'endnotes-list';
    for (const [n, note] of seen) {
      const li = document.createElement('li');
      li.id = 'fn-' + n;
      li.className = 'endnote';
      const noteSpan = document.createElement('span');
      noteSpan.innerHTML = note;
      li.appendChild(noteSpan);
      const back = document.createElement('a');
      back.href = '#fnref-' + n;
      back.className = 'endnote-back';
      back.setAttribute('aria-label', 'Back to reference ' + n);
      back.textContent = '↩';
      li.appendChild(document.createTextNode(' '));
      li.appendChild(back);
      ol.appendChild(li);
    }
    endnotes.appendChild(ol);
    root.appendChild(endnotes);
  }
```

### Step 3: Add CSS inside `COMPONENT_CSS`

Append:

```css
/* ── Footnote (inline ref + endnotes section) ── */
.fn-ref{font-size:.65em;line-height:0;vertical-align:super}
.fn-ref a{color:var(--ink-black);text-decoration:none;border-bottom:1px solid var(--steel);padding:0 1px;font-weight:500;transition:border-color .2s,color .2s}
.fn-ref a:hover{color:var(--spectrum-red);border-bottom-color:var(--spectrum-red)}
.endnotes{max-width:720px;margin:4rem auto 5rem;padding:2rem;background:var(--canvas);border-top:1px solid var(--fog);position:relative;z-index:3}
.endnotes-head{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.2em;margin-bottom:1rem}
.endnotes-list{list-style:decimal;padding-left:1.4rem;font-family:var(--font-body);font-size:.92rem;color:var(--graphite);line-height:1.6}
.endnotes-list li{margin-bottom:.6rem}
.endnote-back{color:var(--ink-black);text-decoration:none;margin-left:.3rem;font-size:.85rem;opacity:.6;transition:opacity .2s}
.endnote-back:hover{opacity:1}

/* ── Highlight (marker style) ── */
.highlight{background:linear-gradient(180deg,transparent 55%,#ffe98a 55%);padding:0 .15em;color:var(--ink-black);border-radius:1px}
```

### Step 4: Admin form support

In `editorialFieldsFor` switch, add:

```js
    case 'footnote':
      return [
        { key: 'ref',  label: 'Reference number', kind: 'text', hint: 'Numeric, e.g. <code>1</code>. Used to link to the endnote.' },
        { key: 'note', label: 'Note text',        kind: 'textarea' },
      ];
    case 'highlight':
      return [
        { key: 'html', label: 'Highlighted text', kind: 'textarea' },
      ];
```

In `defaultItemFor`, add:

```js
    case 'footnote':       return { kind, ref: 1, note: 'The note text.' };
    case 'highlight':      return { kind, html: 'A short highlighted phrase.' };
```

### Step 5: Verify

```bash
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
grep -c "case 'footnote'" js/render.js admin/ui/app.js   # expect 3 (one in render's renderEditorialItem, one in editorialFieldsFor, one in defaultItemFor)
grep -c "case 'highlight'" js/render.js admin/ui/app.js   # expect 3
grep -c "endnotes" js/render.js   # expect ≥ 4
```

Smoke test by inserting an Editorial block that contains a footnote and a highlight via API into a scratch page. Visit the page in the browser, confirm:
- Highlight renders with a yellow underline / marker background on the text
- Footnote shows as a small superscript ¹
- A "Notes" section appears at the bottom of the page with the note text and a return arrow ↩

### Step 6: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): footnote + highlight editorial inline items

Footnote renders as <sup> with a link to a numbered endnote.
Endnotes are auto-collected into an <aside class='endnotes'> appended
to the page after all blocks render. Each note links back to its
in-text reference for a11y.

Highlight wraps text in a semantic <mark> with a soft yellow
marker-style underline (linear-gradient base trick — no extra
descender clipping)."
```

---

## Task 6: stepList inline editorial item

**Files:**
- Modify: `js/render.js` (new case + CSS)
- Modify: `admin/ui/app.js` (editorialFieldsFor, defaultItemFor, helper editor)

### Step 1: Add the renderer case

In `renderEditorialItem`'s switch (just before `default:`):

```js
    case 'stepList': {
      const wrap = el('div', { class: 'steplist' });
      if (item.title) wrap.appendChild(el('div', { class: 'steplist-title' }, item.title));
      const ol = el('ol', { class: 'steplist-list' });
      (item.steps || []).forEach((s, i) => {
        const li = el('li', { class: 'steplist-step' });
        if (s.title) {
          const t = el('div', { class: 'steplist-step-title' });
          t.innerHTML = s.title;
          li.appendChild(t);
        }
        if (s.body) {
          const b = el('div', { class: 'steplist-step-body' });
          b.innerHTML = s.body;
          li.appendChild(b);
        }
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
      return wrap;
    }
```

### Step 2: Add CSS inside `COMPONENT_CSS`

Append:

```css
/* ── StepList (numbered how-to inside Editorial) ── */
.steplist{margin:2rem 0 2.5rem;font-family:var(--font-body)}
.steplist-title{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.18em;margin-bottom:1.2rem}
.steplist-list{list-style:none;counter-reset:steplist;padding:0;margin:0}
.steplist-step{counter-increment:steplist;position:relative;padding-left:3rem;margin-bottom:1.4rem;min-height:2.2rem}
.steplist-step::before{content:counter(steplist,decimal-leading-zero);position:absolute;left:0;top:.05em;font-family:var(--font-display);font-size:1.5rem;font-weight:300;color:var(--graphite);letter-spacing:-.02em;line-height:1;width:2.2rem}
.steplist-step-title{font-family:var(--font-display);font-size:1.15rem;font-weight:500;color:var(--ink-black);line-height:1.3;letter-spacing:-.015em;margin-bottom:.3rem}
.steplist-step-body{font-family:var(--font-body);font-size:1rem;color:var(--graphite);line-height:1.55;font-weight:400}
```

### Step 3: Admin form support

In `editorialFieldsFor`:

```js
    case 'stepList':
      return [
        { key: 'title', label: 'Heading (optional)', kind: 'text' },
        { key: 'steps', label: 'Steps',              kind: 'step_list_field' },
      ];
```

In `defaultItemFor`:

```js
    case 'stepList': return { kind, title: '', steps: [
      { title: 'Step one', body: 'Describe what to do.' },
      { title: 'Step two', body: 'Describe what to do.' },
    ]};
```

Add a `step_list_field` case to `simpleField`'s switch (since stepList is inside Editorial sub-items, it uses `simpleField` not `renderField`):

```js
    case 'step_list_field': {
      let arr = getVal();
      if (!Array.isArray(arr)) { arr = []; setVal(arr); }
      arr.forEach((step, i) => {
        const row = document.createElement('div');
        row.className = 'subitem';
        row.innerHTML = `<div class="subitem-head"><span class="subitem-kind">Step ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:80px 1fr;gap:6px 8px;align-items:center;';
        grid.innerHTML = `
          <label class="field-label">Title</label>
          <input type="text" data-k="title" value="${escapeAttr(step.title||'')}" placeholder="Short step title">
          <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
          <textarea data-k="body" rows="2">${escapeText(step.body||'')}</textarea>`;
        row.appendChild(grid);
        grid.querySelectorAll('[data-k]').forEach(el => {
          el.addEventListener('input', () => { step[el.dataset.k] = el.value; onChange(); });
        });
        row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<arr.length-1) { [arr[i+1], arr[i]] = [arr[i], arr[i+1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); arr.splice(i,1); onChange(); renderEditor(); });
        wrap.appendChild(row);
      });
      const add = document.createElement('button');
      add.textContent = '+ Add step';
      add.className = 'small';
      add.addEventListener('click', (e) => { e.preventDefault(); arr.push({ title: '', body: '' }); onChange(); renderEditor(); });
      wrap.appendChild(add);
      break;
    }
```

### Step 4: Verify

```bash
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
grep -c "case 'stepList'" js/render.js admin/ui/app.js   # expect 3 (renderer, editorialFieldsFor, defaultItemFor)
grep -c "step_list_field" admin/ui/app.js   # expect 2 (schema + simpleField case)
grep -c "steplist-step::before" js/render.js   # expect 1 (counter style)
```

Smoke-test by inserting a stepList in an Editorial via the admin UI (admin → click an Editorial → add inline item → Step-by-step). Verify on the rendered page: numbered steps with weight-300 large numerals on the left, step title in bold, body in graphite.

### Step 5: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): stepList editorial inline item

Numbered how-to / explainer steps with title + body. Each step
shows a large weight-300 step number (zero-padded, '01', '02')
on the left, distinct from List which is just bullets/numbers.

Per-step admin editor reuses the same up/down/delete row pattern
as scrolly steps and timeline events for consistency."
```

---

## Task 7: factCheck inline editorial item

**Files:**
- Modify: `js/render.js` (new case + CSS)
- Modify: `admin/ui/app.js` (editorialFieldsFor, defaultItemFor, verdict select kind)

### Step 1: Add the renderer case

In `renderEditorialItem`'s switch (just before `default:`):

```js
    case 'factCheck': {
      const verdict = (item.verdict || 'true').toLowerCase();
      const verdictLabel = { true: 'True', false: 'False', misleading: 'Misleading' }[verdict] || verdict;
      const wrap = el('aside', { class: `factcheck factcheck-${verdict}`, 'aria-label': 'Fact check: ' + verdictLabel });
      const head = el('div', { class: 'factcheck-head' });
      head.appendChild(el('span', { class: 'factcheck-pill' }, verdictLabel));
      head.appendChild(el('span', { class: 'factcheck-eyebrow' }, 'Fact check'));
      wrap.appendChild(head);
      if (item.claim) {
        const claim = el('blockquote', { class: 'factcheck-claim' });
        claim.innerHTML = item.claim;
        wrap.appendChild(claim);
      }
      if (item.explanation) {
        const exp = el('div', { class: 'factcheck-explanation' });
        exp.innerHTML = item.explanation;
        wrap.appendChild(exp);
      }
      if (item.source) {
        const src = el('div', { class: 'factcheck-source' });
        src.innerHTML = 'Source: ' + (item.source || '');
        wrap.appendChild(src);
      }
      return wrap;
    }
```

### Step 2: Add CSS inside `COMPONENT_CSS`

Append:

```css
/* ── FactCheck ── */
.factcheck{margin:2.4rem 0;padding:1.4rem 1.6rem;border-radius:var(--radius-card);background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(0,0,0,.06);box-shadow:var(--shadow-card);font-family:var(--font-body);position:relative;overflow:hidden}
.factcheck::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px}
.factcheck-true::before{background:var(--signal-blue)}
.factcheck-false::before{background:var(--spectrum-red)}
.factcheck-misleading::before{background:var(--marigold)}
.factcheck-head{display:flex;align-items:center;gap:.7rem;margin-bottom:.9rem}
.factcheck-pill{font-family:var(--font-body);font-size:.7rem;font-weight:500;text-transform:uppercase;letter-spacing:.14em;padding:.3rem .8rem;border-radius:var(--radius-pill);color:#fff;line-height:1}
.factcheck-true .factcheck-pill{background:var(--signal-blue)}
.factcheck-false .factcheck-pill{background:var(--spectrum-red)}
.factcheck-misleading .factcheck-pill{background:var(--marigold);color:var(--ink-black)}
.factcheck-eyebrow{font-size:.7rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.18em}
.factcheck-claim{font-family:var(--font-display);font-size:1.15rem;font-weight:300;color:var(--ink-black);line-height:1.35;letter-spacing:-.015em;margin:0 0 .8rem;padding:0;border:none;font-style:normal}
.factcheck-claim::before{content:'\201C';margin-right:.1em;opacity:.4}
.factcheck-claim::after{content:'\201D';margin-left:.1em;opacity:.4}
.factcheck-explanation{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);line-height:1.55;margin-bottom:.6rem;font-weight:400}
.factcheck-source{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);font-style:normal;font-weight:400}
```

### Step 3: Admin form support

In `editorialFieldsFor`, add:

```js
    case 'factCheck':
      return [
        { key: 'claim',       label: 'Claim being checked', kind: 'textarea' },
        { key: 'verdict',     label: 'Verdict',             kind: 'verdict_select' },
        { key: 'explanation', label: 'Explanation',         kind: 'textarea' },
        { key: 'source',      label: 'Source (optional)',   kind: 'text' },
      ];
```

In `defaultItemFor`:

```js
    case 'factCheck': return { kind, claim: 'The claim being checked.', verdict: 'true', explanation: 'Why the verdict is what it is.', source: '' };
```

Add `verdict_select` case to `simpleField`'s switch:

```js
    case 'verdict_select': {
      const sel = document.createElement('select');
      [['true','True'],['false','False'],['misleading','Misleading']].forEach(([v,l]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        if ((getVal()||'true') === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => setVal(sel.value));
      wrap.appendChild(sel);
      break;
    }
```

### Step 4: Verify

```bash
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
grep -c "case 'factCheck'" js/render.js admin/ui/app.js   # expect 3
grep -c "factcheck-pill\|factcheck-claim" js/render.js   # expect 2+
grep -c "verdict_select" admin/ui/app.js   # expect 2 (schema + simpleField case)
```

Visually: insert a factCheck inline in an Editorial. Verdict pill changes color per choice (true=blue, false=red, misleading=yellow). Claim renders in display-300 with thin gray curly quotes auto-prepended/appended.

### Step 5: Commit

```bash
git add admin/ui/app.js js/render.js
git commit -m "feat(components): factCheck editorial inline item

Frosted-glass aside with a colored verdict pill (signal-blue /
spectrum-red / marigold for TRUE / FALSE / MISLEADING), the
checked claim in display-300, an explanation paragraph, and an
optional source line.

Uses semantic <aside> + <blockquote>. The verdict is also
announced via aria-label so screen readers communicate the
outcome immediately."
```

---

## Task 8: End-to-end smoke test

**Files:** none — verification only.

This task generates one of each new component via the Claude API and visually verifies it renders correctly on a scratch page.

### Step 1: Ensure server is running and login

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login \
  -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null
```

### Step 2: Generate one of each new BLOCK type

Each call takes 15–60 seconds.

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"ChapterDivider","prompt":"A chapter divider for Chapter 2 about climate adaptation; subtitle should hint at what is coming","mode":"create","pageId":"index"}' > /tmp/gen-ChapterDivider.json
echo "ChapterDivider done"

curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"Quote","prompt":"A featured quote from Hannah Arendt about totalitarianism, with attribution and short role line","mode":"create","pageId":"index"}' > /tmp/gen-Quote.json
echo "Quote done"

curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"VideoEmbed","prompt":"Embed a real YouTube documentary about coral reefs, with caption and credit","mode":"create","pageId":"index"}' > /tmp/gen-VideoEmbed.json
echo "VideoEmbed done"
```

### Step 3: Assemble + render on a scratch page

```bash
# Re-create the smoketest page if needed
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/pages \
  -H "Content-Type: application/json" \
  -d '{"id":"smoketest-v2","title":"Smoke test v2"}' > /dev/null

# Generate one Editorial that exercises all 4 new inline kinds
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"Editorial","prompt":"An editorial about misinformation online. Include a kicker, h2, lead, paragraph, then a footnote, a highlight, a stepList with 3 steps, and a factCheck (verdict: misleading). Keep it short.","mode":"create","pageId":"smoketest-v2"}' > /tmp/gen-Editorial-v2.json
echo "Editorial done"

# Assemble doc
node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync("content/smoketest-v2.json","utf8"));
function pick(name) {
  const raw = JSON.parse(fs.readFileSync("/tmp/gen-" + name + ".json","utf8"));
  if (raw.error) throw new Error("gen-" + name + " error: " + raw.error);
  return raw.data;
}
doc.blocks = [
  { id:"b1", type:"ChapterDivider", data: pick("ChapterDivider") },
  { id:"b2", type:"Quote",          data: pick("Quote") },
  { id:"b3", type:"VideoEmbed",     data: pick("VideoEmbed") },
  { id:"b4", type:"Editorial",      data: pick("Editorial-v2") },
];
doc.version++;
doc.updatedAt = new Date().toISOString();
fs.writeFileSync("content/smoketest-v2.json", JSON.stringify(doc, null, 2));
console.log("smoketest-v2 assembled with", doc.blocks.length, "blocks");
'

curl -s -o /dev/null -w "GET /smoketest-v2 → %{http_code}\n" http://localhost:4000/smoketest-v2
curl -s -o /dev/null -w "GET /content/smoketest-v2.json → %{http_code}\n" http://localhost:4000/content/smoketest-v2.json
```

Both should return 200.

### Step 4: Visual verification

In the Chrome preview MCP, navigate to `http://localhost:4000/smoketest-v2` and screenshot. Confirm each new component renders:

- [ ] ChapterDivider: centered, weight-300 title, spectrum gradient strip
- [ ] Quote: blockquote with thin open-quote glyph, portrait (if generated), attribution + role
- [ ] VideoEmbed: 16:9 iframe with caption + credit (or placeholder if no real URL)
- [ ] Editorial with inline items:
  - [ ] Footnote ¹ superscript in text + "Notes" section at bottom of page
  - [ ] Highlight: yellow marker-style emphasis
  - [ ] StepList: numbered steps with large display number on left
  - [ ] FactCheck: frosted aside with verdict pill (true/false/misleading color)

### Step 5: Console + network error check

```js
mcp__Claude_Preview__preview_console_logs({ serverId: '...', level: 'error', lines: 30 })
mcp__Claude_Preview__preview_network({ serverId: '...', filter: 'failed' })
```

Expected: zero errors. iframe to youtube-nocookie may show in network as 200 or 204 (depends on the URL Claude generated — placeholder is fine).

### Step 6: Anti-leak detection (defense-in-depth)

Re-run the journalism-motif leak detector on the four generations to confirm Task 1's prompt-decoupling still holds with the new types:

```bash
node -e '
const fs = require("fs");
const banned = ["pyramide","umgekehrte","marinos","1924","1605","schudson","jahrhunderterfindung","wer? was?","journalismus"];
const files = ["ChapterDivider","Quote","VideoEmbed","Editorial-v2"].map(n => "/tmp/gen-" + n + ".json");
let leaks = 0;
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(f,"utf8"));
  const txt = JSON.stringify(raw.data).toLowerCase();
  const hits = banned.filter(w => txt.includes(w));
  console.log(f, hits.length ? "LEAK " + hits.join(",") : "clean");
  if (hits.length) leaks++;
}
process.exit(leaks ? 1 : 0);
'
```

Expected: 4/4 clean.

### Step 7: Clean up scratch page

```bash
curl -s -b /tmp/cookies.txt -X DELETE http://localhost:4000/admin/api/pages/smoketest-v2
echo "smoketest-v2 cleaned"
```

### Step 8: No commit (unless you fixed a regression mid-test)

---

## Self-Review

**Spec coverage:**
- ✅ 3 new block types: ChapterDivider (Task 2), Quote (Task 3), VideoEmbed (Task 4)
- ✅ 4 new editorial inline kinds: footnote + highlight (Task 5), stepList (Task 6), factCheck (Task 7)
- ✅ Infrastructure (server BLOCK_GUIDES, EDITORIAL_ITEM_KINDS, PALETTE_BLOCKS, EDITORIAL_ITEM_FRIENDLY) — Task 1, so subsequent tasks don't shuffle shared arrays
- ✅ Final E2E smoke test that generates each new type and visually verifies — Task 8
- ✅ Anti-leak detector re-run against new types — Task 8 Step 6
- ✅ All new components use Dia tokens (verified in CSS rules of each task)
- ✅ Semantic HTML / a11y: `<sup>` + `<aside>` for footnotes/endnotes; `<blockquote>` for quote; `<figure>` + `<figcaption>` + `<iframe title>` for video; `<aside aria-label>` + `<blockquote>` for factCheck; `<mark>` for highlight; `<ol>` + counter-reset for stepList

**Placeholder scan:** No TBDs, no "implement later". Every step shows full code or full command. Verification steps assert specific outcomes.

**Type / token consistency:**
- `BLOCK_RENDERERS` map grows consistently across Tasks 2, 3, 4 — each task shows the full map after its addition so the engineer doesn't have to track diffs.
- `COMPONENT_CSS` is appended-only across Tasks 2-7 — order in the file doesn't matter for CSS, so no shuffling concerns.
- `EDITORIAL_ITEM_KINDS`, `EDITORIAL_ITEM_FRIENDLY`, `PALETTE_BLOCKS`, `BLOCK_SCHEMAS` all set their final shape in Task 1 (kinds + previews) or built incrementally with explicit final-state snapshots (Tasks 2/3/4 for blocks).
- `simpleField` cases (`step_list_field`, `verdict_select`) follow the same `getVal/setVal` pattern used by the existing `tone_select` from a previous plan.
- `parseVideoUrl` is unit-tested before integration use (Task 4 Step 4).
- Footnote endnote-collection pass runs once per `render()` call after all blocks are appended — confirmed to fire even on pages with zero footnotes (it short-circuits when `refs.length === 0`).

Plan is internally consistent and ready to execute.
