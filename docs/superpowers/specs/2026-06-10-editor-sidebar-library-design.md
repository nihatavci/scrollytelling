# Editor Sidebar Shell + Component Library

**Date:** 2026-06-10
**Status:** Approved (pending spec review)

This is **sub-project 1+2** of a larger editor revamp. The full revamp decomposes into:

1. **Sidebar shell** — docked Pages/Sections/Assets panel *(this spec)*
2. **Component library** — categorized hover-flyout with visual cards *(this spec)*
3. **Drag-and-drop engine** — translucent ghost + nearest-insertion line + drop-to-place *(separate spec, later)*
4. **AI panel** — top-of-sidebar "Compose" (whole page) / "Improve" (section) + Enhance-as-icon *(separate spec, later)*

This spec covers **1 and 2 only**. The top AI-prompt slot is visually reserved but **not built here** (it lands in cycle 4). Cards are made `draggable` but the sophisticated drop behavior is cycle 3 — until then, **clicking a card adds the block** (current behavior).

## Problem

The editor's left rail is a plain "Blocks" list, and adding a component opens a centered modal ("Add to your story") that's a long scrolling grid of cards. It doesn't match the polished, Framer-like experience the product is aiming for, and there's no single place to manage pages, the current page's sections, or uploaded assets.

## Goal

Replace the left rail with a **docked, full-height, solid-white sidebar** (flush to the edge, overlapping a full-bleed canvas — not a floating "bento" card) containing:

- A **tab strip** (Pages · Sections · Assets) with a smoothly sliding indicator; only the active tab's content shows below.
- **Pages** — list of the user's pages (switch + create).
- **Sections** — the current page's blocks (today's block list), reorderable, each row with a Lucide icon + name.
- **Assets** — a **list** of uploaded files, each row: small thumbnail + filename + size + a **type badge** (IMAGE / VIDEO / GIF / AUDIO).

And a redesigned **component library** opened from "+ Add section":

- **Left:** category folders (Structure, Text, Scroll, Images & media, Data & facts, 3D & effects) with tinted Lucide icons.
- **Right (hover flyout):** hovering a category **instantly** opens a compact flyout of **visual preview cards** — each card is a real `BLOCK_PREVIEW` (recolored/enhanced) with the component name; **no descriptions, no Add button**. Leaving the dock closes the flyout. Clicking a card adds the block.

Visual language: solid white panels, soft shadow, **Lucide line icons** (real set, not hand-drawn), the app's **DM Sans** font, generous Framer-like padding.

## Context (existing code to reuse)

- Layout: `admin/ui/index.html:117-144` — `.layout` → `aside.blocks` (`#block-list`, `#btn-add-block`) + `main.editor` + `aside.preview` (`#preview-frame`).
- `renderBlockList()` (`app.js:2736`) renders the block list — reused as the **Sections** tab body.
- `renderPalette(body)` / `renderPaletteWithInsert()` (`app.js:3085`) + `PALETTE_CATEGORIES` (`app.js:447`) + `BLOCK_PREVIEWS` (`app.js:498`) + `addBlock(type)`→`openCreationCard` (`app.js:3163`) — the library internals to restyle.
- `SB.listFiles(filter)` (used at `app.js:4685`) returns `{ files: [{name, size, url}] }` — the **Assets** tab data source. Type via extension.
- Page data: `state.pageRows`, `loadPage(slug)`, `loadPages()` — the **Pages** tab data source.
- Font token `--font: 'DM Sans', …` (`styles.css:16`). Existing tab-slider pattern from the auth work can inform the indicator.

## Architecture

### Sidebar shell (replaces `aside.blocks`)
- New markup: `aside.sidebar` (docked, full editor height, `width:300px`, solid white, flush). Inside:
  - **AI slot** (top): an empty reserved container `#ai-slot` with a thin divider — **no functional content this cycle** (a code comment marks it for cycle 4). Keeps vertical rhythm so adding the AI panel later doesn't reflow everything.
  - **Tab strip** `#side-tabs`: three buttons (Pages/Sections/Assets) + an absolutely-positioned sliding `.side-ind` pill, JS-measured for pixel-accurate glide (reuse the slider technique from the auth tab work).
  - **Panes** `#side-pane-pages|sections|assets`, only the active one visible; fade-in on switch.
- The middle `main.editor` (block form) and `aside.preview` are unchanged structurally; the canvas remains the live preview. (Full-bleed canvas + overlapping panel is a later visual refinement — this cycle keeps the existing 3-column `.layout` but restyles the left rail into the docked tabbed sidebar.)

### Tab panes
- **Pages** (`renderPagesPane`): list `state.pageRows`; active page highlighted; row click → `loadPage(slug)` + refresh highlight; a "+ New page" row opens the existing create-page modal. Lucide home/file icons.
- **Sections** (`renderSectionsPane`): renders the existing block list via `renderBlockList()` into this pane (move `#block-list` here), keeping drag-reorder and selection behavior intact; header has "+ Add" that opens the library. Each row: tinted Lucide icon per block type + name + hover drag handle.
- **Assets** (`renderAssetsPane`): `await SB.listFiles('all')`; render rows = thumbnail (image → `background-image`; video/audio/other → icon tile) + filename + formatted size + type badge derived from extension (`IMAGE`/`VIDEO`/`GIF`/`AUDIO`/`FILE`). Empty state: "No uploads yet." An "Upload" affordance reuses the existing upload path.

### Component library (restyle of the palette)
- `renderPalette(body)` is rebuilt to the **two-column hover model**:
  - Left column: one row per `PALETTE_CATEGORIES` entry — tinted Lucide icon + label + chevron.
  - `mouseenter` on a category → render its components into a **flyout** column to the right as visual cards (real `BLOCK_PREVIEWS[type]` inside a white "shot" frame + name). `mouseleave` of the dock hides the flyout.
  - Card `click` → existing `addBlock(type)` / insert flow (preserves `renderPaletteWithInsert` "insert after" behavior).
  - Each card gets `draggable="true"` and a `data-block-type` attribute — **wiring only**, so cycle 3's drag engine has the hooks; no drop logic this cycle.
- Icon set: add a small inline-SVG **Lucide icon map** (`BLOCK_ICONS[type]`) + per-category tint classes. Reused by both the Sections rows and the library.

## Files touched

| File | Change |
|---|---|
| `admin/ui/index.html` | Replace `aside.blocks` with the docked tabbed `aside.sidebar` (AI slot, tab strip, three panes) |
| `admin/ui/app.js` | Tab controller + sliding indicator; `renderPagesPane`/`renderSectionsPane`/`renderAssetsPane`; move block-list into Sections; rebuild `renderPalette` to category-list + hover-flyout of real-preview cards; `BLOCK_ICONS` map; `draggable` + `data-block-type` on cards |
| `admin/ui/styles.css` | Docked sidebar, tab strip + sliding pill, pane fade, Lucide icon tints, asset rows + badges, library flyout + cards |

## Out of scope (explicit — later cycles)

- **Drag-and-drop engine**: translucent component ghost, auto-nearest insertion line on the canvas, drop-to-place, free reorder on canvas. *(Cycle 3.)*
- **AI panel**: the top "Compose / Improve" prompt and turning Enhance into an icon (no popup). *(Cycle 4.)* Only the empty `#ai-slot` is reserved now.
- Full-bleed-canvas-with-overlapping-sidebar visual (this cycle keeps the existing 3-column layout, restyled).
- Asset management beyond listing (rename/delete/folders).

## Testing (browser, via dev server)

- Sidebar is docked, solid white, full height; tab pill slides smoothly between Pages/Sections/Assets; only the active pane shows.
- **Pages**: lists pages, active highlighted, clicking switches pages, "+ New page" opens the create modal.
- **Sections**: shows current page's blocks with icons; selecting/reordering/adding still works; "+ Add" opens the library.
- **Assets**: lists uploaded files as rows with thumbnail + size + correct type badge; empty state shows when none.
- **Library**: hovering a category instantly opens the flyout with real-preview cards (DM Sans, recolored); leaving closes it; clicking a card adds that block to the page (and "insert after" still targets the right spot).
- No regression: editing a block, preview refresh, publish unaffected.
