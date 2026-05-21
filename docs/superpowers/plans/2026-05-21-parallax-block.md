# Parallax Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Parallax` block type — a 100vh immersive section with 2-3 image layers that shift at different scroll speeds via CSS `animation-timeline: view()`, plus a headline/subtitle overlay with configurable tint.

**Architecture:** Pure CSS scroll-driven parallax (zero JS runtime). Three image layers (`background`, `midground`, `foreground`) rendered as absolutely positioned divs inside a 100vh section, each with a different `translate` keyframe range bound to `animation-timeline: view()`. Graceful fallback for Firefox via `@supports not`. Admin form uses existing `image_upload`, `text`, and `button_group` field kinds.

**Tech Stack:** Vanilla JS, CSS scroll-driven animations (`animation-timeline: view()`), existing `el()` DOM helper in render.js.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `admin/ui/styles.css` | Modify (append) | All `.parallax*` CSS: layout, animation keyframes, overlay, tint, fallback, mobile |
| `js/render.js` | Modify | `renderParallax()` function + registration in `BLOCK_RENDERERS` |
| `admin/ui/app.js` | Modify | `BLOCK_SCHEMAS.Parallax`, `BLOCK_ICONS`, `PALETTE_CATEGORIES`, `BLOCK_PREVIEWS`, `BLOCK_CREATION_CARDS` |
| `js/visual-edit.js` | Modify | `EDITABLE_MAP` entries for parallax layers and text overlay |

No new files. No new dependencies.

---

### Task 1: CSS — Parallax Styles

All visual rendering depends on these styles. Must land first.

**Files:**
- Modify: `admin/ui/styles.css` (append after line ~1732)

- [ ] **Step 1: Append parallax CSS to the end of styles.css**

Add the following block at the very end of `admin/ui/styles.css`:

```css
/* ═══════════════════════════════════════════════════════════
   Parallax block — CSS scroll-driven layered depth
   ═══════════════════════════════════════════════════════════ */
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

/* ── Scroll-driven animation per layer ── */
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

/* ── Text overlay ── */
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

/* ── Tint (scrim) variants ── */
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

.parallax--tint-light .parallax__headline {
  color: #111;
  text-shadow: 0 2px 20px rgba(255,255,255,0.4);
}
.parallax--tint-light .parallax__subtitle {
  color: rgba(0,0,0,0.85);
  text-shadow: 0 1px 10px rgba(255,255,255,0.3);
}

/* ── Graceful fallback for Firefox / older browsers ── */
@supports not (animation-timeline: view()) {
  .parallax__layer img {
    animation: none !important;
    translate: 0 0 !important;
    scale: 1 !important;
  }
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .parallax { height: 75vh; }
  .parallax__overlay { padding: 1.5rem; }
  .parallax__headline { font-size: clamp(1.5rem, 7vw, 2.5rem); }
  .parallax__subtitle { font-size: clamp(0.9rem, 3.5vw, 1.2rem); }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/ui/styles.css
git commit -m "feat(parallax): add CSS styles for layered depth parallax block"
```

---

### Task 2: Renderer — `renderParallax` in render.js

**Files:**
- Modify: `js/render.js`
  - Insert `renderParallax` function before the `BLOCK_RENDERERS` map (~line 1149)
  - Add `Parallax: renderParallax` entry to `BLOCK_RENDERERS` (~line 1173)

- [ ] **Step 1: Add `renderParallax` function**

Insert the following function in `js/render.js` immediately **before** the line `const BLOCK_RENDERERS = {` (line 1150). Place it after the closing `}` of `renderAudioPlayer` (line 1148):

```javascript

function renderParallax(d) {
  const tintCls = d.tint && d.tint !== 'none' ? ' parallax--tint-' + d.tint : ' parallax--tint-dark';
  const sec = el('section', { class: 'parallax' + tintCls });

  // Render layers — only if src is non-empty
  if (d.background && d.background.src) {
    sec.appendChild(
      el('div', { class: 'parallax__layer parallax__bg' }).appendChild(
        el('img', { src: d.background.src, alt: d.background.alt || '', loading: 'lazy' })
      ).parentNode
    );
  }
  if (d.midground && d.midground.src) {
    sec.appendChild(
      el('div', { class: 'parallax__layer parallax__mid' }).appendChild(
        el('img', { src: d.midground.src, alt: d.midground.alt || '', loading: 'lazy' })
      ).parentNode
    );
  }
  if (d.foreground && d.foreground.src) {
    sec.appendChild(
      el('div', { class: 'parallax__layer parallax__fg' }).appendChild(
        el('img', { src: d.foreground.src, alt: d.foreground.alt || '', loading: 'lazy' })
      ).parentNode
    );
  }

  // Text overlay — only if headline or subtitle present
  if (d.headline || d.subtitle) {
    var pos = d.overlayPosition || 'center';
    var overlay = el('div', { class: 'parallax__overlay parallax__overlay--' + pos });
    if (d.headline) overlay.appendChild(el('h2', { class: 'parallax__headline' }, d.headline));
    if (d.subtitle) overlay.appendChild(el('p', { class: 'parallax__subtitle' }, d.subtitle));
    sec.appendChild(overlay);
  }

  return sec;
}
```

**Important note on the `el()` helper**: The existing `el(tag, attrs, text)` function in this codebase (line 2485) creates elements with attrs and optional text content. For nesting, the pattern used here creates the child, appends it, then gets `.parentNode` back. Alternatively, build the layer wrapper and img separately:

```javascript
// Cleaner alternative if the appendChild().parentNode trick feels fragile:
if (d.background && d.background.src) {
  var bgLayer = el('div', { class: 'parallax__layer parallax__bg' });
  bgLayer.appendChild(el('img', { src: d.background.src, alt: d.background.alt || '', loading: 'lazy' }));
  sec.appendChild(bgLayer);
}
```

Use whichever pattern you prefer. The second is more readable and matches how `renderFullBleed` builds nested elements (see line 1906-1960 of render.js for reference).

- [ ] **Step 2: Register in BLOCK_RENDERERS**

In the `BLOCK_RENDERERS` object (line 1150-1173), add `Parallax: renderParallax` after the `AudioPlayer` line. The map currently ends with:

```javascript
  FullscreenImage: renderFullscreenImage,
  AudioPlayer:     renderAudioPlayer,
};
```

Change it to:

```javascript
  FullscreenImage: renderFullscreenImage,
  AudioPlayer:     renderAudioPlayer,
  Parallax:        renderParallax,
};
```

- [ ] **Step 3: Verify render works**

Create a test page JSON (or use the admin UI to add a Parallax block — Task 3) and verify the DOM output in browser DevTools:
- The `<section class="parallax parallax--tint-dark">` is present
- Layer `div.parallax__layer.parallax__bg` contains an `<img>` with the correct `src`
- Empty midground/foreground produce zero empty divs
- Text overlay `div.parallax__overlay` has correct position class and contains `<h2>` + `<p>`

- [ ] **Step 4: Commit**

```bash
git add js/render.js
git commit -m "feat(parallax): add renderParallax renderer and register in BLOCK_RENDERERS"
```

---

### Task 3: Admin — Schema, Icons, Palette, Preview, Creation Card

**Files:**
- Modify: `admin/ui/app.js`
  - `BLOCK_SCHEMAS` — add `Parallax` entry (after `FullscreenImage` at line ~146, in the "Immersive Moments" section)
  - `BLOCK_ICONS` — add `Parallax` entry (line ~335)
  - `PALETTE_CATEGORIES` — add `'Parallax'` to the 'Immersive Moments' category (line ~408)
  - `BLOCK_PREVIEWS` — add `Parallax` entry (after `FullscreenImage` at line ~624)
  - `BLOCK_CREATION_CARDS` — add `Parallax` entry (after `AudioPlayer` at line ~991)

- [ ] **Step 1: Add BLOCK_SCHEMAS.Parallax**

In `admin/ui/app.js`, find the `FullscreenImage` schema entry (line 128-146). After its closing `},` and before the `VideoEmbed` entry (line 147), insert:

```javascript
  Parallax: {
    name: 'Depth',
    description: 'Layered depth parallax — 2-3 images shift at different scroll speeds. Cinematic immersion for chapter openers.',
    fields: [
      { key: 'background', label: 'Background image (slowest)', kind: 'image', group: 'media' },
      { key: 'midground',  label: 'Midground image',            kind: 'image', group: 'media' },
      { key: 'foreground', label: 'Foreground image (fastest)',  kind: 'image', group: 'media' },
      { key: 'headline',   label: 'Headline',              kind: 'text', group: 'content' },
      { key: 'subtitle',   label: 'Subtitle',              kind: 'text', group: 'content' },
      { key: 'overlayPosition', label: 'Text position', kind: 'select', group: 'layout',
        options: ['center', 'bottom-left', 'bottom-center'] },
      { key: 'tint', label: 'Tint', kind: 'select', group: 'layout',
        options: ['dark', 'light', 'none'] },
    ]
  },
```

**Note on `kind: 'image'`**: The full editor uses `kind: 'image'` (not `'image_upload'`) — this is the existing pattern for image fields in BLOCK_SCHEMAS (see FullBleed line 116, FullscreenImage line 132). The `image_upload` kind is used in BLOCK_CREATION_CARDS only. The image fields here store `{ src, alt }` objects. The BLOCK_SCHEMAS editor handles this via the `renderEditor()` flow which renders `kind: 'image'` as an image upload + alt-text field pair.

**However**, if the existing `kind: 'image'` renders a flat string field (just the src URL), the parallax block's `background`/`midground`/`foreground` fields store **objects** `{ src: '', alt: '' }`. Check how other object-valued image fields work in the editor:

Looking at FullBleed (line 116): `{ key: 'mediaSrc', label: 'Image / poster', kind: 'image' }` — this stores a flat string. So our parallax fields also need flat keys. **Adjust the schema to use flat keys:**

```javascript
  Parallax: {
    name: 'Depth',
    description: 'Layered depth parallax — 2-3 images shift at different scroll speeds. Cinematic immersion for chapter openers.',
    fields: [
      { key: 'backgroundSrc', label: 'Background image (slowest)', kind: 'image', group: 'media' },
      { key: 'backgroundAlt', label: 'Background alt text',        kind: 'text', group: 'media', inline: true },
      { key: 'midgroundSrc',  label: 'Midground image',            kind: 'image', group: 'media' },
      { key: 'midgroundAlt',  label: 'Midground alt text',         kind: 'text', group: 'media', inline: true },
      { key: 'foregroundSrc', label: 'Foreground image (fastest)',  kind: 'image', group: 'media' },
      { key: 'foregroundAlt', label: 'Foreground alt text',        kind: 'text', group: 'media', inline: true },
      { key: 'headline',      label: 'Headline',                    kind: 'text', group: 'content' },
      { key: 'subtitle',      label: 'Subtitle',                    kind: 'text', group: 'content' },
      { key: 'overlayPosition', label: 'Text position', kind: 'select', group: 'layout',
        options: ['center', 'bottom-left', 'bottom-center'] },
      { key: 'tint', label: 'Tint', kind: 'select', group: 'layout',
        options: ['dark', 'light', 'none'] },
    ]
  },
```

**This means the renderer (Task 2) also needs to read flat keys**. Update `renderParallax` to use `d.backgroundSrc` / `d.backgroundAlt` instead of `d.background.src` / `d.background.alt`. See the corrected renderer in the **Addendum** at the bottom of this plan.

- [ ] **Step 2: Add BLOCK_ICONS.Parallax**

Find the `BLOCK_ICONS` object (line 328). Add `Parallax` after `AudioPlayer`:

```javascript
const BLOCK_ICONS = {
  Hero: '📰', VizPanel: '📊', Editorial: '✏️', Scrolly: '📜',
  Outro: '🎬', StatRow: '💥', Timeline: '⏳', Aside: '💡',
  ChapterDivider: '═', Quote: '🗣️', VideoEmbed: '🎞️',
  DataScrolly: '📈', FullBleed: '🎬', ImageCompare: '⚖️',
  ImageHotspot: '📍', AccordionBlock: '📂', ProgressNav: '📍',
  EmbedBlock: '🧩', ImageGrid: '🔍', Map2D: '🧭',
  FullscreenImage: '🖼', AudioPlayer: '🎵', Parallax: '🏔️',
};
```

(Just add `Parallax: '🏔️'` — the mountain emoji — at the end.)

- [ ] **Step 3: Add Parallax to PALETTE_CATEGORIES**

Find the 'Immersive Moments' category (line 406-409). Add `'Parallax'` to its `types` array:

```javascript
  {
    label: 'Immersive Moments',
    hint: 'Full-viewport scenes that stop the reader',
    types: ['FullBleed', 'FullscreenImage', 'VideoEmbed', 'AudioPlayer', 'Parallax'],
  },
```

- [ ] **Step 4: Add BLOCK_PREVIEWS.Parallax**

Find `BLOCK_PREVIEWS.FullscreenImage` (line 613-624). After its closing backtick + comma (line 624), insert:

```javascript
  Parallax: `
    <div style="border-radius:6px;height:70px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,#2d4a3e 0%,#1a2f28 100%);"></div>
      <div style="position:absolute;inset:-8px -4px;background:linear-gradient(135deg,#3d6a5e 0%,#2a4f38 100%);opacity:.5;transform:translateY(4px);"></div>
      <div style="position:absolute;inset:-12px -6px;background:linear-gradient(135deg,#5d8a7e 0%,#3a6f58 100%);opacity:.3;transform:translateY(8px);"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.5) 100%);z-index:2;"></div>
      <div style="position:absolute;bottom:8px;left:10px;right:10px;z-index:3;text-align:center;">
        <div style="font:700 13px 'DM Sans',sans-serif;color:#fff;line-height:1.1;letter-spacing:-.02em;">Layered Depth</div>
        <div style="font:400 6.5px 'DM Sans',sans-serif;color:rgba(255,255,255,.65);margin-top:3px;">3 images · CSS parallax · 60fps</div>
      </div>
    </div>`,
```

- [ ] **Step 5: Add BLOCK_CREATION_CARDS.Parallax**

Find `BLOCK_CREATION_CARDS.AudioPlayer` (line 981-991). After its closing `},`, insert:

```javascript

  Parallax: {
    headline: 'Parallax Depth',
    hint: '2-3 image layers that shift at different scroll speeds — cinematic depth effect',
    fields: [
      { key: 'backgroundSrc', label: 'Background image', kind: 'image_upload', required: true },
      { key: 'headline', label: 'Headline', kind: 'text', placeholder: 'Chapter title or dramatic statement' },
      { key: 'tint', label: 'Tint', kind: 'select',
        options: ['dark', 'light', 'none'], defaultValue: 'dark' },
    ],
  },
```

The creation card keeps it simple: just background image + headline + tint. Midground, foreground, subtitle, and position are configured in the full editor after creation.

- [ ] **Step 6: Verify admin UI works**

1. Open `scrollycms.pages.dev/admin` (or local dev server)
2. Click "+ Add" block
3. Verify "Parallax" appears in the "Immersive Moments" category with 🏔️ icon and the layered-depth preview mockup
4. Click it — creation card shows: background image upload, headline text field, tint dropdown
5. Fill in background image + headline → Create
6. Block appears in the block list
7. Click to edit — full editor shows all fields: 3 image uploads with alt text, headline, subtitle, position dropdown, tint dropdown

- [ ] **Step 7: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(parallax): add admin schema, creation card, palette entry, and preview mockup"
```

---

### Task 4: Visual Edit — EDITABLE_MAP entries

**Files:**
- Modify: `js/visual-edit.js`
  - Add parallax entries to `EDITABLE_MAP` (after ImageGrid entries at ~line 104, before VizPanel at line 105)

- [ ] **Step 1: Add EDITABLE_MAP entries for Parallax**

In `js/visual-edit.js`, find the `// VizPanel` comment (line 105). Insert the following **before** that line:

```javascript
    // Parallax
    '.parallax__bg img':        { field: 'backgroundSrc', type: 'image' },
    '.parallax__mid img':       { field: 'midgroundSrc',  type: 'image' },
    '.parallax__fg img':        { field: 'foregroundSrc', type: 'image' },
    '.parallax__headline':      { field: 'headline',      type: 'text' },
    '.parallax__subtitle':      { field: 'subtitle',      type: 'text' },
```

**Note**: The field names (`backgroundSrc`, `midgroundSrc`, `foregroundSrc`) must match the flat keys used in BLOCK_SCHEMAS and the renderer. When a user clicks a layer image in the preview, the visual edit overlay sends a message to the parent frame with `{ field: 'backgroundSrc', type: 'image' }` — the admin UI's image picker opens, uploads the image, and patches the block data at that key.

- [ ] **Step 2: Verify visual edit works**

1. Create a Parallax block with at least a background image and headline
2. Click "✏️ Edit" to enable visual edit mode
3. Hover over the background image in the preview — it should get a blue outline
4. Click the image — image picker should open
5. Hover over the headline text — it should get a blue outline
6. Click the headline — inline text editing should activate

- [ ] **Step 3: Commit**

```bash
git add js/visual-edit.js
git commit -m "feat(parallax): add visual-edit support for parallax layers and text overlay"
```

---

## Addendum: Corrected `renderParallax` (flat keys)

The spec's original design used nested objects (`d.background.src`), but the admin editor's `kind: 'image'` stores flat string values. The renderer must use flat keys to match. **Use this version in Task 2 instead:**

```javascript
function renderParallax(d) {
  var tintCls = d.tint && d.tint !== 'none' ? ' parallax--tint-' + d.tint : ' parallax--tint-dark';
  var sec = el('section', { class: 'parallax' + tintCls });

  // Render layers — only if src is non-empty
  if (d.backgroundSrc) {
    var bgLayer = el('div', { class: 'parallax__layer parallax__bg' });
    bgLayer.appendChild(el('img', { src: d.backgroundSrc, alt: d.backgroundAlt || '', loading: 'lazy' }));
    sec.appendChild(bgLayer);
  }
  if (d.midgroundSrc) {
    var midLayer = el('div', { class: 'parallax__layer parallax__mid' });
    midLayer.appendChild(el('img', { src: d.midgroundSrc, alt: d.midgroundAlt || '', loading: 'lazy' }));
    sec.appendChild(midLayer);
  }
  if (d.foregroundSrc) {
    var fgLayer = el('div', { class: 'parallax__layer parallax__fg' });
    fgLayer.appendChild(el('img', { src: d.foregroundSrc, alt: d.foregroundAlt || '', loading: 'lazy' }));
    sec.appendChild(fgLayer);
  }

  // Text overlay — only if headline or subtitle present
  if (d.headline || d.subtitle) {
    var pos = d.overlayPosition || 'center';
    var overlay = el('div', { class: 'parallax__overlay parallax__overlay--' + pos });
    if (d.headline) overlay.appendChild(el('h2', { class: 'parallax__headline' }, d.headline));
    if (d.subtitle) overlay.appendChild(el('p', { class: 'parallax__subtitle' }, d.subtitle));
    sec.appendChild(overlay);
  }

  return sec;
}
```

Key differences from the spec's nested version:
- `d.backgroundSrc` instead of `d.background.src`
- `d.backgroundAlt` instead of `d.background.alt`
- Same pattern for `midgroundSrc/Alt` and `foregroundSrc/Alt`
- Uses `var` (not `const`) to match the rest of render.js's function style

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Block schema with all fields — Task 3 Step 1 (adapted to flat keys for admin compat)
- ✅ Rendered DOM — Task 2 + Addendum
- ✅ CSS: layout, animation, overlay, tint, fallback, mobile — Task 1
- ✅ Admin editor form — Task 3 Step 1 (BLOCK_SCHEMAS)
- ✅ Creation card — Task 3 Step 5
- ✅ Visual edit — Task 4
- ✅ BLOCK_RENDERERS registration — Task 2 Step 2
- ✅ BLOCK_ICONS — Task 3 Step 2
- ✅ PALETTE_CATEGORIES — Task 3 Step 3
- ✅ BLOCK_PREVIEWS — Task 3 Step 4
- ✅ Browser fallback — Task 1 (CSS `@supports not`)
- ✅ Mobile responsive — Task 1 (CSS `@media`)

**Placeholder scan:** No TBD/TODO/placeholders found.

**Type consistency:**
- Field keys are consistent across all tasks: `backgroundSrc`, `backgroundAlt`, `midgroundSrc`, `midgroundAlt`, `foregroundSrc`, `foregroundAlt`, `headline`, `subtitle`, `overlayPosition`, `tint`
- CSS class names match between styles.css and render.js: `parallax`, `parallax--tint-dark`, `parallax__layer`, `parallax__bg`, `parallax__mid`, `parallax__fg`, `parallax__overlay`, `parallax__overlay--center`, `parallax__headline`, `parallax__subtitle`
- EDITABLE_MAP selectors match rendered DOM selectors
