---
quick_id: 260522-ws7
slug: lottie-scroll-block
date: 2026-05-22
status: complete
commit: c6d19ff
---

# Summary: LottieScroll Block

## What was done

Added `LottieScroll` as a new ScrollyCMS block type — a scroll-driven Lottie JSON animation block, styled and integrated the same way as other immersive blocks (Parallax, FullscreenImage, etc.).

## Files changed

| File | Change |
|---|---|
| `js/render.js` | Added `loadLottieWeb()` lazy CDN loader + `renderLottieScroll()` + BLOCK_RENDERERS entry |
| `admin/ui/app.js` | BLOCK_SCHEMAS, BLOCK_ICONS (✨), PALETTE_CATEGORIES, BLOCK_PREVIEWS, creation card, `defaultBlockData` case |
| `admin/ui/styles.css` | `.lottie-scroll`, `.lottie-wrap`, `.lottie-canvas`, `.lottie-cap`, `.lottie-placeholder`, fullscreen + mobile variants |
| `js/visual-edit.js` | `.lottie-cap` EDITABLE_MAP entry |
| `admin/index.html` | Cache buster → `?v=20260522d` |

## Technical decisions

- **CDN**: `lottie-web@5.12.2/lottie_light.min.js` (SVG renderer only, ~115KB) — lazy-loaded inside `render.js` the first time a LottieScroll block renders. No admin/index.html changes needed because the preview is a blob URL that runs render.js.
- **Scroll scrub**: `IntersectionObserver` activates a `requestAnimationFrame` loop. Frame calculated as `progress * totalFrames` where progress = how far the element has scrolled through the viewport (0 → element enters bottom, 1 → element exits top). `rootMargin: '20% 0px'` starts the RAF slightly before entry so animation is ready.
- **Autoplay mode**: plays on loop while in view, pauses when not.
- **Placeholder**: shown when `lottieUrl` is empty — purple/navy gradient with play icon, same pattern as Parallax placeholder.
- **No npm deps**: pure CDN, no build step.

## Deployment

Deployed to: https://bf24ab01.scrollycms.pages.dev
