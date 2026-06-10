# Editor v2 — Framer-sized Sidebar, Attached Library Flyout & Drag-to-Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor sidebar Framer-compact, kill scrollbar flicker, re-dock the component flyout flush to the sidebar (not floating), and let users **drag a component onto the live preview** to insert it with mock-rich default content and a blue insertion line.

**Architecture:** All editor UI is a vanilla-JS SPA in `admin/ui/` (`app.js`, `index.html`, `styles.css`). The live preview is a same-origin `<iframe id="preview-frame">` whose runtime `js/render.js` renders every block into `#page-root` with a `[data-block-id]` attribute and already handles `postMessage({type:'soft-refresh', doc})`. Drag-and-drop is implemented by: (1) the parent making library cards real drag sources and broadcasting drag start/end into the iframe; (2) `js/render.js` running a **drop mode** that draws an insertion line between blocks on `dragover` and posts the chosen `afterBlockId` back on `drop`; (3) the parent inserting the block via the existing `addEmptyBlock(type, afterId)` (which fills `defaultDataFor(type)` mock content) and re-rendering the preview.

**Tech Stack:** Vanilla JS, native HTML5 Drag-and-Drop (same-origin iframe), CSS in `admin/ui/styles.css`. Dev server: `PORT=4400 node dev-server.js` → `http://localhost:4400/admin/`. No DOM test harness — verify with `node --check` + the running browser preview. Work in the MAIN repo `/Users/nihat/DevS/Thomas` on branch `main`.

**Scope (from user feedback):**
- Sidebar is too wide — make it Framer-compact.
- Remove visible scrollbars everywhere (they cause the sidebar to flicker when toggling).
- The component flyout must **stick to the sidebar** (attached, flush), not float over the canvas with a gap. It may **start from the top** and be its own (smaller) height — it need not match the sidebar height.
- Dragging a component must let you **drop it on the preview**; on drop the block appears immediately with its **mock-rich default content** (like Framer), at the drop location.

**Out of scope:** a translucent component "ghost" that mirrors the full rendered block while dragging (the native drag image + the insertion line are enough this cycle); reordering existing blocks by dragging them on the canvas; the AI panel.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `admin/ui/styles.css` | editor styling | Sidebar width 380→256px (+ toggle offsets, responsive, fullscreen-slide); global scrollbar hiding; flyout re-docked flush/top-start; insertion-line styles are in render.js (the iframe) so add none here |
| `admin/ui/app.js` | editor controller | Library cards become drag sources (`dragstart`/`dragend`); broadcast `lib-drag-start`/`lib-drag-end` into the iframe; handle the `drop-block` message → `addEmptyBlock` + `refreshPreview` + `closeLibrary`; add a `refreshPreview()` call after `addEmptyBlock` |
| `js/render.js` | preview runtime (inside iframe) | Add an always-loaded **drop mode**: on `lib-drag-start` enable, draw a blue insertion line on `dragover` computed from `#page-root > [data-block-id]` rects, on `drop` post `{type:'visual-edit', action:'drop-block', blockType, afterBlockId}`, on `lib-drag-end`/`dragleave` clear |

Tasks are ordered low-risk-polish → drag engine. Each commits independently. Run `PORT=4400 node dev-server.js` once and reload between tasks. **You must be logged in** to reach the editor with a page loaded (the preview needs real blocks for the drag tests).

---

## Task 1: Framer-compact sidebar width

The sidebar is `380px`; Framer's is ~256px. Narrow it and fix every coupled offset (the floating toggle button, the off-canvas slide distance, and the responsive widths).

**Files:** Modify `admin/ui/styles.css` (lines 250, 265, 278, 316, 1040, 1047)

- [ ] **Step 1: Narrow the base width**

`admin/ui/styles.css:250` reads `  width: 380px;` inside the `.blocks { … }` rule (starts at line 247). Change it to:

```css
  width: 256px;
```

- [ ] **Step 2: Fix the collapsed/off-canvas slide distances**

Line 265 (`left: -380px;`, inside `.blocks.is-collapsed`) → change to:
```css
  left: -256px;
```
Line 278 (`.layout.preview-fullscreen > .blocks { left: -380px; opacity: 0; pointer-events: none; }`) → change the `left` to `-256px`:
```css
.layout.preview-fullscreen > .blocks { left: -256px; opacity: 0; pointer-events: none; }
```

- [ ] **Step 3: Fix the floating sidebar-toggle offset**

Line 316 (`.blocks:not(.is-collapsed) ~ .sidebar-toggle { left: 390px; }`) → change `390px` to `266px` (sidebar width + 10):
```css
.blocks:not(.is-collapsed) ~ .sidebar-toggle { left: 266px; }
```

- [ ] **Step 4: Fix the responsive widths**

Lines 1040 and 1047 currently shrink the sidebar further on small screens:
```css
  .blocks { width: 320px; }
```
(line 1040) and
```css
  .blocks { width: 280px; }
```
(line 1047). Since the base is now 256px (already smaller than these), set both to `240px` so small screens stay a touch tighter, and update their paired toggle offsets on the **next line after each** (1041 `left: 330px;` and 1048 `left: 290px;`):

Line 1040 → `  .blocks { width: 240px; }`
Line 1041 → `  .blocks:not(.is-collapsed) ~ .sidebar-toggle { left: 250px; }`
Line 1047 → `  .blocks { width: 240px; }`
Line 1048 → `  .blocks:not(.is-collapsed) ~ .sidebar-toggle { left: 250px; }`

(Read lines 1040–1048 first to confirm the exact text before editing.)

- [ ] **Step 5: Verify**

Reload `http://localhost:4400/admin/` (logged in). Expected: the left sidebar is noticeably narrower (~256px); the ☰ toggle pill sits just right of it; collapsing/expanding still slides it fully off-screen; no horizontal scrollbar appears. `node --check` n/a (CSS only).

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas && git add admin/ui/styles.css && git commit -m "feat(editor): Framer-compact sidebar (380->256px) + coupled offsets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Hide scrollbars everywhere (stop the toggle flicker)

Visible scrollbars on the sidebar panes/library reserve gutter width that appears/disappears as content changes, making the sidebar flicker. Hide scrollbars globally while keeping wheel/trackpad scrolling.

**Files:** Modify `admin/ui/styles.css` (append at end)

- [ ] **Step 1: Append a global scrollbar-hide rule**

Append to the **end** of `admin/ui/styles.css`:

```css
/* ── Hide scrollbars everywhere (content still scrolls via wheel/trackpad). ──
   Visible scrollbars reserve gutter width that toggles as the sidebar opens/closes,
   which reads as flicker. Hiding them keeps widths stable. */
* { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none; }
```

- [ ] **Step 2: Verify**

Reload. Expected: no visible scrollbars on the sidebar, panes, or modals; scrolling a long block list / Assets list with the trackpad still works; switching tabs or toggling the sidebar no longer shifts content horizontally. (CSS only.)

- [ ] **Step 3: Commit**

```bash
cd /Users/nihat/DevS/Thomas && git add admin/ui/styles.css && git commit -m "feat(editor): hide scrollbars globally to stop sidebar flicker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Re-dock the library flyout flush to the sidebar

Currently the flyout (`.lib-flyout.lib-pop`) is `position:fixed` at `sidebarRight + 10px`, vertically aligned to the hovered row — it reads as a *floating* card. The user wants it **attached** (flush to the sidebar's right edge, no gap) and **starting from the top** of the sidebar, at its own (content) height — not centered on the row, not full height.

**Files:** Modify `admin/ui/app.js` (the `openFly` positioning in `renderLibrary`, ~line 3210); Modify `admin/ui/styles.css` (the `.lib-flyout.lib-pop` rule, ~line 2466)

- [ ] **Step 1: Anchor the flyout flush to the sidebar, from the top**

In `admin/ui/app.js`, inside `renderLibrary`'s `openFly(cat, row)` function, find this positioning block (it currently offsets by +10 and aligns to the row):

```javascript
    const sb = document.querySelector('.blocks.sidebar');
    const sRect = sb.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    fly.style.left = (sRect.right + 10) + 'px';
    fly.style.top = Math.max(12, Math.min(rRect.top, window.innerHeight - 440)) + 'px';
```

Replace it with (flush left edge, top aligned to the sidebar's content top):

```javascript
    const sb = document.querySelector('.blocks.sidebar');
    const sRect = sb.getBoundingClientRect();
    fly.style.left = Math.round(sRect.right) + 'px';   // flush to the sidebar edge (no gap)
    fly.style.top = Math.round(sRect.top + 8) + 'px';  // start from the top, not the hovered row
```

- [ ] **Step 2: Restyle the flyout as an attached panel, not a floating card**

In `admin/ui/styles.css`, find the `.lib-flyout.lib-pop` rule (~line 2466, added previously):

```css
.lib-flyout.lib-pop { position:fixed; width:252px; max-height:60vh; z-index:200; }
```

Replace it with (flush attached look: square the left corners, drop the left shadow so it merges with the sidebar, height fits content up to a cap):

```css
.lib-flyout.lib-pop {
  position:fixed; width:230px; max-height:72vh; z-index:200;
  border-left:1px solid #ececef;
  border-top-left-radius:0; border-bottom-left-radius:0;
  box-shadow:10px 0 30px -8px rgba(20,20,40,.16);  /* shadow only to the right */
}
```

- [ ] **Step 3: Verify**

Reload, log in, open a page, click **+ Add**, hover a category. Expected: the flyout opens **flush against** the sidebar's right edge with no visible gap, starting near the top of the sidebar (not centered on the hovered row), at a compact content height; moving the cursor from the category list into the flyout keeps it open (the 160ms bridge); leaving closes it. `node --check admin/ui/app.js` passes.

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas && git add admin/ui/app.js admin/ui/styles.css && git commit -m "feat(editor): library flyout attached flush to sidebar, top-aligned (un-float)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Make library cards drag sources + handle drops (parent side)

Wire the parent half of drag-to-preview: each card starts a native drag carrying its block type, tells the iframe to enter drop mode, and the parent inserts the block when the iframe reports a drop.

**Files:** Modify `admin/ui/app.js` — the card creation in `renderLibrary` (~line 3220), the `addEmptyBlock` function (~line 3536, add a preview refresh), and the visual-edit message handler (~line 5033, add `drop-block`)

- [ ] **Step 1: Add `dragstart`/`dragend` to library cards**

In `admin/ui/app.js`, inside `renderLibrary`'s `openFly`, find the card setup (lines ~3224–3229):

```javascript
      card.className = 'lib-card';
      card.setAttribute('draggable', 'true');             // hook for the drag-engine cycle
      card.setAttribute('data-block-type', type);
      card.innerHTML = '<div class="lib-shot">' + (BLOCK_PREVIEWS[type] || '') + '</div><div class="lib-name">' + schema.name + '</div>';
      card.addEventListener('click', () => { const after = afterBlockId; closeLibrary(); openCreationCard(type, after ? { insertAfter: after } : undefined); });
      fly.appendChild(card);
```

Replace it with (adds drag wiring; keeps click-to-add as a fallback):

```javascript
      card.className = 'lib-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-block-type', type);
      card.innerHTML = '<div class="lib-shot">' + (BLOCK_PREVIEWS[type] || '') + '</div><div class="lib-name">' + schema.name + '</div>';
      card.addEventListener('click', () => { const after = afterBlockId; closeLibrary(); openCreationCard(type, after ? { insertAfter: after } : undefined); });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-scrolly-block', type);
        e.dataTransfer.setData('text/plain', type); // some browsers require a text type
        beginPreviewDrag(type);
      });
      card.addEventListener('dragend', () => endPreviewDrag());
      fly.appendChild(card);
```

- [ ] **Step 2: Add the drag broadcast helpers**

Add these two functions in `admin/ui/app.js` immediately **after** the `closeLibrary` function (search for `function closeLibrary`). They tell the preview iframe to enter/exit drop mode:

```javascript
// Tell the preview iframe to show/clear the drop insertion UI during a library drag.
function beginPreviewDrag(blockType) {
  const iframe = document.getElementById('preview-frame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'visual-edit', action: 'lib-drag-start', blockType }, '*');
  }
}
function endPreviewDrag() {
  const iframe = document.getElementById('preview-frame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'visual-edit', action: 'lib-drag-end' }, '*');
  }
}
```

- [ ] **Step 3: Refresh the preview after inserting a block**

In `addEmptyBlock` (`admin/ui/app.js`, ~line 3536), find the tail of the function:

```javascript
  state.selectedBlockId = block.id;
  setDirty(true);
  renderBlockList();
  renderEditor();
}
```

Replace with (adds the preview refresh so a dropped/added block shows immediately):

```javascript
  state.selectedBlockId = block.id;
  setDirty(true);
  renderBlockList();
  renderEditor();
  refreshPreview();
}
```

- [ ] **Step 4: Handle the `drop-block` message from the preview**

In the visual-edit message handler (`admin/ui/app.js`, the `window.addEventListener('message', async (evt) => {` at ~line 5033; it early-returns unless `evt.data.type === 'visual-edit'` and destructures `action`), add this block immediately **after** the existing `if (action === 'insert-block') { … }` block (~line 5125):

```javascript
  // Drag-and-drop from the component library onto the preview
  if (action === 'drop-block') {
    const blockType = evt.data.blockType;
    const afterId = evt.data.afterBlockId || null;
    if (blockType) {
      closeLibrary();
      await addEmptyBlock(blockType, afterId);
    }
    return;
  }
```

- [ ] **Step 5: Verify (syntax + wiring presence)**

Run: `cd /Users/nihat/DevS/Thomas && node --check admin/ui/app.js && grep -n "beginPreviewDrag\|endPreviewDrag\|action === 'drop-block'" admin/ui/app.js`
Expected: clean syntax; `beginPreviewDrag` and `endPreviewDrag` each defined once and referenced in the card handlers; one `drop-block` handler. (Full behavior is verified after Task 5.)

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas && git add admin/ui/app.js && git commit -m "feat(editor): library cards are drag sources; parent inserts on preview drop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Drop mode in the preview runtime (insertion line + drop) — `js/render.js`

The iframe runtime draws a blue insertion line between blocks while a library drag is in progress and reports the chosen position on drop. This lives in `js/render.js` so it works whether or not visual-edit mode is on; it stays inert for normal site visitors (only activates after a `lib-drag-start` message, which only the admin sends).

**Files:** Modify `js/render.js` (append a self-contained IIFE near the bottom, after the existing `window.addEventListener('message', …)` at line 3386)

- [ ] **Step 1: Append the drop-mode controller**

Append this IIFE to the **end** of `js/render.js`:

```javascript
// ─────────────── Drag-to-insert from the editor's component library ───────────────
// Activated only by a postMessage from the admin parent ('lib-drag-start'); inert otherwise.
(function initLibraryDrop(){
  var dragging = false;
  var dragType = null;
  var line = null;
  var afterId = null; // id of the block the new one will be inserted AFTER (null = at very top)

  function ensureLine(){
    if (line) return line;
    line = document.createElement('div');
    line.id = 'scrolly-drop-line';
    line.style.cssText = 'position:fixed;left:0;right:0;height:3px;background:#2f6bd6;' +
      'box-shadow:0 0 0 4px rgba(47,107,214,.18);border-radius:2px;z-index:2147483646;' +
      'pointer-events:none;display:none;transition:top .06s linear;';
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:14px;top:-3.5px;width:10px;height:10px;' +
      'border-radius:50%;background:#2f6bd6;';
    line.appendChild(dot);
    document.body.appendChild(line);
    return line;
  }

  // Given a cursor Y (viewport coords), find the gap between blocks and return
  // { afterId, lineY }. afterId is null when inserting before the first block.
  function computeDrop(clientY){
    var blocks = Array.prototype.slice.call(document.querySelectorAll('#page-root > [data-block-id]'));
    if (!blocks.length) {
      var root = document.querySelector('#page-root');
      var rr = root ? root.getBoundingClientRect() : { top: 0 };
      return { afterId: null, lineY: rr.top };
    }
    for (var i = 0; i < blocks.length; i++) {
      var r = blocks[i].getBoundingClientRect();
      var mid = r.top + r.height / 2;
      if (clientY < mid) {
        return { afterId: i === 0 ? null : blocks[i - 1].getAttribute('data-block-id'), lineY: r.top };
      }
    }
    var last = blocks[blocks.length - 1].getBoundingClientRect();
    return { afterId: blocks[blocks.length - 1].getAttribute('data-block-id'), lineY: last.bottom };
  }

  function onDragOver(e){
    if (!dragging) return;
    e.preventDefault();                 // allow the drop
    e.dataTransfer.dropEffect = 'copy';
    var res = computeDrop(e.clientY);
    afterId = res.afterId;
    var l = ensureLine();
    l.style.display = 'block';
    l.style.top = Math.round(res.lineY) + 'px';
  }

  function onDrop(e){
    if (!dragging) return;
    e.preventDefault();
    var type = (e.dataTransfer.getData('application/x-scrolly-block') ||
                e.dataTransfer.getData('text/plain') || dragType);
    clear();
    if (type) {
      window.parent.postMessage({ type: 'visual-edit', action: 'drop-block', blockType: type, afterBlockId: afterId }, '*');
    }
  }

  function clear(){
    dragging = false; dragType = null; afterId = null;
    if (line) line.style.display = 'none';
  }

  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  // If the cursor leaves the document entirely, hide the line (drag may end outside).
  document.addEventListener('dragleave', function(e){ if (dragging && (e.clientX <= 0 || e.clientY <= 0)) { if (line) line.style.display = 'none'; } });

  window.addEventListener('message', function(e){
    if (!e.data || e.data.type !== 'visual-edit') return;
    if (e.data.action === 'lib-drag-start') { dragging = true; dragType = e.data.blockType || null; ensureLine(); }
    else if (e.data.action === 'lib-drag-end') { clear(); }
  });
})();
```

- [ ] **Step 2: Verify (syntax)**

Run: `cd /Users/nihat/DevS/Thomas && node --check js/render.js && grep -n "initLibraryDrop\|action === 'drop-block'\|scrolly-drop-line" js/render.js`
Expected: clean syntax; one `initLibraryDrop`, one `drop-block` post, the line element id present.

- [ ] **Step 3: Verify (browser, end-to-end)**

Reload `http://localhost:4400/admin/`, log in, open a page that has several blocks. Click **+ Add**, hover a category to reveal the cards, then **drag a card over the preview**. Expected:
- A **blue insertion line** follows the cursor, snapping to the gap between blocks.
- **Dropping** inserts that block at the line's position; the new block appears in the preview with its **default mock content** (e.g. a Quote shows "Type the quote here." / "Name"), is selected in the editor, and shows in the Sections list.
- The library closes on drop. Dragging and releasing **outside** the preview inserts nothing and clears the line.
- Normal (non-drag) preview interaction is unaffected.

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas && git add js/render.js && git commit -m "feat(preview): drag-to-insert drop mode — insertion line + drop-block message

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Sidebar** — narrower (~256px), docked left, solid white; toggle pill sits flush beside it; collapse/expand slides fully off-screen.
- [ ] **Step 2: No scrollbars** — sidebar, panes, Assets list, and modals show no scrollbars; trackpad scroll still works; toggling the sidebar causes no horizontal flicker.
- [ ] **Step 3: Library flyout** — opens **flush** to the sidebar (no gap), from near the top, compact height; hover bridge keeps it open; leaving closes it; clicking a card still adds the block (fallback path).
- [ ] **Step 4: Drag-to-preview** — dragging a card over the preview shows the blue insertion line; dropping inserts the block with mock-rich default content at that spot; the block is selected and listed; dropping outside inserts nothing.
- [ ] **Step 5: Regression** — editing a field still hot-swaps the preview; publish, page switch, autosave, and double-click rename all still work; no console errors.
- [ ] **Step 6: Proof** — screenshot the compact sidebar, the attached flyout, and a mid-drag insertion line. No commit.

---

## Self-Review Notes

- **Spec coverage:** compact sidebar → Task 1; no scrollbars/flicker → Task 2; flyout attached + top-start, not floating → Task 3; drag a component and drop on the preview with mock-rich content + insertion line → Tasks 4 (parent) + 5 (preview runtime). "Not same size on hover sidebar / start from up" → Task 3 Step 1 (top = sidebar top, content height). Out-of-scope ghost/reorder intentionally omitted.
- **Type/name consistency:** `beginPreviewDrag`/`endPreviewDrag` (Task 4) are called from the card handlers (Task 4 Step 1) and post `{type:'visual-edit', action:'lib-drag-start'|'lib-drag-end'}` consumed by `initLibraryDrop` (Task 5). The drop posts `{type:'visual-edit', action:'drop-block', blockType, afterBlockId}` consumed by the parent handler (Task 4 Step 4), which calls `addEmptyBlock(blockType, afterId)` (existing signature `addEmptyBlock(type, insertAfterId)`), which now calls `refreshPreview()` (Task 4 Step 3). `afterBlockId` semantics match `addEmptyBlock`'s `insertAfterId` (null ⇒ append; in render.js, null ⇒ insert before first block — note the slight asymmetry below).
- **Known soft spot (flagged for implementer):** dropping *above the first block* posts `afterBlockId: null`, and `addEmptyBlock(type, null)` **appends to the end** rather than inserting at the top. This is acceptable for v1 (rare case), but note it during Task 5 Step 3; if it feels wrong, a follow-up can add an `insertAtStart` path. Do **not** silently fake it.
- **Native-DnD-into-iframe risk:** same-origin iframes in Chromium (the user's Arc browser) deliver `dragover`/`drop` to the child document and allow `dataTransfer.getData` on drop — the approach is sound there. If a future browser misbehaves, the fallback is a parent overlay over the iframe computing positions from postMessaged rects; not implemented now (YAGNI).
- **No placeholders:** every code step contains the full code; verification steps use `node --check` + grep + explicit browser expectations (the codebase has no DOM test harness, consistent with prior plans).
