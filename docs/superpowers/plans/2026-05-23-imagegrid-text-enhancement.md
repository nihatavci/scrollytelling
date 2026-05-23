# ImageGrid Text & Scroll-Fade Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing `ImageGrid` block to support per-item rich text (title, body, CTA) in grid mode, and a new `scroll-fade` mode where one column is sticky while the other cross-fades.

**Architecture:** Three layers — block-level defaults (`mode`, `textSide`, `stickyPanel`), per-item text content (`title`, `body`, `cta`), and per-item layout overrides (`textSide`, `fullWidth`). In `grid` mode, cells gain an optional side-by-side or stacked text panel. In `scroll-fade` mode, a new dedicated function `renderScrollFadeGrid` handles the sticky+cross-fade layout via `IntersectionObserver`. Fully backward-compatible — blocks with no new fields render identically to today.

**Tech Stack:** Vanilla JS DOM builder (`el()`), CSS custom properties, `IntersectionObserver` API, Node.js built-in test runner for the schema/AI rule tests.

---

## File Map

| File | Change |
|---|---|
| `js/render.js` | (A) ~25 lines of CSS after line 454 for grid-mode text panels; (B) updated `buildCell()` signature + body; (C) ~30 lines of CSS for scroll-fade mode; (D) new `renderScrollFadeGrid()` function (~80 lines) before `renderImageGrid()`; (E) one-line fork at top of `renderImageGrid()` |
| `functions/api/generate.js` | Updated `BLOCK_SCHEMAS.ImageGrid` description + example, extended `IMPROVE_RULES.ImageGrid` |

---

## Task 1 — Grid-mode text panel CSS

**Files:**
- Modify: `js/render.js` (insert ~25 lines after line 454)

- [ ] **Step 1: Insert the grid-mode text-panel CSS block**

  Open `js/render.js`. Find the exact anchor (the end of the `@media(max-width:600px)` ImageGrid block + the start of the FullBleed section):

  ```
    .ig-grid:not(.ig-mosaic):not(.ig-filmstrip) .ig-cell-media{aspect-ratio:auto}
  }

  /* ── FullBleed (viewport media + text overlay) ── */
  ```

  Replace with:

  ```
    .ig-grid:not(.ig-mosaic):not(.ig-filmstrip) .ig-cell-media{aspect-ratio:auto}
  }
  /* ── ImageGrid: text panels (grid mode) ── */
  .ig-cell--with-text{overflow:visible;flex-direction:row;align-items:stretch}
  .ig-cell--text-right{flex-direction:row}
  .ig-cell--text-left{flex-direction:row-reverse}
  .ig-cell--text-top{flex-direction:column-reverse}
  .ig-cell--text-bottom{flex-direction:column}
  .ig-cell--full-width{grid-column:1/-1!important}
  .ig-cell--with-text .ig-cell-media{flex:0 0 55%;min-height:0;aspect-ratio:unset!important}
  .ig-cell--with-text .ig-cell-media img{height:100%}
  .ig-cell--text-top .ig-cell-media,.ig-cell--text-bottom .ig-cell-media{flex:0 0 auto;aspect-ratio:16/9!important}
  .ig-text-panel{flex:1 1 45%;display:flex;flex-direction:column;justify-content:center;padding:1.5rem 1.75rem;gap:.75rem;min-width:0}
  .ig-text-title{font-family:var(--font-display);font-size:clamp(1.1rem,2vw,1.5rem);font-weight:600;color:var(--ink-black);line-height:1.2;margin:0;letter-spacing:-.02em}
  .ig-text-body{font-family:var(--font-body);font-size:.95rem;color:var(--graphite,#444);line-height:1.6;margin:0}
  .ig-text-cta{display:inline-block;font-family:var(--font-body);font-size:.85rem;font-weight:600;color:var(--ink-black);border:1.5px solid currentColor;padding:.45rem 1.1rem;border-radius:3px;text-decoration:none;transition:background .18s,color .18s;align-self:flex-start}
  .ig-text-cta:hover{background:var(--ink-black);color:#fff}
  @media(max-width:700px){
    .ig-cell--with-text,.ig-cell--text-left,.ig-cell--text-right{flex-direction:column!important}
    .ig-cell--with-text .ig-cell-media{flex:0 0 auto;aspect-ratio:16/9!important}
    .ig-text-panel{padding:1rem 1.25rem}
  }

  /* ── FullBleed (viewport media + text overlay) ── */
  ```

- [ ] **Step 2: Verify no syntax errors**

  Run: `node -e "require('./js/render.js')" 2>&1 | head -5`

  Expected: no output (or only unrelated warnings). Any `SyntaxError` means a typo crept in.

- [ ] **Step 3: Commit**

  ```bash
  git add js/render.js
  git commit -m "feat(ImageGrid): add grid-mode text panel CSS classes

  Adds .ig-cell--with-text, .ig-cell--text-{left,right,top,bottom},
  .ig-cell--full-width, .ig-text-panel, .ig-text-title, .ig-text-body,
  .ig-text-cta with responsive stacking at 700px."
  ```

---

## Task 2 — Update buildCell() and its call sites

**Files:**
- Modify: `js/render.js` (update `buildCell` function body, add `blockTextSide` variable, update 3 call sites)

- [ ] **Step 1: Replace the `buildCell` function definition**

  Find this exact block in `js/render.js` (lines ~2686-2721):

  ```js
    // Build cells — always creates an <img> (with placeholder fallback) so visual-edit can target it
    function buildCell(img, i) {
      const cell = el('div', { class: 'ig-cell' });
      const media = el('div', { class: 'ig-cell-media' });
      const src = img.src || img.url || '';

      if (src) {
        const imgEl = el('img', {
          class: 'ig-cell-img',
          src: src,
          alt: img.alt || img.caption || '',
          loading: i < 2 ? 'eager' : 'lazy',
        });
        imgEl.onerror = function() {
          this.style.display = 'none';
          media.classList.add('ig-cell-broken');
          media.insertAdjacentHTML('afterbegin', '<div class="ig-cell-ph">' + escapeHtml(img.alt || img.caption || 'Image') + '</div>');
        };
        media.appendChild(imgEl);
      } else {
        // Empty placeholder — visual-edit can bind click handler via .ig-cell img selector
        media.classList.add('ig-cell-broken');
        const ph = el('img', {
          class: 'ig-cell-img',
          src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#f0f0f0" width="400" height="300"/><text x="200" y="155" text-anchor="middle" font-family="system-ui" font-size="14" fill="#999">Image</text></svg>'),
          alt: img.alt || 'Image placeholder',
        });
        media.appendChild(ph);
      }
      cell.appendChild(media);

      if (img.caption) cell.appendChild(el('div', { class: 'ig-cell-cap' }, img.caption));
      if (img.credit) cell.appendChild(el('div', { class: 'ig-cell-credit' }, img.credit));
      if (img.description) cell.appendChild(el('div', { class: 'ig-cell-desc' }, img.description));

      return cell;
    }
  ```

  Replace with:

  ```js
    // Build cells — always creates an <img> (with placeholder fallback) so visual-edit can target it
    // blockTextSide: 'left'|'right'|'top'|'bottom'|'alternate' — block-level default, per-item img.textSide overrides
    function buildCell(img, i, blockTextSide) {
      const hasText = !!(img.title || img.body || img.cta);
      let textSide;
      if (img.textSide) {
        textSide = img.textSide;
      } else if (blockTextSide === 'alternate') {
        textSide = i % 2 === 0 ? 'right' : 'left';
      } else {
        textSide = blockTextSide || 'right';
      }
      const cellCls = ['ig-cell'];
      if (hasText) cellCls.push('ig-cell--with-text', 'ig-cell--text-' + textSide);
      if (img.fullWidth) cellCls.push('ig-cell--full-width');
      const cell = el('div', { class: cellCls.join(' ') });
      const media = el('div', { class: 'ig-cell-media' });
      const src = img.src || img.url || '';

      if (src) {
        const imgEl = el('img', {
          class: 'ig-cell-img',
          src: src,
          alt: img.alt || img.caption || '',
          loading: i < 2 ? 'eager' : 'lazy',
        });
        imgEl.onerror = function() {
          this.style.display = 'none';
          media.classList.add('ig-cell-broken');
          media.insertAdjacentHTML('afterbegin', '<div class="ig-cell-ph">' + escapeHtml(img.alt || img.caption || 'Image') + '</div>');
        };
        media.appendChild(imgEl);
      } else {
        // Empty placeholder — visual-edit can bind click handler via .ig-cell img selector
        media.classList.add('ig-cell-broken');
        const ph = el('img', {
          class: 'ig-cell-img',
          src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#f0f0f0" width="400" height="300"/><text x="200" y="155" text-anchor="middle" font-family="system-ui" font-size="14" fill="#999">Image</text></svg>'),
          alt: img.alt || 'Image placeholder',
        });
        media.appendChild(ph);
      }
      cell.appendChild(media);

      if (img.caption) cell.appendChild(el('div', { class: 'ig-cell-cap' }, img.caption));
      if (img.credit)  cell.appendChild(el('div', { class: 'ig-cell-credit' }, img.credit));
      if (img.description) cell.appendChild(el('div', { class: 'ig-cell-desc' }, img.description));

      if (hasText) {
        const panel = el('div', { class: 'ig-text-panel' });
        if (img.title) panel.appendChild(el('h3', { class: 'ig-text-title' }, img.title));
        if (img.body)  panel.appendChild(el('p',  { class: 'ig-text-body' }, img.body));
        if (img.cta)   panel.appendChild(el('a',  { class: 'ig-text-cta', href: img.cta.url || '#' }, img.cta.label || 'Read more'));
        cell.appendChild(panel);
      }

      return cell;
    }
  ```

- [ ] **Step 2: Add `blockTextSide` variable and update the three buildCell call sites**

  Find this block in `renderImageGrid` (lines ~2678-2733):

  ```js
    // hero-grid: first image is full-width, remaining in a sub-row
    const isHeroGrid = layout === 'hero-grid';
    const grid = el('div', { class: `ig-grid ${gridCls}` });

    if (layout === 'filmstrip') {
      grid.style.setProperty('--ig-film-count', n);
    }

    // Build cells — always creates an <img> (with placeholder fallback) so visual-edit can target it
    function buildCell(img, i, blockTextSide) {
  ```

  Replace with:

  ```js
    // hero-grid: first image is full-width, remaining in a sub-row
    const isHeroGrid = layout === 'hero-grid';
    const grid = el('div', { class: `ig-grid ${gridCls}` });

    if (layout === 'filmstrip') {
      grid.style.setProperty('--ig-film-count', n);
    }

    const blockTextSide = d.textSide || 'right';

    // Build cells — always creates an <img> (with placeholder fallback) so visual-edit can target it
    function buildCell(img, i, blockTextSide) {
  ```

- [ ] **Step 3: Update the hero-grid call sites**

  Find:

  ```js
    if (isHeroGrid && n > 1) {
      // First image as hero
      grid.appendChild(buildCell(images[0], 0));
      // Remaining images in a sub-row
      const row = el('div', { class: 'ig-grid ig-hero-grid-row' });
      row.style.setProperty('--ig-hero-cols', Math.min(n - 1, 4));
      for (let i = 1; i < n; i++) row.appendChild(buildCell(images[i], i));
      grid.appendChild(row);
    } else {
      images.forEach((img, i) => grid.appendChild(buildCell(img, i)));
    }
  ```

  Replace with:

  ```js
    if (isHeroGrid && n > 1) {
      // First image as hero
      grid.appendChild(buildCell(images[0], 0, blockTextSide));
      // Remaining images in a sub-row
      const row = el('div', { class: 'ig-grid ig-hero-grid-row' });
      row.style.setProperty('--ig-hero-cols', Math.min(n - 1, 4));
      for (let i = 1; i < n; i++) row.appendChild(buildCell(images[i], i, blockTextSide));
      grid.appendChild(row);
    } else {
      images.forEach((img, i) => grid.appendChild(buildCell(img, i, blockTextSide)));
    }
  ```

- [ ] **Step 4: Verify no syntax errors**

  Run: `node -e "require('./js/render.js')" 2>&1 | head -5`

  Expected: no output.

- [ ] **Step 5: Visual smoke test — open admin, add an ImageGrid block with text**

  Start the dev server: `npm run dev`

  In the admin, add an `ImageGrid` block with this JSON (or edit an existing one):
  ```json
  {
    "type": "ImageGrid",
    "textSide": "right",
    "images": [
      {
        "src": "https://picsum.photos/seed/a/800/600",
        "alt": "Test image",
        "title": "A Bold Heading",
        "body": "One or two sentences of editorial copy to confirm the text panel renders.",
        "cta": { "label": "Read more", "url": "#" }
      },
      {
        "src": "https://picsum.photos/seed/b/800/600",
        "alt": "Second image — no text, backward compat test"
      }
    ]
  }
  ```

  Expected:
  - Item 1: image (55% width) on the left, text panel on the right with heading + body + ghost button
  - Item 2: plain image cell, no text panel — **existing behaviour unchanged**

- [ ] **Step 6: Commit**

  ```bash
  git add js/render.js
  git commit -m "feat(ImageGrid): wire up text panels in grid mode

  buildCell() now accepts blockTextSide, resolves per-item textSide override
  and 'alternate' zig-zag. Text panel (h3+p+a) appended when title/body/cta
  present. fullWidth items get grid-column:1/-1. Backward compatible — cells
  without text fields render exactly as before."
  ```

---

## Task 3 — Scroll-fade mode CSS

**Files:**
- Modify: `js/render.js` (insert ~30 lines after the grid-mode text panel CSS block)

- [ ] **Step 1: Insert scroll-fade CSS**

  Find the end of the grid-mode text panel CSS block you inserted in Task 1:

  ```
  @media(max-width:700px){
    .ig-cell--with-text,.ig-cell--text-left,.ig-cell--text-right{flex-direction:column!important}
    .ig-cell--with-text .ig-cell-media{flex:0 0 auto;aspect-ratio:16/9!important}
    .ig-text-panel{padding:1rem 1.25rem}
  }

  /* ── FullBleed (viewport media + text overlay) ── */
  ```

  Replace with:

  ```
  @media(max-width:700px){
    .ig-cell--with-text,.ig-cell--text-left,.ig-cell--text-right{flex-direction:column!important}
    .ig-cell--with-text .ig-cell-media{flex:0 0 auto;aspect-ratio:16/9!important}
    .ig-text-panel{padding:1rem 1.25rem}
  }
  /* ── ImageGrid: scroll-fade mode ── */
  .ig--scroll-fade{display:grid;grid-template-columns:var(--ig-sf-col1,50%) var(--ig-sf-col2,50%);align-items:start;max-width:1100px;margin:4.5rem auto;padding:0 2rem;gap:0}
  .ig-sf-sticky{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden}
  .ig-sf-sticky-inner{position:relative;width:100%;height:100%}
  .ig-sf-media,.ig-sf-text-item{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(6px);transition:opacity .45s ease,transform .45s ease;pointer-events:none}
  .ig-sf-media.is-active,.ig-sf-text-item.is-active{opacity:1;transform:none;pointer-events:auto}
  .ig-sf-media img{width:100%;height:100%;object-fit:cover;border-radius:8px}
  .ig-sf-text-item{flex-direction:column;align-items:flex-start;justify-content:center;padding:2rem 3rem 2rem 2rem}
  .ig-sf-panels{display:flex;flex-direction:column}
  .ig-sf-panel{min-height:75vh;display:flex;align-items:center;padding:2rem 2rem 2rem 3rem}
  .ig-sf-panel.sf-media-panel{padding:2rem}
  .ig-sf-panel-card{opacity:0;transform:translateY(6px);transition:opacity .45s ease,transform .45s ease}
  .ig-sf-panel.is-active .ig-sf-panel-card{opacity:1;transform:none}
  .ig-sf-title{font-family:var(--font-display);font-size:clamp(1.3rem,2.5vw,2rem);font-weight:600;color:var(--ink-black);line-height:1.2;margin:0 0 .75rem;letter-spacing:-.02em}
  .ig-sf-body{font-family:var(--font-body);font-size:1rem;color:var(--graphite,#444);line-height:1.65;margin:0 0 1rem}
  .ig-sf-cta{display:inline-block;font-family:var(--font-body);font-size:.9rem;font-weight:600;color:var(--ink-black);border:1.5px solid currentColor;padding:.5rem 1.25rem;border-radius:3px;text-decoration:none;transition:background .18s,color .18s}
  .ig-sf-cta:hover{background:var(--ink-black);color:#fff}
  @media(max-width:700px){
    .ig--scroll-fade{grid-template-columns:1fr;grid-template-rows:auto auto}
    .ig-sf-sticky{position:relative;height:60vw;min-height:220px}
    .ig-sf-media,.ig-sf-text-item{position:relative;inset:auto;width:100%;height:auto;opacity:1!important;transform:none!important;transition:none}
    .ig-sf-media:not(.is-active),.ig-sf-text-item:not(.is-active){display:none}
    .ig-sf-panel{min-height:50vh;padding:1.5rem}
    .ig-sf-panel-card{opacity:1;transform:none;transition:none}
  }

  /* ── FullBleed (viewport media + text overlay) ── */
  ```

- [ ] **Step 2: Verify no syntax errors**

  Run: `node -e "require('./js/render.js')" 2>&1 | head -5`

  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  git add js/render.js
  git commit -m "feat(ImageGrid): add scroll-fade mode CSS

  Adds .ig--scroll-fade two-column grid, .ig-sf-sticky/sticky-inner,
  .ig-sf-media/.ig-sf-text-item cross-fade pairs, .ig-sf-panels/.ig-sf-panel
  scroll triggers with .ig-sf-panel-card, and all typography classes.
  Responsive: stacks to single column below 700px."
  ```

---

## Task 4 — renderScrollFadeGrid() function + mode fork

**Files:**
- Modify: `js/render.js` (insert `renderScrollFadeGrid` before `renderImageGrid`, add fork at top of `renderImageGrid`)

- [ ] **Step 1: Insert renderScrollFadeGrid() before renderImageGrid()**

  Find this exact line in `js/render.js`:

  ```js
  // ───────── ImageGrid (named layout presets) ─────────
  function renderImageGrid(d) {
  ```

  Replace with:

  ```js
  // ───────── ImageGrid scroll-fade mode ─────────
  function renderScrollFadeGrid(d) {
    const images = d.images || [];
    const stickyPanel = d.stickyPanel || 'media'; // 'media' → left col sticky, 'text' → left col sticky with text
    const imageSize = d.imageSize || 'medium';
    const sizeMap = { small: '35%', medium: '50%', large: '65%' };
    const mediaW = sizeMap[imageSize] || '50%';
    const textW = `${100 - parseFloat(mediaW)}%`;
    // col1 = sticky (left), col2 = scrolling panels (right)
    const col1W = stickyPanel === 'media' ? mediaW : textW;
    const col2W = stickyPanel === 'media' ? textW   : mediaW;

    const sec = el('section', { class: 'ig ig--scroll-fade' });
    sec.style.setProperty('--ig-sf-col1', col1W);
    sec.style.setProperty('--ig-sf-col2', col2W);

    if (d.title) sec.appendChild(el('h3', { class: 'ig-title' }, d.title));

    // Left column: sticky — all items absolutely layered, cross-fade on scroll
    const stickyCol  = el('div', { class: 'ig-sf-sticky' });
    const stickyInner = el('div', { class: 'ig-sf-sticky-inner' });
    stickyCol.appendChild(stickyInner);

    // Right column: scrolling panels — one panel per item is the scroll trigger
    const panelsCol = el('div', { class: 'ig-sf-panels' });

    images.forEach((img, i) => {
      const isFirst = i === 0;
      const src = img.src || img.url || '';

      if (stickyPanel === 'media') {
        // ── Sticky side: images ──
        const mediaDiv = el('div', {
          class: 'ig-sf-media' + (isFirst ? ' is-active' : ''),
          'data-sf-idx': i,
        });
        if (src) {
          mediaDiv.appendChild(el('img', {
            src,
            alt: img.alt || img.caption || '',
            loading: i < 2 ? 'eager' : 'lazy',
          }));
        }
        stickyInner.appendChild(mediaDiv);

        // ── Scrolling side: text panels ──
        const panel = el('div', {
          class: 'ig-sf-panel' + (isFirst ? ' is-active' : ''),
          'data-sf-idx': i,
        });
        const card = el('div', { class: 'ig-sf-panel-card' });
        if (img.title) card.appendChild(el('h3', { class: 'ig-sf-title' }, img.title));
        if (img.body)  card.appendChild(el('p',  { class: 'ig-sf-body' }, img.body));
        if (img.cta)   card.appendChild(el('a',  { class: 'ig-sf-cta', href: img.cta.url || '#' }, img.cta.label || 'Read more'));
        panel.appendChild(card);
        panelsCol.appendChild(panel);

      } else {
        // ── Sticky side: text ──
        const textItem = el('div', {
          class: 'ig-sf-text-item' + (isFirst ? ' is-active' : ''),
          'data-sf-idx': i,
        });
        if (img.title) textItem.appendChild(el('h3', { class: 'ig-sf-title' }, img.title));
        if (img.body)  textItem.appendChild(el('p',  { class: 'ig-sf-body' }, img.body));
        if (img.cta)   textItem.appendChild(el('a',  { class: 'ig-sf-cta', href: img.cta.url || '#' }, img.cta.label || 'Read more'));
        stickyInner.appendChild(textItem);

        // ── Scrolling side: images ──
        const panel = el('div', {
          class: 'ig-sf-panel sf-media-panel' + (isFirst ? ' is-active' : ''),
          'data-sf-idx': i,
        });
        const card = el('div', { class: 'ig-sf-panel-card' });
        if (src) {
          card.appendChild(el('img', {
            src,
            alt: img.alt || img.caption || '',
            loading: i < 2 ? 'eager' : 'lazy',
            style: 'width:100%;border-radius:8px;display:block',
          }));
        }
        if (img.caption) card.appendChild(el('div', { class: 'ig-cell-cap' }, img.caption));
        panel.appendChild(card);
        panelsCol.appendChild(panel);
      }
    });

    sec.appendChild(stickyCol);
    sec.appendChild(panelsCol);

    if (d.caption) sec.appendChild(el('p', { class: 'ig-caption' }, d.caption));
    if (d.credit)  sec.appendChild(el('p', { class: 'ig-credit' }, d.credit));

    // IntersectionObserver: when a panel enters the middle 50% of viewport, activate its sticky item
    requestAnimationFrame(() => {
      const stickyItems = stickyInner.querySelectorAll('[data-sf-idx]');
      const panels = panelsCol.querySelectorAll('.ig-sf-panel');

      const activate = (idx) => {
        stickyItems.forEach(el => el.classList.toggle('is-active', parseInt(el.dataset.sfIdx) === idx));
        panels.forEach(p => p.classList.toggle('is-active', parseInt(p.dataset.sfIdx) === idx));
      };

      const obs = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        // When multiple panels visible, activate the topmost one
        visible.sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        activate(parseInt(visible[0].target.dataset.sfIdx));
      }, { rootMargin: '-25% 0px -25% 0px', threshold: 0 });

      panels.forEach(p => obs.observe(p));
    });

    return sec;
  }

  // ───────── ImageGrid (named layout presets) ─────────
  function renderImageGrid(d) {
  ```

- [ ] **Step 2: Add the scroll-fade mode fork at the top of renderImageGrid()**

  Find this exact block at the start of `renderImageGrid`:

  ```js
  function renderImageGrid(d) {
    const PRESETS = ['side-by-side','feature-left','feature-right','triptych','quad','hero-grid','mosaic','filmstrip'];
  ```

  Replace with:

  ```js
  function renderImageGrid(d) {
    // Scroll-fade mode: two-column sticky+cross-fade layout — delegate entirely
    if ((d.mode || 'grid') === 'scroll-fade') return renderScrollFadeGrid(d);

    const PRESETS = ['side-by-side','feature-left','feature-right','triptych','quad','hero-grid','mosaic','filmstrip'];
  ```

- [ ] **Step 3: Verify no syntax errors**

  Run: `node -e "require('./js/render.js')" 2>&1 | head -5`

  Expected: no output.

- [ ] **Step 4: Visual smoke test — scroll-fade with stickyPanel "media"**

  In the admin, add an `ImageGrid` block with this JSON:
  ```json
  {
    "type": "ImageGrid",
    "mode": "scroll-fade",
    "stickyPanel": "media",
    "images": [
      {
        "src": "https://picsum.photos/seed/sf1/800/600",
        "alt": "First image",
        "title": "Chapter One",
        "body": "Scroll down to see the next section fade in while this image remains anchored.",
        "cta": { "label": "Explore", "url": "#" }
      },
      {
        "src": "https://picsum.photos/seed/sf2/800/600",
        "alt": "Second image",
        "title": "Chapter Two",
        "body": "A different image fades in on the left as you scroll past this text panel."
      },
      {
        "src": "https://picsum.photos/seed/sf3/800/600",
        "alt": "Third image",
        "title": "Chapter Three",
        "body": "Third image cross-fades in while the previous one fades out."
      }
    ]
  }
  ```

  Expected:
  - Two-column layout: image column on left (sticky, stays in viewport), text panels stacked on right
  - First panel visible on load: image #1 and text #1 both visible (opacity: 1)
  - Scroll down: text panel #2 enters the middle 50% → image #1 fades out, image #2 fades in; text card #2 fades in
  - Continue scrolling: same cross-fade for panel #3

- [ ] **Step 5: Visual smoke test — scroll-fade with stickyPanel "text"**

  Change `"stickyPanel": "media"` to `"stickyPanel": "text"` in the same block.

  Expected:
  - Text column on left (sticky), image panels stacked on right
  - Scroll down: each new image fades in on the right, text on the left updates

- [ ] **Step 6: Visual backward-compat test**

  Load any existing `ImageGrid` block with no `mode` field (e.g., the original site blocks). Expected: renders identically to before — the `(d.mode || 'grid') === 'scroll-fade'` check short-circuits only when mode is explicitly set.

- [ ] **Step 7: Commit**

  ```bash
  git add js/render.js
  git commit -m "feat(ImageGrid): add scroll-fade mode with sticky+cross-fade layout

  renderScrollFadeGrid(): two-column grid with one sticky col (all items
  layered absolutely, cross-fade via opacity) and one scrolling col (panels
  as IntersectionObserver triggers). stickyPanel:'media'|'text' controls
  which side is sticky. imageSize maps to column proportions (35/50/65%).
  renderImageGrid() forks to renderScrollFadeGrid when mode:'scroll-fade'."
  ```

---

## Task 5 — Update BLOCK_SCHEMAS and IMPROVE_RULES in generate.js

**Files:**
- Modify: `functions/api/generate.js`

- [ ] **Step 1: Replace the ImageGrid description string**

  Find this block (lines ~395-414):

  ```js
    description: `Smart image grid with auto-layout. Detects the number of images and picks the best grid arrangement automatically. Supports natural language layout hints.

  Fields:
  - layout (string): controls width and arrangement. Accepts natural language:
    - Width: "editorial" (narrow 720px), "wide" (1100px, default), "full" (edge-to-edge), "bleed" (beyond container)
    - Arrangement: "2 grid" (2 columns), "3 columns", "masonry", "row" (single horizontal strip), "stack" (vertical)
    - Or combine: "wide 3 grid", "bleed masonry", "editorial 2 columns"
    - If empty, auto-detects best layout from image count (1=hero, 2=side-by-side, 3=1big+2small, 4=2x2, 5=reuters, 6=3x2)
  - title (string, optional): heading above the grid
  - images (array): each image has:
    - src (string): image URL
    - alt (string): accessibility description
    - caption (string, optional): hover caption overlay
    - span (number, optional): set to 2 to make image span two columns
    - wide (boolean, optional): same as span:2
    - tall (boolean, optional): span two rows
  - caption (string, optional): overall caption below the grid
  - credit (string, optional): photo credit line

  The user may paste raw image URLs — put each URL as a src in the images array. Generate meaningful alt text and captions.`,
  ```

  Replace with:

  ```js
    description: `Smart image grid with auto-layout, optional per-item rich text, and a scroll-fade storytelling mode.

  Block-level fields:
  - layout (string): controls width and arrangement. Accepts natural language:
    - Width: "editorial" (narrow 720px), "wide" (1100px, default), "full" (edge-to-edge), "bleed" (beyond container)
    - Arrangement: "2 grid" (2 columns), "3 columns", "masonry", "row" (single horizontal strip), "stack" (vertical)
    - Or combine: "wide 3 grid", "bleed masonry", "editorial 2 columns"
    - If empty, auto-detects best layout from image count (1=hero, 2=side-by-side, 3=1big+2small, 4=2x2, 5=reuters, 6=3x2)
  - mode (string, optional): "grid" (default, static layout) | "scroll-fade" (sticky panel + cross-fade sequence)
  - textSide (string, optional): "right" (default) | "left" | "alternate" (zig-zag) — which side text panels appear in grid mode
  - stickyPanel (string, optional): "media" (default) | "text" — which column is sticky in scroll-fade mode
  - imageSize (string, optional): "small" (35%) | "medium" (50%, default) | "large" (65%) — column proportions in scroll-fade mode
  - title (string, optional): heading above the grid
  - caption (string, optional): overall caption below the grid
  - credit (string, optional): photo credit line

  Per-image fields in images[]:
  - src (string): image URL
  - alt (string): accessibility description
  - caption (string, optional): caption below image (grid mode)
  - title (string, optional): bold heading for this item's text panel
  - body (string, optional): 1–3 sentences of editorial text
  - cta (object, optional): { label: "Read more", url: "#" } — call-to-action button
  - textSide (string, optional): per-item override of block textSide — "left" | "right" | "top" | "bottom"
  - fullWidth (boolean, optional): span both grid columns — useful for editorial break items

  The user may paste raw image URLs — put each URL as a src in the images array. Generate meaningful alt text and captions.
  In scroll-fade mode every item should have title + body for the storytelling effect to work well.`,
  ```

- [ ] **Step 2: Replace the ImageGrid example**

  Find this block (lines ~384-394):

  ```js
    example: {
      layout: 'wide',
      title: '',
      images: [
        { src: 'https://example.com/photo1.jpg', alt: 'Newsroom in the 1920s', caption: 'The FAZ newsroom, circa 1924' },
        { src: 'https://example.com/photo2.jpg', alt: 'Modern digital newsroom', caption: 'A digital-first newsroom in 2024' },
        { src: 'https://example.com/photo3.jpg', alt: 'Printing press', caption: 'Rotary press at the Berliner Tageblatt' }
      ],
      caption: 'Photos: Bundesarchiv, DPA',
      credit: ''
    },
  ```

  Replace with:

  ```js
    example: {
      layout: 'wide',
      mode: 'scroll-fade',
      stickyPanel: 'media',
      title: 'A Century of Printing',
      images: [
        {
          src: 'https://example.com/photo1.jpg',
          alt: 'Newsroom in the 1920s',
          title: 'The Age of Lead Type',
          body: 'Before digital tools, compositors arranged individual metal characters by hand — a painstaking craft that defined journalism for a century.',
          cta: { label: 'Learn more', url: '#lead-type' },
        },
        {
          src: 'https://example.com/photo2.jpg',
          alt: 'Modern digital newsroom',
          title: 'The Digital Revolution',
          body: 'Desktop publishing transformed the newsroom overnight. What once took a team of specialists could now be done by a single editor.',
        },
        {
          src: 'https://example.com/photo3.jpg',
          alt: 'Printing press',
          title: 'Print Endures',
          body: 'Despite every prediction of its demise, the printed newspaper remains a daily ritual for millions.',
        },
      ],
      caption: 'Photos: Bundesarchiv, DPA',
      credit: '',
    },
  ```

- [ ] **Step 3: Extend IMPROVE_RULES.ImageGrid**

  Find:

  ```js
    ImageGrid: [
      '"make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)',
      '"bigger" or "wider" or "full width" → layout "bleed" or "full"',
      '"2 grid" or "3 columns" etc → set layout field accordingly',
      '"remove image 2" or "swap images" → modify images array',
      '"add caption" or "change credit" → update those fields',
      '"make the image half size" → layout "editorial" for narrow',
    ],
  ```

  Replace with:

  ```js
    ImageGrid: [
      '"make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)',
      '"bigger" or "wider" or "full width" → layout "bleed" or "full"',
      '"2 grid" or "3 columns" etc → set layout field accordingly',
      '"remove image 2" or "swap images" → modify images array',
      '"add caption" or "change credit" → update those fields',
      '"make the image half size" → layout "editorial" for narrow',
      '"add text to images" or "add descriptions" → add title + body to each item in images[]',
      '"scroll mode" or "make it scrolly" or "scroll-fade" → set mode:"scroll-fade", stickyPanel:"media", ensure every item has title+body',
      '"flip sticky" or "sticky text" → toggle stickyPanel between "media" and "text"',
      '"alternate" or "zig-zag" → set textSide:"alternate" on the block',
      '"text on left" → set textSide:"left" on the block',
      '"text on right" → set textSide:"right" on the block',
      '"grid mode" or "static layout" → set mode:"grid"',
    ],
  ```

- [ ] **Step 4: Verify generate.js has no syntax errors**

  Run: `node -e "require('./functions/api/generate.js')" 2>&1 | head -5`

  Expected: no output (the file is an ES module with `export` statements, so expect a syntax error about exports — that's fine; what matters is no JSON parse errors or obvious JS errors before the exports).

  Actually, because `generate.js` is an ES module (`export default`), the node check will throw on the export keyword. Use this instead:

  Run: `node --input-type=module --eval "import('./functions/api/generate.js').then(() => console.log('OK')).catch(e => console.error(e.message))" 2>&1 | head -5`

  Expected: `OK`

- [ ] **Step 5: Confirm IMPROVE_RULES edit is syntactically clean**

  Run: `node --test tests/*.test.js 2>&1 | tail -10`

  Expected: all tests still pass (the existing datascrolly and token-savings tests should not be broken by an ImageGrid schema change).

- [ ] **Step 6: Commit**

  ```bash
  git add functions/api/generate.js
  git commit -m "feat(generate): update ImageGrid schema for text+scroll-fade mode

  BLOCK_SCHEMAS.ImageGrid: new description documents mode, textSide,
  stickyPanel, imageSize block fields and per-item title/body/cta/textSide/
  fullWidth fields. Example updated to show scroll-fade with 3 items.
  IMPROVE_RULES.ImageGrid: 7 new rules for text, scroll mode, sticky flip,
  alternate zig-zag, and side switches."
  ```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `mode: "grid"` text panels (Task 1 CSS + Task 2 buildCell)
- ✅ `mode: "scroll-fade"` sticky+cross-fade (Task 3 CSS + Task 4 renderScrollFadeGrid)
- ✅ `textSide: "alternate"` zig-zag (Task 2 buildCell, alternate branch)
- ✅ `textSide: "left"|"right"|"top"|"bottom"` per-item override (Task 2 buildCell)
- ✅ `fullWidth: true` spans both columns (Task 1 `.ig-cell--full-width`, Task 2 cellCls push)
- ✅ `cta: { label, url }` ghost button (Task 2 + Task 4)
- ✅ `stickyPanel: "media"|"text"` (Task 4 renderScrollFadeGrid col1W/col2W swap)
- ✅ `imageSize` → column proportions in scroll-fade (Task 4 sizeMap)
- ✅ IntersectionObserver rootMargin `-25% 0px -25% 0px` (Task 4)
- ✅ Fade: `opacity 0→1, translateY(6px)→0, 0.45s ease` (Task 3 CSS)
- ✅ Backward compatibility: no new fields = original render (Task 2 `hasText` guard, Task 4 fork only on explicit `mode:scroll-fade`)
- ✅ AI schema + improve rules (Task 5)

**No placeholders:** All steps contain actual code or exact commands.

**Type consistency:** `data-sf-idx` attribute and `el.dataset.sfIdx` — `sfIdx` is the camelCase form of `sf-idx`. This is correct: `el.dataset.sfIdx` reads `data-sf-idx`. ✅
