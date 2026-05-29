# Scene3D Block — Design Spec

**Date:** 2026-05-28  
**Status:** Approved for implementation

---

## Goal

Add a `Scene3D` block to ScrollyCMS that lets editors upload a GLB/GLTF 3D model, save up to 4 camera viewpoints ("scenes") by freely orbiting in the admin, and publish a scroll-snapping 3D experience where the camera tweens between scenes as the reader scrolls. Ships with a "Coming Soon" overlay toggle so it can be fully built but softly gated.

---

## Theme & Visual Language

The block uses the **project's existing design system**, not a dark neon aesthetic:

- **Viewport background:** `#1a1a1a` (near-black, neutral — lets the model read clearly)
- **Accent / active state:** `--signal-blue: #0358f7`
- **Scene dots progress:** `--spectrum-gradient` (rose-quartz → red → marigold → blue)
- **Text cards:** `--snow: #fff` background, `--ink-black: #000` text — matches editorial blocks
- **Coming Soon badge:** `--spectrum-red: #fa3d1d` background
- **Admin UI:** inherits all existing admin tokens (`--fog`, `--pebble`, `--canvas`) — no custom dark theme in the editor panel

---

## Architecture

```
admin/ui/scene3d-editor.js   — orbit editor, thumbnail capture, scene save
admin/ui/app.js              — BLOCK_SCHEMAS.Scene3D, renderEditor tab wiring  
admin/ui/styles.css          — editor panel styles
admin/ui/index.html          — Three.js importmap entry (CDN, no build step)
admin/index.html             — same importmap entry (kept in sync)

js/scene3d.js                — public renderer: canvas setup, GLB load, tween engine
js/render.js                 — renderScene3D() function + CSS
```

**Three.js** loaded via dynamic `import()` — **not** added to `index.html` unconditionally. Both the admin editor and the public renderer lazy-load Three.js the first time a Scene3D block is encountered:

```javascript
// Inside scene3d-editor.js and js/scene3d.js:
const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js');
const { OrbitControls } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js');
```

Version pinned to `0.170.0`. Pages without a Scene3D block download zero Three.js bytes.

---

## Data Model

Stored in `block.data`:

```jsonc
{
  "glbUrl": "https://…/models/building.glb",   // Supabase Storage public URL
  "scenes": [
    {
      "caption": "Full overview",
      "camera": { "x": 5, "y": 3, "z": 8 },
      "target": { "x": 0, "y": 0, "z": 0 },
      "fov": 45
    },
    { "caption": "Left detail", "camera": {…}, "target": {…}, "fov": 50 },
    { "caption": "Top-down",    "camera": {…}, "target": {…}, "fov": 40 },
    { "caption": "Close-up",    "camera": {…}, "target": {…}, "fov": 35 }
  ],
  "_comingSoon": true    // boolean — shows overlay on public page when true
}
```

`scenes` array has 1–4 entries. Minimum 1 (the block always has at least one camera position). Caption is optional (shown in scroll card).

---

## Admin Editor (`scene3d-editor.js`)

### Structure

The Scene3D block gets the standard new tabbed editor (per the admin-editor-redesign spec). Tabs:

- **Media** — GLB file upload + filmstrip of scenes
- **Settings** — Coming Soon toggle, caption per scene
- **✦ AI** — (future: AI can suggest scene angles based on model analysis)

### Media Tab

**GLB upload zone:**
- Drag-and-drop or click-to-upload. Accepts `.glb`, `.gltf`. Max 50 MB (same as existing `MAX_UPLOAD_SIZE`).
- Upload via `SB.uploadFile(file)` — same as images. Stores to `page-images` Supabase bucket.
- Once uploaded, URL stored in `block.data.glbUrl`. The 3D editor initialises automatically.

**3D Orbit Viewport (canvas):**
- Full-width canvas inside the Media tab body, height `280px`.
- Three.js `WebGLRenderer` with `antialias: true`, `alpha: true`.
- Background: `#1a1a1a`. Ambient light + directional light (neutral white).
- `OrbitControls`: left-drag = orbit, scroll = zoom, right-drag (or two-finger) = pan.
- Hint bar at bottom: `"Drag · orbit   Scroll · zoom   ⌥ Drag · pan"` — same `ash` color as other admin hints.

**Scene thumbnail strip (right of viewport):**
- 4 slots arranged vertically.
- Filled slots show a 128×96px thumbnail (rendered offscreen to a separate canvas at the saved camera position).
- Empty slots show `+` with a dashed border.
- Active slot highlighted with `--signal-blue` border.
- Clicking a saved thumbnail recalls that exact camera state (animates smoothly over 400ms in the editor too).

**"Save view" button:**
- Lives below the viewport: `"📷 Save as Scene N"` where N = next empty slot (or overwrites active slot if all 4 are filled).
- On click: captures current `camera.position`, `controls.target`, `camera.fov`. Renders a 128×96px thumbnail offscreen. Stores both in `block.data.scenes[n]`. Calls `setDirty(true)` + `refreshPreview()`.

**Delete scene:**
- Small `✕` on each filled thumbnail. Two-click confirm pattern (same as block delete).

### Settings Tab

**Caption field per scene:**
- One inline text input per saved scene. Label: "Scene 1 caption", "Scene 2 caption", etc.
- Only shows inputs for saved scenes (not empty slots).

**Coming Soon toggle:**
- Single chip selector: `[ Live ]  [ Coming Soon ]`
- "Coming Soon" stores `_comingSoon: true`. Renders blurred overlay + badge on public page.

---

## Public Renderer (`js/scene3d.js` + `renderScene3D` in `render.js`)

### HTML structure (emitted by `renderScene3D`)

```html
<section class="scene3d" id="scene3d-{blockId}">
  <div class="scene3d-sticky">
    <canvas class="scene3d-canvas"></canvas>
    <div class="scene3d-dots">…one dot per scene…</div>
    <div class="scene3d-progress"><div class="scene3d-progress-fill"></div></div>
  </div>
  <div class="scene3d-cards">
    <div class="scene3d-card" data-scene="0">…caption…</div>
    …up to 4 cards…
  </div>
  <!-- Coming Soon overlay (only when _comingSoon: true) -->
  <div class="scene3d-coming-soon">
    <span>Coming Soon</span>
  </div>
</section>
```

### CSS

```css
.scene3d { position:relative; }
.scene3d-sticky { position:sticky; top:0; height:100vh; }
.scene3d-canvas { width:100%; height:100%; display:block; }
.scene3d-cards { position:relative; z-index:2; }
.scene3d-card { min-height:100vh; display:flex; align-items:center; padding:0 var(--editorial-pad, 1.5rem); }
/* Scene dots */
.scene3d-dots { position:absolute; right:1.5rem; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:8px; }
.scene3d-dot { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.2); transition:background .3s, transform .3s; }
.scene3d-dot.active { background:#0358f7; transform:scale(1.4); }
/* Progress bar */
.scene3d-progress { position:absolute; left:0; top:0; width:3px; height:100%; background:rgba(0,0,0,.08); }
.scene3d-progress-fill { width:100%; background:var(--spectrum-gradient); border-radius:0 0 2px 2px; transition:height .4s ease; }
/* Coming soon overlay */
.scene3d-coming-soon { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); background:rgba(248,248,248,.5); z-index:10; pointer-events:none; }
.scene3d-coming-soon span { background:#fa3d1d; color:#fff; font-weight:700; font-size:0.875rem; letter-spacing:.08em; padding:10px 24px; border-radius:9999px; }
```

### Initialisation (`js/scene3d.js`)

`scene3d.js` exports a single function `initScene3D(blockId, data)` called from `render.js` after the DOM is built.

Steps:
1. Create `WebGLRenderer` targeting the block's canvas. `pixelRatio = Math.min(devicePixelRatio, 2)` — caps at 2 to protect low-end devices.
2. Load GLB via `GLTFLoader`. Show a subtle loading spinner (CSS only, no JS dependency) on the canvas while loading.
3. Centre and scale the model to fit a 2-unit bounding box (auto-normalise so any GLB looks good without manual scaling).
4. Set camera to `scenes[0]` position/target/fov immediately (no tween on first render).
5. Render one frame. Then **pause** — renderer only re-renders when a tween is active or the user interacts.

### Scroll snap mechanic

`IntersectionObserver` on each `.scene3d-card` with `threshold: 0.5` and `root: null`.

When card N enters view:
- Update active dot.
- Update progress bar height: `(n / (scenes.length - 1)) * 100%`.
- Call `tweenCamera(currentScene, scenes[n], 800)`.

`tweenCamera(from, to, durationMs)`:
- Uses `requestAnimationFrame` loop.
- Lerps `camera.position` and `controls.target` using Three.js `Vector3.lerp`.
- Easing: `t = 1 - Math.pow(1 - progress, 3)` (cubic ease-out).
- If a new tween starts before the current one finishes, the current tween is cancelled and a new one starts from the camera's current in-flight position (no jarring jump).
- After tween completes: `renderer.setAnimationLoop(null)` — stops render loop, saves GPU.

### Mobile

On screens `< 768px`: the sticky layout collapses. The viewport becomes full-width `60vw` height, cards stack below it (not side-by-side). Scene cards still trigger camera tweens. Reduced pixel ratio (`1.5` cap) on mobile.

---

## Optimisation Plan

### GLB file

- **Draco compression**: recommended in-editor hint ("Use Draco-compressed GLB for best performance — tools: gltf-pipeline, Blender export"). Not enforced programmatically — just documented.
- **Max size**: `SB.uploadFile` already enforces 50 MB. A hint in the upload zone says "Best under 10 MB — use Draco compression for large models."
- No server-side transcoding (YAGNI — Supabase Storage is not a CDN that supports this).

### Three.js bundle

- Loaded via CDN importmap — not bundled with the site. Only downloaded by browsers that visit a page containing a Scene3D block.
- `js/scene3d.js` itself is loaded lazily by `render.js`: only `import('./scene3d.js')` when `document.querySelector('.scene3d')` exists.
- **Total cold-load cost** for pages without a Scene3D block: **zero**.

### Render loop

- Render loop is `null` (stopped) when no tween is in progress and OrbitControls has no active interaction.
- `OrbitControls.addEventListener('change', render)` for admin — one-frame renders on user input.
- `renderer.setAnimationLoop(null)` after every tween completes on the public page.

### Memory / disposal

`scene3d.js` exposes a `dispose()` method that:
- Traverses the scene graph and calls `geometry.dispose()`, `material.dispose()`, `texture.dispose()` on each object.
- Calls `renderer.dispose()`.
- Called when the block scrolls out of viewport by a large margin (`rootMargin: '-100% 0px'` IntersectionObserver) — prevents memory accumulation on long articles with multiple Scene3D blocks.

### Canvas resolution

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — sharp on Retina, not wasteful on 3× screens.
- Canvas CSS size set via `width:100%; height:100%`, physical resolution set in JS matching the container. Recalculated on `ResizeObserver`.

### Thumbnail generation (admin)

- Thumbnails rendered to a separate offscreen `128×96` canvas with the same Three.js scene (no second GLB load). Rendered synchronously in the next animation frame after "Save view" is clicked. Stored as a `data:image/jpeg;base64,…` string in `block.data.scenes[n].thumb` — no extra network request.

---

## "Coming Soon" Implementation

- `block.data._comingSoon: true` → `renderScene3D` adds class `scene3d--coming-soon` to the section.
- CSS `.scene3d--coming-soon .scene3d-coming-soon { display:flex }` (hidden by default, shown when class present).
- The Three.js canvas still initialises and renders behind the overlay — no special code paths. The overlay is purely visual.
- In the admin, the Settings tab shows the toggle. The preview frame reflects the overlay immediately.

---

## BLOCK_SCHEMAS entry (`admin/ui/app.js`)

```javascript
Scene3D: {
  name: 'Scene3D',
  description: 'A 3D model that the reader can scroll through — camera snaps between saved viewpoints.',
  fields: [
    { key: 'glbUrl',       label: 'GLB / GLTF file', kind: 'model3d', group: 'media' },
    { key: '_comingSoon',  label: 'Coming Soon',      kind: 'select',  group: 'settings', options: ['false','true'] },
  ],
  // scenes[] managed by scene3d-editor.js, not by renderField
}
```

`kind: 'model3d'` is a new field kind handled by `scene3d-editor.js` (renders the full orbit editor + scene strip instead of a simple upload widget).

---

## Scope / YAGNI

**In scope:**
- GLB/GLTF upload and display
- Up to 4 saved camera scenes
- Scroll-snap with 800ms camera tween
- Coming Soon overlay
- Mobile-responsive layout
- Admin orbit editor with thumbnail strip

**Out of scope:**
- Draco auto-decompression is included (Three.js DRACOLoader) — but Draco *encoding* on upload is not (editor hint only)
- Animation playback within the GLB (skeletal animations, morph targets) — not triggered, model renders in bind pose
- Multiple Scene3D blocks on one page — the implementation supports it (each block gets its own renderer instance) but is not explicitly tested
- AR/VR mode
- AI scene angle suggestions (placeholder in ✦ AI tab, not wired up)
