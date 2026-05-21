# Parallax Block — Design Spec

**Date:** 2026-05-21
**Status:** Approved
**Scope:** New `Parallax` block type for ScrollyCMS

---

## Overview

A full-viewport (100vh) immersive parallax section with 2-3 image layers moving at different scroll speeds, plus an optional centered headline and subtitle overlay. Uses CSS `animation-timeline: view()` for 60fps compositor-thread animation with zero JS runtime cost.

## User-Facing Behavior

When the Parallax block scrolls into view:
- **Background layer** shifts slowly (subtle drift)
- **Midground layer** shifts at medium speed
- **Foreground layer** shifts fastest (dramatic depth)
- **Text overlay** stays pinned at the chosen position with a readability tint

The effect creates cinematic depth as the reader scrolls through the section. On browsers without `animation-timeline` support (~15%, primarily Firefox), layers display as a static stacked image — no broken layout, no missing content.

## Block Schema

```json
{
  "type": "Parallax",
  "data": {
    "background": { "src": "", "alt": "" },
    "midground":  { "src": "", "alt": "" },
    "foreground": { "src": "", "alt": "" },
    "headline": "",
    "subtitle": "",
    "overlayPosition": "center",
    "tint": "dark"
  }
}
```

### Field Details

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `background` | `{ src: string, alt: string }` | Yes | `{ src: "", alt: "" }` | Slowest-moving layer. Should be a wide landscape image. |
| `midground` | `{ src: string, alt: string }` | No | `{ src: "", alt: "" }` | Medium-speed layer. Often a cutout/transparent PNG. |
| `foreground` | `{ src: string, alt: string }` | No | `{ src: "", alt: "" }` | Fastest-moving layer. Often a cutout/transparent PNG. |
| `headline` | `string` | No | `""` | Large overlay text. |
| `subtitle` | `string` | No | `""` | Smaller text below headline. |
| `overlayPosition` | `enum` | No | `"center"` | One of: `"center"`, `"bottom-left"`, `"bottom-center"`. |
| `tint` | `enum` | No | `"dark"` | One of: `"dark"` (rgba(0,0,0,0.35)), `"light"` (rgba(255,255,255,0.35)), `"none"`. |

Only `background` is required. If `midground` and `foreground` are empty, the block renders as a single parallax image with text overlay — still useful as a section opener.

## Rendered DOM

```html
<section class="parallax parallax--tint-dark">
  <div class="parallax__layer parallax__bg">
    <img src="bg.jpg" alt="Mountain range" loading="lazy">
  </div>
  <div class="parallax__layer parallax__mid">
    <img src="mid.png" alt="Forest treeline" loading="lazy">
  </div>
  <div class="parallax__layer parallax__fg">
    <img src="fg.png" alt="Foreground grass" loading="lazy">
  </div>
  <div class="parallax__overlay parallax__overlay--center">
    <h2 class="parallax__headline">The Journey Begins</h2>
    <p class="parallax__subtitle">A story told in layers</p>
  </div>
</section>
```

- Empty layers (no `src`) are not rendered — no empty divs
- Images use `loading="lazy"` since the block may be below the fold
- The `parallax--tint-*` class controls the text readability scrim

## CSS Architecture

### Core Layout

```css
.parallax {
  position: relative;
  height: 100vh;
  overflow: hidden;
}

.parallax__layer {
  position: absolute;
  inset: 0;
}

.parallax__layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

### Parallax Motion via `animation-timeline: view()`

```css
.parallax__bg img {
  scale: 1.3;
  animation: parallax-slow linear both;
  animation-timeline: view();
  animation-range: entry 0% exit 100%;
}

.parallax__mid img {
  scale: 1.4;
  animation: parallax-mid linear both;
  animation-timeline: view();
  animation-range: entry 0% exit 100%;
}

.parallax__fg img {
  scale: 1.5;
  animation: parallax-fast linear both;
  animation-timeline: view();
  animation-range: entry 0% exit 100%;
}

@keyframes parallax-slow { from { translate: 0 8%; }  to { translate: 0 -8%; }  }
@keyframes parallax-mid  { from { translate: 0 15%; } to { translate: 0 -15%; } }
@keyframes parallax-fast { from { translate: 0 25%; } to { translate: 0 -25%; } }
```

**How it works:**
- `animation-timeline: view()` binds animation progress to the element's scroll position within the viewport
- When the section enters the viewport, animation is at 0% (layers shifted down)
- When the section exits the viewport, animation is at 100% (layers shifted up)
- Each layer has a different displacement range: background ±8%, midground ±15%, foreground ±25%
- `scale` on each layer is slightly oversized to prevent edge reveal during translation
- All transforms run on the compositor thread — guaranteed 60fps

### Text Overlay

```css
.parallax__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 4;
  padding: 2rem;
  text-align: center;
}

.parallax__overlay--bottom-left {
  justify-content: flex-end;
  align-items: flex-start;
  text-align: left;
  padding-bottom: 4rem;
}

.parallax__overlay--bottom-center {
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 4rem;
}

.parallax__headline {
  font-size: clamp(2rem, 5vw, 4.5rem);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 20px rgba(0,0,0,0.4);
  margin: 0;
  max-width: 900px;
}

.parallax__subtitle {
  font-size: clamp(1rem, 2vw, 1.5rem);
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 10px rgba(0,0,0,0.3);
  margin: 0.75rem 0 0;
  max-width: 700px;
}
```

### Tint Variants

```css
.parallax--tint-dark::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 3;
  pointer-events: none;
}

.parallax--tint-light::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.35);
  z-index: 3;
  pointer-events: none;
}

.parallax--tint-light .parallax__headline { color: #111; text-shadow: 0 2px 20px rgba(255,255,255,0.4); }
.parallax--tint-light .parallax__subtitle { color: rgba(0,0,0,0.85); text-shadow: 0 1px 10px rgba(255,255,255,0.3); }
```

### Graceful Fallback (Firefox, older browsers)

```css
@supports not (animation-timeline: view()) {
  .parallax__layer img {
    animation: none !important;
    translate: 0 0 !important;
    scale: 1 !important;
  }
}
```

Unsupported browsers display the layers stacked statically. Images cover the viewport, text overlay is readable. No broken experience — just no motion.

### Mobile

```css
@media (max-width: 768px) {
  .parallax { height: 75vh; }
  .parallax__overlay { padding: 1.5rem; }
  .parallax__headline { font-size: clamp(1.5rem, 7vw, 2.5rem); }
  .parallax__subtitle { font-size: clamp(0.9rem, 3.5vw, 1.2rem); }
}
```

On phones, reduce height to 75vh and scale typography down. Parallax effect still works (CSS handles it automatically).

## Admin Editor Form

### Schema Registration (`BLOCK_SCHEMAS.Parallax` in `app.js`)

```javascript
Parallax: {
  label: 'Parallax',
  fields: [
    { key: 'background', label: 'Background (slowest)', kind: 'image_upload' },
    { key: 'midground',  label: 'Midground',            kind: 'image_upload' },
    { key: 'foreground', label: 'Foreground (fastest)',  kind: 'image_upload' },
    { key: 'headline',   label: 'Headline',              kind: 'text' },
    { key: 'subtitle',   label: 'Subtitle',              kind: 'text' },
    { key: 'overlayPosition', label: 'Text position', kind: 'button_group',
      options: ['center', 'bottom-left', 'bottom-center'] },
    { key: 'tint', label: 'Tint', kind: 'button_group',
      options: ['dark', 'light', 'none'] },
  ]
}
```

### Creation Card (`BLOCK_CREATION_CARDS.Parallax`)

```javascript
Parallax: {
  label: 'Parallax',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20l6-10 4 5 4-8 6 13"/><path d="M2 17l7-6 5 4 4-7 4 9" opacity=".4"/></svg>'
  category: 'media',
  fields: [
    { key: 'background', label: 'Background image', kind: 'image_upload' },
    { key: 'headline',   label: 'Headline',          kind: 'text' },
  ]
}
```

The creation card shows minimal fields (just background + headline). Full editing (midground, foreground, tint, position) is done in the editor form after creation.

### Default Data

```javascript
{
  background: { src: '', alt: '' },
  midground:  { src: '', alt: '' },
  foreground: { src: '', alt: '' },
  headline: '',
  subtitle: '',
  overlayPosition: 'center',
  tint: 'dark'
}
```

## Visual Edit Support (`visual-edit.js`)

Add entries to `EDITABLE_MAP` for inline preview editing:

```javascript
// Parallax layers
'.parallax__bg img':        { field: 'background', type: 'image' },
'.parallax__mid img':       { field: 'midground',  type: 'image' },
'.parallax__fg img':        { field: 'foreground', type: 'image' },

// Text overlay
'.parallax__headline':      { field: 'headline', type: 'text' },
'.parallax__subtitle':      { field: 'subtitle', type: 'text' },
```

Clicking a layer image in the preview opens the image picker. Clicking headline/subtitle enables inline text editing. Same UX patterns as existing blocks.

## Renderer Integration (`render.js`)

Add `renderParallax` to `BLOCK_RENDERERS`:

```javascript
BLOCK_RENDERERS.Parallax = renderParallax;

function renderParallax(block) {
  const d = block.data || {};
  const section = el('section', {
    class: 'parallax parallax--tint-' + (d.tint || 'dark'),
    'data-block-id': block.id
  });

  // Render layers (only if src is non-empty)
  if (d.background?.src) {
    section.appendChild(
      el('div', { class: 'parallax__layer parallax__bg' },
        el('img', { src: d.background.src, alt: d.background.alt || '', loading: 'lazy' })
      )
    );
  }
  if (d.midground?.src) {
    section.appendChild(
      el('div', { class: 'parallax__layer parallax__mid' },
        el('img', { src: d.midground.src, alt: d.midground.alt || '', loading: 'lazy' })
      )
    );
  }
  if (d.foreground?.src) {
    section.appendChild(
      el('div', { class: 'parallax__layer parallax__fg' },
        el('img', { src: d.foreground.src, alt: d.foreground.alt || '', loading: 'lazy' })
      )
    );
  }

  // Text overlay (only if headline or subtitle present)
  if (d.headline || d.subtitle) {
    const pos = d.overlayPosition || 'center';
    const overlay = el('div', { class: 'parallax__overlay parallax__overlay--' + pos });
    if (d.headline) overlay.appendChild(el('h2', { class: 'parallax__headline' }, d.headline));
    if (d.subtitle) overlay.appendChild(el('p', { class: 'parallax__subtitle' }, d.subtitle));
    section.appendChild(overlay);
  }

  return section;
}
```

## Files Changed

| File | Change |
|------|--------|
| `js/render.js` | Add `renderParallax` function + register in `BLOCK_RENDERERS` |
| `js/visual-edit.js` | Add parallax entries to `EDITABLE_MAP` |
| `admin/ui/app.js` | Add `BLOCK_SCHEMAS.Parallax`, `BLOCK_CREATION_CARDS.Parallax`, default data |
| `admin/ui/styles.css` | Add all `.parallax*` styles (layout, animation, tint, overlay, responsive, fallback) |

No new files. No new dependencies. The entire feature fits within the existing architecture.

## Browser Support

| Browser | Parallax Effect | Fallback |
|---------|----------------|----------|
| Chrome 115+ | Full parallax | - |
| Edge 115+ | Full parallax | - |
| Safari 18+ | Full parallax | - |
| Firefox (all) | Static layers | Stacked images, no motion |
| Safari < 18 | Static layers | Stacked images, no motion |

Estimated support for parallax motion: ~85% global, ~90% German audience.

## Testing

1. **Render test**: Create a Parallax block with all 3 layers + text. Verify DOM structure matches spec.
2. **Empty layers**: Create with only background. Verify no empty `parallax__mid`/`parallax__fg` divs rendered.
3. **Tint variants**: Verify all 3 tints produce correct `::after` pseudo-element and text colors.
4. **Overlay positions**: Verify `center`, `bottom-left`, `bottom-center` alignment.
5. **Visual edit**: Click layer images in preview — image picker opens. Click text — inline edit works.
6. **Fallback**: Open in Firefox — layers display statically, no animation, no broken layout.
7. **Mobile**: Check 75vh height, scaled typography on viewport < 768px.
8. **Performance**: Scroll through parallax section — verify smooth 60fps in Chrome DevTools Performance tab.
