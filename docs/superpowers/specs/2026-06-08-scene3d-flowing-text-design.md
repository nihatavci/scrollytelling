# Scene3D Flowing Text (pretext) — Design Spec

**Date:** 2026-06-08
**Status:** Approved for implementation
**Builds on:** Scene3D specs (2026-05-28, 2026-05-29 annotations)

---

## Goal

Add a **flowing-text mode** to the Scene3D block: a body of article prose that lays out into columns and **reflows around the 3D model's shape in real time** as the scroll-driven camera moves — text yields where the model is, fills open space. Inspired by chenglou/pretext's Castle of Loarre demo.

Theme = project's existing system (`#f8f8f8` canvas, `--ink-black` text, editorial fonts). No dark neon.

---

## Key research finding (scope-setting)

`@chenglou/pretext` (npm, **MIT**) is a fast **2D text layout/measurement engine** — pure arithmetic over cached glyph widths, **no DOM reflow**, microsecond relayout. It does **not** know about 3D. The demo's magic is: each frame the demo computes how much horizontal space the model occupies per text line and feeds pretext a per-line `maxWidth`. **We must compute that occupancy ourselves.** Per the approved decisions:

- **Occupancy:** bounding-profile approximation (project model points → coarse per-row left/right profile). **No GPU readback.**
- **Rendering:** pretext materializes lines onto a **Canvas-2D overlay** above the WebGL canvas, with a **hidden DOM copy** of the prose for selection/SEO/a11y.

pretext loads via esm.sh (`https://esm.sh/@chenglou/pretext`); needs `Intl.Segmenter` (all modern browsers). Lazy-loaded only when a flow-mode block exists. **Implementation note:** verify the esm.sh URL resolves the package's ESM build during Phase 1; if it doesn't, vendor the single compiled ESM file into `js/vendor/pretext.js` (MIT — attribution kept).

---

## Data model

Scene3D block `data` gains:
```jsonc
{
  "textMode": "cards" | "flow",   // default "cards" (existing behavior)
  "flowText": "Paragraph one…\n\nParagraph two…",  // prose for flow mode (plain paragraphs, \n\n separated)
  "flowColumns": 2                 // 1–3, default 2
  // existing: glbUrl, scenes[], annotations[], bg, _comingSoon
}
```
`textMode: 'cards'` → exactly today's behavior (per-scene heading/body cards). `textMode: 'flow'` → cards suppressed; `flowText` flows around the model. Absent `textMode` ⇒ `'cards'` (full back-compat).

---

## Public render structure (`js/render.js` → `renderScene3D`)

When `textMode === 'flow'`, the section adds a flow layer instead of the `.scene3d-cards`:
```html
<section class="scene3d scene3d--flow ...">
  <div class="scene3d-sticky">
    <canvas class="scene3d-canvas"></canvas>        <!-- WebGL model -->
    <canvas class="scene3d-text-canvas"></canvas>   <!-- pretext-drawn flowing text -->
    <div class="scene3d-text-a11y" aria-hidden="false">…real prose paragraphs…</div> <!-- visually hidden, for SEO/selection -->
    <div class="scene3d-dots">…</div>
  </div>
  <!-- a tall scroll spacer drives the scenes, same as cards mode -->
  <div class="scene3d-cards">…one empty trigger card per scene…</div>
</section>
```
- `.scene3d-text-canvas` is `position:absolute; inset:0` over the model canvas, `pointer-events:none`.
- `.scene3d-text-a11y` is `position:absolute; width:1px; height:1px; overflow:hidden; clip` (sr-only pattern) — holds the actual prose so it's selectable/indexable.
- Scroll trigger cards remain (empty) so scenes still advance on scroll.

---

## The per-frame pipeline (`js/scene3d-flow.js`, new module)

A focused module the Scene3D renderer calls. Exposes:
```
createFlowText(THREE, ctx2d, getCamera, getModel, opts) → { relayout(), resize(w,h), dispose() }
```
Driven from the Scene3D render path: `relayout()` is called after each model render during a camera tween (and once on settle / on resize). Between tweens the camera is static ⇒ no work.

**1. Occupancy profile**
- Sample the model's bounding box 8 corners + 6 face centers (14 points) — or cached mesh bounding sphere ring — and `project()` each to screen (NDC→px) using the live camera.
- Bucket into `BANDS = 12` horizontal row-bands spanning the canvas height. For each band, track min/max projected x of points whose projected y falls in (or spans) the band → `[occLeft[b], occRight[b]]`. Add a px padding margin. Bands with no coverage = fully open.
- Result: per-band occupied x-interval. O(14) work + O(12) — trivial.

**2. Column layout with pretext**
- Split the canvas width into `flowColumns` columns (gutters between).
- For each column, walk lines top→bottom via `layoutNextLineRange(prepared, cursor, maxWidth)`:
  - For the current line's y (cursor height × lineHeight), find its band → the occupied interval.
  - Compute the line's available width within this column = column width minus the overlap with `[occLeft,occRight]`. If the model splits the column, take the **wider** open sub-segment (and record its x-offset). If the open width < a min (e.g. 40px), skip the line (advance y) so text doesn't crush.
  - Feed that `maxWidth` (and x-offset) to pretext; it returns the line's glyph run.
- `prepare()`/`prepareWithSegments()` is called once per `flowText` change (cached); per-frame is only `layoutNextLineRange` + draw.

**3. Draw**
- Clear the text canvas; set font (editorial body, `--ink-black`), `ctx.fillText` each materialized line at its (x-offset, y). DPR-aware (canvas sized to `clientW*dpr`).
- Optional: subtle fade for the first/last lines; respects the block's `bg` (on dark bg, text switches to near-white — read from a data attr).

**Perf:** pretext relayout is microseconds; the only real cost is `fillText` per line per frame *during a tween*. Cap total lines (~200) and columns (≤3). Static between tweens. Mobile uses the fallback (below), so no per-frame text on phones.

---

## Editor (`admin/ui/scene3d-editor.js`)

- A **Text mode** toggle (Cards / Flowing text) in the editor (below the scene strip).
- When **Flowing text**: show a large **Article text** textarea (writes `flowText`) + a **Columns** chip row (1/2/3 → `flowColumns`). The per-scene heading/body panel is hidden (cards-only).
- When **Cards**: existing per-scene heading/body panel (unchanged).
- Live preview: editing `flowText` triggers the standard soft-refresh; the public renderer re-prepares and redraws. (Editor viewport itself shows the model; the flowing text is visible in the preview iframe, consistent with how other render-only features preview.)

---

## Fallback (graceful, non-negotiable)

`textMode: 'flow'` falls back to a **plain single column of `flowText` below the model** when any of:
- `Intl.Segmenter` unavailable, or pretext fails to load,
- `prefers-reduced-motion: reduce`,
- viewport `< 768px` (mobile).

Fallback renders `flowText` paragraphs as normal DOM (`.scene3d-flow-fallback`), fully readable; the `.scene3d-text-canvas` stays empty/hidden. The hidden a11y copy is reused as the fallback (just un-hidden) to avoid duplication.

---

## Files

| File | Change |
|---|---|
| `js/scene3d-flow.js` | NEW — occupancy profile + pretext column layout + canvas draw |
| `js/scene3d.js` | In flow mode: create the flow controller, call `relayout()` in the render/tween path + on resize/settle; dispose with the block |
| `js/render.js` | `renderScene3D` flow-mode DOM (text canvas + a11y copy + fallback) + CSS |
| `admin/ui/scene3d-editor.js` | Text-mode toggle, Article-text textarea, Columns chips |
| `admin/ui/app.js` | Scene3D schema: `textMode`, `flowText`, `flowColumns` defaults |
| `admin/ui/styles.css` | editor flow controls |

---

## Phasing (verified per phase, like the WebGL work)

1. **pretext load + occupancy profile** — load `@chenglou/pretext` (verify esm.sh, else vendor); build the per-band occupancy profile from the live camera/model; headless-log the profile updates as the camera tweens. No drawing yet.
2. **Column layout + canvas draw** — wire `layoutNextLineRange` per column with per-line widths from the profile; draw to the text canvas; headless-screenshot text wrapping around the model.
3. **Render/editor wiring** — `textMode` toggle + `flowText`/`flowColumns` in schema & editor; flow-mode DOM + a11y copy + fallback in `render.js`.
4. **Fallback + polish + deploy** — mobile/reduced-motion/no-Segmenter fallback, theme colors per `bg`, deploy + smoke test.

---

## Scope / YAGNI

**In scope:** flow mode on Scene3D, bounding-profile occupancy, pretext 2D-canvas columns, a11y copy, graceful fallback, editor controls.

**Out of scope:**
- True pixel-silhouette wrap (GPU readback) — explicitly rejected for cost.
- Rich text (bold/links/images) inside flowing prose — plain paragraphs only (pretext supports rich inline; deferred).
- Text wrapping for the non-Scene3D blocks or the WebGL showpiece blocks.
- Justified text / hyphenation tuning beyond pretext defaults.
- Selectable on-canvas text (we keep the hidden DOM copy instead).
