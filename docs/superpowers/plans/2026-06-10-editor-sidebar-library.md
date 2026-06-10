# Editor Sidebar Shell + Component Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the editor's left rail into a left-docked Pages/Sections/Assets tabbed sidebar, and rebuild the component picker into a Framer-style category list + hover flyout of real-preview cards.

**Architecture:** The existing `aside.blocks` is already docked flush-left; we restructure its *contents* into a top tab strip (sliding indicator) with three panes — Pages, Sections (the existing block list), Assets (uploaded files via `SB.listFiles`). The palette modal's body is rebuilt to a two-column hover model reusing the real `BLOCK_PREVIEWS`. A reserved (empty) `#ai-slot` sits at the top for the later AI cycle. Icons come from a small inline-Lucide map keyed by category.

**Tech Stack:** Vanilla JS SPA, `window.SB` (Supabase), CSS in `admin/ui/styles.css`, DM Sans (`--font`). Dev server: `PORT=4400 npm run dev` → `http://localhost:4400/admin/` (your `:4000` is occupied). No DOM test harness — verify in the browser + `node --check`.

**Scope (from spec):** Shell + Library only. **Deferred:** drag-and-drop engine (ghost + insertion line) and the AI panel — cards get `draggable`/`data-block-type` hooks but clicking adds the block (current behavior). The `#ai-slot` stays empty this cycle.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `admin/ui/app.js` | controller | `CAT_META` (Lucide icons + tints) + `categoryOf(type)`; tab controller + sliding pill; `renderPagesPane` / `renderAssetsPane`; Sections row icons; rebuilt `renderLibrary()` (replaces palette body builders) |
| `admin/ui/index.html` | markup | restructure `aside.blocks` → tabbed sidebar (AI slot, tab strip, 3 panes); `#block-list` moves into Sections pane |
| `admin/ui/styles.css` | styles | sidebar/tab strip/sliding pill/panes; Lucide icon tints; pages rows; asset rows + badges; library flyout + cards |

Tasks are ordered foundational → dependent; each commits independently. Run `PORT=4400 npm run dev` once; reload between tasks. Log in to reach the editor.

---

## Task 1: Category icon + tint map (`CAT_META`, `categoryOf`)

A single source of truth for the 6 categories' Lucide icons + tint classes, plus a helper mapping any block type → its category. Reused by the Sections rows and the library.

**Files:** Modify `admin/ui/app.js` (add near `PALETTE_CATEGORIES`, ~line 447)

- [ ] **Step 1: Add `CAT_META` and `categoryOf` after `PALETTE_CATEGORIES`**

Find the closing `];` of `PALETTE_CATEGORIES` (~line 483) and the `PALETTE_BLOCKS` line right after it. Insert this immediately **after** `const PALETTE_BLOCKS = ...;`:

```javascript
// Category metadata — Lucide line icons (inline SVG) + tint class per category.
// Keyed by the PALETTE_CATEGORIES label. Reused by the Sections list and the library.
const CAT_META = {
  'Page Structure':      { key:'structure', tint:'ti-slate', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/></svg>' },
  'Text':                { key:'text', tint:'ti-org', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>' },
  'Scroll Animations':   { key:'scroll', tint:'ti-blu', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>' },
  'Images & Media':      { key:'media', tint:'ti-grn', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/></svg>' },
  'Data & Facts':        { key:'data', tint:'ti-amb', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' },
  'Immersive (WebGL)':   { key:'immersive', tint:'ti-vio', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>' },
  'Advanced effects (experimental)': { key:'advanced', tint:'ti-vio', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.2 6.3L21 11l-6.8 1.7L12 19l-2.2-6.3L3 11l6.8-1.7z"/></svg>' },
  'Embeds':              { key:'embeds', tint:'ti-slate', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-12"/><path d="m6 9-4 3 4 3"/><path d="m18 9 4 3-4 3"/></svg>' },
};
// Map a block type to its category metadata (falls back to a neutral icon).
function categoryOf(type) {
  const cat = PALETTE_CATEGORIES.find(c => c.types.includes(type));
  return (cat && CAT_META[cat.label]) || { key:'other', tint:'ti-slate', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>' };
}
```

- [ ] **Step 2: Add the tint classes to `admin/ui/styles.css`**

Append to the end of `admin/ui/styles.css`:

```css
/* ── Editor sidebar: shared Lucide icon tints ── */
.ti-slate{background:#e7eaf0;color:#5b6472}
.ti-org{background:#fbe4cf;color:#c2641f}
.ti-blu{background:#dde9ff;color:#2f6bd6}
.ti-grn{background:#d4efdf;color:#1d8a57}
.ti-amb{background:#fbeccb;color:#bf8a18}
.ti-vio{background:#e6dbff;color:#6a45cf}
.lucide-box{display:grid;place-items:center;border-radius:7px;flex:none}
.lucide-box svg{width:15px;height:15px}
```

- [ ] **Step 3: Verify**

Run: `node --check admin/ui/app.js && grep -n "function categoryOf" admin/ui/app.js`
Expected: clean syntax; one match. (No visible change yet.)

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(editor): category icon+tint map (CAT_META) and categoryOf helper"
```

---

## Task 2: Tabbed sidebar markup + base styles

Restructure the left aside into: reserved AI slot, tab strip, three panes. Keep `#block-list` (moved into the Sections pane) so existing block rendering keeps working.

**Files:** Modify `admin/ui/index.html:119-125`; Modify `admin/ui/styles.css`

- [ ] **Step 1: Replace the `aside.blocks` markup**

Replace lines `admin/ui/index.html:119-125` (the `<aside class="blocks">…</aside>` block) with:

```html
    <!-- Left sidebar: Pages · Sections · Assets -->
    <aside class="blocks sidebar">
      <!-- Reserved for the AI panel (Compose / Improve) — built in a later cycle -->
      <div id="ai-slot"></div>

      <div class="side-tabs" id="side-tabs">
        <div class="side-ind" id="side-ind"></div>
        <button class="side-tab on" data-pane="sections">Sections</button>
        <button class="side-tab" data-pane="pages">Pages</button>
        <button class="side-tab" data-pane="assets">Assets</button>
      </div>

      <div class="side-pane" data-pane="sections">
        <div class="aside-head">
          <span>Sections</span>
          <button id="btn-add-block" class="small" title="Add a section">+ Add</button>
        </div>
        <ol id="block-list" class="block-list"></ol>
      </div>

      <div class="side-pane" data-pane="pages" hidden>
        <div class="aside-head"><span>Pages</span><button id="side-new-page" class="small" title="New page">+ New</button></div>
        <div id="pages-pane" class="pane-body"></div>
      </div>

      <div class="side-pane" data-pane="assets" hidden>
        <div class="aside-head"><span>Assets</span><button id="side-upload" class="small" title="Upload a file">+ Upload</button></div>
        <div id="assets-pane" class="pane-body"></div>
      </div>
    </aside>
```

(Sections is the default tab so the editor still opens on the block list. `#btn-add-block` and `#block-list` keep their IDs, so existing handlers/rendering are unaffected.)

- [ ] **Step 2: Add sidebar/tab/pane styles**

Append to `admin/ui/styles.css`:

```css
/* ── Editor sidebar shell ── */
.sidebar { display:flex; flex-direction:column; }
.sidebar #ai-slot:empty { display:none; }   /* reserved for AI cycle */
.side-tabs { position:relative; display:flex; margin:10px; padding:4px; background:#f1f1f4; border-radius:11px; }
.side-ind { position:absolute; top:4px; bottom:4px; left:4px; width:96px; background:#fff; border-radius:8px;
  box-shadow:0 2px 6px rgba(20,20,40,.10), 0 0 0 .5px rgba(20,20,40,.04);
  transition:transform .30s cubic-bezier(.45,.05,.15,1), width .30s cubic-bezier(.45,.05,.15,1); }
.side-tab { position:relative; z-index:1; flex:1; border:none; background:none; padding:8px 4px;
  font:600 12.5px/1 var(--font); color:#9b9ba3; cursor:pointer; transition:color .2s; }
.side-tab.on { color:#16161d; }
.side-pane { flex:1; min-height:0; display:flex; flex-direction:column; animation:sidefade .26s cubic-bezier(.4,0,.2,1); }
.side-pane[hidden] { display:none; }
@keyframes sidefade { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
.pane-body { overflow:auto; padding:4px 8px 10px; }
```

- [ ] **Step 3: Verify markup loads**

Reload `http://localhost:4400/admin/`, log in. Expected: sidebar shows the tab strip (Sections active) above the block list; Pages/Assets tabs render but their bodies are empty (wired in later tasks). No console errors. `node --check` n/a (HTML/CSS).

- [ ] **Step 4: Commit**

```bash
git add admin/ui/index.html admin/ui/styles.css
git commit -m "feat(editor): tabbed sidebar shell (Sections/Pages/Assets) markup + styles"
```

---

## Task 3: Tab controller + sliding indicator

**Files:** Modify `admin/ui/app.js` (add after the existing block-list / sidebar setup; place near the `$('#btn-add-block')` handler — search for it)

- [ ] **Step 1: Add the tab controller**

Run `grep -n "getElementById('btn-add-block')\|#btn-add-block" admin/ui/app.js` to locate the add-block wiring, and add this block immediately after that handler (or anywhere at top level after DOM-dependent setup):

```javascript
// ── Sidebar tabs (Sections / Pages / Assets) ──
(function initSideTabs(){
  const tabs = document.getElementById('side-tabs');
  const ind = document.getElementById('side-ind');
  if (!tabs || !ind) return;
  function place(btn){ ind.style.width = btn.offsetWidth + 'px'; ind.style.transform = 'translateX(' + (btn.offsetLeft - 4) + 'px)'; }
  function show(name, btn){
    tabs.querySelectorAll('.side-tab').forEach(b => b.classList.toggle('on', b===btn));
    place(btn);
    document.querySelectorAll('.side-pane').forEach(p => { p.hidden = (p.getAttribute('data-pane') !== name); });
    if (name === 'pages' && typeof renderPagesPane === 'function') renderPagesPane();
    if (name === 'assets' && typeof renderAssetsPane === 'function') renderAssetsPane();
  }
  tabs.querySelectorAll('.side-tab').forEach(btn => btn.addEventListener('click', () => show(btn.getAttribute('data-pane'), btn)));
  requestAnimationFrame(() => place(tabs.querySelector('.side-tab.on')));
})();
```

- [ ] **Step 2: Verify**

Run: `node --check admin/ui/app.js`
Browser: reload, click the tabs. Expected: the white pill **glides** between Sections/Pages/Assets; the active pane shows (Pages/Assets still empty until next tasks); Sections still shows the block list.

- [ ] **Step 3: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(editor): sidebar tab controller with sliding indicator"
```

---

## Task 4: Pages pane

**Files:** Modify `admin/ui/app.js` (add `renderPagesPane`); Modify `admin/ui/styles.css`

- [ ] **Step 1: Add `renderPagesPane`**

Add at top level in `admin/ui/app.js` (near `loadPages`):

```javascript
function renderPagesPane(){
  const box = document.getElementById('pages-pane');
  if (!box) return;
  const rows = state.pageRows || [];
  const cur = document.getElementById('page-select') ? document.getElementById('page-select').value : null;
  box.innerHTML = '';
  rows.forEach(r => {
    const el = document.createElement('div');
    el.className = 'side-row' + (r.slug === cur ? ' active' : '');
    const home = r.slug === cur;
    el.innerHTML = '<span class="lucide-box ' + (home ? 'ti-blu' : 'ti-slate') + '">' +
      (home
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3.5l9 7.1"/><path d="M5 9.4V20h14V9.4"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h9l5 5v11H5z"/><path d="M14 4v6h5"/></svg>') +
      '</span><span class="side-row-name">' + escapeText(r.title || r.slug) + '</span>';
    el.addEventListener('click', () => { const sel = document.getElementById('page-select'); if (sel) { sel.value = r.slug; } loadPage(r.slug); renderPagesPane(); if (typeof updatePageTitleUI==='function') updatePageTitleUI(); });
    box.appendChild(el);
  });
  if (!rows.length) box.innerHTML = '<div class="side-empty">No pages yet.</div>';
}
```

- [ ] **Step 2: Wire the "+ New" button and keep the pane fresh**

Run `grep -n "getElementById('side-new-page')\|btn-new-page')" admin/ui/app.js`. Add after the tab controller (Task 3):

```javascript
document.getElementById('side-new-page')?.addEventListener('click', () => document.getElementById('btn-new-page')?.click());
```

- [ ] **Step 3: Add row styles**

Append to `admin/ui/styles.css`:

```css
/* sidebar generic rows */
.side-row { display:flex; align-items:center; gap:10px; padding:8px 9px; border-radius:9px; cursor:pointer;
  font:500 13px/1.2 var(--font); color:#33333b; transition:background .12s; }
.side-row:hover { background:#f6f6f9; }
.side-row.active { background:#eef1fe; color:#2440c4; font-weight:600; }
.side-row .lucide-box { width:24px; height:24px; }
.side-row-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.side-empty { padding:18px 10px; text-align:center; color:#b0b0b8; font:500 12.5px var(--font); }
```

- [ ] **Step 4: Verify**

Run: `node --check admin/ui/app.js`
Browser: open the **Pages** tab. Expected: your pages list with the current page highlighted (home icon); clicking another page switches to it and re-highlights; "+ New" opens the create-page modal.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(editor): Pages tab — list, switch, new"
```

---

## Task 5: Sections pane icons (category-tinted)

The block list already renders in the Sections pane (Task 2 moved it). Upgrade each row's icon to the category Lucide icon + tint, replacing the emoji.

**Files:** Modify `admin/ui/app.js:2747` & `2756` (inside `renderBlockList`)

- [ ] **Step 1: Swap the row icon to the category Lucide icon**

In `renderBlockList()` (`app.js:2736`), replace the icon line. Find:

```javascript
    const icon = BLOCK_ICONS[block.type] || '';
```
Replace with:
```javascript
    const cm = categoryOf(block.type);
```

Then find the header markup line:
```javascript
        <span class="block-icon">${icon}</span>
```
Replace with:
```javascript
        <span class="block-icon lucide-box ${cm.tint}">${cm.icon}</span>
```

- [ ] **Step 2: Style the block-list Lucide icon**

Append to `admin/ui/styles.css`:

```css
.block-item .block-icon.lucide-box { width:24px; height:24px; }
.block-item .block-icon.lucide-box svg { width:15px; height:15px; }
```

- [ ] **Step 3: Verify**

Run: `node --check admin/ui/app.js`
Browser: Sections tab. Expected: each block row shows a tinted Lucide icon matching its category (Hero/Outro slate, Text amber, Quote… etc.); selecting, reordering (drag), and "+ Add" still work.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(editor): Sections rows use category Lucide icons"
```

---

## Task 6: Assets pane

**Files:** Modify `admin/ui/app.js` (add `renderAssetsPane`); Modify `admin/ui/styles.css`

- [ ] **Step 1: Add `renderAssetsPane`**

Add at top level in `admin/ui/app.js`:

```javascript
function _assetKind(name){
  if (/\.(gif)$/i.test(name)) return ['GIF','b-gif'];
  if (/\.(mp4|webm|mov|m4v)$/i.test(name)) return ['VIDEO','b-vid'];
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) return ['AUDIO','b-aud'];
  if (/\.(png|jpe?g|webp|avif|svg)$/i.test(name)) return ['IMAGE','b-img'];
  return ['FILE','b-file'];
}
function _fmtSize(b){ return b > 1048576 ? (b/1048576).toFixed(1)+' MB' : b > 1024 ? Math.round(b/1024)+' KB' : (b||0)+' B'; }
async function renderAssetsPane(){
  const box = document.getElementById('assets-pane');
  if (!box) return;
  box.innerHTML = '<div class="side-empty">Loading…</div>';
  try {
    const { files } = await SB.listFiles('all');
    if (!files || !files.length) { box.innerHTML = '<div class="side-empty">No uploads yet.</div>'; return; }
    box.innerHTML = '';
    files.forEach(f => {
      const [badge, cls] = _assetKind(f.name);
      const isImg = badge === 'IMAGE' || badge === 'GIF';
      const row = document.createElement('div');
      row.className = 'asset-row';
      const thumb = isImg
        ? '<div class="asset-thumb" style="background-image:url(\'' + encodeURI(f.url) + '\')"></div>'
        : '<div class="asset-thumb asset-thumb--icon ' + cls + '">' + (badge==='VIDEO'?'▶':badge==='AUDIO'?'♪':'⎙') + '</div>';
      row.innerHTML = thumb +
        '<div class="asset-meta"><div class="asset-name">' + escapeText(f.name) + '</div><div class="asset-sub">' + _fmtSize(f.size) + '</div></div>' +
        '<span class="asset-badge ' + cls + '">' + badge + '</span>';
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<div class="side-empty">Couldn\'t load files.</div>';
  }
}
```

- [ ] **Step 2: Wire the Upload button**

Run `grep -n "uploadFile\|btn.*upload\|input type=\"file\"" admin/ui/app.js` to find the existing upload trigger. Add after the tab controller:

```javascript
document.getElementById('side-upload')?.addEventListener('click', () => {
  // Reuse the existing image picker / upload entry point.
  if (typeof openImagePicker === 'function') openImagePicker(() => renderAssetsPane());
});
```
(If `openImagePicker` is not the right entry, leave the button wired to it — it opens the existing media picker which includes upload; verify in Step 3 and adjust the called function name to the project's upload opener if needed.)

- [ ] **Step 3: Add asset styles**

Append to `admin/ui/styles.css`:

```css
/* assets list */
.asset-row { display:flex; align-items:center; gap:11px; padding:7px 9px; border-radius:9px; cursor:pointer; transition:background .12s; }
.asset-row:hover { background:#f6f6f9; }
.asset-thumb { width:40px; height:40px; border-radius:8px; flex:none; background:#ececef center/cover no-repeat; box-shadow:inset 0 0 0 1px rgba(20,20,40,.05); }
.asset-thumb--icon { display:grid; place-items:center; color:#fff; font-size:16px; }
.asset-thumb--icon.b-vid{background:#1c2433} .asset-thumb--icon.b-aud{background:#c63b73} .asset-thumb--icon.b-file{background:#8a8a93}
.asset-meta { min-width:0; flex:1; }
.asset-name { font:500 13px/1.2 var(--font); color:#26262e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.asset-sub { font:500 11px/1.3 var(--font); color:#a8a8b0; margin-top:2px; }
.asset-badge { font:700 8.5px/1 var(--font); letter-spacing:.07em; padding:3px 6px; border-radius:5px; flex:none; }
.b-img{background:#e6f0ff;color:#2f6bd6} .b-vid{background:#ffe9e9;color:#d4453f} .b-gif{background:#efe6ff;color:#6a3fd0} .b-aud{background:#fde6f0;color:#c63b73} .b-file{background:#eef0f3;color:#6b7280}
```

- [ ] **Step 4: Verify**

Run: `node --check admin/ui/app.js`
Browser: open the **Assets** tab. Expected: a list of your uploaded files, each with a thumbnail (images show the picture; video/audio/file show an icon tile), filename, size, and a correct type badge. Empty account shows "No uploads yet." Upload button opens the existing media picker.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(editor): Assets tab — file list with thumbnails and type badges"
```

---

## Task 7: Component library — category list + hover flyout

Replace the two near-duplicate palette builders with one `renderLibrary(body, afterBlockId)` that renders the category list + hover flyout of real-preview cards. Keep the modal trigger and the "insert after" behavior.

**Files:** Modify `admin/ui/app.js:3085-3161` (`renderPalette` + `renderPaletteWithInsert`); Modify `admin/ui/styles.css`

- [ ] **Step 1: Replace both palette functions with `renderLibrary`**

Replace `admin/ui/app.js:3085-3161` (from `function renderPalette(body) {` through the closing `}` of `renderPaletteWithInsert`) with:

```javascript
function renderLibrary(body, afterBlockId) {
  body.innerHTML = '';
  const dock = document.createElement('div');
  dock.className = 'lib-dock';
  const list = document.createElement('div');
  list.className = 'lib-list';
  const fly = document.createElement('div');
  fly.className = 'lib-flyout';
  fly.style.display = 'none';
  dock.appendChild(list); dock.appendChild(fly); body.appendChild(dock);

  PALETTE_CATEGORIES.forEach(cat => {
    const meta = CAT_META[cat.label] || categoryOf(cat.types[0]);
    const row = document.createElement('div');
    row.className = 'lib-cat';
    row.innerHTML = '<span class="lucide-box ' + meta.tint + '">' + meta.icon + '</span>' +
      '<span class="lib-cat-label">' + cat.label + '</span>' +
      '<span class="lib-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>';
    row.addEventListener('mouseenter', () => openFly(cat, row));
    list.appendChild(row);
  });

  function openFly(cat, row){
    list.querySelectorAll('.lib-cat').forEach(r => r.classList.toggle('on', r===row));
    fly.innerHTML = '';
    cat.types.forEach(type => {
      const schema = BLOCK_SCHEMAS[type];
      if (!schema) return;
      const card = document.createElement('div');
      card.className = 'lib-card';
      card.setAttribute('draggable', 'true');             // hook for the drag-engine cycle
      card.setAttribute('data-block-type', type);
      card.innerHTML = '<div class="lib-shot">' + (BLOCK_PREVIEWS[type] || '') + '</div><div class="lib-name">' + schema.name + '</div>';
      card.addEventListener('click', () => { closeModal(); openCreationCard(type, afterBlockId ? { insertAfter: afterBlockId } : undefined); });
      fly.appendChild(card);
    });
    fly.style.display = 'flex';
  }
  dock.addEventListener('mouseleave', () => { fly.style.display = 'none'; list.querySelectorAll('.lib-cat').forEach(r => r.classList.remove('on')); });
}
// Back-compat wrappers (existing callers pass body, or body+afterId)
function renderPalette(body) { renderLibrary(body); }
function renderPaletteWithInsert(body, afterBlockId) { renderLibrary(body, afterBlockId); }
```

(`openCreationCard(type)` with no opts must behave as before — confirm its signature treats a missing 2nd arg the same as the old `addBlock`. It does: `addBlock` calls `openCreationCard(type)`.)

- [ ] **Step 2: Add library styles**

Append to `admin/ui/styles.css`:

```css
/* ── Component library (palette modal body) ── */
.lib-dock { display:flex; align-items:flex-start; gap:10px; }
.lib-list { width:240px; flex:none; }
.lib-cat { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:9px; cursor:pointer; font:600 13.5px/1.2 var(--font); color:#3a3a42; }
.lib-cat:hover, .lib-cat.on { background:#f3f3f6; }
.lib-cat .lucide-box { width:28px; height:28px; }
.lib-cat .lucide-box svg { width:16px; height:16px; }
.lib-cat-label { flex:1; }
.lib-chev { color:#cdcdd5; } .lib-chev svg { width:15px; height:15px; }
.lib-flyout { width:262px; flex:none; display:flex; flex-direction:column; gap:10px; max-height:360px; overflow:auto;
  background:#fff; border:1px solid #ececef; border-radius:14px; box-shadow:0 14px 40px rgba(20,20,40,.14); padding:12px; }
.lib-card { border-radius:13px; padding:13px; cursor:grab; background:#f7f7f9; transition:transform .12s, box-shadow .12s; }
.lib-card:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(20,20,40,.12); }
.lib-card:active { cursor:grabbing; }
.lib-shot { background:#fff; border-radius:10px; padding:11px; box-shadow:0 3px 12px rgba(20,20,40,.07); overflow:hidden; }
.lib-name { text-align:center; font:600 12px/1 var(--font); margin-top:9px; color:#555; }
```

- [ ] **Step 3: Verify**

Run: `node --check admin/ui/app.js`
Browser: Sections tab → **+ Add**. Expected: the modal shows the category list on the left; **hovering** a category instantly opens a flyout of real-preview cards (your `BLOCK_PREVIEWS`, DM Sans); moving off the dock closes it; **clicking** a card adds that block to the page. Adding via a block's own "insert after" affordance still inserts in the right place.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js admin/ui/styles.css
git commit -m "feat(editor): component library — category list + hover flyout of real-preview cards"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Shell** — Sidebar is left-docked; tab pill slides between Sections/Pages/Assets; only the active pane shows; `#ai-slot` is empty (no stray UI).
- [ ] **Step 2: Pages** — lists pages, current highlighted, click switches, "+ New" opens create modal.
- [ ] **Step 3: Sections** — block rows show category Lucide icons; select/reorder/rename still work; "+ Add" opens the library.
- [ ] **Step 4: Assets** — lists files with thumbnail + size + correct badge (IMAGE/VIDEO/GIF/AUDIO/FILE); empty state when none.
- [ ] **Step 5: Library** — hover opens flyout instantly, leave closes; cards use real previews; click adds the block; insert-after still targets correctly.
- [ ] **Step 6: Regression** — edit a block, preview refresh, publish, and the top-bar title/switcher all still work.
- [ ] **Step 7: Proof** — screenshot the sidebar (each tab) and the library flyout. No commit.

---

## Self-Review Notes

- **Spec coverage:** docked tabbed sidebar → Tasks 2-3; Pages → Task 4; Sections (+icons) → Tasks 2/5; Assets list+badges → Task 6; library category-list + hover-flyout + real previews + draggable/data-block-type hooks → Task 7; reserved empty `#ai-slot` → Task 2. Deferred items (drag engine, AI panel) intentionally absent.
- **Type/name consistency:** `CAT_META` + `categoryOf` (Task 1) used by `renderBlockList` (Task 5) and `renderLibrary` (Task 7). `renderPagesPane`/`renderAssetsPane` defined in Tasks 4/6 and called (guarded) by the tab controller (Task 3). `.ti-*`/`.lucide-box` defined Task 1, used 4/5/7. `.side-row`/`.side-empty` defined Task 4, used by Pages (4) and reused conceptually by Assets' empty state. Library back-compat wrappers keep existing callers (`openModal('Add to your story', renderPalette)`, insert-after) working.
- **No placeholders:** every step has complete code; Steps that depend on an existing entry point (upload opener) instruct a grep + verify rather than guessing silently.
- **Known soft spots flagged for the implementer:** the Upload button reuses `openImagePicker` — if the project's upload entry differs, Task 6 Step 2 says to confirm and point it at the right opener.
