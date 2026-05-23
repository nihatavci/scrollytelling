# ImageGrid Text & Scroll-Fade Enhancement
**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Enhance the existing `ImageGrid` block — no replacement, fully backward-compatible

---

## Problem

The current `ImageGrid` block renders images only. There is no way to attach rich editorial text (title, body, CTA) to individual items, and no scroll-driven behavior (sticky panel + fading content). Both are needed for editorial storytelling.

---

## Design Decisions

### Backward Compatibility — Non-Negotiable
All existing `ImageGrid` blocks must render identically after this change. The new fields (`title`, `body`, `cta`, `mode`, `textSide`, `stickyPanel`) are all optional with safe defaults. If none are present, the block renders as today.

### The Hybrid Architecture
Three layers, each optional:

**Layer 1 — Block-level defaults** (new fields on the block object)
```json
{
  "mode": "grid",
  "textSide": "right",
  "stickyPanel": "media"
}
```

**Layer 2 — Per-item text content** (new fields added to each object in `images[]`)
```json
{
  "src": "...",
  "alt": "...",
  "caption": "...",
  "title": "Bold heading for this item",
  "body": "1–2 sentences of editorial text.",
  "cta": { "label": "Read more", "url": "#" }
}
```

**Layer 3 — Per-item layout overrides** (optional, overrides block-level defaults)
```json
{
  "textSide": "left",
  "fullWidth": true
}
```

---

## New Block-Level Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `"grid" \| "scroll-fade"` | `"grid"` | `"grid"` = static layout. `"scroll-fade"` = sticky panel + fading sequence. |
| `textSide` | `"left" \| "right" \| "alternate"` | `"right"` | Which side the text panel appears on. `"alternate"` flips every other item. |
| `stickyPanel` | `"media" \| "text"` | `"media"` | In `scroll-fade` mode: which panel sticks while the other fades in/out. |

---

## New Per-Item Fields

| Field | Type | Description |
|---|---|---|
| `title` | string | Heading displayed above body text |
| `body` | string | Editorial paragraph (1–3 sentences) |
| `cta` | `{ label, url }` | Optional call-to-action button |
| `textSide` | `"left" \| "right" \| "top" \| "bottom"` | Per-item override of block-level `textSide` |
| `fullWidth` | boolean | Span the full block width — useful for text-only break items |

---

## Rendering Modes

### Mode 1: `"grid"` (default — existing behaviour + text panels)
- Renders as a CSS grid, same as today
- If an item has `title` or `body`, the cell splits into a media panel and a text panel
- If no text fields: renders as a plain image cell (today's behaviour)
- `textSide: "right"` → image left, text right
- `textSide: "left"` → text left, image right
- `textSide: "alternate"` → odd items image-left, even items image-right (zig-zag)
- `textSide: "top"` / `"bottom"` → stacked layout (image above or below text)
- `fullWidth: true` on an item → spans both grid columns, useful for editorial breaks

### Mode 2: `"scroll-fade"`
- Layout becomes two fixed columns (like the existing `Scrolly` block)
- `stickyPanel` determines which column is `position: sticky` in CSS — it stays in the viewport while the other column is the scroll trigger
- Both columns cross-fade their content per item (opacity transition, not slide) — the content of both sides changes, `stickyPanel` only controls layout stickiness
- `stickyPanel: "media"` → image column on the left is sticky, text column on the right is the scroll trigger
- `stickyPanel: "text"` → text column on the left is sticky, image column on the right is the scroll trigger
- Column proportions use the existing `imageSize` field (`"small"` 35%, `"medium"` 50%, `"large"` 65%) — default `"medium"` (50/50)
- `textSide` is ignored in `scroll-fade` mode (column positions are fixed by `stickyPanel`)
- Uses `IntersectionObserver` with a fade transition — not the card-slide pattern of `Scrolly`

---

## Fade Animation (`scroll-fade`)

- Inactive panels: `opacity: 0`, `transform: translateY(6px)`
- Active panel: `opacity: 1`, `transform: translateY(0)`
- Transition: `opacity 0.45s ease, transform 0.45s ease`
- `IntersectionObserver` rootMargin: `-25% 0px -25% 0px` — activates when panel is in the middle 50% of the viewport
- No JS animation library required — pure CSS transitions triggered by class toggle

---

## Text Panel Layout (grid mode)

When an item has a text panel, the cell renders as:
```
[media panel] [text panel]   ← textSide: "right" (default)
[text panel] [media panel]   ← textSide: "left"
[media panel]                ← textSide: "top" / "bottom" (stacked)
[text panel]
```

Text panel contains (in order, all optional):
1. `title` — `h3` with display font
2. `body` — `p` with body font
3. `cta` — `<a>` styled as a ghost button

Split ratio for `left`/`right`: media 55%, text 45% (matches existing `feature-left` feel).

---

## CSS Architecture

All new styles use namespaced classes prefixed `.ig-text-*` to avoid conflicts:

- `.ig-cell--with-text` — applied to cells that have text content
- `.ig-cell--text-left` / `.ig-cell--text-right` — controls flex direction
- `.ig-cell--text-top` / `.ig-cell--text-bottom` — stacked variant
- `.ig-cell--full-width` — spans full grid width
- `.ig-text-panel` — the text container
- `.ig-text-title` — heading
- `.ig-text-body` — body paragraph
- `.ig-text-cta` — CTA button/link
- `.ig--scroll-fade` — applied to `.ig` section in scroll-fade mode
- `.ig-sf-sticky` — the sticky column in scroll-fade mode
- `.ig-sf-panels` — the scrolling column in scroll-fade mode
- `.ig-sf-panel` — individual fade panel (inactive: opacity 0)
- `.ig-sf-panel.is-active` — active panel (opacity 1)

---

## AI Generation Schema Update

`generate.js` → `BLOCK_SCHEMAS.ImageGrid` gets updated `description` and `example` to:
- Document the new fields
- Show an example with `mode: "scroll-fade"` and items with `title` + `body`
- Add to `IMPROVE_RULES.ImageGrid`:
  - `"add text to images"` → add `title` + `body` to each item
  - `"scroll mode"` or `"make it scrolly"` → set `mode: "scroll-fade"`, `stickyPanel: "media"`
  - `"flip sticky"` → toggle `stickyPanel` between `"media"` and `"text"`
  - `"alternate"` → set `textSide: "alternate"`

---

## Files Changed

| File | Change |
|---|---|
| `js/render.js` | CSS additions (~60 lines), `renderImageGrid()` updated to handle text panels and scroll-fade mode |
| `functions/api/generate.js` | `BLOCK_SCHEMAS.ImageGrid` description + example updated, `IMPROVE_RULES.ImageGrid` extended |
| `admin/ui/app.js` | No changes needed — existing block editor form auto-generates inputs from the data |

---

## Out of Scope

- Video in the media panel (future)
- More than 2 panels per item (future)
- Custom fade duration per item (future)
- Saving the sticky ratio from the drag handle (already handled by existing `imageSize` field)
