# Scene3D Productionize — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-05-28-scene3d-block-design.md`

---

## Goal

Make the Scene3D block production-ready: robust scroll-driven scene changes (no more "stuck on scene 1"), Scrolly-style text cards on the right with per-scene heading+body editing, large-file safety with compressed-GLB support, fast in-place preview updates on edit/delete, and a fix for the model not appearing on light backgrounds.

Theme stays the project's existing system (`#f8f8f8` canvas, ink black, spectrum gradient) — no dark neon.

---

## 1. Robust scroll mechanic (fixes "stuck on scene 1")

### Root cause
Current layout renders `.scene3d-cards` **after** the sticky viewport in normal flow, so cards sit below the 3D scene instead of overlaying it. Combined with a single-threshold (`0.5`) IntersectionObserver that can miss fast scrolls, the camera never advances past scene 1.

### New layout (overlay, cards on the right)
```
.scene3d            { position: relative; }
.scene3d-sticky     { position: sticky; top: 0; height: 100vh; overflow: hidden; }  /* canvas */
.scene3d-cards      { position: relative; margin-top: -100vh; z-index: 2; pointer-events: none; }
.scene3d-card       { min-height: 100vh; display: flex; align-items: center; justify-content: flex-end; padding: 0 6vw; }
.scene3d-card-inner { max-width: 380px; pointer-events: auto; }   /* the .sc-style glass card */
```
`margin-top: -100vh` pulls the first card up to overlay the pinned viewport from the start. Section scroll height = N×100vh; the canvas stays pinned the whole way while cards scroll over it on the right. This is the same overlay technique Scrolly uses on mobile.

Mobile (`<768px`): viewport becomes `position: sticky; height: 100vh` still, cards overlay full-width with bottom-aligned cards (same as Scrolly mobile). Card max-width removed.

### New detection (deterministic — replaces IntersectionObserver)
A single rAF-throttled scroll listener picks the card whose center is nearest the viewport center and activates that scene:

```javascript
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const vpCenter = window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < cardEls.length; i++) {
      const r = cardEls[i].getBoundingClientRect();
      const d = Math.abs((r.top + r.height / 2) - vpCenter);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    activateScene(best);
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll(); // set initial scene
```

This never "sticks": it always resolves to a concrete nearest card, works identically scrolling up or down, and is robust to any number/height of cards. The old card IntersectionObserver for activation is removed. (The scroll listener is removed in `disposeAll()`.)

`activateScene(n)` keeps the existing behavior: skip if already current, update dots, set progress-bar height, and `tweenCamera(scenes[n], 1600)` with the cubic ease-in-out already in place.

---

## 2. Text cards — Scrolly style, on the right, heading + body

### Data model
Each saved scene gains two optional fields (keeping `caption` for back-compat):
```jsonc
scenes[i] = {
  heading: "The barrel assembly",   // optional
  body: "Forged from a single…",    // optional
  caption: "",                       // legacy — migrated to heading if present
  camera: {x,y,z}, target: {x,y,z}, fov: 45, thumb: "data:…"
}
```
Migration: if an old scene has `caption` but no `heading`, render `caption` as the heading. No data rewrite needed — handled at render time.

### Public rendering
Each scene with a heading or body produces a card using the **exact Scrolly card class** for visual identity:
```html
<div class="scene3d-card" data-scene="0">
  <div class="sc scene3d-sc">
    <div class="scene3d-card-num">SCENE 1</div>
    <h3 class="step-heading">{heading}</h3>
    <div class="step-body">{body}</div>
  </div>
</div>
```
- Reuses `.sc` (glass card, `--card` bg, blur, `--radius-card`, `--shadow-card`) and `.step-heading` / `.step-body` typography from Scrolly so it looks identical.
- The active scene's card is full opacity; non-active cards dim to `opacity:.35` (same `.is-active` pattern as Scrolly). `activateScene` toggles `.is-active` on the matching `.scene3d-card`.
- Scenes with no heading AND no body render an empty (invisible) card that still acts as a scroll trigger, so camera-only scenes work.

### Editor editing UX
In the 3D editor, below the viewport + strip, a **per-scene text panel** shows the **active scene's** fields:
```
┌ Scene 2 ───────────────────────────────┐
│ Heading  [ The barrel assembly        ] │
│ Body     [ Forged from a single …     ] │
└─────────────────────────────────────────┘
```
- Appears only when a saved scene is active (selected or just saved). Selecting a different thumbnail switches which scene the panel edits.
- Two inputs: `heading` (text) and `body` (textarea). On input → write to `blockData.scenes[activeSlot].heading/body`, call `onChange()` (which triggers an immediate preview refresh — see §4).
- Styled with existing admin field classes (`.field`, `.field-label`, inputs) — inherits the admin theme.

---

## 3. Large-file safety & compressed-GLB support

### Caps & warnings
- **Hard cap: 50 MB.** `uploadFile` and the Scene3D drop zone reject larger files: *"File too large (X MB). Maximum is 50 MB. Compress your model at gltf.report."*
- **Warn above 12 MB** (non-blocking toast + inline note): *"Large model (X MB) — every visitor downloads this. Compress at gltf.report for faster loads."*
- The existing 50 MB limit in `uploadFile` already aligns; we add the Scene3D-specific drop-zone check + warning band.

### Decoders (so compressed GLBs load)
Both `js/scene3d.js` and `admin/ui/scene3d-editor.js` configure GLTFLoader with three decoders, all from esm.sh (consistent with the working three.js loading):
- **DRACOLoader** — `loader.setDRACOLoader(draco)` with the official Google decoder CDN: `draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')` (stable, CORS-enabled, WASM).
- **MeshoptDecoder** — imported from `https://esm.sh/three@0.170.0/examples/jsm/libs/meshopt_decoder.module.js`; `loader.setMeshoptDecoder(MeshoptDecoder)`.
- **KTX2Loader** — `new KTX2Loader().setTranscoderPath('https://esm.sh/three@0.170.0/examples/jsm/libs/basis/').detectSupport(renderer)`; `loader.setKTX2Loader(ktx2)`. KTX2 needs a live renderer, so it's attached after the renderer exists.

These are created once (memoized in the same `_loadThree()` promise) and attached to every GLTFLoader instance. STL path is unchanged.

Effect: a 1 GB raw model, compressed with Draco/KTX2 to ~5–20 MB, uploads under the cap and loads/decodes on the GPU. Decoders only download when a Scene3D block is present (lazy), preserving the zero-cost rule for other pages.

### Editor hint
The drop zone gains a permanent sub-line: *"GLB / GLTF / STL · max 50 MB · compress big models free at gltf.report ↗"* (link opens in new tab).

---

## 4. Fast, immediate preview updates

### Debounce
`refreshPreview()` soft-refresh debounce drops from **400 ms → 150 ms** for snappy field edits.

### Immediate path
`refreshPreview({ immediate: true })` skips the debounce and posts the soft-refresh synchronously. Called from:
- **Block delete** (`deleteBlock`) — the most important per the user; the block vanishes from preview instantly.
- **Scene save / scene delete** in the 3D editor.
- **Block duplicate / reorder**.

Soft-refresh already preserves scroll position (no jump) and re-renders in place, so "immediate" is genuinely instant — no iframe reload.

---

## 5. Light-background bug fix

### Root cause
The loading spinner border is white (`rgba(255,255,255,…)`) → invisible on the studio (light) gradient, so the model load looks like nothing is happening. Plus the first paint on a transparent canvas can be missed.

### Fix
- Spinner uses a **theme-neutral color** that reads on light and dark: border `rgba(120,120,120,.25)` with top-color `rgba(120,120,120,.8)` (works on `#f8f8f8` and `#1a1a1a`). Applied to both `.scene3d-loader` (public) and `.s3d-load-spinner` (editor).
- After the model loads, render **twice across two animation frames** (`renderer.render` now + `requestAnimationFrame(render)`) so the first frame always paints on the transparent canvas regardless of layout timing.

---

## Files touched

| File | Changes |
|---|---|
| `js/render.js` | renderScene3D layout (overlay cards right), `.sc` card markup, CSS (overlay, neutral spinner, card dim), heading/body/caption migration |
| `js/scene3d.js` | nearest-center scroll handler (replaces card IO), Draco/Meshopt/KTX2 decoders, double-paint after load, remove scroll listener in dispose |
| `admin/ui/scene3d-editor.js` | decoders, per-scene heading+body panel, 50 MB cap + 12 MB warn, neutral spinner, immediate refresh on save/delete, gltf.report hint |
| `admin/ui/supabase-client.js` | 12 MB warn hook (cap already 50 MB) |
| `admin/ui/app.js` | refreshPreview debounce 150 ms + `{immediate}` option; deleteBlock/duplicate/reorder call immediate; Scene3D schema keeps `bg`, no new top-level fields (heading/body live in scenes[]) |

---

## Scope / YAGNI

**In scope:** everything above.

**Out of scope:**
- In-browser auto-compression (rejected — heavy WASM, breaks no-build philosophy; users compress via gltf.report).
- Rich text in scene cards (heading + plain body only).
- Streaming/progressive GLB loading (cap + compression makes it unnecessary).
- Re-initializing the renderer after it scrolls far away (renderer stays alive; no auto-dispose).
