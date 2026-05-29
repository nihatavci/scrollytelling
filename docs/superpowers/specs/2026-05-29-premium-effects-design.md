# Premium CSS Effects — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation

---

## Goal

Add a curated library of premium modern-CSS effects that editors apply **as modifiers to existing blocks** via an "✨ Effects" panel in each block's editor. Effects enhance content already present (no new block types). Everything is **progressively enhanced** — unsupported browsers degrade gracefully to plain content. A live "Effects gallery" demo page lets the team see each effect in motion.

Theme = project's existing system (`#f8f8f8` canvas, ink black, `--spectrum-gradient`). No dark neon.

---

## Effect set (v1)

| Key | Effect | Applies to (block types) | Mechanism | Fallback |
|---|---|---|---|---|
| `reveal` | Fade/slide/scale in on enter | all | `motion-fx` `data-reveal` (existing) | none needed (IntersectionObserver) |
| `parallax` | Drift on scroll | all | `motion-fx` `data-parallax` (existing) | static (no transform) |
| `tilt` | 3D tilt toward pointer | FullscreenImage, FullBleed, ImageGrid, ImageCompare, Quote, Aside, Scene3D | pointer → `rotateX/Y` + `perspective` | flat (no tilt) |
| `wipe` | `clip-path` reveal driven by scroll | FullscreenImage, FullBleed, ImageGrid, Editorial | scroll-driven `animation-timeline:view()` | instant show |
| `zoom` | Slow Ken Burns zoom | FullscreenImage, FullBleed, ImageGrid | CSS `@keyframes scale` | static |
| `glass` | Frosted backdrop surface | Quote, Aside, Editorial, StatRow | `backdrop-filter:blur` | solid `--snow` bg |
| `gradientText` | Headline filled with spectrum gradient | Hero, ChapterDivider, Editorial, Quote, StatRow | `background-clip:text` | solid ink color |
| `genBg` | Houdini-painted animated texture behind block | any | CSS Paint API worklet | static spectrum-tinted gradient |

**Applicability map** is data-driven: a `FX_APPLICABLE` object maps each block type → the list of effect keys that make sense for it. The Effects panel only shows applicable effects; the renderer only applies applicable ones.

---

## Data model

One compact object per block, absent keys = effect off:
```jsonc
block.data._fx = {
  reveal: "up",        // '' | 'up' | 'left' | 'right' | 'scale' | 'fade'
  revealDelay: 0,       // seconds
  parallax: 0,          // 0 = off; 0.05–0.3 strength
  tilt: false,          // boolean
  wipe: false,          // boolean
  zoom: false,          // boolean
  glass: false,         // boolean
  gradientText: false,  // boolean
  genBg: false          // boolean
}
```
If `block.data._fx` is absent or all-falsy, the block renders exactly as today (zero overhead).

---

## Editor — "✨ Effects" panel

In the block editor (the grouped editor in `app.js`), add a new group **`fx`** labelled **"✨ Effects"** (collapsed by default), rendered AFTER the schema groups in `renderEditor`. It is generated from `FX_APPLICABLE[block.type]`, not from BLOCK_SCHEMAS:

- **Reveal** — select: Off / Fade up / Slide left / Slide right / Scale / Fade. Writes `_fx.reveal`. When not Off, a small "Delay" chip row (0 / 0.1 / 0.2 / 0.3s) writes `_fx.revealDelay`.
- **Parallax** — chips: Off / Subtle (0.1) / Medium (0.2) / Strong (0.3). Writes `_fx.parallax`.
- **3D tilt**, **Scroll wipe**, **Slow zoom**, **Glass**, **Gradient text**, **Generative backdrop** — each a toggle (checkbox styled as a pill). Write the matching boolean.

Only effects in `FX_APPLICABLE[block.type]` appear. Each change calls `setDirty(true)` + `refreshPreview()` (150 ms debounce, already in place) so the preview updates live. The panel reads/writes `block.data._fx` (created lazily).

A one-line note at the top: *"Effects enhance this block. Unsupported browsers fall back gracefully."*

---

## Rendering

### Tagging (in `js/render.js`, block append loop)
After a block node is created and before append, a new `applyBlockFx(node, block)` adds classes + data-attrs from `block.data._fx`:
- `reveal` → `node.setAttribute('data-reveal', value)` + `data-reveal-delay` (consumed by existing `motion-fx` `bindReveals`).
- `parallax` → set on the block's primary media child if present, else the node: `setAttribute('data-parallax', strength)` (existing `bindParallax`).
- `tilt` → `node.classList.add('fx-tilt')` + `data-fx-tilt` (new binder).
- `wipe` → `node.classList.add('fx-wipe')`.
- `zoom` → add `fx-zoom` to the block's `img`/media element (or node).
- `glass` → `node.classList.add('fx-glass')`.
- `gradientText` → `node.classList.add('fx-gradient-text')` (CSS targets headings within).
- `genBg` → `node.classList.add('fx-genbg')` + register the Houdini worklet once (see below).

`applyBlockFx` is also called inside the `soft-refresh` re-render path so live edits apply.

### CSS (in `COMPONENT_CSS`)
```css
/* Slow zoom */
.fx-zoom{animation:fxZoom 22s ease-in-out infinite alternate;transform-origin:center}
@keyframes fxZoom{from{transform:scale(1)}to{transform:scale(1.08)}}
/* Glass */
.fx-glass{background:rgba(255,255,255,.55)}
@supports((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .fx-glass{background:rgba(255,255,255,.35);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
}
/* Gradient text — target headings inside the block */
.fx-gradient-text h1,.fx-gradient-text h2,.fx-gradient-text .fullbleed-title,.fx-gradient-text .step-heading{
  color:var(--ink-black);
}
@supports(background-clip:text) or (-webkit-background-clip:text){
  .fx-gradient-text h1,.fx-gradient-text h2,.fx-gradient-text .fullbleed-title,.fx-gradient-text .step-heading{
    background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;color:transparent
  }
}
/* 3D tilt */
.fx-tilt{transform-style:preserve-3d;transition:transform .25s ease-out;will-change:transform}
/* Scroll wipe */
.fx-wipe{clip-path:inset(0 0 0 0)}
@supports(animation-timeline:view()){
  .fx-wipe{animation:fxWipe linear both;animation-timeline:view();animation-range:entry 10% cover 40%}
  @keyframes fxWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
}
/* Generative backdrop */
.fx-genbg{position:relative;isolation:isolate}
.fx-genbg::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(198,121,196,.12),rgba(3,88,247,.12))}
@supports(background:paint(id)){
  .fx-genbg::before{background:paint(fxGarden)}
}
```

### Behavior (in `js/motion-fx.js`)
Two new binders, called from `init()`:
- `bindTilt()` — for each `.fx-tilt`, on `pointermove` compute normalized offset from center, set `transform: perspective(800px) rotateX(...) rotateY(...)`; on `pointerleave` reset. Respects `prefers-reduced-motion` (skip).
- Reveal/parallax already handled by existing `bindReveals`/`bindParallax` reading the data-attrs `applyBlockFx` now sets.
- `MFX.init()` is re-run after `soft-refresh` (dispatch `content:ready` already happens) so new effects bind. Guard against double-binding by marking bound elements (`el._fxBound`).

### Houdini worklet (optional file)
`js/fx-garden-worklet.js` — a Paint worklet drawing a soft animated speckle/gradient. Registered once via `CSS.paintWorklet.addModule()` when any `.fx-genbg` exists AND `CSS.paintWorklet` is available. If unavailable, the `::before` static gradient fallback shows. This is the only new file and is purely additive.

---

## Effects gallery demo

A static demo page `effects-gallery.html` at the repo root (served by Pages) showcasing every effect on sample content, with labels. Not linked from the app — a reference/QA page at `https://scrolli.nihatavci.com/effects-gallery.html`. Lets the team see each effect live and pick favorites. Uses the same `COMPONENT_CSS` + `motion-fx.js`.

---

## Files touched

| File | Changes |
|---|---|
| `js/render.js` | `applyBlockFx(node, block)` + call in block loop and soft-refresh; effect CSS in `COMPONENT_CSS` |
| `js/motion-fx.js` | `bindTilt()`, re-init guard, call in `init()` |
| `js/fx-garden-worklet.js` | NEW — Houdini paint worklet (generative backdrop) |
| `admin/ui/app.js` | `FX_APPLICABLE` map; "✨ Effects" group in `renderEditor`; reads/writes `block.data._fx` |
| `admin/ui/styles.css` | Effects-panel control styles |
| `effects-gallery.html` | NEW — live reference page |
| `admin/ui/index.html`, `admin/index.html` | version bump |

---

## Scope / YAGNI

**In scope:** the 8 effects above as per-block modifiers, progressive enhancement, Effects panel, gallery page.

**Out of scope:**
- View Transitions API (page-level navigation morphs) — different layer than block modifiers; revisit separately.
- Anchor Positioning, Container/Style Queries, Trigonometric layouts — internal techniques, not user-facing toggles.
- Per-sub-element targeting beyond headings/media (effects apply at block granularity).
- OKLCH auto-shade hover — internal styling concern, not an editor toggle.
- Flip cards / multi-face 3D (needs back-content authoring) — future.
