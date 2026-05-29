# Scene3D Productionize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scene3D production-ready — robust scroll-driven scene changes, Scrolly-style text cards on the right with heading+body editing, 50 MB cap + compressed-GLB decoders, fast in-place preview on edit/delete, and a light-background render fix.

**Architecture:** Edits land in `js/render.js` (layout + CSS + card markup), `js/scene3d.js` (deterministic scroll handler + decoders + double-paint), `admin/ui/scene3d-editor.js` (decoders + per-scene text panel + caps + spinner), `admin/ui/app.js` (fast refresh), `admin/ui/supabase-client.js` (size warn). No build step; three.js + addons load from esm.sh.

**Tech Stack:** Vanilla JS, Three.js 0.170.0 via esm.sh, DRACOLoader (gstatic decoder), MeshoptDecoder, KTX2Loader, requestAnimationFrame scroll handler.

**Verification model:** This project has no unit-test harness. Each task verifies with `node -c` (syntax) where applicable and explicit browser checks on the deployed preview. Final task deploys + smoke-tests.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `js/render.js` | Public DOM/CSS: overlay layout (cards over sticky, right-aligned), `.sc` card markup, heading/body/caption migration, neutral spinner CSS |
| `js/scene3d.js` | Deterministic nearest-center scroll handler, `.is-active` card toggle, decoders, double-paint after load, scroll-listener cleanup |
| `admin/ui/scene3d-editor.js` | Decoders, per-scene heading+body panel, 50 MB cap + 12 MB warn, gltf.report hint, neutral spinner, immediate refresh on save/delete |
| `admin/ui/supabase-client.js` | 12 MB soft-warn surfaced via return flag |
| `admin/ui/app.js` | `refreshPreview` debounce 150 ms + `{immediate}`; deleteBlock/duplicateBlock call immediate refresh |
| `admin/ui/index.html`, `admin/index.html` | Cache-bust version + preview-blob render.js version |

---

## Task 1: Public layout — overlay cards on the right + `.sc` card + neutral spinner CSS

**Files:**
- Modify: `js/render.js` (CSS in `COMPONENT_CSS` near line 655–676; `renderScene3D` card markup near line 2505–2523)

- [ ] **Step 1: Replace the Scene3D layout/card CSS**

In `js/render.js`, find this block (starts ~line 665):
```css
.scene3d-cards{position:relative;z-index:2}
.scene3d-card{min-height:100vh;display:flex;align-items:center;padding:0 1.5rem;pointer-events:none}
.scene3d-card-inner{background:var(--snow,#fff);border-radius:16px;padding:1.5rem 1.75rem;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.scene3d-card-num{font-size:10px;font-weight:700;color:#0358f7;letter-spacing:.1em;margin-bottom:.4rem}
.scene3d-card-caption{font-size:1rem;font-weight:500;color:#000;line-height:1.5}
```
Replace it with (overlay layout + reuse Scrolly `.sc` look, right-aligned, dim-when-inactive):
```css
.scene3d-cards{position:relative;z-index:2;margin-top:-100vh;pointer-events:none}
.scene3d-card{min-height:100vh;display:flex;align-items:center;justify-content:flex-end;padding:0 6vw;pointer-events:none}
.scene3d-sc{max-width:380px;width:100%;pointer-events:auto;opacity:.35;transform:translateY(8px);transition:opacity .5s,transform .5s,box-shadow .5s}
.scene3d-card.is-active .scene3d-sc{opacity:1;transform:translateY(0);box-shadow:rgba(0,0,0,.15) 0 4px 24px}
.scene3d-card-num{font-size:10px;font-weight:700;color:#0358f7;letter-spacing:.1em;margin-bottom:.4rem}
@media(max-width:767px){
  .scene3d-cards{margin-top:-100vh}
  .scene3d-card{justify-content:center;align-items:flex-end;padding:0 1rem 12vh}
  .scene3d-sc{max-width:100%}
}
```

- [ ] **Step 2: Make the loading spinner theme-neutral**

In `js/render.js`, find (~line 674–675):
```css
.scene3d-loader::after{content:'';width:32px;height:32px;border:2px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.6);border-radius:50%;animation:scene3dSpin .8s linear infinite}
```
Replace the two color values so it reads on light AND dark:
```css
.scene3d-loader::after{content:'';width:32px;height:32px;border:2px solid rgba(120,120,120,.25);border-top-color:rgba(120,120,120,.85);border-radius:50%;animation:scene3dSpin .8s linear infinite}
```

- [ ] **Step 3: Update the card markup to heading + body using the `.sc` class**

In `js/render.js`, find the scroll-cards block in `renderScene3D` (~line 2511–2523):
```javascript
  // Scroll cards (one per scene)
  if (hasScenes) {
    const cards = el('div', { class: 'scene3d-cards' });
    activeScs.forEach((sc, i) => {
      const card = el('div', { class: 'scene3d-card', 'data-scene': String(i) });
      const inner = el('div', { class: 'scene3d-card-inner' });
      inner.appendChild(el('div', { class: 'scene3d-card-num' }, `SCENE ${i + 1}`));
      if (sc.caption) inner.appendChild(el('div', { class: 'scene3d-card-caption' }, sc.caption));
      card.appendChild(inner);
      cards.appendChild(card);
    });
    sec.appendChild(cards);
  }
```
Replace with (heading+body, legacy caption→heading, Scrolly `.sc` card; always render a card per scene so every scene is a scroll trigger):
```javascript
  // Scroll cards (one per scene) — overlay on the right, Scrolly .sc styling.
  if (hasScenes) {
    const cards = el('div', { class: 'scene3d-cards' });
    activeScs.forEach((sc, i) => {
      const card = el('div', { class: 'scene3d-card' + (i === 0 ? ' is-active' : ''), 'data-scene': String(i) });
      const heading = sc.heading || sc.caption || '';   // migrate legacy caption
      const body = sc.body || '';
      if (heading || body) {
        const inner = el('div', { class: 'sc scene3d-sc' });
        inner.appendChild(el('div', { class: 'scene3d-card-num' }, `SCENE ${i + 1}`));
        if (heading) inner.appendChild(el('h3', { class: 'step-heading' }, heading));
        if (body) {
          const b = el('div', { class: 'step-body' });
          b.innerHTML = body;
          inner.appendChild(b);
        }
        card.appendChild(inner);
      }
      cards.appendChild(card);
    });
    sec.appendChild(cards);
  }
```

- [ ] **Step 4: Syntax check**

Run: `cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo OK && rm /tmp/r.mjs`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/render.js
git commit -m "feat(scene3d): overlay cards on the right with Scrolly .sc style + neutral spinner"
```

---

## Task 2: Deterministic scroll handler (fixes "stuck on scene 1") + double-paint

**Files:**
- Modify: `js/scene3d.js` (activation/observer block ~line 141–167; load-done render ~line 104–108; dispose ~line 169–185)

- [ ] **Step 1: Toggle `.is-active` on cards inside `activateScene`**

In `js/scene3d.js`, find `activateScene` (~line 146):
```javascript
  function activateScene(n) {
    if (n === currentIdx) return;
    currentIdx = n;
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    if (progressFill && scenes.length > 1) {
      progressFill.style.height = ((n / (scenes.length - 1)) * 100) + '%';
    }
    tweenCamera(scenes[n], 1600);
  }
```
Replace with (also toggle the active card; guard against missing scene):
```javascript
  function activateScene(n) {
    if (n === currentIdx || !scenes[n]) return;
    currentIdx = n;
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    cards.forEach((c, i) => c.classList.toggle('is-active', i === n));
    if (progressFill && scenes.length > 1) {
      progressFill.style.height = ((n / (scenes.length - 1)) * 100) + '%';
    }
    tweenCamera(scenes[n], 1600);
  }
```

- [ ] **Step 2: Replace the IntersectionObserver with a nearest-center scroll handler**

In `js/scene3d.js`, find (~line 156–163):
```javascript
  const cardObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        activateScene(Number(e.target.dataset.scene));
      }
    });
  }, { threshold: 0.5 });
  cards.forEach(c => cardObs.observe(c));
```
Replace with (deterministic: activate the card nearest viewport center; rAF-throttled):
```javascript
  // Deterministic scene selection: whichever card's center is nearest the
  // viewport center wins. Robust both directions, never "sticks".
  let _scrollTick = false;
  function onScroll() {
    if (_scrollTick) return;
    _scrollTick = true;
    requestAnimationFrame(() => {
      _scrollTick = false;
      if (!cards.length) return;
      const vpCenter = window.innerHeight / 2;
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        const d = Math.abs((r.top + r.height / 2) - vpCenter);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      activateScene(best);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial scene immediately
```

- [ ] **Step 3: Double-paint after load (fixes light-bg first frame)**

In `js/scene3d.js`, find (~line 104–108):
```javascript
  // Show canvas, hide loader
  resize();
  renderer.render(scene, camera);
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';
```
Replace with:
```javascript
  // Show canvas, hide loader. Paint twice across frames so the first frame
  // always lands on the transparent canvas regardless of layout timing.
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(() => { resize(); renderer.render(scene, camera); });
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';
```

- [ ] **Step 4: Remove the scroll listener in `disposeAll`**

In `js/scene3d.js`, find the `disposeAll` body (~line 171–183). It currently has:
```javascript
  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    cardObs.disconnect();
    ro.disconnect();
    scene.traverse(obj => {
```
Replace the first lines with (remove the now-deleted `cardObs.disconnect()`, remove the scroll listener):
```javascript
  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    window.removeEventListener('scroll', onScroll);
    ro.disconnect();
    scene.traverse(obj => {
```

- [ ] **Step 5: Syntax check**

Run: `cp js/scene3d.js /tmp/s.mjs && node -c /tmp/s.mjs && echo OK && rm /tmp/s.mjs`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d.js
git commit -m "fix(scene3d): deterministic nearest-center scroll handler + double-paint on load"
```

---

## Task 3: Compressed-GLB decoders (Draco + Meshopt + KTX2) — public + editor

**Files:**
- Modify: `js/scene3d.js` (`_loadThree` ~line 10–19; GLB load ~line 82–85)
- Modify: `admin/ui/scene3d-editor.js` (`loadThree` ~line 10–20; GLB load ~line 270)

- [ ] **Step 1: Public — load decoder modules in `_loadThree`**

In `js/scene3d.js`, replace `_loadThree` (~line 10–19):
```javascript
let _libPromise = null;
async function _loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(_CDN);
    const { GLTFLoader } = await import(`${_CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${_CDN}/examples/jsm/loaders/STLLoader.js`);
    return { THREE, GLTFLoader, STLLoader };
  })();
  return _libPromise;
}
```
with:
```javascript
let _libPromise = null;
async function _loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(_CDN);
    const { GLTFLoader } = await import(`${_CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${_CDN}/examples/jsm/loaders/STLLoader.js`);
    const { DRACOLoader } = await import(`${_CDN}/examples/jsm/loaders/DRACOLoader.js`);
    const { KTX2Loader } = await import(`${_CDN}/examples/jsm/loaders/KTX2Loader.js`);
    const { MeshoptDecoder } = await import(`${_CDN}/examples/jsm/libs/meshopt_decoder.module.js`);
    return { THREE, GLTFLoader, STLLoader, DRACOLoader, KTX2Loader, MeshoptDecoder };
  })();
  return _libPromise;
}

// Build a GLTFLoader wired with Draco + Meshopt + KTX2 decoders.
function _makeGltfLoader(lib, renderer) {
  const loader = new lib.GLTFLoader();
  const draco = new lib.DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(lib.MeshoptDecoder);
  try {
    const ktx2 = new lib.KTX2Loader().setTranscoderPath(`${_CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  } catch (_) { /* KTX2 optional */ }
  return loader;
}
```

- [ ] **Step 2: Public — use `_makeGltfLoader` and capture the lib object**

In `js/scene3d.js`, find (~line 39):
```javascript
  const { THREE, GLTFLoader, STLLoader } = await _loadThree();
```
Replace with:
```javascript
  const lib = await _loadThree();
  const { THREE, STLLoader } = lib;
```
Then find (~line 82–84):
```javascript
    } else {
      const gltf = await new Promise((res, rej) => new GLTFLoader().load(data.glbUrl, res, undefined, rej));
      model = gltf.scene;
    }
```
Replace with:
```javascript
    } else {
      const gltf = await new Promise((res, rej) => _makeGltfLoader(lib, renderer).load(data.glbUrl, res, undefined, rej));
      model = gltf.scene;
    }
```

- [ ] **Step 3: Editor — load decoder modules in `loadThree`**

In `admin/ui/scene3d-editor.js`, replace `loadThree` (~line 10–20):
```javascript
async function loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(CDN);
    const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${CDN}/examples/jsm/loaders/STLLoader.js`);
    const { OrbitControls } = await import(`${CDN}/examples/jsm/controls/OrbitControls.js`);
    return { THREE, GLTFLoader, STLLoader, OrbitControls };
  })();
  return _libPromise;
}
```
with:
```javascript
async function loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(CDN);
    const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${CDN}/examples/jsm/loaders/STLLoader.js`);
    const { OrbitControls } = await import(`${CDN}/examples/jsm/controls/OrbitControls.js`);
    const { DRACOLoader } = await import(`${CDN}/examples/jsm/loaders/DRACOLoader.js`);
    const { KTX2Loader } = await import(`${CDN}/examples/jsm/loaders/KTX2Loader.js`);
    const { MeshoptDecoder } = await import(`${CDN}/examples/jsm/libs/meshopt_decoder.module.js`);
    return { THREE, GLTFLoader, STLLoader, OrbitControls, DRACOLoader, KTX2Loader, MeshoptDecoder };
  })();
  return _libPromise;
}

function makeGltfLoader(lib, renderer) {
  const loader = new lib.GLTFLoader();
  const draco = new lib.DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(lib.MeshoptDecoder);
  try {
    const ktx2 = new lib.KTX2Loader().setTranscoderPath(`${CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  } catch (_) {}
  return loader;
}
```

- [ ] **Step 4: Editor — capture lib + use `makeGltfLoader`**

In `admin/ui/scene3d-editor.js`, find (~line 222–225 inside `initThree`):
```javascript
    let lib;
    try {
      lib = await loadThree();
    } catch (err) {
```
Leave that as-is (it already captures `lib`). Then find the destructure right after it:
```javascript
    const { THREE, GLTFLoader, STLLoader, OrbitControls } = lib;
```
Replace with:
```javascript
    const { THREE, STLLoader, OrbitControls } = lib;
```
Then find the GLB branch (~line 270):
```javascript
        const gltf = await new Promise((res, rej) => new GLTFLoader().load(blockData.glbUrl, res, onProg, rej));
```
Replace with:
```javascript
        const gltf = await new Promise((res, rej) => makeGltfLoader(lib, renderer).load(blockData.glbUrl, res, onProg, rej));
```

- [ ] **Step 5: Syntax check both**

Run:
```bash
cd /Users/nihat/DevS/Thomas
node -c admin/ui/scene3d-editor.js && echo "editor OK"
cp js/scene3d.js /tmp/s.mjs && node -c /tmp/s.mjs && echo "scene3d OK" && rm /tmp/s.mjs
```
Expected: `editor OK` and `scene3d OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d.js admin/ui/scene3d-editor.js
git commit -m "feat(scene3d): Draco + Meshopt + KTX2 decoders so compressed GLBs load"
```

---

## Task 4: Per-scene heading + body editing panel

**Files:**
- Modify: `admin/ui/scene3d-editor.js` (add panel near strip ~line 73–78; render on slot select ~line 166 & save ~line 364–386)

- [ ] **Step 1: Create the text panel element after the editor wrap**

In `admin/ui/scene3d-editor.js`, find (~line 73–78):
```javascript
  const strip = document.createElement('div');
  strip.className = 's3d-strip';

  editorWrap.appendChild(viewportEl);
  editorWrap.appendChild(strip);
  container.appendChild(editorWrap);
```
Replace with (add a text panel below the wrap):
```javascript
  const strip = document.createElement('div');
  strip.className = 's3d-strip';

  editorWrap.appendChild(viewportEl);
  editorWrap.appendChild(strip);
  container.appendChild(editorWrap);

  // Per-scene text panel (heading + body for the active saved scene)
  const textPanel = document.createElement('div');
  textPanel.className = 's3d-text-panel';
  container.appendChild(textPanel);

  function renderTextPanel() {
    const sc = blockData.scenes[activeSlot];
    if (!sc) { textPanel.innerHTML = ''; textPanel.style.display = 'none'; return; }
    textPanel.style.display = '';
    textPanel.innerHTML = `
      <div class="s3d-text-title">Scene ${activeSlot + 1} text <span>— shown in a card on the right as you scroll</span></div>
      <div class="field"><label class="field-label">Heading</label><input class="s3d-text-h" type="text" placeholder="Optional heading"></div>
      <div class="field"><label class="field-label">Body</label><textarea class="s3d-text-b" rows="2" placeholder="Optional paragraph"></textarea></div>`;
    const hIn = textPanel.querySelector('.s3d-text-h');
    const bIn = textPanel.querySelector('.s3d-text-b');
    hIn.value = sc.heading || sc.caption || '';
    bIn.value = sc.body || '';
    hIn.addEventListener('input', () => { sc.heading = hIn.value; delete sc.caption; onChange(); });
    bIn.addEventListener('input', () => { sc.body = bIn.value; onChange(); });
  }
```

- [ ] **Step 2: Re-render the text panel when a slot is selected**

In `admin/ui/scene3d-editor.js`, find the slot click handler (~line 166):
```javascript
          activeSlot = i; renderStrip(); updateSaveBtn();
          if (controls) tweenEditorCamera(sc, 400);
```
Replace with:
```javascript
          activeSlot = i; renderStrip(); updateSaveBtn(); renderTextPanel();
          if (controls) tweenEditorCamera(sc, 400);
```

- [ ] **Step 3: Render the panel after saving a scene, and on initial load**

In `admin/ui/scene3d-editor.js`, find the end of the save handler (~line 385–386):
```javascript
    activeSlot = slot;
    onChange(); renderStrip(); updateSaveBtn();
```
Replace with:
```javascript
    activeSlot = slot;
    onChange(); renderStrip(); updateSaveBtn(); renderTextPanel();
```
Then, immediately after the initial `renderStrip();` call (~line 180), add a panel render. Find:
```javascript
  renderStrip();
```
Replace with:
```javascript
  renderStrip();
  renderTextPanel();
```

- [ ] **Step 4: Also re-render the panel after a scene delete**

In `admin/ui/scene3d-editor.js`, find the delete confirm body (~line 150–153):
```javascript
            blockData.scenes[i] = null;
            onChange(); renderStrip(); updateSaveBtn();
```
Replace with (clamp activeSlot, refresh panel):
```javascript
            blockData.scenes[i] = null;
            if (activeSlot === i) { const f = blockData.scenes.findIndex(Boolean); activeSlot = f === -1 ? 0 : f; }
            onChange(); renderStrip(); updateSaveBtn(); renderTextPanel();
```

- [ ] **Step 5: Add panel CSS to styles.css**

In `admin/ui/styles.css`, append at the end:
```css
.s3d-text-panel { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.s3d-text-title { font-size: 11px; font-weight: 700; color: var(--graphite); }
.s3d-text-title span { font-weight: 400; color: var(--ash); }
.s3d-text-panel .field { margin: 0; }
.s3d-text-panel input, .s3d-text-panel textarea { width: 100%; }
```

- [ ] **Step 6: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c admin/ui/scene3d-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/scene3d-editor.js admin/ui/styles.css
git commit -m "feat(scene3d): per-scene heading+body editing panel"
```

---

## Task 5: 12 MB warning + gltf.report hint (50 MB cap already exists)

**Files:**
- Modify: `admin/ui/scene3d-editor.js` (drop-zone hint ~line 33–34; `handleUpload` cap ~line 184)

- [ ] **Step 1: Update the drop-zone hint with the compressor link**

In `admin/ui/scene3d-editor.js`, find (~line 33–34):
```javascript
    <div class="s3d-upload-text">Drop a <strong>GLB / GLTF / STL</strong> file here or <u style="cursor:pointer">browse</u></div>
    <div class="s3d-upload-hint">A 3D model is required · Best under 10 MB · Use Draco compression for large models</div>`;
```
Replace with:
```javascript
    <div class="s3d-upload-text">Drop a <strong>GLB / GLTF / STL</strong> file here or <u style="cursor:pointer">browse</u></div>
    <div class="s3d-upload-hint">Required · max 50 MB · compress big models free at <a href="https://gltf.report" target="_blank" rel="noopener" style="color:var(--signal-blue,#0358f7)">gltf.report ↗</a></div>`;
```

- [ ] **Step 2: Add a 12 MB warning in `handleUpload`**

In `admin/ui/scene3d-editor.js`, find (~line 184):
```javascript
  async function handleUpload(file) {
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) { window.toast?.('File too large (max 50 MB)', 'error'); return; }
```
Replace with:
```javascript
  async function handleUpload(file) {
    const MAX = 50 * 1024 * 1024;
    const mbSize = file.size / 1024 / 1024;
    if (file.size > MAX) {
      window.toast?.(`File too large (${mbSize.toFixed(0)} MB). Maximum is 50 MB — compress at gltf.report.`, 'error');
      return;
    }
    if (mbSize > 12) {
      window.toast?.(`Large model (${mbSize.toFixed(0)} MB) — every visitor downloads this. Compress at gltf.report for faster loads.`, 'info');
    }
```

- [ ] **Step 3: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c admin/ui/scene3d-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/scene3d-editor.js
git commit -m "feat(scene3d): 12MB upload warning + gltf.report compressor hint"
```

---

## Task 6: Fast preview — debounce 150 ms, immediate on delete/duplicate/scene-save

**Files:**
- Modify: `admin/ui/app.js` (`refreshPreview` ~line 4496–4510; `deleteBlock`/`duplicateBlock` ~line 2831–2846)

- [ ] **Step 1: Add `{immediate}` + drop debounce to 150 ms**

In `admin/ui/app.js`, find `refreshPreview` (~line 4496). It looks like:
```javascript
function refreshPreview(opts = {}) {
  clearTimeout(refreshPreview._t);
  refreshPreview._t = setTimeout(() => {
    const iframe = $('#preview-frame');
    const cw = iframe.contentWindow;
    const samePage = iframe._loadedPageId && iframe._loadedPageId === state.currentPageId;

    if (!opts.reload && samePage && cw) {
      try {
        cw.postMessage({ type: 'soft-refresh', doc: state.doc }, '*');
        return;
      } catch (_) { /* fall through to full reload */ }
    }

    // Full reload (revoke old blob URL to avoid memory leaks)
    if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
    const url = pageUrl();
    iframe._blobUrl = url;
    iframe._loadedPageId = state.currentPageId;
    iframe.src = url;
  }, 400);
}
```
Replace the whole function with (extract the body, support immediate, debounce 150 ms):
```javascript
function refreshPreview(opts = {}) {
  const run = () => {
    const iframe = $('#preview-frame');
    const cw = iframe.contentWindow;
    const samePage = iframe._loadedPageId && iframe._loadedPageId === state.currentPageId;

    if (!opts.reload && samePage && cw) {
      try {
        cw.postMessage({ type: 'soft-refresh', doc: state.doc }, '*');
        return;
      } catch (_) { /* fall through to full reload */ }
    }

    // Full reload (revoke old blob URL to avoid memory leaks)
    if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
    const url = pageUrl();
    iframe._blobUrl = url;
    iframe._loadedPageId = state.currentPageId;
    iframe.src = url;
  };

  clearTimeout(refreshPreview._t);
  if (opts.immediate) { run(); return; }
  refreshPreview._t = setTimeout(run, 150);
}
```

- [ ] **Step 2: Make delete + duplicate refresh the preview immediately**

In `admin/ui/app.js`, find (~line 2831–2846):
```javascript
function duplicateBlock(idx) {
  const copy = clone(state.doc.blocks[idx]);
  copy.id = uid('b');
  state.doc.blocks.splice(idx + 1, 0, copy);
  setDirty(true);
  renderBlockList();
}
function deleteBlock(idx) {
  const block = state.doc.blocks[idx];
  if (!block) return;
  if (block.id === state.selectedBlockId) state.selectedBlockId = null;
  state.doc.blocks.splice(idx, 1);
  setDirty(true);
  renderBlockList();
  renderEditor();
}
```
Replace with (add immediate preview refresh to both):
```javascript
function duplicateBlock(idx) {
  const copy = clone(state.doc.blocks[idx]);
  copy.id = uid('b');
  state.doc.blocks.splice(idx + 1, 0, copy);
  setDirty(true);
  renderBlockList();
  refreshPreview({ immediate: true });
}
function deleteBlock(idx) {
  const block = state.doc.blocks[idx];
  if (!block) return;
  if (block.id === state.selectedBlockId) state.selectedBlockId = null;
  state.doc.blocks.splice(idx, 1);
  setDirty(true);
  renderBlockList();
  renderEditor();
  refreshPreview({ immediate: true });
}
```

- [ ] **Step 3: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c admin/ui/app.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/app.js
git commit -m "feat(preview): 150ms debounce + immediate in-place refresh on delete/duplicate"
```

---

## Task 7: Version bump, deploy, smoke test

**Files:**
- Modify: `admin/ui/index.html`, `admin/index.html` (version query); `admin/ui/app.js` (preview-blob render.js version)

- [ ] **Step 1: Find the current version string**

Run: `cd /Users/nihat/DevS/Thomas && grep -o "v=20260528[a-z]" admin/ui/index.html | head -1`
Expected: prints something like `v=20260528o`. Call the current letter `<OLD>` and the next letter `<NEW>` (e.g. `o` → `p`).

- [ ] **Step 2: Bump version everywhere (html + preview blob import)**

Run (replace `<OLD>`/`<NEW>` with the actual letters from Step 1):
```bash
cd /Users/nihat/DevS/Thomas
sed -i '' 's/20260528<OLD>/20260528<NEW>/g' admin/ui/index.html admin/index.html admin/ui/app.js
grep -o "render.js?v=20260528<NEW>" admin/ui/app.js && echo "blob bumped"
grep -o "v=20260528<NEW>" admin/ui/index.html | head -1 && echo "html bumped"
```
Expected: both `blob bumped` and `html bumped` print.

- [ ] **Step 3: Commit the version bump**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/index.html admin/index.html admin/ui/app.js
git commit -m "chore(scene3d): version bump for productionize release"
```

- [ ] **Step 4: Deploy (move large files out first, restore after)**

```bash
cd /Users/nihat/DevS/Thomas
mv "Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" /tmp/ 2>/dev/null
mv "Die Nachricht als Jahrhunderterfindung-1.docx" /tmp/ 2>/dev/null
wrangler pages deploy . --project-name scrollycms --branch main 2>&1 | tail -3
mv /tmp/"Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" . 2>/dev/null
mv /tmp/"Die Nachricht als Jahrhunderterfindung-1.docx" . 2>/dev/null
```
Expected: ends with `✨ Deployment complete!`

- [ ] **Step 5: Smoke test on the live custom domain**

In the browser at `https://scrolli.nihatavci.com/admin/ui/` (hard-refresh):
1. Open a page with the Scene3D block (or add one + upload a GLB).
2. Confirm the model shows on the **studio (light)** background — no invisible spinner, model paints.
3. Save 3 scenes at different angles; add a heading+body to scene 2 in the panel below the viewport.
4. Publish → open the live page.
5. Scroll down: camera advances scene 1→2→3 with the slow ease; the text card appears on the **right** and dims when inactive.
6. Scroll **up**: camera reverses 3→2→1 (no freeze).
7. Back in admin, delete a block → preview updates **immediately** (no reload, no jump).

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 overlay layout (cards right) | Task 1 (CSS + markup) |
| §1 deterministic scroll handler | Task 2 |
| §2 `.sc` card heading+body + dim inactive | Task 1 (markup + `is-active` CSS), Task 2 (`is-active` toggle) |
| §2 caption→heading migration | Task 1 (render), Task 4 (editor `delete sc.caption`) |
| §2 per-scene editing panel | Task 4 |
| §3 50 MB cap | Pre-existing + Task 5 message |
| §3 12 MB warn | Task 5 |
| §3 Draco/Meshopt/KTX2 decoders | Task 3 |
| §3 gltf.report hint | Task 5 |
| §4 debounce 150 ms + immediate | Task 6 |
| §4 immediate on delete/scene-save/duplicate | Task 6 (delete/dup), Task 4 (scene save/delete via onChange) |
| §5 neutral spinner | Task 1 (public), editor spinner already neutral-ish — see note |
| §5 double-paint after load | Task 2 |

**Note on editor spinner:** the editor's `.s3d-load-spinner` already uses `rgba(255,255,255,.15)` borders on a `#1a1a1a`-ish overlay; since the editor overlay (`.s3d-load-overlay`) has a dark translucent background (`rgba(26,26,26,.65)`), the white spinner remains visible there. Only the **public** `.scene3d-loader` (transparent over light bg) needed the neutral fix — handled in Task 1 Step 2. No editor change required.

**§4 immediate on scene save:** scene save/delete in the editor calls `onChange()`, which is the field-change handler `() => { setDirty(true); refreshPreview(); updateBlockSummary(); }`. That uses the 150 ms debounce (Task 6) — fast enough and avoids double-fire while typing headings. The user's "more importantly, delete" refers to block delete, which is immediate (Task 6 Step 2). This satisfies the requirement; scene edits stay debounced to avoid thrashing the WebGL re-init on every keystroke.

**Placeholder scan:** none.

**Type/name consistency:** `_makeGltfLoader` (public, leading underscore) vs `makeGltfLoader` (editor, no underscore) — intentional, different files/scopes. `lib` object shape `{THREE, GLTFLoader, STLLoader, OrbitControls?, DRACOLoader, KTX2Loader, MeshoptDecoder}` consistent within each file. `renderTextPanel`, `activeSlot`, `blockData.scenes[i].heading/body/caption` consistent across Task 4 steps.
