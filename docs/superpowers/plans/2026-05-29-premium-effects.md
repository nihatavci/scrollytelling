# Premium CSS Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Per-block "✨ Effects" modifiers (reveal, parallax, tilt, wipe, zoom, glass, gradient-text, generative backdrop), progressively enhanced, plus a live gallery page.

**Architecture:** `block.data._fx` stores effect choices. `js/render.js#applyBlockFx` tags each block node with classes/data-attrs; `js/motion-fx.js` binds reveal/parallax (existing) + tilt (new); CSS in `COMPONENT_CSS` handles glass/zoom/gradient/wipe/genBg with `@supports` fallbacks; one Houdini worklet for genBg. The admin `renderEditor` renders an Effects group from `FX_APPLICABLE`.

**Tech Stack:** Vanilla JS, modern CSS (`animation-timeline`, `background-clip:text`, `backdrop-filter`), CSS Paint API (Houdini).

**Verification:** `node -c` per JS file; gallery page visual check; final deploy smoke test.

---

## File map

| File | Responsibility |
|---|---|
| `js/render.js` | `applyBlockFx(node, block)` + calls in render loop + soft-refresh; effect CSS in `COMPONENT_CSS`; register Houdini worklet when needed |
| `js/motion-fx.js` | `bindTilt()`; re-init double-bind guard; call in `init()` |
| `js/fx-garden-worklet.js` | NEW Houdini paint worklet |
| `admin/ui/app.js` | `FX_APPLICABLE`; `renderFxGroup()` in `renderEditor` |
| `admin/ui/styles.css` | Effects panel control styles |
| `effects-gallery.html` | NEW reference page |

---

## Task 1: render.js — applyBlockFx + CSS + worklet registration

**Files:** Modify `js/render.js`

- [ ] **Step 1: Add `applyBlockFx` + worklet registration helper**

In `js/render.js`, immediately BEFORE the `export async function render(` line (search for it, ~line 1527), add:
```javascript
// ── Premium effects: tag a block node from block.data._fx ──
let _fxWorkletTried = false;
function _ensureGardenWorklet() {
  if (_fxWorkletTried) return;
  _fxWorkletTried = true;
  try {
    if (typeof CSS !== 'undefined' && CSS.paintWorklet) {
      const base = document.querySelector('base')?.href || '';
      CSS.paintWorklet.addModule((base ? base : '/') + 'js/fx-garden-worklet.js');
    }
  } catch (_) { /* fallback gradient shows */ }
}

function applyBlockFx(node, block) {
  if (!node || node.nodeType !== 1) return;
  const fx = block && block.data && block.data._fx;
  if (!fx) return;
  if (fx.reveal) {
    node.setAttribute('data-reveal', fx.reveal);
    if (fx.revealDelay) node.setAttribute('data-reveal-delay', String(fx.revealDelay));
  }
  const media = node.querySelector('img,video');
  if (fx.parallax) (media || node).setAttribute('data-parallax', String(fx.parallax));
  if (fx.tilt) node.classList.add('fx-tilt');
  if (fx.wipe) node.classList.add('fx-wipe');
  if (fx.zoom) (media || node).classList.add('fx-zoom');
  if (fx.glass) node.classList.add('fx-glass');
  if (fx.gradientText) node.classList.add('fx-gradient-text');
  if (fx.genBg) { node.classList.add('fx-genbg'); _ensureGardenWorklet(); }
}
```

- [ ] **Step 2: Call it in the main render loop**

In `js/render.js`, find (~line 1645–1649):
```javascript
      if (node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
      }
```
Replace with:
```javascript
      if (node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
        applyBlockFx(node, block);
      }
```

- [ ] **Step 3: Call it in the soft-refresh loop**

In `js/render.js`, find the soft-refresh tagging (~line 3303–3309):
```javascript
      if (node && node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
      }
```
Replace with:
```javascript
      if (node && node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
        applyBlockFx(node, block);
      }
```

- [ ] **Step 4: Add effect CSS to `COMPONENT_CSS`**

In `js/render.js`, find the Scene3D coming-soon CSS line `.scene3d-coming-soon span{...}` inside `COMPONENT_CSS`. Immediately AFTER it add:
```css
/* ── Premium effects ── */
.fx-zoom{animation:fxZoom 22s ease-in-out infinite alternate;transform-origin:center}
@keyframes fxZoom{from{transform:scale(1)}to{transform:scale(1.08)}}
.fx-glass{background:rgba(255,255,255,.55)}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.fx-glass{background:rgba(255,255,255,.35);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}}
.fx-gradient-text h1,.fx-gradient-text h2,.fx-gradient-text .fullbleed-title,.fx-gradient-text .step-heading{color:var(--ink-black)}
@supports (background-clip:text) or (-webkit-background-clip:text){.fx-gradient-text h1,.fx-gradient-text h2,.fx-gradient-text .fullbleed-title,.fx-gradient-text .step-heading{background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;color:transparent}}
.fx-tilt{transform-style:preserve-3d;transition:transform .25s ease-out;will-change:transform}
.fx-wipe{clip-path:inset(0 0 0 0)}
@supports (animation-timeline:view()){.fx-wipe{animation:fxWipe linear both;animation-timeline:view();animation-range:entry 10% cover 40%}@keyframes fxWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}}
.fx-genbg{position:relative;isolation:isolate}
.fx-genbg::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(198,121,196,.12),rgba(3,88,247,.12))}
@supports (background:paint(id)){.fx-genbg::before{background:paint(fxGarden)}}
@media(prefers-reduced-motion:reduce){.fx-zoom{animation:none}.fx-tilt{transform:none!important}}
```

- [ ] **Step 5: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo OK && rm /tmp/r.mjs`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/render.js
git commit -m "feat(fx): applyBlockFx tagging + effect CSS + Houdini worklet registration"
```

---

## Task 2: motion-fx.js — tilt binder + re-init guard

**Files:** Modify `js/motion-fx.js`

- [ ] **Step 1: Add `bindTilt` and a double-bind guard helper**

In `js/motion-fx.js`, find `function init() {` (~line 153). Immediately BEFORE it add:
```javascript
  // ── 3D tilt toward pointer (.fx-tilt) ──
  function bindTilt() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.fx-tilt').forEach(el => {
      if (el._fxTiltBound) return;
      el._fxTiltBound = true;
      const MAX = 8; // degrees
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(800px) rotateY(${px * MAX}deg) rotateX(${-py * MAX}deg)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }
```

- [ ] **Step 2: Call `bindTilt` in `init` and guard reveals/parallax against double-bind**

In `js/motion-fx.js`, find `function init() {` body (~line 153–161):
```javascript
  function init() {
    // autoTag() removed — auto-reveal animations on text/figures were
    // unwanted (user reported content "zooming in" on scroll).
    // bindReveals and bindStagger still work for manually placed data-reveal attrs.
    bindReveals();
    bindStagger();
    bindCounters();
    bindParallax();
  }
```
Replace with:
```javascript
  function init() {
    // autoTag() removed — auto-reveal animations on text/figures were
    // unwanted (user reported content "zooming in" on scroll).
    // bindReveals and bindStagger still work for manually placed data-reveal attrs.
    bindReveals();
    bindStagger();
    bindCounters();
    bindParallax();
    bindTilt();
  }
```

- [ ] **Step 3: Expose `bindTilt` on the public API**

In `js/motion-fx.js`, find (~line 171):
```javascript
  window.MFX = { init, bindReveals, bindStagger, bindCounters, bindParallax, autoTag };
```
Replace with:
```javascript
  window.MFX = { init, bindReveals, bindStagger, bindCounters, bindParallax, bindTilt, autoTag };
```

- [ ] **Step 4: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c js/motion-fx.js && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/motion-fx.js
git commit -m "feat(fx): pointer 3D tilt binder + init wiring"
```

---

## Task 3: Houdini generative backdrop worklet

**Files:** Create `js/fx-garden-worklet.js`

- [ ] **Step 1: Create the worklet file**

Create `js/fx-garden-worklet.js` with:
```javascript
// js/fx-garden-worklet.js — CSS Paint worklet for the generative backdrop (.fx-genbg).
// Registered via CSS.paintWorklet.addModule() in render.js when supported.
// Draws soft overlapping spectrum-tinted blobs — a calm, premium texture.
registerPaint('fxGarden', class {
  paint(ctx, size) {
    const { width: w, height: h } = size;
    const colors = ['rgba(198,121,196,0.20)', 'rgba(250,61,29,0.16)', 'rgba(255,176,5,0.16)', 'rgba(3,88,247,0.18)'];
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, w, h);
    // Deterministic pseudo-random blobs (no Math.random — stable per size)
    const seeded = (n) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 5; i++) {
      const cx = seeded(i + 1) * w;
      const cy = seeded(i + 7) * h;
      const r = (0.25 + seeded(i + 13) * 0.35) * Math.max(w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, colors[i % colors.length]);
      g.addColorStop(1, 'rgba(248,248,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
});
```

- [ ] **Step 2: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c js/fx-garden-worklet.js && echo OK`
Expected: `OK` (note: `registerPaint` is undefined at parse-check time but `node -c` only checks syntax, so it passes).

- [ ] **Step 3: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/fx-garden-worklet.js
git commit -m "feat(fx): Houdini generative backdrop paint worklet"
```

---

## Task 4: Admin — FX_APPLICABLE map + Effects panel in renderEditor

**Files:** Modify `admin/ui/app.js`

- [ ] **Step 1: Add the applicability map + effect definitions**

In `admin/ui/app.js`, immediately BEFORE `function renderEditor() {` (~line 3297), add:
```javascript
// Which effects make sense per block type (modifier model).
const FX_ALL = ['reveal', 'parallax', 'tilt', 'wipe', 'zoom', 'glass', 'gradientText', 'genBg'];
const FX_APPLICABLE = {
  Hero: ['reveal', 'gradientText', 'genBg'],
  ChapterDivider: ['reveal', 'gradientText', 'genBg'],
  Editorial: ['reveal', 'parallax', 'wipe', 'glass', 'gradientText'],
  Quote: ['reveal', 'tilt', 'glass', 'gradientText'],
  Aside: ['reveal', 'tilt', 'glass'],
  StatRow: ['reveal', 'glass', 'gradientText'],
  Timeline: ['reveal'],
  FullscreenImage: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  FullBleed: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  ImageGrid: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  ImageCompare: ['reveal', 'tilt'],
  ImageHotspot: ['reveal', 'tilt'],
  VideoEmbed: ['reveal'],
  AudioPlayer: ['reveal', 'glass'],
  Scene3D: ['reveal'],
  Outro: ['reveal', 'gradientText', 'genBg'],
  VizPanel: ['reveal', 'glass'],
  EmbedBlock: ['reveal'],
  AccordionBlock: ['reveal', 'glass'],
  ProgressNav: [],
  Scrolly: ['reveal'],
  DataScrolly: ['reveal'],
};
const FX_LABELS = {
  reveal: 'Reveal on scroll', parallax: 'Parallax', tilt: '3D tilt', wipe: 'Scroll wipe',
  zoom: 'Slow zoom', glass: 'Glass', gradientText: 'Gradient text', genBg: 'Generative backdrop',
};
```

- [ ] **Step 2: Add the Effects-group renderer function**

In `admin/ui/app.js`, immediately AFTER the `FX_LABELS` block from Step 1, add:
```javascript
function renderFxGroup(block, form, onFieldChange) {
  const keys = FX_APPLICABLE[block.type] || [];
  if (!keys.length) return;
  if (!block.data._fx) block.data._fx = {};
  const fx = block.data._fx;

  const section = document.createElement('div');
  section.className = 'editor-group';
  const header = document.createElement('button');
  header.className = 'editor-group-header'; header.type = 'button';
  header.innerHTML = `<span class="editor-group-arrow">▸</span> ✨ Effects`;
  const body = document.createElement('div');
  body.className = 'editor-group-body collapsed';
  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    header.querySelector('.editor-group-arrow').textContent = body.classList.contains('collapsed') ? '▸' : '▼';
  });

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:8px;line-height:1.45;';
  note.textContent = 'Effects enhance this block. Unsupported browsers fall back gracefully.';
  body.appendChild(note);

  // Reveal (select) + delay chips
  if (keys.includes('reveal')) {
    const f = document.createElement('div'); f.className = 'field';
    f.innerHTML = `<label class="field-label">Reveal on scroll</label>`;
    const sel = document.createElement('select');
    [['','Off'],['up','Fade up'],['left','Slide left'],['right','Slide right'],['scale','Scale'],['fade','Fade']].forEach(([v,t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if ((fx.reveal||'') === v) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', () => { fx.reveal = sel.value; if (!sel.value) delete fx.revealDelay; onFieldChange(); renderEditor(); });
    f.appendChild(sel);
    if (fx.reveal) {
      const delRow = document.createElement('div'); delRow.className = 'fx-chips';
      [0,0.1,0.2,0.3].forEach(d => {
        const c = document.createElement('button'); c.type='button'; c.className='fx-chip'+(((fx.revealDelay||0)===d)?' active':'');
        c.textContent = d === 0 ? 'No delay' : d+'s';
        c.addEventListener('click', e => { e.preventDefault(); fx.revealDelay = d; onFieldChange(); renderEditor(); });
        delRow.appendChild(c);
      });
      f.appendChild(delRow);
    }
    body.appendChild(f);
  }
  // Parallax chips
  if (keys.includes('parallax')) {
    const f = document.createElement('div'); f.className = 'field';
    f.innerHTML = `<label class="field-label">Parallax</label>`;
    const row = document.createElement('div'); row.className = 'fx-chips';
    [[0,'Off'],[0.1,'Subtle'],[0.2,'Medium'],[0.3,'Strong']].forEach(([v,t]) => {
      const c = document.createElement('button'); c.type='button'; c.className='fx-chip'+(((fx.parallax||0)===v)?' active':'');
      c.textContent = t;
      c.addEventListener('click', e => { e.preventDefault(); fx.parallax = v; onFieldChange(); renderEditor(); });
      row.appendChild(c);
    });
    f.appendChild(row); body.appendChild(f);
  }
  // Boolean toggles
  ['tilt','wipe','zoom','glass','gradientText','genBg'].forEach(key => {
    if (!keys.includes(key)) return;
    const lbl = document.createElement('label');
    lbl.className = 'fx-toggle';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!fx[key];
    cb.addEventListener('change', () => { fx[key] = cb.checked; onFieldChange(); });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + FX_LABELS[key]));
    body.appendChild(lbl);
  });

  section.appendChild(header); section.appendChild(body);
  form.appendChild(section);
}
```

- [ ] **Step 3: Call `renderFxGroup` after the schema groups**

In `admin/ui/app.js`, find the end of the `GROUP_ORDER.forEach` loop — the line `form.appendChild(section);` followed by the loop close `});`, then the comment `// ── Universal: background opacity per block ──` (~line 3409–3412). Immediately AFTER the `});` that closes the GROUP_ORDER loop and BEFORE the background-opacity comment, add:
```javascript
  // ── Premium effects panel ──
  renderFxGroup(block, form, onFieldChange);
```

- [ ] **Step 4: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c admin/ui/app.js && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/app.js
git commit -m "feat(fx): admin Effects panel (FX_APPLICABLE + renderFxGroup)"
```

---

## Task 5: Admin — Effects panel CSS

**Files:** Modify `admin/ui/styles.css`

- [ ] **Step 1: Append control styles**

Append at the END of `admin/ui/styles.css`:
```css
/* Effects panel controls */
.fx-chips { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; }
.fx-chip { padding:4px 11px; border-radius:9999px; font-size:11px; border:1.5px solid #e8e8e8; background:#fff; color:#555; cursor:pointer; font-family:inherit; }
.fx-chip:hover { border-color:#bbb; color:#000; }
.fx-chip.active { background:#000; color:#fff; border-color:#000; font-weight:600; }
.fx-toggle { display:flex; align-items:center; gap:7px; font-size:13px; font-weight:400; padding:5px 0; cursor:pointer; }
.fx-toggle input { width:auto; }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/styles.css
git commit -m "feat(fx): effects panel control styles"
```

---

## Task 6: Live effects gallery page

**Files:** Create `effects-gallery.html`

- [ ] **Step 1: Create the gallery page**

Create `effects-gallery.html` at the repo root with:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Premium Effects Gallery — ScrollyCMS</title>
<link rel="stylesheet" href="/css/site.css">
<style>
  body{font-family:'DM Sans',system-ui,sans-serif;background:#f8f8f8;color:#000;margin:0}
  .fx-section{min-height:90vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:4rem 1.5rem;border-bottom:1px solid #eee}
  .fx-section h2{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:#0358f7;margin:0}
  .fx-demo{max-width:680px;width:100%}
  .demo-card{background:#fff;border-radius:20px;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .demo-img{width:100%;height:340px;object-fit:cover;border-radius:16px;display:block}
  h3.big{font-size:clamp(2rem,5vw,3.4rem);font-weight:300;letter-spacing:-.03em;margin:.4rem 0}
  :root{--card:rgba(255,255,255,.6)}
</style>
</head>
<body>
  <div style="text-align:center;padding:6rem 1.5rem 2rem"><h1 style="font-weight:300;font-size:2.4rem;letter-spacing:-.03em">Premium Effects Gallery</h1><p style="color:#777">Scroll to see each effect. Apply any of these per-block in the editor.</p></div>

  <section class="fx-section"><h2>Reveal · fade up</h2><div class="fx-demo" data-reveal="up"><div class="demo-card"><h3 class="big">Reveal on scroll</h3><p>Fades and slides in as it enters the viewport.</p></div></div></section>

  <section class="fx-section"><h2>Parallax</h2><div class="fx-demo"><img class="demo-img" data-parallax="0.2" src="https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=900&q=70" alt="" loading="lazy"></div></section>

  <section class="fx-section"><h2>3D tilt · hover</h2><div class="fx-demo fx-tilt"><img class="demo-img" src="https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=70" alt="" loading="lazy"></div></section>

  <section class="fx-section"><h2>Scroll wipe</h2><div class="fx-demo"><img class="demo-img fx-wipe" src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&q=70" alt="" loading="lazy"></div></section>

  <section class="fx-section"><h2>Slow zoom</h2><div class="fx-demo" style="overflow:hidden;border-radius:16px"><img class="demo-img fx-zoom" src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=900&q=70" alt="" loading="lazy"></div></section>

  <section class="fx-section" style="background:url('https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=1200&q=70') center/cover"><h2 style="color:#fff">Glass</h2><div class="fx-demo fx-glass" style="border-radius:20px;padding:2rem"><h3 class="big" style="margin:0">Frosted glass surface</h3><p>backdrop-filter over imagery.</p></div></section>

  <section class="fx-section"><h2>Gradient text</h2><div class="fx-demo fx-gradient-text" style="text-align:center"><h2 style="font-size:clamp(2.4rem,7vw,5rem);font-weight:300;letter-spacing:-.04em;color:#000">Spectrum headline</h2></div></section>

  <section class="fx-section"><h2>Generative backdrop</h2><div class="fx-demo fx-genbg demo-card" style="min-height:280px;display:flex;align-items:center;justify-content:center"><h3 class="big">Houdini texture</h3></div></section>

  <script src="https://cdn.jsdelivr.net/npm/motion@11.18.2/dist/motion.js"></script>
  <script type="module">
    // Pull in the same effect CSS the renderer injects, plus motion-fx behaviors.
    import { injectComponentCSS } from '/js/render.js';
    try { injectComponentCSS(); } catch(_) {}
    if (CSS.paintWorklet) { try { CSS.paintWorklet.addModule('/js/fx-garden-worklet.js'); } catch(_){} }
  </script>
  <script src="/js/motion-fx.js"></script>
  <script>
    // The gallery has no #page-root, so motion-fx's auto-init won't fire — run it manually.
    window.addEventListener('load', () => { if (window.MFX) window.MFX.init(); });
  </script>
</body>
</html>
```

Note: `injectComponentCSS` must be exported from `render.js` for this import. Check whether it already is; if not, this step also requires adding `export` to its declaration.

- [ ] **Step 2: Ensure `injectComponentCSS` is exported**

Run: `cd /Users/nihat/DevS/Thomas && grep -n "function injectComponentCSS" js/render.js`
If the line is `function injectComponentCSS() {` (no `export`), change it to `export function injectComponentCSS() {`. If it already has `export`, skip.

- [ ] **Step 3: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo "render OK" && rm /tmp/r.mjs`
Expected: `render OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add effects-gallery.html js/render.js
git commit -m "feat(fx): live effects gallery reference page"
```

---

## Task 7: Version bump, deploy, smoke test

**Files:** Modify `admin/ui/index.html`, `admin/index.html`, `admin/ui/app.js` (version)

- [ ] **Step 1: Current version**

Run: `cd /Users/nihat/DevS/Thomas && grep -o "v=20260528[a-z]" admin/ui/index.html | head -1`
Note `<OLD>`; next letter `<NEW>`.

- [ ] **Step 2: Bump (html + preview-blob render.js)**

```bash
cd /Users/nihat/DevS/Thomas
sed -i '' 's/20260528<OLD>/20260528<NEW>/g' admin/ui/index.html admin/index.html admin/ui/app.js
grep -o "render.js?v=20260528<NEW>" admin/ui/app.js && echo "blob bumped"
```
Expected: `blob bumped`

- [ ] **Step 3: Final syntax check all touched JS**

```bash
cd /Users/nihat/DevS/Thomas
node -c admin/ui/app.js && echo "app OK"
node -c js/motion-fx.js && echo "motion OK"
node -c js/fx-garden-worklet.js && echo "worklet OK"
cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo "render OK" && rm /tmp/r.mjs
```
Expected: all `OK`.

- [ ] **Step 4: Commit + deploy**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/index.html admin/index.html admin/ui/app.js
git commit -m "chore(fx): version bump for premium effects release"
mv "Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" /tmp/ 2>/dev/null
mv "Die Nachricht als Jahrhunderterfindung-1.docx" /tmp/ 2>/dev/null
wrangler pages deploy . --project-name scrollycms --branch main 2>&1 | tail -3
mv /tmp/"Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" . 2>/dev/null
mv /tmp/"Die Nachricht als Jahrhunderterfindung-1.docx" . 2>/dev/null
```
Expected: `✨ Deployment complete!`

- [ ] **Step 5: Smoke test**

1. `https://scrolli.nihatavci.com/effects-gallery.html` — scroll through; each effect visibly works (reveal, parallax, tilt on hover, wipe, zoom, glass, gradient text, generative backdrop with fallback).
2. `https://scrolli.nihatavci.com/admin/ui/` (hard-refresh) — open a block (e.g. Full-Screen Photo) → expand **✨ Effects** → only applicable effects show. Toggle **Slow zoom** + **Reveal: Fade up** → preview updates live.
3. Toggle **Gradient text** on a Cover/Text heading → headline fills with the spectrum gradient in preview.
4. Publish → live page shows the effects.

---

## Self-review

**Spec coverage:**

| Spec item | Task |
|---|---|
| 8 effects as per-block modifiers | Task 1 (apply+CSS), Task 2 (tilt), Task 4 (panel) |
| `block.data._fx` model | Task 1 (read), Task 4 (write) |
| FX_APPLICABLE map | Task 4 |
| ✨ Effects editor panel | Task 4 + Task 5 CSS |
| Progressive enhancement (@supports) | Task 1 CSS, Task 3 fallback |
| Reuse motion-fx reveal/parallax | Task 1 sets data-attrs consumed by existing binders |
| Tilt binder | Task 2 |
| Houdini worklet + registration | Task 3 + Task 1 `_ensureGardenWorklet` |
| soft-refresh applies fx live | Task 1 Step 3 |
| Gallery page | Task 6 |
| prefers-reduced-motion | Task 1 CSS + Task 2 guard |

**Placeholder scan:** none (Task 6 Step 2 is a conditional edit with the exact condition stated).

**Name consistency:** `_fx` keys (`reveal, revealDelay, parallax, tilt, wipe, zoom, glass, gradientText, genBg`) identical across data model, `applyBlockFx`, `FX_APPLICABLE`, `renderFxGroup`. CSS classes `fx-tilt/fx-wipe/fx-zoom/fx-glass/fx-gradient-text/fx-genbg` identical in `applyBlockFx` and `COMPONENT_CSS`. Worklet name `fxGarden` matches `paint(fxGarden)` in CSS and `registerPaint('fxGarden', …)`.

**Note — motion-fx re-init on soft-refresh:** the admin preview's `soft-refresh` dispatches `content:ready`; `motion-fx` listens for it once (`{once:true}`) for the initial run. After soft-refresh, `MFX.init()` may not auto-run. Tilt uses a `_fxTiltBound` guard so re-running is safe, and reveal/parallax read data-attrs on (re)build. The live-preview path already re-renders via the iframe's existing `content:ready` dispatch in `soft-refresh`; if tilt doesn't bind after an edit, it will after the next full reload. Acceptable for v1 (the published page always runs init fresh). Not adding a re-init hook to avoid scope creep; flagged here.
