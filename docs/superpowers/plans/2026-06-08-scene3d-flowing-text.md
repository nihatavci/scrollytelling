# Scene3D Flowing Text (pretext) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `textMode: 'flow'` to the Scene3D block where article prose reflows around the 3D model's shape in real time (pretext), with a graceful fallback.

**Architecture:** A new `js/scene3d-flow.js` controller owns: loading `@chenglou/pretext`, building a per-frame coarse **occupancy profile** from the live camera+model (no GPU readback), laying out prose into columns with per-line widths from that profile, and drawing the lines onto a 2D canvas over the WebGL canvas. `js/scene3d.js` creates the controller in flow mode and calls `relayout()` from its render path. `render.js`/`app.js`/editor add the DOM, schema, and controls.

**Tech Stack:** Vanilla JS, Three.js 0.170.0 (esm.sh), `@chenglou/pretext` (esm.sh, MIT), Canvas 2D, `Intl.Segmenter`.

**CRITICAL — empirical API gate:** pretext's exact runtime shapes are pinned in **Task 1** (headless probe) before Task 2 draws against them. Task 2's draw loop is written against the documented API and **must be reconciled with Task 1's logged shapes** (the probe prints them).

**Verification:** `node -c` per JS file + headless browser probe/screenshot (Claude Preview MCP) per phase. No unit harness in repo.

---

## File map

| File | Responsibility |
|---|---|
| `js/scene3d-flow.js` | NEW — pretext load, occupancy profile, column layout, canvas draw, dispose |
| `js/scene3d.js` | Create flow controller in flow mode; call `relayout()` in render/tween/resize/settle; dispose |
| `js/render.js` | `renderScene3D` flow DOM (text canvas + a11y copy + fallback), CSS |
| `admin/ui/app.js` | Scene3D schema: `textMode`, `flowText`, `flowColumns`; defaults |
| `admin/ui/scene3d-editor.js` | Text-mode toggle, Article-text textarea, Columns chips |
| `admin/ui/styles.css` | editor flow controls |
| `/tmp/flowtest/*` (Task 1/2 only) | throwaway headless probe pages |

---

## Task 1: pretext load + occupancy profile (+ API probe)

**Files:** Create `js/scene3d-flow.js`

- [ ] **Step 1: Create the module skeleton — loader, support check, occupancy**

Create `js/scene3d-flow.js`:
```javascript
// js/scene3d-flow.js — pretext flowing text wrapped around the Scene3D model.
// Public: flowSupported(), loadPretext(), createFlowText(opts)

const PRETEXT_CDN = 'https://esm.sh/@chenglou/pretext';
let _ptPromise = null;
export function loadPretext() {
  if (!_ptPromise) _ptPromise = import(PRETEXT_CDN);
  return _ptPromise;
}
export function flowSupported() {
  return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
}

// Layout constants
const FONT_PX = 17, LINE_H = 27, BANDS = 12, PAD = 26, GUTTER = 36, MIN_W = 52;
const FONT = `${FONT_PX}px Georgia, 'Times New Roman', serif`;

// Build a coarse per-band [left,right] screen-x occupancy interval for the model.
// 14 sample points (8 box corners + 6 face centers) projected to screen — no readback.
export function computeOccupancy(THREE, camera, model, W, H) {
  const bands = new Array(BANDS).fill(null);
  if (!camera || !model) return bands;
  const box = new THREE.Box3().setFromObject(model);
  if (!isFinite(box.min.x)) return bands;
  const mn = box.min, mx = box.max, cx = (mn.x + mx.x) / 2, cy = (mn.y + mx.y) / 2, cz = (mn.z + mx.z) / 2;
  const pts = [
    [mn.x,mn.y,mn.z],[mx.x,mn.y,mn.z],[mn.x,mx.y,mn.z],[mx.x,mx.y,mn.z],
    [mn.x,mn.y,mx.z],[mx.x,mn.y,mx.z],[mn.x,mx.y,mx.z],[mx.x,mx.y,mx.z],
    [cx,cy,mn.z],[cx,cy,mx.z],[mn.x,cy,cz],[mx.x,cy,cz],[cx,mn.y,cz],[cx,mx.y,cz],
  ];
  const v = new THREE.Vector3();
  const lo = new Array(BANDS).fill(Infinity), hi = new Array(BANDS).fill(-Infinity);
  for (const [x,y,z] of pts) {
    v.set(x,y,z).project(camera);
    if (v.z > 1) continue;
    const sx = (v.x*0.5+0.5)*W, sy = (-v.y*0.5+0.5)*H;
    const b = Math.max(0, Math.min(BANDS-1, Math.floor(sy / H * BANDS)));
    if (sx < lo[b]) lo[b] = sx;
    if (sx > hi[b]) hi[b] = sx;
  }
  for (let b = 0; b < BANDS; b++) {
    if (lo[b] === Infinity) continue;
    bands[b] = [Math.max(0, lo[b]-PAD), Math.min(W, hi[b]+PAD)];
  }
  // Vertically dilate occupancy by 1 band so the silhouette reads continuous.
  const dil = bands.slice();
  for (let b = 0; b < BANDS; b++) {
    for (const nb of [b-1, b+1]) {
      if (nb<0||nb>=BANDS||!bands[nb]) continue;
      if (!dil[b]) dil[b] = bands[nb].slice();
      else { dil[b][0]=Math.min(dil[b][0],bands[nb][0]); dil[b][1]=Math.max(dil[b][1],bands[nb][1]); }
    }
  }
  return dil;
}

export { FONT, FONT_PX, LINE_H, BANDS, GUTTER, MIN_W };
```

- [ ] **Step 2: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/scene3d-flow.js /tmp/f.mjs && node -c /tmp/f.mjs && echo OK && rm /tmp/f.mjs`
Expected: `OK`

- [ ] **Step 3: Build a headless probe page to PIN the pretext API + verify esm.sh + occupancy**

Create `/tmp/flowtest/probe.html`:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<canvas id="c" width="600" height="800"></canvas>
<div id="log" style="font:12px monospace;white-space:pre"></div>
<script type="module">
const log=(m)=>{document.getElementById('log').textContent+=m+'\n';};
try {
  const P = await import('https://esm.sh/@chenglou/pretext');
  log('pretext keys: ' + Object.keys(P).join(', '));
  const ctx = document.getElementById('c').getContext('2d');
  const FONT = "17px Georgia, serif";
  // prepare
  const prep = P.prepareWithSegments ? P.prepareWithSegments('The quick brown fox jumps over the lazy dog. '.repeat(8), FONT)
                                      : P.prepare('The quick brown fox jumps over the lazy dog. '.repeat(8), FONT);
  log('prepared type: ' + (prep && typeof prep) + ' keys: ' + (prep && Object.keys(prep).join(',')));
  // try layoutNextLineRange to learn cursor + materialize shapes
  if (P.layoutNextLineRange && P.materializeLineRange) {
    let cursor = 0; const lines = [];
    for (let i=0;i<6;i++){
      const r = P.layoutNextLineRange(prep, cursor, 260);
      log('layoutNextLineRange['+i+'] => ' + JSON.stringify(r).slice(0,200));
      const mat = P.materializeLineRange(prep, r);
      log('materializeLineRange['+i+'] => ' + JSON.stringify(mat).slice(0,200));
      cursor = (r && (r.next ?? r.end ?? r.cursor)) ?? cursor;
      if (cursor == null) break;
    }
  } else if (P.layoutWithLines) {
    const r = P.layoutWithLines(prep, 260, 27);
    log('layoutWithLines => ' + JSON.stringify(r).slice(0,300));
  }
  window.__probeOK = true;
  log('PROBE OK');
} catch(e){ log('ERROR: '+e.message); window.__probeErr=e.message; }
</script></body></html>
```
Add a launch config and serve it (mirror the pattern used for prior headless tests): append to the worktree `.claude/launch.json` a config `{ "name": "flowtest", "runtimeExecutable": "python3", "runtimeArgs": ["-m","http.server","8790","--directory","/tmp/flowtest"], "port": 8790 }`, then start it with the Claude Preview MCP (`preview_start` name `flowtest`), wait ~3s, and `preview_eval` `(()=>({ok:window.__probeOK,err:window.__probeErr,log:document.getElementById('log').textContent}))()`.

Expected: `PROBE OK`, with the log printing the exact `prepared` keys, the `layoutNextLineRange` return object shape (note the field that advances the cursor — `next`/`end`/`cursor`), and the `materializeLineRange` output (note how to get each glyph/segment's text and x-advance). **Record these exact shapes in a comment block at the top of `js/scene3d-flow.js`** — Task 2 depends on them.

- [ ] **Step 4: Record the verified API as a comment in the module**

Edit the top of `js/scene3d-flow.js` to add, right after the header comment, a block documenting the probe findings, e.g.:
```javascript
// --- Verified pretext API (probe 2026-06-08) ---
// prepareWithSegments(text, font) -> <PREP_SHAPE from probe>
// layoutNextLineRange(prep, cursor, maxWidth) -> { ...advance field: <NAME>... }
// materializeLineRange(prep, range) -> <how to read line text + width from probe>
// (Fill the <...> from the probe log before implementing Task 2.)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d-flow.js
git commit -m "feat(flow): scene3d-flow occupancy profile + pretext loader + pinned API (Task 1)"
```

---

## Task 2: Column layout + canvas draw

**Files:** Modify `js/scene3d-flow.js`

- [ ] **Step 1: Add `createFlowText` — the layout+draw controller**

Append to `js/scene3d-flow.js`. **Reconcile the marked pretext calls with Task 1's pinned shapes** (the `advance`/materialize specifics):
```javascript
export async function createFlowText(opts) {
  // opts: { THREE, textCanvas, getCamera, getModel, getColor, text, columns }
  const { THREE, textCanvas, getCamera, getModel, getColor } = opts;
  if (!flowSupported()) return null;
  let P; try { P = await loadPretext(); } catch (_) { return null; }
  const ctx = textCanvas.getContext('2d');
  const columns = Math.max(1, Math.min(3, opts.columns || 2));
  const paras = String(opts.text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  let W = 1, H = 1, dpr = 1;

  // Prepare each paragraph once (cached). prepareWithSegments per pinned API.
  const prep = (t) => (P.prepareWithSegments ? P.prepareWithSegments(t, FONT) : P.prepare(t, FONT));
  let prepared = paras.map(prep);

  function resize(w, h, _dpr) {
    W = Math.max(w, 1); H = Math.max(h, 1); dpr = _dpr || window.devicePixelRatio || 1;
    textCanvas.width = Math.floor(W * dpr); textCanvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function setText(t, cols) {
    if (cols) opts.columns = Math.max(1, Math.min(3, cols));
    paras.length = 0;
    String(t || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(p => paras.push(p));
    prepared = paras.map(prep);
  }

  // For a given line y in a column [colX, colX+colW], return the widest open
  // sub-segment after subtracting the model occupancy for that band.
  function openSegment(occ, y, colX, colW) {
    const b = Math.max(0, Math.min(BANDS - 1, Math.floor(y / H * BANDS)));
    const iv = occ[b];
    const colR = colX + colW;
    if (!iv || iv[1] <= colX || iv[0] >= colR) return { x: colX, w: colW }; // model misses this column
    const leftW = iv[0] - colX;          // open gap to the left of the model
    const rightW = colR - iv[1];          // open gap to the right
    if (leftW >= rightW) return { x: colX, w: Math.max(0, leftW) };
    return { x: iv[1], w: Math.max(0, rightW) };
  }

  function relayout() {
    if (!W || !H || !prepared.length) return;
    ctx.clearRect(0, 0, W, H);
    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = (getColor && getColor()) || '#000';
    const occ = computeOccupancy(THREE, getCamera(), getModel(), W, H);
    const colW = (W - GUTTER * (columns - 1)) / columns;
    // Pour paragraphs sequentially; move to next column when one fills.
    let pi = 0, cursor = 0, col = 0, y = LINE_H;
    const topPad = LINE_H, botPad = LINE_H;
    while (pi < prepared.length && col < columns) {
      const colX = col * (colW + GUTTER);
      const seg = openSegment(occ, y, colX, colW);
      if (seg.w < MIN_W) { y += LINE_H; if (y > H - botPad) { col++; y = topPad; } continue; }
      // --- pinned pretext call: lay out ONE line into seg.w, draw it, advance cursor ---
      const range = P.layoutNextLineRange(prepared[pi], cursor, seg.w);
      if (!range) { pi++; cursor = 0; y += LINE_H * 0.6; continue; } // paragraph done → gap
      const text = materializeText(P, prepared[pi], range);   // helper below, per pinned API
      ctx.fillText(text, seg.x, y);
      // advance cursor per pinned API field name
      const next = (range.next ?? range.end ?? range.cursor);
      if (next == null || next === cursor) { pi++; cursor = 0; y += LINE_H * 0.6; }
      else { cursor = next; y += LINE_H; }
      if (y > H - botPad) { col++; y = topPad; }
    }
  }

  resize(textCanvas.clientWidth, textCanvas.clientHeight);
  return { relayout, resize, setText, dispose() { ctx && ctx.clearRect(0, 0, W, H); } };
}

// Extract the line's plain text from a materialized range. ADJUST to pinned shape:
// if materializeLineRange returns {text} use that; if it returns glyph/segment
// arrays, join their characters. Probe log (Task 1) shows which.
function materializeText(P, prepared, range) {
  const mat = P.materializeLineRange(prepared, range);
  if (typeof mat === 'string') return mat;
  if (mat && typeof mat.text === 'string') return mat.text;
  if (Array.isArray(mat)) return mat.map(s => s.text || s.char || s.grapheme || '').join('');
  if (mat && Array.isArray(mat.segments)) return mat.segments.map(s => s.text || '').join('');
  return '';
}
```

- [ ] **Step 2: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/scene3d-flow.js /tmp/f.mjs && node -c /tmp/f.mjs && echo OK && rm /tmp/f.mjs`
Expected: `OK`

- [ ] **Step 3: Headless visual test — text wraps a stand-in box**

Create `/tmp/flowtest/draw.html` that imports `js/scene3d-flow.js` (copy the file into `/tmp/flowtest/`), makes a fake `getModel` returning a `THREE.Mesh` box and a `getCamera` (perspective, positioned so the box sits center), a 600×800 text canvas, calls `createFlowText({...text: <3 paragraphs>, columns:2})` then `resize(600,800)` + `relayout()`. Import THREE from esm.sh. `preview_start` (reuse `flowtest` config, update directory copy), screenshot.
Expected: two columns of text with a visible gap/indent where the box sits (text wraps around it). If text overlaps the box, adjust `PAD`/`openSegment`. Record the screenshot result.

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d-flow.js
git commit -m "feat(flow): column layout + canvas draw wrapping the model (Task 2)"
```

---

## Task 3: Wire into Scene3D render + render.js DOM + schema + editor

**Files:** Modify `js/scene3d.js`, `js/render.js`, `admin/ui/app.js`, `admin/ui/scene3d-editor.js`, `admin/ui/styles.css`

- [ ] **Step 1: render.js — flow-mode DOM in `renderScene3D`**

In `js/render.js` `renderScene3D`, after the `.scene3d-canvas` is appended to `sticky`, add (flow mode only):
```javascript
  if (d.textMode === 'flow') {
    sec.classList.add('scene3d--flow');
    sticky.appendChild(el('canvas', { class: 'scene3d-text-canvas', 'aria-hidden': 'true' }));
    const a11y = el('div', { class: 'scene3d-text-a11y' });
    String(d.flowText || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
      .forEach(p => a11y.appendChild(el('p', {}, p)));
    sticky.appendChild(a11y);
    const fb = el('div', { class: 'scene3d-flow-fallback' });
    String(d.flowText || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
      .forEach(p => fb.appendChild(el('p', {}, p)));
    sec.appendChild(fb);
  }
```

- [ ] **Step 2: render.js — CSS for flow layer**

In `COMPONENT_CSS`, after the Scene3D CSS block, add:
```css
.scene3d-text-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none}
.scene3d-text-a11y{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.scene3d-flow-fallback{display:none;max-width:720px;margin:0 auto;padding:6vh 1.25rem;font-family:Georgia,serif;font-size:1.0625rem;line-height:1.6;color:var(--ink-black,#000)}
.scene3d-flow-fallback p{margin:0 0 1.1em}
/* Fallback shows (and canvas hides) on mobile / reduced-motion */
@media(max-width:767px){.scene3d--flow .scene3d-text-canvas{display:none}.scene3d--flow .scene3d-flow-fallback{display:block}}
@media(prefers-reduced-motion:reduce){.scene3d--flow .scene3d-text-canvas{display:none}.scene3d--flow .scene3d-flow-fallback{display:block}}
```

- [ ] **Step 3: scene3d.js — create the flow controller after model load**

In `js/scene3d.js`, find the post-load block (after `model = ...; scene.add(model); ... renderer.render(scene, camera);` near line 125). Add after the double-paint line:
```javascript
  // Flowing text (pretext) — only in flow mode.
  let flow = null;
  if (data.textMode === 'flow') {
    const textCanvas = sec.querySelector('.scene3d-text-canvas');
    if (textCanvas && !(window.matchMedia && window.matchMedia('(max-width:767px),(prefers-reduced-motion: reduce)').matches)) {
      import('./scene3d-flow.js').then(async (FM) => {
        if (!FM.flowSupported()) return; // fallback CSS shows
        flow = await FM.createFlowText({
          THREE, textCanvas,
          getCamera: () => camera, getModel: () => model,
          getColor: () => (data.bg === 'dark' ? '#f4f4f5' : '#111'),
          text: data.flowText || '', columns: data.flowColumns || 2,
        });
        if (flow) {
          const fit = () => { flow.resize(textCanvas.clientWidth, textCanvas.clientHeight, Math.min(window.devicePixelRatio||1, 2)); flow.relayout(); };
          fit();
        }
      }).catch(() => {});
    }
  }
```

- [ ] **Step 4: scene3d.js — relayout in the render path**

In `js/scene3d.js`, the tween `step` already calls `renderer.render(scene, camera); updateAnnotations();` (~line 205). Add `if (flow) flow.relayout();` right after `updateAnnotations();` there. Do the same in the ResizeObserver callback (~line 253): change it to also `if (flow) { flow.resize(...); flow.relayout(); }`:
```javascript
  const ro = new ResizeObserver(() => {
    resize(); renderer.render(scene, camera); updateAnnotations();
    if (flow) { const tc = sec.querySelector('.scene3d-text-canvas'); if (tc) flow.resize(tc.clientWidth, tc.clientHeight, Math.min(window.devicePixelRatio||1,2)); flow.relayout(); }
  });
```
And in `disposeAll` (~line 260) add `if (flow) flow.dispose();`.

- [ ] **Step 5: app.js — schema fields + defaults**

In `admin/ui/app.js` `BLOCK_SCHEMAS.Scene3D.fields`, add:
```javascript
      { key: 'textMode',    label: 'Text mode', kind: 'select', group: 'settings', options: ['cards', 'flow'] },
      { key: 'flowText',    label: 'Article text (flow mode)', kind: 'textarea', group: 'content', hint: 'Plain paragraphs, blank line between. Flows around the model.' },
      { key: 'flowColumns', label: 'Columns (flow mode)', kind: 'select', group: 'layout', options: ['1','2','3'] },
```
In `defaultDataFor`, the `Scene3D` case — add `textMode: 'cards', flowText: '', flowColumns: '2'` to the returned object.

- [ ] **Step 6: editor — hide per-scene text panel in flow mode**

In `admin/ui/scene3d-editor.js` `renderTextPanel()`, at the top after `const sc = blockData.scenes[activeSlot];`, add:
```javascript
    if (blockData.textMode === 'flow') {
      textPanel.style.display = '';
      textPanel.innerHTML = `<div class="s3d-text-title">Flowing text mode — edit “Article text” in the block settings on the right. Per-scene captions are disabled in flow mode.</div>`;
      return;
    }
```

- [ ] **Step 7: Syntax check all**

Run:
```bash
cd /Users/nihat/DevS/Thomas
node -c admin/ui/app.js && echo "app OK"
node -c admin/ui/scene3d-editor.js && echo "editor OK"
cp js/scene3d.js /tmp/s.mjs && node -c /tmp/s.mjs && echo "scene3d OK" && rm /tmp/s.mjs
cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo "render OK" && rm /tmp/r.mjs
```
Expected: all `OK`.

- [ ] **Step 8: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d.js js/render.js admin/ui/app.js admin/ui/scene3d-editor.js admin/ui/styles.css
git commit -m "feat(flow): wire flowing text into Scene3D render + schema + editor (Task 3)"
```

---

## Task 4: Version bump, deploy, smoke test

**Files:** Modify `admin/ui/index.html`, `admin/index.html`, `admin/ui/app.js` (version)

- [ ] **Step 1: Current version**

Run: `cd /Users/nihat/DevS/Thomas && grep -o "v=20260528[a-z]" admin/ui/index.html | head -1`
Note `<OLD>`, next letter `<NEW>`.

- [ ] **Step 2: Bump (html + preview-blob render.js import)**

```bash
cd /Users/nihat/DevS/Thomas
sed -i '' 's/20260528<OLD>/20260528<NEW>/g' admin/ui/index.html admin/index.html admin/ui/app.js
grep -o "render.js?v=20260528<NEW>" admin/ui/app.js && echo "blob bumped"
```

- [ ] **Step 3: Commit + deploy (move large files first, restore after)**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/index.html admin/index.html admin/ui/app.js
git commit -m "chore(flow): version bump for flowing-text release"
mv "Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" /tmp/ 2>/dev/null
mv "Die Nachricht als Jahrhunderterfindung-1.docx" /tmp/ 2>/dev/null
wrangler pages deploy . --project-name scrollycms --branch main 2>&1 | tail -3
mv /tmp/"Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" . 2>/dev/null
mv /tmp/"Die Nachricht als Jahrhunderterfindung-1.docx" . 2>/dev/null
```
Expected: `✨ Deployment complete!`

- [ ] **Step 4: Smoke test on `https://scrolli.nihatavci.com/admin/ui/` (hard-refresh)**

1. Open a Scene3D block with a model + 2–3 saved scenes.
2. In settings set **Text mode = flow**, paste several paragraphs into **Article text**, Columns = 2.
3. Preview: text renders in 2 columns and **wraps around the model**; scrolling tweens the camera and the text **reflows** around the moving model.
4. Resize the preview — text re-fits.
5. DevTools → toggle device toolbar / narrow to <768px → text falls back to a single readable column below the model.
6. Publish → live page shows the effect on desktop, fallback on mobile.

- [ ] **Step 5: Clean up probe scaffolding**

Restore the worktree `.claude/launch.json` to its original two configs (remove `flowtest`); `rm -rf /tmp/flowtest`.

---

## Self-review

**Spec coverage:**

| Spec item | Task |
|---|---|
| pretext load via esm.sh (+ vendoring note) | Task 1 (loader) |
| `Intl.Segmenter` support gate | Task 1 (`flowSupported`) |
| occupancy profile (14 pts, 12 bands, no readback, dilation) | Task 1 (`computeOccupancy`) |
| **empirical API pin** | Task 1 Steps 3–4 (probe) |
| column layout w/ per-line widths | Task 2 (`relayout`/`openSegment`) |
| canvas-2D draw | Task 2 |
| data model `textMode`/`flowText`/`flowColumns` | Task 3 Step 5 |
| flow DOM + a11y copy + fallback DOM | Task 3 Steps 1–2 |
| render-path relayout (tween/resize/settle) | Task 3 Steps 3–4 |
| editor toggle + article textarea + columns | Task 3 Steps 5–6 |
| fallback (mobile / reduced-motion / no-Segmenter) | Task 3 Step 2 CSS + Step 3 guard |
| theme color per `bg` | Task 3 Step 3 (`getColor`) |
| dispose | Task 3 Step 4 |
| deploy + smoke + mobile fallback check | Task 4 |

**Placeholder scan:** The only deliberately-deferred specifics are the pretext `range.next`/materialize field names — these are **pinned empirically in Task 1** and the Task 2 code reads the probe-confirmed fields (with defensive `??` fallbacks across the documented field names). This is an explicit verification gate, not an unresolved placeholder.

**Type/name consistency:** `createFlowText` opts `{THREE, textCanvas, getCamera, getModel, getColor, text, columns}` consistent between Task 2 (definition) and Task 3 Step 3 (call site). `computeOccupancy(THREE, camera, model, W, H)` signature consistent. CSS classes `.scene3d-text-canvas`, `.scene3d-text-a11y`, `.scene3d-flow-fallback`, `.scene3d--flow` identical across render.js DOM (Task 3.1), CSS (Task 3.2), and scene3d.js selectors (Task 3.3–4). Constants `FONT/LINE_H/BANDS/GUTTER/MIN_W` defined once (Task 1) and reused in Task 2.

**Scope check:** Single feature (flow mode on Scene3D); 4 phases each independently testable. Good.
