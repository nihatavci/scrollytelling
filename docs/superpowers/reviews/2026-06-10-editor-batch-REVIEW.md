---
phase: editor-batch
reviewed: 2026-06-10T15:07:50Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - admin/ui/app.js
  - admin/ui/index.html
  - admin/ui/styles.css
  - admin/ui/supabase-client.js
  - js/render.js
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Editor Batch Code Review

**Reviewed:** 2026-06-10T15:07:50Z
**Depth:** deep (cross-file: app.js ⇄ js/render.js postMessage protocol)
**Scope:** cumulative diff `057e927..HEAD` (25 commits)
**Files:** `admin/ui/app.js`, `admin/ui/index.html`, `admin/ui/styles.css`, `admin/ui/supabase-client.js`, `js/render.js`

## Summary

The batch is mostly well-built (consistent `escapeText`/`escapeAttr` use in the new
Pages/Assets panes, render.js drop handler correctly gated on a `dragging` flag, blob-URL
preview kept off the real origin). All three JS files pass `node --check`.

However, the autosave/data-loss rework introduced **two genuine data-loss / data-corruption
bugs in `loadPage`**: (1) the silently-restored local backup is immediately marked clean by a
following `setDirty(false)`, so the recovered work is never re-persisted and is lost on the
next reload; and (2) the backup is now restored **unconditionally** with no version/timestamp
comparison, so a stranded local backup can silently overwrite newer server content
(multi-tab / multi-device). These are the highest-value findings.

The drag-to-insert postMessage path is functional, but the **parent** handler accepts
`drop-block` (and the older `text-change`/`insert-block`/`image-pick`) with only a
`type === 'visual-edit'` check — no origin validation and no "is a library drag actually in
progress" guard — and `addEmptyBlock`/`defaultDataFor` accept an arbitrary unvalidated
`blockType`. render.js's side is correctly inert for normal visitors; the gap is parent-side.

## Critical Issues

### CR-01: Restored local backup is discarded by a following `setDirty(false)` — recovered work is lost

**File:** `admin/ui/app.js:2635-2643`
**Issue:** `loadPage` restores a local backup and calls `setDirty(true)` (line 2638, comment:
"re-persists on the autosave tick"), but four lines later line 2643 unconditionally calls
`setDirty(false)`. `runAutosave` (line 5586) early-returns when `!state.dirty`, so the restored
unsaved work is **never autosaved**. The stale backup also remains in localStorage (only
`runAutosave` clears it, line 5592), and the Publish button is disabled. The recovered doc lives
only in memory; the next reload re-reads the *server* doc (older) and the user silently loses the
work the recovery was supposed to save.
**Fix:** Do not clear the dirty flag when a backup was restored. Set it last, conditionally:

```js
const backup = getLocalBackup(id);
let restored = false;
if (backup && backup.doc /* && backup.version >= (state.doc.version||0) — see CR-02 */) {
  state.doc = backup.doc;
  restored = true;
}
state.selectedBlockId = null;
state.selectedItemIdx  = null;
setDirty(restored);   // keep dirty (→ schedules autosave) only when we recovered unsaved work
```

### CR-02: Backup restored unconditionally — stale local backup can silently overwrite newer server content

**File:** `admin/ui/app.js:2633-2639` (and `supabase-client.js:210-221`, `getPage`)
**Issue:** The previous logic compared `backup.ts > (state.doc._lastSaveTs || 0)` before
restoring. The new code restores **any** surviving backup with no comparison. `_lastSaveTs` is
never set anywhere (grep confirms zero writes), and `backup.version` is written
(`backupToLocal`, app.js:1993) but never read. The safety argument in the comment — "backups are
cleared on every successful autosave, so one existing here means it's unsaved work" — only holds
for a single tab on a single device. Failure modes that strand a backup and then clobber newer
server data:
  - Tab A autosaves and clears its backup; Tab B (older) still holds a backup and on next
    `loadPage` overwrites the server doc with B's stale content.
  - Autosave succeeds server-side but the tab is killed before `clearLocalBackup` runs
    (line 5592 is *after* the awaited save) → next load restores the now-stale backup.
  - Edits on device 1 are saved to the server; device 2 still has an old localStorage backup and
    silently reverts the page on open.
This is silent data corruption — the user gets no prompt and no indication the page rolled back.
**Fix:** Gate the restore on a freshness check using the version already on the backup and the
server doc, and/or only restore when the backup is strictly newer:

```js
const backup = getLocalBackup(id);
const serverVersion = state.doc.version || 0;
// Only recover when the backup is at least as new as the server doc.
if (backup && backup.doc && (backup.version || 0) >= serverVersion) {
  state.doc = backup.doc;
  restored = true;
} else if (backup) {
  clearLocalBackup(id); // server is newer — drop the stale backup so it can't reapply later
}
```
Version is monotonic only on publish; for autosave parity, also persist a server `updated_at`
into the doc on load and compare timestamps, or stamp `state.doc._lastSaveTs = Date.now()` inside
`runAutosave` success so the original `ts >` comparison can be restored.

## Warnings

### WR-01: `drop-block` (and sibling visual-edit actions) accepted with no origin or drag-state guard on the parent

**File:** `admin/ui/app.js:5094-5095, 5184-5191`
**Issue:** The parent `message` handler gates only on `evt.data.type === 'visual-edit'`. There is
no `evt.origin` check and — for `drop-block` — no check that a library drag is actually in
progress (render.js guards its side with `if (!dragging) return`, but the parent does not). Any
window able to `postMessage` to the admin window (an embedded/opener frame, a future
`window.open` of the admin) can inject `{type:'visual-edit',action:'drop-block',blockType:'…'}`
and mutate + autosave the document, or drive `text-change`/`insert-block`/`image-pick`. The blob
preview iframe has an opaque (`null`) origin, so a literal origin allow-list is awkward, but the
handler should at minimum require an in-progress library drag for `drop-block` and reject when
the document isn't loaded.
**Fix:** Track a parent-side `state._libDragging` flag (set in `beginPreviewDrag`, cleared in
`endPreviewDrag`) and require it in the `drop-block` branch; reject messages whose source isn't
the preview iframe's `contentWindow`:

```js
window.addEventListener('message', async (evt) => {
  const iframe = $('#preview-frame');
  if (iframe && evt.source !== iframe.contentWindow) return; // only trust our preview
  if (!evt.data || evt.data.type !== 'visual-edit') return;
  ...
  if (action === 'drop-block') {
    if (!state._libDragging) return;     // ignore drops not initiated by a real lib drag
    ...
  }
});
```

### WR-02: `addEmptyBlock` / `defaultDataFor` accept an unvalidated `blockType` from the drop message

**File:** `admin/ui/app.js:3568-3586, 3588 (default: return {})`, drop site `5188-5190`
**Issue:** `drop-block` forwards `evt.data.blockType` straight to `addEmptyBlock(blockType, …)`
with no allow-list check. `defaultDataFor` falls through to `return {}` for unknown types, so an
arbitrary string becomes a persisted block `{type:'<anything>', data:{}}` that is autosaved and
ignored by render.js, leaving junk in the document (and a permanent unrenderable block in the
Sections list). Combined with WR-01 this is the persisted-junk vector.
**Fix:** Validate against known types before inserting:

```js
if (action === 'drop-block') {
  const blockType = evt.data.blockType;
  if (!blockType || !BLOCK_SCHEMAS[blockType]) return;
  closeLibrary();
  await addEmptyBlock(blockType, evt.data.afterBlockId || null);
  return;
}
```
(Also add the guard inside `addEmptyBlock` itself for defense-in-depth.)

### WR-03: Inline-rename `commit` runs twice (Enter then blur) on a stale block closure

**File:** `admin/ui/app.js:2828-2855` (rename `dblclick` handler)
**Issue:** On Enter, `keydown` calls `commit(true)` which sets `contentEditable='false'` and calls
`renderBlockList()` (rebuilding the `<ol>` and detaching `nameEl`). Detaching/blurring the
focused editable then fires the `{once:true}` blur listener → `commit(true)` again. `commit` has
no re-entrancy guard (the `dataset.editing` flag is checked only in the *dblclick* opener, not in
`commit`). The second call reads `nameEl.textContent` of the detached node and calls
`renderBlockList()` a second time with a stale `block`/`schema` closure. Today it's idempotent, but
it's fragile and double-renders on every rename.
**Fix:** Guard `commit` against double execution:

```js
let done = false;
const commit = (save) => {
  if (done) return;
  done = true;
  nameEl.contentEditable = 'false';
  ...
};
```

### WR-04: Asset thumbnail injects `f.url` into a `style="background-image:url('…')"` via `encodeURI`, which leaves `'` unescaped

**File:** `admin/ui/app.js:2336`
**Issue:** `encodeURI(f.url)` is interpolated into an inline `style` attribute inside a
single-quoted CSS `url('…')`. `encodeURI` does **not** encode the single quote `'` (nor `(`/`)`),
so a URL or filename containing `'` breaks out of the CSS string — a CSS-injection sink. Today
`uploadFile` sanitizes `safeBase` to `[\w.-]` and host-generated public/signed URLs don't contain
`'`, so it's not currently exploitable, but legacy/hash-only files or files uploaded outside this
app (the bucket lists by `user.id` prefix) are not guaranteed safe, and the value reaches the DOM
unescaped.
**Fix:** Set the background via JS property instead of string concatenation, or `escapeAttr` and
percent-encode quotes:

```js
const thumb = document.createElement('div');
thumb.className = 'asset-thumb';
if (isImg) thumb.style.backgroundImage = `url("${f.url.replace(/"/g,'%22')}")`;
```

### WR-05: `#page-select` options interpolate page `title`/`slug` unescaped (self-XSS)

**File:** `admin/ui/app.js:2285`
**Issue:** `sel.innerHTML = pageRows.map(r => `<option value="${r.slug}">${r.title || r.slug}</option>`)`
inserts user-controlled `r.title` as text and `r.slug` into an attribute with no escaping. A page
titled `</option><img src=x onerror=…>` injects markup into the admin DOM. Pre-existing (line is
outside the diff) and RLS-scoped to the page owner, so it's self-XSS only — but the batch added a
parallel `renderPagesPane` that *does* escape correctly (`escapeText`, line 2306), making this the
inconsistent outlier. Flagged because the review explicitly targets innerHTML/title safety.
**Fix:** `escapeText(r.title || r.slug)` for the label and `escapeAttr(r.slug)` for the value.

### WR-06: Library flyout positioning throws / mispositions when the sidebar is collapsed or absent

**File:** `admin/ui/app.js:3232-3236`
**Issue:** `openFly` does `const sb = document.querySelector('.blocks.sidebar'); const sRect =
sb.getBoundingClientRect();` with no null check. If the markup ever lacks `.blocks.sidebar` this
throws. More realistically, when the sidebar is collapsed (`.is-collapsed`, see `initSidebarToggle`,
app.js:5708) the rect is zero-width/offscreen, so the flyout pins to a wrong/clipped position.
The library can still be opened via the FAB / insert-block flow while collapsed.
**Fix:** Guard the lookup and skip/relocate the flyout when the sidebar isn't visible:

```js
const sb = document.querySelector('.blocks.sidebar');
if (!sb) return;
const sRect = sb.getBoundingClientRect();
if (sRect.width === 0) return; // collapsed — don't open a detached flyout
```

## Info

### IN-01: `flushAutosave` does not wait for an in-flight save before switching pages

**File:** `admin/ui/app.js:2628`, `runAutosave:5586`
**Issue:** `loadPage` calls `await flushAutosave()`, but `runAutosave` early-returns immediately if
`_autosaving` is already true. So if a debounced save is mid-flight when the user switches pages,
`flushAutosave` resolves without waiting and `loadPage` proceeds to swap `state.doc`. The in-flight
save still targets the (correct) old `currentPageId`, so it's benign today, but the "flush before
switch" guarantee is weaker than it reads.
**Fix:** Have `runAutosave` return/await the in-flight promise instead of early-returning, or track
`_autosavePromise` and `await` it in `flushAutosave`.

### IN-02: `displayName` strip regex can over-strip when `safeBase` ends in 16 hex chars

**File:** `admin/ui/supabase-client.js:564`
**Issue:** `f.name.replace(/-[0-9a-f]{16}(\.[a-z0-9]+)$/i, '$1')` strips the *last* `-<16hex>`. A
stored key like `report-0123456789abcdef-<hash>.png` strips correctly, but if `safeBase` itself was
truncated/ended at a 16-hex run the display name can lose a real segment. Cosmetic only (display
name), but worth noting.
**Fix:** Anchor more tightly or store the original name in object metadata rather than reconstructing.

### IN-03: `categoryOf` is O(categories) per call and re-run for every block on every `renderBlockList`

**File:** `admin/ui/app.js:443-446, 2807`
**Issue:** Linear scan of `PALETTE_CATEGORIES` per block render. Not a correctness problem and
performance is out of v1 scope; noted only as a cheap memoization opportunity (build a
`type → CAT_META` map once at module load).

### IN-04: Dead/legacy wrappers retained

**File:** `admin/ui/app.js:3268-3270` (`renderPalette`, `renderPaletteWithInsert`), `startAutosave`
(5608, now a no-op), `clearLocalBackup` still referenced only by `runAutosave`/auth paths
**Issue:** Back-compat shims kept "for legacy callers, if any." A quick grep shows no remaining
callers of `renderPalette`/`renderPaletteWithInsert` except each other. Harmless but dead.
**Fix:** Remove once confirmed unreferenced.

### IN-05: render.js `dragleave` line-hide condition is heuristic and can flicker

**File:** `js/render.js:3550` (`dragleave` → `if (dragging && (e.clientX <= 0 || e.clientY <= 0))`)
**Issue:** Hides the insertion line only when the cursor hits the top/left viewport edge; leaving
via the right/bottom edge leaves the line visible until the next `dragover` or `lib-drag-end`.
Cosmetic; `lib-drag-end` ultimately clears it.

---

## Verdict

**CHANGES-REQUIRED**

CR-01 and CR-02 are real data-loss / silent-data-corruption defects in the core autosave path and
must be fixed before shipping. WR-01/WR-02 (parent-side postMessage trust + unvalidated blockType)
should be tightened in the same pass since they share the drag-to-insert surface. The remaining
warnings and info items are quality/robustness improvements.

---

_Reviewed: 2026-06-10T15:07:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
