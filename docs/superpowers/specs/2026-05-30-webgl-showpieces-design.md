# WebGL Showpiece Blocks + Unified Picker — Design Spec

**Date:** 2026-05-30
**Status:** Approved for implementation
**Builds on:** Scene3D specs (Three.js via esm.sh), premium-effects spec

---

## Goal

Add an "Immersive (WebGL)" tier of standalone blocks that capture the Immersive-Garden feel — **Flowmap Image** (mouse-driven fluid distortion), **Shader Gradient** (living noise gradient), **Particle Dissolve** (image → scroll-driven GPU particles) — built on a shared, safe WebGL framework. Plus a unified, compact, illustrative **square-tile picker** for the Add-block palette and the per-block Effects panel.

Theme = project system (`#f8f8f8`, ink black, `--spectrum-gradient`). No dark neon.

---

## Part A — Shared WebGL framework (`js/webgl-fx.js`)

A new public module, lazy-imported by `render.js` only when a WebGL block exists.

```
initWebGLFx(blockId, kind, data)   // kind: 'flowmap' | 'gradient' | 'particles'
disposeWebGLFx(blockId)
```

Responsibilities (shared across all three effects):
- Lazy-load Three.js once (reuse the esm.sh loader pattern; share `_libPromise` with Scene3D if simple, else its own).
- Create `WebGLRenderer` on the block's `<canvas>`, `alpha:true`, `setPixelRatio(min(dpr, isMobile?1.5:2))`.
- Orthographic full-screen quad for flowmap/gradient; perspective for particles.
- `ResizeObserver` → resize + uniform update.
- **IntersectionObserver** → run the rAF loop only while the block is in/near the viewport (`rootMargin:'200px'`); pause otherwise (saves GPU). NOT disposed on scroll (Scene3D lesson) — only paused.
- Track instances in a `Map` keyed by blockId; `disposeWebGLFx` tears down on soft-refresh re-render.
- Guards: if `!window.WebGLRenderingContext` or `prefers-reduced-motion`, skip init — the static fallback (CSS) shows.

Each effect is a factory `createX(THREE, renderer, canvas, data)` returning `{ render(time), resize(), dispose() }`.

### Fallbacks (CSS, always present in `COMPONENT_CSS`)
- Flowmap: the `<img>` shows normally behind the canvas (canvas is `alpha:true` overlay; if WebGL absent, plain image).
- Gradient: `background: var(--spectrum-gradient)` static on the section.
- Particles: the source `<img>` shown static.

---

## Effect 1 — Flowmap Image (`WebGLFlowmap`)

**Look:** full-width image; moving the pointer leaves a decaying ripple that distorts the image (fluid/heat-haze trail) — the IG hero signature.

**Technique:** ping-pong framebuffer flowmap.
- Two `WebGLRenderTarget`s (A/B). Each frame: render a "flow" shader into the target that (a) decays the previous flow by `~0.96`, (b) adds a soft brush at the pointer position weighted by pointer velocity (smoothed). Swap A/B.
- Display shader samples the image texture with UV displaced by the flow texture's RG (velocity): `uv += flow.rg * intensity`. Chromatic offset on R/B channels for a subtle prismatic edge.
- Pointer tracked in normalized canvas coords; velocity = delta between frames, decayed when idle so the trail fades.

**Data:** `{ imageSrc, intensity (0.05–0.4, default 0.18), height ('100vh'|'75vh'|'50vh') }`.

**Editor:** image upload (reuse `mediaField`), intensity chips (Subtle/Medium/Strong), height select. Live preview.

---

## Effect 2 — Shader Gradient (`WebGLGradient`)

**Look:** a slow, living gradient — domain-warped simplex noise blending 2–4 brand colors across a full-bleed plane. Optional headline/subtitle overlay (HTML, on theme).

**Technique:** single fragment shader on a full-screen quad. Uniforms: `u_time`, `u_colors[4]`, `u_colorCount`, `u_speed`. Use 3D simplex noise (compact GLSL snippet) to drive color mixing + flow. No framebuffers — cheap and safe.

**Data:** `{ colors: [hex…] (default spectrum 4), speed (0.1–1, default 0.3), height, title, subtitle, overlayPosition }`.

**Editor:** color pickers (default = spectrum stops), speed chips, height, optional title/subtitle text + position (reuse FullBleed-style fields).

---

## Effect 3 — Particle Dissolve (`WebGLParticles`)

**Look:** image resolves from / dissolves into a cloud of points as the reader scrolls through the block.

**Technique:**
- Load image to an offscreen canvas, sample on a grid (step based on density) → for each sampled pixel create a particle with `position` (plane xy from UV), `color` (pixel rgb), and a random `offset` direction/seed.
- `BufferGeometry` of `THREE.Points`; vertex shader lerps each particle between its grid position and a scattered position by `u_progress` (0 = formed image, 1 = dispersed). `u_progress` is driven by the block's scroll position (0→1 across its scroll range) via the framework.
- Fragment shader: round soft points, particle color, fade alpha as they disperse.
- Density auto-scales: desktop ~step 4px, mobile ~step 8px; hard cap ~120k particles.

**Data:** `{ imageSrc, density ('low'|'medium'|'high', default medium), height }`.

**Editor:** image upload, density chips, height.

---

## Rendering & block wiring

For each WebGL block, `render.js` adds a `renderWebGLX(d, block)` that emits:
```html
<section class="webgl-fx webgl-fx--{kind} h-{height}" id="webglfx-{blockId}">
  <img class="webgl-fx-fallback" src="…">     <!-- flowmap/particles only; static fallback -->
  <canvas class="webgl-fx-canvas"></canvas>
  <div class="webgl-fx-overlay">…title/subtitle…</div>   <!-- gradient only -->
</section>
```
- `BLOCK_RENDERERS`: `WebGLFlowmap`, `WebGLGradient`, `WebGLParticles`.
- After DOM insert: `if (block exists) import('./webgl-fx.js').then(m => m.initWebGLFx(block.id, kind, d))` — lazy.
- soft-refresh path calls `disposeWebGLFx(id)` then re-inits (prevents context leak), mirroring Scene3D.
- CSS: heights (reuse `.h-100/75/50` pattern), canvas `position:absolute;inset:0;width:100%;height:100%`, fallback `object-fit:cover`, gradient static fallback bg, overlay text styles.

`admin/ui/app.js`:
- `BLOCK_SCHEMAS` entries for the three (fields per above; image fields use `kind:'image'`, others `select`/`text`).
- `BLOCK_ICONS`, `BLOCK_PREVIEWS` mini-mockups, `defaultDataFor`, palette category.
- WebGL blocks skip the Claude create-modal (like Scene3D) — `openCreationCard` adds them via `addEmptyBlock`.

---

## Part B — Unified square-tile picker

### Add-block palette → illustrative square grid
Rework `renderPalette` so each block is a **square tile**: the existing `BLOCK_PREVIEWS[type]` mini-mockup scaled into a 1:1 thumbnail, block name beneath, on hover a subtle lift. Tiles laid out in a responsive grid (`repeat(auto-fill, minmax(150px,1fr))`). Categories become section headers above each grid. A new **"Immersive (WebGL)"** category lists Scene3D + the 3 WebGL blocks first.

### Effects panel → square toggle tiles
The per-block **✨ Effects** panel (from the premium-effects work) switches from a list to a compact grid of square tiles: each effect is a tile with a tiny illustrative glyph/preview and its name; active state = ring + check. Reveal/parallax (which have options) open a small popover/inline control when their tile is on. Keeps it compact and visual.

---

## Files touched / created

| File | Change |
|---|---|
| `js/webgl-fx.js` | NEW — framework + 3 effect factories + shaders |
| `js/render.js` | 3 `renderWebGLX` + BLOCK_RENDERERS + lazy init/dispose + CSS |
| `admin/ui/app.js` | 3 schemas, icons, previews, defaults, palette category, skip-modal; palette square-tile rework; effects-panel tile rework |
| `admin/ui/styles.css` | palette tile grid, effects tile grid, webgl editor controls |
| `webgl-gallery.html` | NEW — live demo of the 3 WebGL blocks (reference/QA) |
| `admin/ui/index.html`, `admin/index.html` | version bump |

---

## Performance & safety

- Three.js + `webgl-fx.js` lazy-loaded only when a WebGL block is present → zero cost elsewhere.
- rAF loop paused when block offscreen.
- Pixel ratio capped (1.5 mobile / 2 desktop); particle count capped + mobile-reduced.
- `prefers-reduced-motion` and no-WebGL → static fallbacks.
- Renderer/targets/geometry disposed on soft-refresh re-render and block removal.
- One WebGL context per block; warn (console) if >4 WebGL blocks on a page (browser context limits).

---

## Scope / phasing (build order, lowest risk first)

1. Framework + **Shader Gradient** (safe, proves the pipeline).
2. **Flowmap Image** (medium — ping-pong FBO).
3. **Particle Dissolve** (highest — particle system + scroll uniform).
4. Unified square-tile picker (palette + effects panel).
5. Gallery + deploy.

**Out of scope:** bespoke 3D environment models, video-plane distortion (revisit later), audio-reactive, post-processing stacks, multi-pass bloom. WebGL effects are image/gradient/particle only for v1.
