# Scene3D Spatial Annotations — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-05-28-scene3d-block-design.md`, `2026-05-29-scene3d-productionize-design.md`

---

## Goal

Let an editor pin a labelled marker to a specific point **on the 3D model**. The marker tracks the model as the camera orbits/tweens (projected from a 3D world point every frame), hides when its point is occluded by the geometry, and appears only when its scene is active — so it reads as a native part of the 3D scene (Sketchfab-style), not a label floating on the web layer.

Theme = project's existing system (`--snow` cards, `--ink-black` text, `--spectrum-gradient` accent). No dark neon.

---

## Data model

New **block-level** array (sibling of `scenes`), each annotation tied to one scene by index:

```jsonc
annotations: [
  {
    id: "an-ab12",          // uid
    scene: 0,                // index into scenes[] — annotation shows when this scene is active
    point: { x, y, z },      // 3D position in NORMALISED model space (see below)
    label: "Barrel assembly" // text shown when expanded
  }
]
```

### Why `point` is reliable across editor → public
Both the editor and public renderer normalise the loaded model identically: scale into a 2-unit bounding box centred at the origin (`scale = 2 / maxDim`, then subtract the scaled centre). Because that transform is deterministic from the model's geometry, a world point captured by a raycast in the editor maps to the exact same surface point in the public renderer. We store `point` in this normalised world space — no per-render conversion needed.

### Scene deletion / reorder
- On **scene delete** (editor): drop any annotation whose `scene` equals the deleted index; decrement `scene` for annotations referencing a higher index. (Scenes are stored in fixed 4 slots with `null` holes, so "index" = slot index; deletion sets the slot to `null` — annotations for that slot are removed.)
- Annotations whose `scene` slot is `null` at render time are ignored (defensive).

---

## Rendering — shared mechanics (public + editor)

Each context (public `js/scene3d.js`, admin `scene3d-editor.js`) owns its own annotation layer + update function, since they have different cameras and render loops. The math is identical:

### DOM
A non-interactive overlay inside the sticky viewport (public) / the viewport element (editor):
```html
<div class="scene3d-annotations">           <!-- absolute, inset:0, pointer-events:none -->
  <button class="s3d-anno" data-id="an-ab12" data-scene="0">
    <span class="s3d-anno-dot">1</span>
    <span class="s3d-anno-label">Barrel assembly</span>
  </button>
  …
</div>
```
- The dot is `pointer-events:auto` so hover/tap works; the container is `none`.
- One `.s3d-anno` element per annotation, created once when the renderer initialises.

### `updateAnnotations()` — called after every `renderer.render(...)`
Visibility is toggled purely with the `.is-visible` class (opacity + pointer-events) so fades animate — never `display:none` (which would kill the transition). For each annotation element:
1. **Scene gate:** if `annotation.scene !== currentSceneIndex`, remove `.is-visible` and skip. (Public: `currentIdx`; editor: `activeSlot`.)
2. **Project:** `v = worldPoint.clone().project(camera)`. If `v.z > 1` (behind camera), remove `.is-visible` and skip.
3. **Occlusion:** raycast from `camera.position` toward the world point; `raycaster.set(camera.position, dir.normalize())`; `const hits = raycaster.intersectObject(model, true)`. If `hits.length` and `hits[0].distance < cameraToPointDistance - 0.02`, the point is behind geometry → remove `.is-visible`, skip.
4. **Position + show:** convert NDC → pixels relative to the canvas rect:
   `left = (v.x * 0.5 + 0.5) * rectW; top = (-v.y * 0.5 + 0.5) * rectH;` set `element.style.transform = 'translate(' + left + 'px,' + top + 'px) translate(-50%,-50%)'`, then add `.is-visible`. (The position is always updated before showing, so the fade happens in the correct spot.)

Reuse one shared `THREE.Raycaster` and temp `Vector3`s (no per-frame allocation).

### When `updateAnnotations` runs
- **Public:** inside the tween `step()` loop (right after `renderer.render`), once after model load, once after the post-load double-paint, and in the `ResizeObserver` callback. Between tweens the camera is static, so positions stay correct with no extra work.
- **Editor:** inside the existing `setAnimationLoop` (after `renderFrame()`), so dots track live while the user orbits.

### Per-scene fade + auto-open
- When a dot's scene becomes active, it fades in (CSS `opacity` transition on `.s3d-anno`) and its label **auto-expands** (`.s3d-anno.is-open` class) so the reader sees the callout for that moment.
- Hover (desktop) / tap (mobile/click) toggles `.is-open`. On mobile the label is tap-to-open.
- Dots for non-active scenes are `hidden`.

---

## Editor — placing annotations

The per-scene panel (`renderTextPanel`, below the viewport) gains an **Annotations** subsection for the active scene:

```
Scene 1 text
  Heading [ … ]
  Body    [ … ]
Annotations
  📍 Add annotation
  ① [ Barrel assembly            ] ✕
  ② [ Cooling vents              ] ✕
```

### Placement flow
1. Click **📍 Add annotation** → enters placement mode: viewport cursor becomes crosshair, a hint shows ("Click a point on the model"), the button becomes "Cancel".
2. On the next pointerdown on the canvas: compute NDC from the pointer, `raycaster.setFromCamera(ndc, camera)`, `intersectObject(model, true)`.
   - **Hit:** create `{ id: uid, scene: activeSlot, point: hit.point (clone), label: "" }`, push to `blockData.annotations`, exit placement mode, re-render the panel + strip, `onChange()`. A live dot appears immediately via `updateAnnotations()`.
   - **Miss** (clicked empty space): stay in placement mode, toast "Click directly on the model."
3. Each annotation row: a number badge, a label `<input>` (writes `annotation.label`, `onChange()` on input), and a two-click-confirm delete (✕) consistent with scene delete.

### State
- `placementMode` boolean in the editor closure; pointer handler on the canvas checks it.
- `uid()` helper: `'an-' + Math.random().toString(36).slice(2,6)` (no Date/crypto needed; collisions astronomically unlikely for ≤ dozens).
- Editor `updateAnnotations` gates on `activeSlot` so you see exactly the active scene's pins while editing.

---

## Styling (theme-matched)

```css
.scene3d-annotations, .s3d-anno-layer { position:absolute; inset:0; pointer-events:none; z-index:4; overflow:hidden; }
.s3d-anno {
  position:absolute; top:0; left:0; transform:translate(-50%,-50%);
  display:flex; align-items:center; gap:0; background:none; border:none; padding:0;
  pointer-events:auto; cursor:pointer; opacity:0; transition:opacity .4s ease;
  font-family:var(--font, 'DM Sans', sans-serif);
}
.s3d-anno.is-visible { opacity:1; }
.s3d-anno-dot {
  width:22px; height:22px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:700; color:var(--ink-black,#000);
  background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.25), 0 0 0 2px transparent;
  background-image:linear-gradient(#fff,#fff), var(--spectrum-gradient);
  background-origin:border-box; background-clip:padding-box, border-box;
  border:2px solid transparent;
}
.s3d-anno-label {
  max-width:0; overflow:hidden; white-space:nowrap;
  background:var(--snow,#fff); color:var(--ink-black,#000);
  font-size:12px; line-height:1; border-radius:9999px;
  box-shadow:0 2px 10px rgba(0,0,0,.15);
  margin-left:0; padding:0; opacity:0;
  transition:max-width .35s ease, padding .35s ease, opacity .25s ease, margin-left .35s ease;
}
.s3d-anno.is-open .s3d-anno-label {
  max-width:220px; padding:7px 12px; margin-left:8px; opacity:1;
}
@media(max-width:767px){ .s3d-anno-dot{ width:26px; height:26px; } }
```
The dot is a white circle ringed by the spectrum gradient (matches brand). The label is a clean white pill that slides open. No leader line needed at this size; the dot sits exactly on the point.

---

## Files touched

| File | Changes |
|---|---|
| `js/render.js` | Add `.scene3d-annotations` container inside the sticky viewport in `renderScene3D`; add annotation CSS to `COMPONENT_CSS` |
| `js/scene3d.js` | Build `.s3d-anno` elements from `data.annotations`; `updateAnnotations()` (project + occlude + scene-gate); call it after every render + on resize; raycaster reused |
| `admin/ui/scene3d-editor.js` | Annotation layer in viewport; Annotations subsection in `renderTextPanel`; placement mode + canvas raycast; annotation rows (label input + two-click delete); `updateAnnotations()` in the animation loop; drop annotations on scene delete |
| `admin/ui/styles.css` | Editor-side annotation row styles + crosshair/placement hint |

No schema field changes — `annotations` lives in block data, managed by the editor like `scenes`.

---

## Scope / YAGNI

**In scope:** pin-on-surface, frame-accurate tracking, depth occlusion, per-scene visibility + auto-open, click-to-place editor, label text, delete.

**Out of scope:**
- Dragging an existing pin to reposition (delete + re-add instead).
- Rich text / links / images in labels (plain text only).
- Leader lines / callout arrows.
- Annotations spanning multiple scenes (exactly one scene each).
- Annotation-driven camera focus (clicking a pin moving the camera).
