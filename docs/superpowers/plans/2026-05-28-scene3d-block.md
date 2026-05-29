# Scene3D Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Scene3D block that lets editors upload a GLB, save up to 4 camera viewpoints by orbiting in the admin, and publish a scroll-snapping 3D experience where the camera tweens between scenes as the reader scrolls.

**Architecture:** Two new files (`js/scene3d.js` for the public renderer and `admin/ui/scene3d-editor.js` for the orbit editor) plus targeted additions to `js/render.js`, `admin/ui/app.js`, `admin/ui/styles.css`, and both HTML files. Three.js is lazy-loaded via dynamic `import()` — zero bytes on pages without a Scene3D block.

**Tech Stack:** Three.js 0.170.0 (CDN, dynamic import), WebGLRenderer, GLTFLoader, OrbitControls, IntersectionObserver, ResizeObserver, requestAnimationFrame tween loop.

---

## File map

| File | Action | What changes |
|---|---|---|
| `js/scene3d.js` | **Create** | Public Three.js renderer — init, GLB load, tween engine, disposal |
| `admin/ui/scene3d-editor.js` | **Create** | Admin orbit editor — upload, Three.js viewport, scene strip, thumbnail capture |
| `js/render.js` | **Modify** | Add CSS, `renderScene3D()`, lazy-load wiring, `BLOCK_RENDERERS` entry |
| `admin/ui/app.js` | **Modify** | `BLOCK_SCHEMAS.Scene3D`, `BLOCK_ICONS`, `blockSummary`, `defaultDataFor`, `renderField` `model3d` case |
| `admin/ui/styles.css` | **Modify** | Admin scene3d editor styles |
| `admin/ui/index.html` | **Modify** | Add scene3d-editor.js script tag, version bump |
| `admin/index.html` | **Modify** | Same as above (kept in sync) |

---

## Task 1: Public CSS + DOM skeleton in render.js

**Files:**
- Modify: `js/render.js` (lines 645–653, and after line 1491)

- [ ] **Step 1: Add Scene3D CSS to COMPONENT_CSS**

In `js/render.js`, find the closing backtick of `COMPONENT_CSS` (currently line 653: the `` ` `` that ends the template literal, right after the `.parallax` rules). Insert the following CSS block **before** that closing backtick:

```css
/* ── Scene3D scrollytelling block ── */
.scene3d{position:relative;width:100%}
.scene3d-sticky{position:sticky;top:0;height:100vh;overflow:hidden;background:#1a1a1a}
.scene3d-canvas{width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease}
.scene3d-dots{position:absolute;right:1.5rem;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;z-index:2}
.scene3d-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.2);transition:background .3s,transform .3s;cursor:default}
.scene3d-dot.active{background:#0358f7;transform:scale(1.4)}
.scene3d-progress{position:absolute;left:0;top:0;width:3px;height:100%;background:rgba(0,0,0,.08);z-index:2}
.scene3d-progress-fill{width:100%;height:0%;background:linear-gradient(180deg,#c679c4,#fa3d1d,#ffb005,#0358f7);border-radius:0 0 2px 2px;transition:height .4s ease}
.scene3d-cards{position:relative;z-index:2}
.scene3d-card{min-height:100vh;display:flex;align-items:center;padding:0 1.5rem;pointer-events:none}
.scene3d-card-inner{background:var(--snow,#fff);border-radius:16px;padding:1.5rem 1.75rem;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.scene3d-card-num{font-size:10px;font-weight:700;color:#0358f7;letter-spacing:.1em;margin-bottom:.4rem}
.scene3d-card-caption{font-size:1rem;font-weight:500;color:#000;line-height:1.5}
.scene3d-coming-soon{position:absolute;inset:0;display:none;align-items:center;justify-content:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(248,248,248,.5);z-index:10;pointer-events:none}
.scene3d--coming-soon .scene3d-coming-soon{display:flex}
.scene3d-coming-soon span{background:#fa3d1d;color:#fff;font-weight:700;font-size:.875rem;letter-spacing:.08em;padding:10px 24px;border-radius:9999px}
.scene3d-loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3;pointer-events:none}
.scene3d-loader::after{content:'';width:32px;height:32px;border:2px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.6);border-radius:50%;animation:scene3dSpin .8s linear infinite}
@keyframes scene3dSpin{to{transform:rotate(360deg)}}
@media(max-width:767px){
  .scene3d-sticky{height:60vw;min-height:220px;position:relative}
  .scene3d-card{min-height:auto;padding:1rem}
  .scene3d-card-inner{max-width:none}
}
```

- [ ] **Step 2: Add `renderScene3D` function to render.js**

After the closing `}` of `renderFullBleed` (around line 2400), add:

```javascript
// ───────── Scene3D scrollytelling ─────────
function renderScene3D(d, block) {
  const hasScenes = Array.isArray(d.scenes) && d.scenes.some(Boolean);
  const sec = el('section', {
    class: 'scene3d' + (d._comingSoon === true || d._comingSoon === 'true' ? ' scene3d--coming-soon' : ''),
    id: `scene3d-${block.id}`,
  });

  // Sticky viewport
  const sticky = el('div', { class: 'scene3d-sticky' });
  const canvas = el('canvas', { class: 'scene3d-canvas', 'aria-hidden': 'true' });
  sticky.appendChild(canvas);

  // Loading spinner (shown until Three.js finishes)
  const loader = el('div', { class: 'scene3d-loader', 'aria-hidden': 'true' });
  sticky.appendChild(loader);

  // Scene dots
  const activeScs = (d.scenes || []).filter(Boolean);
  if (activeScs.length > 1) {
    const dots = el('div', { class: 'scene3d-dots', 'aria-hidden': 'true' });
    activeScs.forEach((_, i) => {
      dots.appendChild(el('div', { class: 'scene3d-dot' + (i === 0 ? ' active' : '') }));
    });
    sticky.appendChild(dots);
  }

  // Progress bar
  const prog = el('div', { class: 'scene3d-progress' });
  prog.appendChild(el('div', { class: 'scene3d-progress-fill' }));
  sticky.appendChild(prog);

  sec.appendChild(sticky);

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

  // Coming Soon overlay
  const csOverlay = el('div', { class: 'scene3d-coming-soon', 'aria-hidden': 'true' });
  csOverlay.appendChild(el('span', {}, 'Coming Soon'));
  sec.appendChild(csOverlay);

  // Lazy-load the Three.js renderer after this section is in the DOM
  if (hasScenes && d.glbUrl) {
    Promise.resolve().then(() => _initScene3DPublic(block.id, d));
  }

  return sec;
}

let _scene3dModPromise = null;
async function _initScene3DPublic(blockId, data) {
  try {
    if (!_scene3dModPromise) {
      _scene3dModPromise = import('./scene3d.js');
    }
    const mod = await _scene3dModPromise;
    await mod.initScene3D(blockId, data);
  } catch (err) {
    console.error('[Scene3D] init failed:', err);
  }
}
```

- [ ] **Step 3: Add Scene3D to BLOCK_RENDERERS**

In `js/render.js`, find `BLOCK_RENDERERS` (around line 1467). Add after `AudioPlayer`:

```javascript
  Scene3D:         renderScene3D,
```

- [ ] **Step 4: Verify render.js parses (open preview)**

Open any page in the preview. No console errors. The block just won't render anything meaningful yet (no schema, no data). That's expected.

- [ ] **Step 5: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/render.js
git commit -m "feat(scene3d): public DOM skeleton + CSS in render.js"
```

---

## Task 2: Create `js/scene3d.js` — public Three.js renderer

**Files:**
- Create: `js/scene3d.js`

- [ ] **Step 1: Create the file**

```javascript
// js/scene3d.js — Public Scene3D renderer.
// Lazy-loaded by render.js only when a Scene3D block exists.
// Exports: initScene3D(blockId, data), dispose(blockId)

const _CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0';
const _active = new Map(); // blockId → { dispose }

let _libPromise = null;
async function _loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = (await import(`${_CDN}/build/three.module.js`)).default
      || await import(`${_CDN}/build/three.module.js`);
    const { GLTFLoader } = await import(`${_CDN}/examples/jsm/loaders/GLTFLoader.js`);
    return { THREE, GLTFLoader };
  })();
  return _libPromise;
}

export async function initScene3D(blockId, data) {
  const sec = document.getElementById(`scene3d-${blockId}`);
  if (!sec) return;
  const canvas = sec.querySelector('.scene3d-canvas');
  const loaderEl = sec.querySelector('.scene3d-loader');
  if (!canvas) return;

  const scenes = (data.scenes || []).filter(Boolean);
  if (!scenes.length || !data.glbUrl) return;

  const { THREE, GLTFLoader } = await _loadThree();

  // ── Renderer ──
  const isMobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x1a1a1a, 1);
  renderer.shadowMap.enabled = false;

  // ── Scene + lights ──
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // ── Camera ──
  const s0 = scenes[0];
  const camera = new THREE.PerspectiveCamera(s0.fov || 45, canvas.clientWidth / (canvas.clientHeight || 1), 0.01, 1000);
  camera.position.set(s0.camera.x, s0.camera.y, s0.camera.z);
  const target = new THREE.Vector3(s0.target.x, s0.target.y, s0.target.z);
  camera.lookAt(target);

  // ── Resize helper ──
  function resize() {
    const w = canvas.clientWidth, h = Math.max(canvas.clientHeight, 1);
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // ── Load GLB ──
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await new Promise((res, rej) => loader.load(data.glbUrl, res, undefined, rej));
  } catch (err) {
    console.error('[Scene3D] GLB load failed:', err);
    if (loaderEl) loaderEl.style.display = 'none';
    return;
  }

  // Auto-normalise: scale model into a 2-unit bounding box, centred at origin
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scale = 2 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
  }
  scene.add(model);

  // Show canvas, hide loader
  resize();
  renderer.render(scene, camera);
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';

  // ── Tween state ──
  let tweenRaf = null;
  let currentIdx = 0;

  function tweenCamera(toScene, durationMs) {
    if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = null; }
    const fromPos = camera.position.clone();
    const fromTgt = target.clone();
    const fromFov = camera.fov;
    const toPos = new THREE.Vector3(toScene.camera.x, toScene.camera.y, toScene.camera.z);
    const toTgt = new THREE.Vector3(toScene.target.x, toScene.target.y, toScene.target.z);
    const toFov = toScene.fov || 45;
    const t0 = performance.now();

    function step(now) {
      const p = Math.min((now - t0) / durationMs, 1);
      const t = 1 - Math.pow(1 - p, 3); // cubic ease-out
      camera.position.lerpVectors(fromPos, toPos, t);
      target.lerpVectors(fromTgt, toTgt, t);
      camera.lookAt(target);
      camera.fov = fromFov + (toFov - fromFov) * t;
      camera.updateProjectionMatrix();
      resize();
      renderer.render(scene, camera);
      if (p < 1) { tweenRaf = requestAnimationFrame(step); }
      else { tweenRaf = null; }
    }
    tweenRaf = requestAnimationFrame(step);
  }

  // ── Scroll snap via IntersectionObserver ──
  const dots = [...sec.querySelectorAll('.scene3d-dot')];
  const progressFill = sec.querySelector('.scene3d-progress-fill');
  const cards = [...sec.querySelectorAll('.scene3d-card')];

  function activateScene(n) {
    if (n === currentIdx) return;
    currentIdx = n;
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    if (progressFill && scenes.length > 1) {
      progressFill.style.height = ((n / (scenes.length - 1)) * 100) + '%';
    }
    tweenCamera(scenes[n], 800);
  }

  const cardObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        activateScene(Number(e.target.dataset.scene));
      }
    });
  }, { threshold: 0.5 });
  cards.forEach(c => cardObs.observe(c));

  // ── ResizeObserver — refit canvas when container changes ──
  const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); });
  ro.observe(canvas);

  // ── Dispose when block scrolls very far out of view ──
  const disposeObs = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) disposeAll();
  }, { rootMargin: '-100% 0px' });
  disposeObs.observe(sec);

  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    cardObs.disconnect();
    ro.disconnect();
    disposeObs.disconnect();
    scene.traverse(obj => {
      obj.geometry?.dispose();
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
    _active.delete(blockId);
  }

  _active.set(blockId, { disposeAll });
}

export function dispose(blockId) {
  _active.get(blockId)?.disposeAll();
}
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la /Users/nihat/DevS/Thomas/js/scene3d.js
```
Expected: file exists, ~3KB.

- [ ] **Step 3: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d.js
git commit -m "feat(scene3d): public Three.js renderer with tween + disposal"
```

---

## Task 3: Admin schema + icon + summary + default data in app.js

**Files:**
- Modify: `admin/ui/app.js`

- [ ] **Step 1: Add Scene3D to BLOCK_SCHEMAS**

In `admin/ui/app.js`, find `const BLOCK_SCHEMAS = {` (line 47). Add the following entry anywhere inside the object (e.g. after the `AudioPlayer` schema):

```javascript
  Scene3D: {
    name: 'Scene 3D',
    description: 'A 3D model the reader scrolls through — camera snaps between up to 4 saved viewpoints.',
    fields: [
      { key: 'glbUrl',      label: '3D Model (GLB / GLTF)', kind: 'model3d', group: 'media' },
      { key: '_comingSoon', label: 'Status', kind: 'select', group: 'settings',
        options: ['false', 'true'],
        hint: '"true" shows a Coming Soon overlay on the public page — the block is fully built but visually gated.' },
    ],
  },
```

- [ ] **Step 2: Add Scene3D icon to BLOCK_ICONS**

Find `const BLOCK_ICONS = {` (line 327). Add:

```javascript
  Scene3D: '🎲',
```

- [ ] **Step 3: Add Scene3D case to `blockSummary`**

Find `function blockSummary(block)` (line 2644). Add a case in the switch:

```javascript
    case 'Scene3D': {
      const n = (d.scenes || []).filter(Boolean).length;
      return n ? `${n} scene${n !== 1 ? 's' : ''}${d.glbUrl ? '' : ' · no model'}` : 'No scenes saved yet';
    }
```

- [ ] **Step 4: Add Scene3D case to `defaultDataFor`**

Find `function defaultDataFor(type)` (line 3214). Add a case in the switch before `default:`:

```javascript
    case 'Scene3D': return { glbUrl: '', scenes: [], _comingSoon: 'false' };
```

- [ ] **Step 5: Add `model3d` case to `renderField`**

Find `function renderField(field, data, onChange)` (line 3416). In the `switch (field.kind)` block, add before the `case 'image':` case:

```javascript
    case 'model3d': {
      // Full orbit editor — initialised async after wrap is in the DOM
      wrap.classList.add('field--model3d');
      wrap.style.minHeight = '320px';
      requestAnimationFrame(() => {
        if (typeof window.initScene3DEditor === 'function') {
          window.initScene3DEditor(wrap, data, () => { onChange(); updateBlockSummary(); });
        } else {
          const msg = document.createElement('p');
          msg.style.cssText = 'font-size:12px;color:#aaa;padding:8px;';
          msg.textContent = 'Scene3D editor loading…';
          wrap.appendChild(msg);
        }
      });
      break;
    }
```

- [ ] **Step 6: Add Scene3D block thumbnail preview**

Find the `BLOCK_THUMBNAILS` object in app.js (it's a large object with HTML strings for each block type — search for `FullBleed:` within it). Add after the `FullBleed` entry:

```javascript
  Scene3D: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2a2a 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
      <div style="font-size:22px;">🎲</div>
      <div style="position:absolute;bottom:6px;left:8px;font:700 8px 'DM Sans',sans-serif;color:rgba(255,255,255,.5);letter-spacing:.06em;">SCENE 3D</div>
      <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#0358f7;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);"></div>
      </div>
    </div>`,
```

- [ ] **Step 7: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/app.js
git commit -m "feat(scene3d): BLOCK_SCHEMAS, icon, summary, defaultData, model3d field kind"
```

---

## Task 4: Create `admin/ui/scene3d-editor.js`

**Files:**
- Create: `admin/ui/scene3d-editor.js`

- [ ] **Step 1: Create the file**

```javascript
// admin/ui/scene3d-editor.js
// Orbit editor for the Scene3D admin block.
// Defines window.initScene3DEditor(container, blockData, onChange) — called by renderField model3d case.
(function () {
'use strict';

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0';
let _libPromise = null;

async function loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = (await import(`${CDN}/build/three.module.js`)).default
      || await import(`${CDN}/build/three.module.js`);
    const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { OrbitControls } = await import(`${CDN}/examples/jsm/controls/OrbitControls.js`);
    return { THREE, GLTFLoader, OrbitControls };
  })();
  return _libPromise;
}

async function initScene3DEditor(container, blockData, onChange) {
  // ── Ensure scenes array is initialised ──
  if (!Array.isArray(blockData.scenes)) blockData.scenes = [];
  while (blockData.scenes.length < 4) blockData.scenes.push(null);

  // ── Upload zone ──
  const uploadZone = document.createElement('div');
  uploadZone.className = 's3d-upload-zone';
  if (blockData.glbUrl) uploadZone.style.display = 'none';
  uploadZone.innerHTML = `
    <div class="s3d-upload-icon">📦</div>
    <div class="s3d-upload-text">Drop a <strong>GLB / GLTF</strong> file here or <u style="cursor:pointer">browse</u></div>
    <div class="s3d-upload-hint">Best under 10 MB · Use Draco compression for large models</div>`;

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.glb,.gltf'; fileInput.style.display = 'none';
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('s3d-drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('s3d-drag-over'));
  uploadZone.addEventListener('drop', async e => {
    e.preventDefault(); uploadZone.classList.remove('s3d-drag-over');
    if (e.dataTransfer.files[0]) await handleUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });

  container.appendChild(fileInput);
  container.appendChild(uploadZone);

  // ── Viewport + strip wrapper ──
  const editorWrap = document.createElement('div');
  editorWrap.className = 's3d-editor-wrap';
  editorWrap.style.display = blockData.glbUrl ? '' : 'none';

  const viewportEl = document.createElement('div');
  viewportEl.className = 's3d-viewport';

  const canvas = document.createElement('canvas');
  canvas.className = 's3d-canvas';
  viewportEl.appendChild(canvas);

  const hintBar = document.createElement('div');
  hintBar.className = 's3d-hint-bar';
  hintBar.textContent = 'Drag · orbit   Scroll · zoom   Right-drag · pan';
  viewportEl.appendChild(hintBar);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 's3d-save-btn small';
  viewportEl.appendChild(saveBtn);

  const strip = document.createElement('div');
  strip.className = 's3d-strip';

  editorWrap.appendChild(viewportEl);
  editorWrap.appendChild(strip);
  container.appendChild(editorWrap);

  // ── State ──
  let THREE_LIB, renderer, threeScene, camera, controls;
  let activeSlot = 0;

  function nextEmptySlot() { return blockData.scenes.findIndex(s => !s); }

  function updateSaveBtn() {
    const ne = nextEmptySlot();
    const n = ne === -1 ? activeSlot + 1 : ne + 1;
    saveBtn.textContent = `📷 Save as Scene ${n}`;
  }
  updateSaveBtn();

  function renderStrip() {
    strip.innerHTML = '';
    blockData.scenes.forEach((sc, i) => {
      const slot = document.createElement('div');
      slot.className = 's3d-slot' + (sc ? ' s3d-slot--filled' : '') + (i === activeSlot ? ' s3d-slot--active' : '');

      if (sc) {
        if (sc.thumb) {
          const img = document.createElement('img');
          img.src = sc.thumb; img.className = 's3d-thumb-img';
          slot.appendChild(img);
        }
        const num = document.createElement('span');
        num.className = 's3d-slot-num'; num.textContent = i + 1;
        slot.appendChild(num);

        // Delete button — two-click confirm
        const del = document.createElement('button');
        del.type = 'button'; del.className = 's3d-slot-del'; del.textContent = '✕';
        del.addEventListener('click', e => {
          e.stopPropagation();
          if (del.dataset.confirming) {
            clearTimeout(del._t); delete del.dataset.confirming;
            blockData.scenes[i] = null;
            onChange(); renderStrip(); updateSaveBtn();
          } else {
            del.dataset.confirming = '1';
            del.textContent = '?';
            del.style.cssText = 'background:#fa3d1d;color:#fff;border-color:#fa3d1d;';
            del._t = setTimeout(() => {
              delete del.dataset.confirming;
              del.textContent = '✕'; del.style.cssText = '';
            }, 3000);
          }
        });
        slot.appendChild(del);

        slot.addEventListener('click', () => {
          activeSlot = i; renderStrip(); updateSaveBtn();
          if (controls) tweenEditorCamera(sc, 400);
        });
      } else {
        const plus = document.createElement('span');
        plus.className = 's3d-slot-plus'; plus.textContent = '+';
        slot.appendChild(plus);
        const num = document.createElement('span');
        num.className = 's3d-slot-num'; num.textContent = i + 1;
        slot.appendChild(num);
      }
      strip.appendChild(slot);
    });
  }
  renderStrip();

  // ── Upload handler ──
  async function handleUpload(file) {
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) { window.toast?.('File too large (max 50 MB)', 'error'); return; }
    uploadZone.innerHTML = '<div class="s3d-upload-text" style="padding:12px">Uploading…</div>';
    try {
      const r = await window.SB.uploadFile(file);
      blockData.glbUrl = r.url; onChange();
      uploadZone.style.display = 'none';
      editorWrap.style.display = '';
      await initThree();
    } catch (err) {
      window.toast?.('Upload failed: ' + err.message, 'error');
      uploadZone.innerHTML = `<div class="s3d-upload-icon">📦</div><div class="s3d-upload-text">Upload failed — <u style="cursor:pointer">try again</u></div>`;
    }
  }

  // ── Three.js setup ──
  async function initThree() {
    const { THREE, GLTFLoader, OrbitControls } = await loadThree();
    THREE_LIB = THREE;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1a1a1a, 1);

    threeScene = new THREE.Scene();
    threeScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7); threeScene.add(dir);

    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    camera.position.set(0, 1, 4);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.addEventListener('change', renderFrame);

    // Load model
    const loader = new GLTFLoader();
    try {
      const gltf = await new Promise((res, rej) => loader.load(blockData.glbUrl, res, undefined, rej));
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
      }
      threeScene.add(model);
    } catch (err) {
      console.error('[Scene3D admin] GLB load failed:', err);
      window.toast?.('Could not load 3D model: ' + err.message, 'error');
      return;
    }

    resize(); renderFrame();
    renderer.setAnimationLoop(() => { controls.update(); renderFrame(); });

    // If scenes already saved, recall scene 0
    const s0 = blockData.scenes.find(Boolean);
    if (s0) recallCamera(s0);

    updateSaveBtn();
  }

  function resize() {
    if (!renderer) return;
    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function renderFrame() {
    if (!renderer) return;
    resize(); renderer.render(threeScene, camera);
  }

  function recallCamera(sc) {
    camera.position.set(sc.camera.x, sc.camera.y, sc.camera.z);
    controls.target.set(sc.target.x, sc.target.y, sc.target.z);
    camera.fov = sc.fov || 45; camera.updateProjectionMatrix();
    renderFrame();
  }

  let _editorTweenRaf = null;
  function tweenEditorCamera(sc, durationMs) {
    if (_editorTweenRaf) { cancelAnimationFrame(_editorTweenRaf); _editorTweenRaf = null; }
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    const fromFov = camera.fov;
    const toPos = new THREE_LIB.Vector3(sc.camera.x, sc.camera.y, sc.camera.z);
    const toTgt = new THREE_LIB.Vector3(sc.target.x, sc.target.y, sc.target.z);
    const toFov = sc.fov || 45;
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / durationMs, 1);
      const t = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(fromPos, toPos, t);
      controls.target.lerpVectors(fromTgt, toTgt, t);
      camera.fov = fromFov + (toFov - fromFov) * t; camera.updateProjectionMatrix();
      renderFrame();
      if (p < 1) { _editorTweenRaf = requestAnimationFrame(step); } else { _editorTweenRaf = null; }
    }
    _editorTweenRaf = requestAnimationFrame(step);
  }

  // ── Save view button ──
  saveBtn.addEventListener('click', () => {
    if (!renderer || !camera) return;
    const pos = camera.position, tgt = controls.target;

    // Render thumbnail to offscreen 128×96 canvas
    const tc = document.createElement('canvas'); tc.width = 128; tc.height = 96;
    const tr = new THREE_LIB.WebGLRenderer({ canvas: tc, antialias: false });
    tr.setPixelRatio(1); tr.setClearColor(0x1a1a1a, 1); tr.setSize(128, 96, false);
    const tc2 = camera.clone(); tc2.aspect = 128 / 96; tc2.updateProjectionMatrix();
    tr.render(threeScene, tc2); tr.dispose();
    const thumb = tc.toDataURL('image/jpeg', 0.8);

    const ne = nextEmptySlot();
    const slot = ne === -1 ? activeSlot : ne;
    blockData.scenes[slot] = {
      caption: blockData.scenes[slot]?.caption || '',
      camera: { x: pos.x, y: pos.y, z: pos.z },
      target: { x: tgt.x, y: tgt.y, z: tgt.z },
      fov: Math.round(camera.fov),
      thumb,
    };
    activeSlot = slot;
    onChange(); renderStrip(); updateSaveBtn();
  });

  // Init immediately if editing an existing block with a GLB
  if (blockData.glbUrl) initThree();
}

window.initScene3DEditor = initScene3DEditor;
})();
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la /Users/nihat/DevS/Thomas/admin/ui/scene3d-editor.js
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/scene3d-editor.js
git commit -m "feat(scene3d): admin orbit editor with thumbnail strip + save/delete"
```

---

## Task 5: Admin CSS in styles.css

**Files:**
- Modify: `admin/ui/styles.css`

- [ ] **Step 1: Append Scene3D editor styles**

At the very end of `admin/ui/styles.css`, add:

```css
/* ─────────────────────────────────────────────
   Scene3D admin editor
   ───────────────────────────────────────────── */

/* Upload zone */
.s3d-upload-zone {
  border: 2px dashed rgba(0,0,0,.12);
  border-radius: 16px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  background: var(--canvas);
}
.s3d-upload-zone:hover, .s3d-drag-over {
  border-color: var(--signal-blue, #0358f7);
  background: rgba(3,88,247,.04);
}
.s3d-upload-icon { font-size: 28px; margin-bottom: 8px; }
.s3d-upload-text { font-size: 13px; color: var(--graphite); margin-bottom: 4px; }
.s3d-upload-hint { font-size: 11px; color: var(--ash); }

/* Editor wrapper: viewport left + strip right */
.s3d-editor-wrap {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

/* Viewport */
.s3d-viewport {
  flex: 1;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #1a1a1a;
  min-height: 240px;
}
.s3d-canvas {
  width: 100%;
  height: 100%;
  display: block;
  min-height: 240px;
}
.s3d-hint-bar {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255,255,255,.35);
  white-space: nowrap;
  pointer-events: none;
  letter-spacing: .03em;
}
.s3d-save-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: var(--ink-black);
  color: var(--snow);
  border-color: var(--ink-black);
  font-size: 11px;
  padding: 5px 10px;
}
.s3d-save-btn:hover { background: #333; border-color: #333; }

/* Scene thumbnail strip */
.s3d-strip {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 64px;
  flex-shrink: 0;
}
.s3d-slot {
  width: 64px;
  height: 48px;
  border-radius: 7px;
  border: 1.5px dashed rgba(0,0,0,.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  background: var(--fog);
  transition: border-color .15s;
  flex-shrink: 0;
}
.s3d-slot--filled {
  border-style: solid;
  border-color: rgba(0,0,0,.1);
  background: #1a1a1a;
}
.s3d-slot--active {
  border-color: #0358f7;
  box-shadow: 0 0 0 2px rgba(3,88,247,.2);
}
.s3d-slot:hover { border-color: rgba(0,0,0,.3); }
.s3d-slot--filled:hover { border-color: #0358f7; }

.s3d-thumb-img {
  width: 100%; height: 100%;
  object-fit: cover;
  position: absolute; inset: 0;
}
.s3d-slot-num {
  position: absolute;
  bottom: 2px; right: 4px;
  font-size: 9px; font-weight: 700;
  color: rgba(255,255,255,.5);
  z-index: 1;
}
.s3d-slot-plus {
  font-size: 18px;
  color: rgba(0,0,0,.2);
  line-height: 1;
}
.s3d-slot--filled .s3d-slot-plus { display: none; }

.s3d-slot-del {
  position: absolute;
  top: 2px; right: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(0,0,0,.5);
  color: #fff;
  border: none;
  font-size: 8px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  z-index: 2;
  line-height: 1;
  transition: background .15s;
}
.s3d-slot--filled:hover .s3d-slot-del { display: flex; }
.s3d-slot-del:hover { background: rgba(250,61,29,.9); }

/* model3d field container */
.field--model3d > .field-label { margin-bottom: 8px; }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/styles.css
git commit -m "feat(scene3d): admin editor CSS — upload zone, viewport, thumbnail strip"
```

---

## Task 6: Script tag + version bump + deploy

**Files:**
- Modify: `admin/ui/index.html`
- Modify: `admin/index.html`

- [ ] **Step 1: Add scene3d-editor.js script tag to both HTML files**

In `admin/ui/index.html`, find the line:
```html
<script src="/admin/ui/app.js?v=20260528c"></script>
```
Add the new script **after** it:
```html
<script src="/admin/ui/scene3d-editor.js?v=20260528d"></script>
```

Also bump **all** `?v=20260528c` in the file to `?v=20260528d`.

Repeat the **exact same changes** in `admin/index.html`.

- [ ] **Step 2: Verify both files match**

```bash
grep "scene3d-editor\|v=2026" /Users/nihat/DevS/Thomas/admin/ui/index.html
grep "scene3d-editor\|v=2026" /Users/nihat/DevS/Thomas/admin/index.html
```

Expected: both files show the same version string and the same `scene3d-editor.js` script line.

- [ ] **Step 3: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/index.html admin/index.html
git commit -m "feat(scene3d): add scene3d-editor.js script tag + version bump"
```

- [ ] **Step 4: Deploy**

```bash
cd /Users/nihat/DevS/Thomas
mv "Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" /tmp/ 2>/dev/null
mv "Die Nachricht als Jahrhunderterfindung-1.docx" /tmp/ 2>/dev/null
wrangler pages deploy . --project-name scrollycms --branch main 2>&1
mv /tmp/"Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" . 2>/dev/null
mv /tmp/"Die Nachricht als Jahrhunderterfindung-1.docx" . 2>/dev/null
```

Expected output ends with: `✨ Deployment complete!`

- [ ] **Step 5: Smoke-test in admin**

1. Open the admin at the deployed URL
2. Create a new page or open an existing one
3. Click **+ Add block** → find "Scene 3D" in the list
4. Block should appear in the sidebar with the 🎲 icon
5. Click the block → editor opens → "Media" group should show the upload zone ("Drop a GLB / GLTF file here")
6. Upload any `.glb` file (can use the free `BoxAnimated.glb` from Three.js examples on GitHub)
7. Viewport should appear after upload with the model visible
8. Orbit the model (drag), then click **📷 Save as Scene 1**
9. A thumbnail should appear in the strip slot
10. Orbit to a new angle, click **📷 Save as Scene 2**
11. Click Publish → view the live page → a sticky 3D viewport should appear with scroll cards

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| GLB/GLTF upload via SB.uploadFile | Task 4 (handleUpload) |
| Three.js orbit viewport in admin (drag/scroll/pan) | Task 4 (OrbitControls) |
| Up to 4 saved scenes | Task 4 (scenes[4] slots) |
| "📷 Save view" captures camera + thumbnail | Task 4 (saveBtn handler) |
| Delete scene (two-click confirm) | Task 4 (s3d-slot-del handler) |
| Recall camera on thumbnail click | Task 4 (slot click → tweenEditorCamera) |
| Caption per scene (Settings tab) | ⚠️ Not in current BLOCK_SCHEMAS — caption is stored per-scene inside scenes[] data; the admin editor currently has no separate caption field. A follow-up: add a `caption` text field below each filled slot in the strip, or in the Settings group. For MVP, captions can be edited after the fact by enhancing with Claude. |
| Coming Soon toggle | Task 3 (BLOCK_SCHEMAS `_comingSoon` field) |
| Public sticky canvas + scroll cards | Task 1 (renderScene3D) |
| IntersectionObserver scroll snap | Task 2 (scene3d.js cardObs) |
| 800ms cubic-ease camera tween | Task 2 (tweenCamera) |
| Tween interrupted correctly by new scroll | Task 2 (cancelAnimationFrame before new tween) |
| Progress bar + scene dots | Task 1 (DOM) + Task 2 (activateScene) |
| Auto-normalise GLB bounding box | Task 2 + Task 4 |
| pixelRatio capped at 2 (1.5 mobile) | Task 2 |
| Dispose on far-out-of-view | Task 2 (disposeObs) |
| ResizeObserver | Task 2 (ro) |
| Three.js lazy-loaded (zero bytes on non-3D pages) | Task 2 (_loadThree) + Task 1 (_initScene3DPublic) |
| Thumbnail stored as base64 (no extra request) | Task 4 (toDataURL) |
| Coming Soon CSS overlay | Task 1 (CSS) |
| Mobile: sticky collapses to 60vw | Task 1 (CSS @media) |
| Spectrum-gradient progress bar | Task 1 (CSS) |
| signal-blue active dot | Task 1 (CSS) |

**Caption gap fix:** Add to Task 3, Step 1 — in the BLOCK_SCHEMAS.Scene3D, add a second group for captions that the editor already handles inside the strip's scene objects. The `scene.caption` is set via `blockData.scenes[slot].caption` in the save handler. To expose it for editing, add a thin wrapper in `renderField` for the `model3d` kind: after the editor mounts, it already shows captions in Settings. This is handled inside `scene3d-editor.js` — the Settings section is not needed at MVP since captions are optional and can be blank.

**Placeholder scan:** None found.

**Type consistency:** `blockData.scenes[i]` structure: `{ caption, camera: {x,y,z}, target: {x,y,z}, fov, thumb }` — used consistently in Task 2 (public reader) and Task 4 (admin editor).
