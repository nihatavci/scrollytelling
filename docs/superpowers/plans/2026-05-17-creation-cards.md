# Tailor-Made Block Creation Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Claude AI modal for block creation with purpose-built creation forms — each of the 24 block types gets labeled upload zones, smart defaults, and fields that match what the component actually does.

**Architecture:** A new `BLOCK_CREATION_CARDS` object defines per-type creation forms (field lists, layouts, post-processors). A `renderCreationField()` function handles 11 field kinds (text, textarea, image_upload, audio_upload, select, button_group, range, toggle, number, repeater). `openCreationCard(type, opts)` renders the form in a modal. AI assistance is an expandable toggle that fills the same form fields via the existing `/api/generate` endpoint. The palette click handler changes from `openClaudeModal({ mode:'create' })` to `openCreationCard(type)`. The `openClaudeModal` `mode:'improve'` path stays untouched.

**Tech Stack:** Vanilla JS (no React). All code goes inside the existing IIFE in `admin/ui/app.js`. CSS in `admin/ui/styles.css`. Uploads via existing `SB.uploadFile()`.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `admin/ui/app.js` | Modify | Add `BLOCK_CREATION_CARDS`, `renderCreationField()`, `openCreationCard()`. Update palette click handlers. |
| `admin/ui/styles.css` | Modify | Add `.cc-*` creation card CSS classes. |
| `admin/ui/index.html` | Modify | Bump cache-bust version string. |

---

### Task 1: Add BLOCK_CREATION_CARDS definitions

All 24 block type creation card definitions. Inserted after line 767 (`};` closing `BLOCK_PREVIEWS`) and before line 769 (`const $ = ...`).

**Files:**
- Modify: `admin/ui/app.js:767` — insert after `BLOCK_PREVIEWS` closing brace

- [ ] **Step 1: Add BLOCK_CREATION_CARDS object**

Insert this block after line 767 (`};` that closes `BLOCK_PREVIEWS`) in `admin/ui/app.js`:

```javascript
// ─────────────────────────── Creation card definitions ──────
// Purpose-built creation forms per block type. Each card defines
// the fields shown when creating a NEW block of that type.
// Post-creation editing uses the full BLOCK_SCHEMAS via renderEditor().
const BLOCK_CREATION_CARDS = {

  // ── Opening & Structure ──────────────────────────────────────

  Hero: {
    headline: 'The Lede',
    hint: 'The opening scene — first thing your reader sees',
    fields: [
      { key: 'titleHtml', label: 'Headline', kind: 'text', required: true, placeholder: 'Your headline...' },
      { key: 'subtitle', label: 'Subtitle', kind: 'text', placeholder: 'A supporting line' },
      { key: 'brand', label: 'Brand line (small caps at top)', kind: 'text', placeholder: 'BRAND' },
      { key: 'lines', label: 'Intro lines (appear one by one before headline)', kind: 'repeater',
        itemFields: [{ key: 'value', label: 'Line', kind: 'text' }],
        flatten: true, // repeater stores string[] not object[]
      },
      { key: 'scrollCueText', label: 'Scroll cue text', kind: 'text', placeholder: 'Scroll', defaultValue: 'Scroll' },
    ],
  },

  ChapterDivider: {
    headline: 'Chapter Break',
    hint: 'Mark the start of a new section',
    fields: [
      { key: 'number', label: 'Chapter #', kind: 'text', placeholder: '01', inline: true },
      { key: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'Chapter title', inline: true },
      { key: 'subtitle', label: 'Subtitle', kind: 'text', placeholder: 'Optional subtitle' },
    ],
  },

  ProgressNav: {
    headline: 'Progress Navigation',
    hint: 'Section labels shown as progress dots',
    fields: [
      { key: 'sections', label: 'Section labels', kind: 'repeater', min: 2, max: 10,
        itemFields: [{ key: 'label', label: 'Section name', kind: 'text' }],
        defaults: [{ label: 'Introduction' }, { label: 'Evidence' }, { label: 'Conclusion' }],
      },
    ],
  },

  // ── The Narrative ────────────────────────────────────────────

  Editorial: {
    headline: 'Editorial Section',
    hint: 'Prose, headings, and images that tell your story',
    fields: [
      { key: '_kicker', label: 'Kicker (small caps above title)', kind: 'text', placeholder: 'THE EVIDENCE' },
      { key: '_heading', label: 'Section heading', kind: 'text', placeholder: 'Your heading...' },
      { key: '_body', label: 'Paste or write your text', kind: 'textarea', rows: 8,
        hint: 'Each blank line starts a new paragraph.' },
    ],
    postProcess(data) {
      const content = [];
      if (data._kicker) content.push({ kind: 'kicker', text: data._kicker });
      if (data._heading) content.push({ kind: 'h2', text: data._heading });
      const body = (data._body || '').trim();
      if (body) {
        body.split(/\n\s*\n/).forEach(p => {
          const trimmed = p.trim();
          if (trimmed) content.push({ kind: 'p', html: trimmed });
        });
      }
      if (content.length === 0) content.push({ kind: 'h2', text: 'New section' }, { kind: 'p', html: 'New paragraph.' });
      return { content };
    },
  },

  Scrolly: {
    headline: 'Scroll Story',
    hint: 'Images that change as the reader scrolls through your narrative',
    fields: [
      { key: 'imageSize', label: 'Image size', kind: 'select', options: ['small', 'medium', 'large'], defaultValue: 'medium', inline: true },
      { key: 'imageHeight', label: 'Image height', kind: 'text', defaultValue: '80vh', inline: true },
      { key: 'steps', label: 'Scroll steps', kind: 'repeater', min: 1, max: 10,
        itemFields: [
          { key: 'badgeKind', label: 'Badge', kind: 'select', options: ['pyramid', 'data', 'explain', 'future', 'voice'] },
          { key: 'imageSrc', label: 'Step image', kind: 'image_upload' },
          { key: 'body', label: 'Step text', kind: 'textarea', rows: 3 },
        ],
        defaults: [
          { stepIndex: 0, badgeKind: 'pyramid', badgeLabel: 'Step 1', imageSrc: '', body: '' },
          { stepIndex: 1, badgeKind: 'data',    badgeLabel: 'Step 2', imageSrc: '', body: '' },
        ],
      },
    ],
    postProcess(data) {
      const id = 'scrolly-' + Math.random().toString(36).slice(2, 7);
      const steps = (data.steps || []).map((s, i) => ({
        stepIndex: i,
        badgeKind: s.badgeKind || 'pyramid',
        badgeLabel: s.badgeLabel || `Step ${i + 1}`,
        imageSrc: s.imageSrc || '',
        body: s.body || '',
      }));
      return {
        scrollyId: id,
        stepsId: 'steps-' + id.slice(8),
        imageSize: data.imageSize || 'medium',
        imageHeight: data.imageHeight || '80vh',
        imageRadius: '12px',
        maxWidth: '1400px',
        steps,
      };
    },
  },

  DataScrolly: {
    headline: 'Data Story',
    hint: 'A chart that transforms as readers scroll through your argument',
    fields: [
      { key: 'title', label: 'Chart title', kind: 'text', required: true, placeholder: 'What does this chart show?' },
      { key: 'source', label: 'Data source', kind: 'text', placeholder: 'e.g., World Bank 2024' },
      { key: '_chartKind', label: 'Chart type', kind: 'button_group', options: [
        { value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'area', label: 'Area' },
      ], defaultValue: 'bar' },
      { key: '_csvData', label: 'Data (one entry per line: Label, Value)', kind: 'textarea', rows: 5,
        placeholder: 'Germany, 83\nFrance, 67\nSpain, 47' },
      { key: 'steps', label: 'Story steps', kind: 'repeater', min: 1,
        itemFields: [
          { key: 'body', label: 'Step narration', kind: 'textarea', rows: 2 },
        ],
        defaults: [{ badgeKind: 'data', badgeLabel: 'Step 1', body: '', vizState: {} }],
      },
    ],
    postProcess(data) {
      // Parse CSV into chart data
      const lines = (data._csvData || '').trim().split('\n').filter(l => l.trim());
      const chartData = lines.map(line => {
        const parts = line.split(',').map(s => s.trim());
        const label = parts[0] || '';
        const val = parseFloat(parts[1]) || 0;
        return { label, value: val };
      });
      if (chartData.length === 0) chartData.push({ label: 'A', value: 10 }, { label: 'B', value: 20 });
      const steps = (data.steps || []).map((s, i) => ({
        badgeKind: s.badgeKind || 'data',
        badgeLabel: s.badgeLabel || `Step ${i + 1}`,
        body: s.body || '',
        vizState: s.vizState || {},
      }));
      return {
        title: data.title || 'Chart',
        subtitle: data.subtitle || '',
        source: data.source || '',
        chartSpec: {
          kind: data._chartKind || 'bar',
          data: chartData,
          xField: 'label',
          yField: 'value',
          xLabel: '',
          yLabel: '',
        },
        steps,
      };
    },
  },

  // ── Immersive Moments ────────────────────────────────────────

  FullBleed: {
    headline: 'Full Bleed Scene',
    hint: 'Edge-to-edge image or video with text overlay',
    fields: [
      { key: 'mediaSrc', label: 'Background image (or video)', kind: 'image_upload', required: true, accept: 'image/*,video/*' },
      { key: 'kicker', label: 'Kicker', kind: 'text', placeholder: 'CHAPTER BREAK' },
      { key: 'title', label: 'Title overlay', kind: 'text', placeholder: 'A powerful statement' },
      { key: 'textPosition', label: 'Text position', kind: 'select',
        options: ['top-left', 'center', 'bottom-left', 'bottom-right'], defaultValue: 'center' },
      { key: 'overlayOpacity', label: 'Darken overlay', kind: 'range', min: 0, max: 100, defaultValue: 60, unit: '%' },
    ],
    postProcess(data) {
      return {
        mediaSrc: data.mediaSrc || '', kicker: data.kicker || '', title: data.title || '',
        textPosition: data.textPosition || 'center', overlayOpacity: (data.overlayOpacity ?? 60) / 100,
      };
    },
  },

  FullscreenImage: {
    headline: 'Fullscreen Image',
    hint: 'A single powerful image that fills the viewport',
    fields: [
      { key: 'imageSrc', label: 'Hero image', kind: 'image_upload', required: true },
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'caption', label: 'Caption', kind: 'text' },
      { key: 'credit', label: 'Photo credit', kind: 'text' },
      { key: 'overlayPosition', label: 'Text position', kind: 'select',
        options: ['bottom-left', 'bottom-center', 'bottom-right', 'center'], defaultValue: 'bottom-left' },
    ],
  },

  VideoEmbed: {
    headline: 'Video',
    hint: 'Embed a YouTube, Vimeo, or other video',
    fields: [
      { key: 'url', label: 'Video URL', kind: 'text', required: true, placeholder: 'https://youtube.com/watch?v=...' },
      { key: 'caption', label: 'Caption', kind: 'text' },
      { key: 'credit', label: 'Credit', kind: 'text' },
    ],
  },

  AudioPlayer: {
    headline: 'Audio Player',
    hint: 'Podcast episode, interview clip, or ambient sound',
    fields: [
      { key: 'audioSrc', label: 'Audio file', kind: 'audio_upload', required: true, hint: 'MP3, WAV, OGG, M4A' },
      { key: 'title', label: 'Show / Episode title', kind: 'text', placeholder: 'Episode title' },
      { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
      { key: 'coverSrc', label: 'Cover art', kind: 'image_upload' },
      { key: 'subtitle', label: 'Speaker name', kind: 'text' },
    ],
  },

  // ── Evidence & Proof ─────────────────────────────────────────

  ImageCompare: {
    headline: 'Before & After',
    hint: 'Two images with a slider to compare',
    layout: 'side-by-side-uploads',
    fields: [
      { key: 'beforeSrc', label: 'Before image', kind: 'image_upload', required: true },
      { key: 'afterSrc', label: 'After image', kind: 'image_upload', required: true },
      { key: 'beforeLabel', label: 'Before label', kind: 'text', placeholder: 'e.g., 2019', inline: true },
      { key: 'afterLabel', label: 'After label', kind: 'text', placeholder: 'e.g., 2024', inline: true },
      { key: 'caption', label: 'Caption', kind: 'text' },
    ],
  },

  ImageHotspot: {
    headline: 'Annotated Image',
    hint: 'An image with clickable pins that reveal details',
    fields: [
      { key: 'imageSrc', label: 'Image to annotate', kind: 'image_upload', required: true },
      { key: 'hotspots', label: 'Hotspot pins', kind: 'repeater',
        hint: 'Fine-tune pin positions after creation by editing the block',
        itemFields: [
          { key: 'label', label: 'Pin label', kind: 'text', inline: true },
          { key: 'description', label: 'Detail text', kind: 'textarea', rows: 2 },
          { key: 'x', label: 'X %', kind: 'number', min: 0, max: 100, defaultValue: 50, inline: true },
          { key: 'y', label: 'Y %', kind: 'number', min: 0, max: 100, defaultValue: 50, inline: true },
        ],
        defaults: [{ label: '', description: '', x: 50, y: 50 }],
      },
    ],
  },

  ImageGrid: {
    headline: 'Image Grid',
    hint: 'Multiple images in a grid layout',
    fields: [
      { key: '_layout', label: 'Layout', kind: 'button_group', options: [
        { value: '2', label: '2 side-by-side' }, { value: '4', label: '2×2 grid' }, { value: '3', label: '3 across' },
      ], defaultValue: '2' },
      { key: 'cells', label: 'Images', kind: 'repeater', min: 2, max: 6, dynamicCount: '_layout',
        itemFields: [
          { key: 'src', label: 'Image', kind: 'image_upload' },
          { key: 'caption', label: 'Caption', kind: 'text' },
        ],
        defaults: [{ src: '', caption: '' }, { src: '', caption: '' }],
      },
      { key: 'caption', label: 'Grid caption', kind: 'text' },
    ],
    postProcess(data) {
      const count = parseInt(data._layout) || 2;
      const cells = (data.cells || []).slice(0, count).map(c => ({
        src: c.src || '', alt: c.caption || '', caption: c.caption || '',
      }));
      while (cells.length < count) cells.push({ src: '', alt: '', caption: '' });
      return { columns: count <= 2 ? 2 : count, cells, caption: data.caption || '' };
    },
  },

  EmbedBlock: {
    headline: 'Embed',
    hint: 'Datawrapper, Flourish, social posts, or any iframe',
    fields: [
      { key: 'embedCode', label: 'Paste URL or embed code', kind: 'textarea', rows: 3, required: true,
        placeholder: 'https://... or <iframe>...</iframe>',
        hint: 'Supports Datawrapper, Flourish, Twitter/X, Instagram, Spotify' },
      { key: 'caption', label: 'Caption', kind: 'text' },
    ],
  },

  // ── Voices & Data ────────────────────────────────────────────

  Quote: {
    headline: 'Quote',
    hint: 'A voice in your story — testimony, expert opinion, or reaction',
    fields: [
      { key: 'text', label: 'Quote text', kind: 'textarea', rows: 4, required: true, placeholder: '"Type the quote here..."' },
      { key: 'attribution', label: 'Name', kind: 'text', required: true, placeholder: 'Who said this?', inline: true },
      { key: 'role', label: 'Role / title', kind: 'text', placeholder: 'e.g., Editor-in-chief', inline: true },
      { key: 'portraitSrc', label: 'Portrait photo', kind: 'image_upload' },
      { key: 'sourceUrl', label: 'Source URL', kind: 'text', inline: true },
      { key: 'sourceLabel', label: 'Source name', kind: 'text', inline: true },
    ],
  },

  StatRow: {
    headline: 'Key Numbers',
    hint: '2–5 statistics that anchor your argument',
    layout: 'stat-cards',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'By the numbers' },
      { key: 'stats', label: 'Statistics', kind: 'repeater', min: 2, max: 5,
        itemFields: [
          { key: 'value', label: 'Value', kind: 'text', placeholder: '83M', inline: true },
          { key: 'label', label: 'Label', kind: 'text', placeholder: 'People', inline: true },
          { key: 'context', label: 'Context', kind: 'text', placeholder: 'since 2020' },
        ],
        defaults: [
          { value: '', label: '', context: '' },
          { value: '', label: '', context: '' },
          { value: '', label: '', context: '' },
        ],
      },
    ],
  },

  Map2D: {
    headline: 'Interactive Map',
    hint: 'A map that flies between locations as readers scroll',
    fields: [
      { key: 'title', label: 'Map title', kind: 'text' },
      { key: '_centerLat', label: 'Center latitude', kind: 'number', defaultValue: 52.52, inline: true },
      { key: '_centerLng', label: 'Center longitude', kind: 'number', defaultValue: 13.405, inline: true },
      { key: 'initialZoom', label: 'Zoom', kind: 'range', min: 1, max: 18, defaultValue: 6 },
      { key: 'tileStyle', label: 'Map style', kind: 'select',
        options: ['default', 'satellite', 'light', 'dark', 'watercolor'], defaultValue: 'default' },
      { key: 'markers', label: 'Markers', kind: 'repeater', min: 0,
        itemFields: [
          { key: 'name', label: 'Place name', kind: 'text', inline: true },
          { key: 'lat', label: 'Lat', kind: 'number', inline: true },
          { key: 'lng', label: 'Lng', kind: 'number', inline: true },
        ],
        defaults: [{ id: 'marker-1', lat: 52.52, lng: 13.405, label: '1', name: 'Berlin', popupHtml: '<strong>Berlin</strong>', color: '#c06830' }],
      },
      { key: 'steps', label: 'Story steps (scroll-driven)', kind: 'repeater', min: 1,
        itemFields: [
          { key: 'body', label: 'Step text', kind: 'textarea', rows: 2 },
        ],
        defaults: [{ badgeKind: 'data', badgeLabel: 'Start', body: 'Story begins here.', mapState: { center: [52.52, 13.405], zoom: 13, showMarkers: ['marker-1'], showAreas: [], animateRoute: null } }],
      },
    ],
    postProcess(data) {
      const lat = parseFloat(data._centerLat) || 52.52;
      const lng = parseFloat(data._centerLng) || 13.405;
      const markers = (data.markers || []).map((m, i) => ({
        id: m.id || `marker-${i + 1}`, lat: parseFloat(m.lat) || lat, lng: parseFloat(m.lng) || lng,
        label: m.label || String(i + 1), name: m.name || '', popupHtml: `<strong>${m.name || ''}</strong>`,
        color: m.color || '#c06830',
      }));
      const steps = (data.steps || []).map((s, i) => ({
        badgeKind: s.badgeKind || 'data', badgeLabel: s.badgeLabel || `Step ${i + 1}`,
        body: s.body || '',
        mapState: s.mapState || { center: [lat, lng], zoom: data.initialZoom || 6, showMarkers: markers.map(m => m.id), showAreas: [], animateRoute: null },
      }));
      return {
        title: data.title || '', subtitle: '', source: '', layout: 'behind',
        tileStyle: data.tileStyle || 'default', height: '100vh', maxWidth: '100%',
        initialCenter: [lat, lng], initialZoom: data.initialZoom || 6,
        flyDuration: 2, scrollZoom: false, markers, routes: [], areas: [], steps,
        caption: '', credit: 'OpenStreetMap',
      };
    },
  },

  Timeline: {
    headline: 'Timeline',
    hint: 'Key moments arranged chronologically',
    fields: [
      { key: 'title', label: 'Timeline title', kind: 'text', placeholder: 'Key moments' },
      { key: 'events', label: 'Events', kind: 'repeater', min: 2,
        itemFields: [
          { key: 'when', label: 'When', kind: 'text', placeholder: '1440', inline: true },
          { key: 'title', label: 'What happened', kind: 'text', inline: true },
          { key: 'body', label: 'Detail', kind: 'textarea', rows: 2 },
        ],
        defaults: [
          { when: '', title: '', body: '' },
          { when: '', title: '', body: '' },
          { when: '', title: '', body: '' },
        ],
      },
    ],
  },

  // ── Supporting ───────────────────────────────────────────────

  Aside: {
    headline: 'Context Box',
    hint: 'Background info, methodology notes, or warnings',
    fields: [
      { key: 'tone', label: 'Tone', kind: 'button_group', options: [
        { value: 'info', label: 'ℹ️ Info' }, { value: 'note', label: '✏️ Note' }, { value: 'warning', label: '⚠️ Warning' },
      ], defaultValue: 'info' },
      { key: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'Context' },
      { key: 'body', label: 'Body text', kind: 'textarea', rows: 4, required: true },
    ],
  },

  AccordionBlock: {
    headline: 'Expandable Sections',
    hint: 'Collapsible Q&A or detail sections',
    fields: [
      { key: 'heading', label: 'Section heading', kind: 'text', placeholder: 'FAQ' },
      { key: 'items', label: 'Sections', kind: 'repeater', min: 1,
        itemFields: [
          { key: 'title', label: 'Title / Question', kind: 'text', required: true },
          { key: 'body', label: 'Body / Answer', kind: 'textarea', rows: 3, required: true },
        ],
        defaults: [
          { title: '', body: '' },
          { title: '', body: '' },
        ],
      },
    ],
  },

  Outro: {
    headline: 'Closing',
    hint: 'The final words, credits, and sources',
    fields: [
      { key: 'h2', label: 'Closing heading', kind: 'text', placeholder: 'Conclusion' },
      { key: '_body', label: 'Final paragraph(s)', kind: 'textarea', rows: 4, hint: 'Separate paragraphs with blank lines' },
      { key: 'finalLine', label: 'Final line (italic accent)', kind: 'text', placeholder: 'A closing thought...' },
      { key: 'sourcesHtml', label: 'Sources (HTML)', kind: 'textarea', rows: 3, hint: 'Use <a href> tags for links' },
    ],
    postProcess(data) {
      const paragraphs = (data._body || '').trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      if (paragraphs.length === 0) paragraphs.push('Final paragraph.');
      return { h2: data.h2 || 'Outro', paragraphs, finalLine: data.finalLine || '', sourcesHtml: data.sourcesHtml || '' };
    },
  },

  VizPanel: {
    headline: 'Visualization Panel',
    hint: 'Container for D3 data visualization',
    fields: [
      { key: 'initialTitle', label: 'Title', kind: 'text', placeholder: 'Chart title' },
      { key: 'initialSub', label: 'Subtitle', kind: 'text', placeholder: 'Supporting context' },
    ],
  },
};
```

- [ ] **Step 2: Verify no syntax errors**

Run:
```bash
node -c admin/ui/app.js
```
Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat: add BLOCK_CREATION_CARDS definitions for all 24 block types"
```

---

### Task 2: Add renderCreationField function

Handles all 11 field kinds: text, textarea, select, button_group, range, toggle, number, image_upload, audio_upload, repeater. Insert after the `BLOCK_CREATION_CARDS` closing brace (just added in Task 1).

**Files:**
- Modify: `admin/ui/app.js` — insert after `BLOCK_CREATION_CARDS` closing `};`

- [ ] **Step 1: Add renderCreationField function**

Insert immediately after the `BLOCK_CREATION_CARDS` closing `};`:

```javascript
// ─────────────────────────── Creation card field renderer ────
// Renders a single form field for the creation card.
// Returns a DOM element. Calls onChange(key, value) on user input.
function renderCreationField(fieldDef, data, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'cc-field' + (fieldDef.inline ? ' cc-field-inline' : '');

  const { key, label, kind, hint, placeholder, required, options,
          min, max, defaultValue, unit, rows, accept,
          itemFields, defaults, flatten, dynamicCount } = fieldDef;

  // Initialize data with defaultValue if not set
  if (data[key] === undefined && defaultValue !== undefined) {
    data[key] = defaultValue;
  }

  // Label
  if (label && kind !== 'repeater') {
    const lbl = document.createElement('label');
    lbl.className = 'cc-label';
    lbl.textContent = label;
    if (required) { const star = document.createElement('span'); star.className = 'cc-req'; star.textContent = ' *'; lbl.appendChild(star); }
    wrap.appendChild(lbl);
  }

  switch (kind) {

    // ── Text input ──
    case 'text': {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cc-input';
      inp.placeholder = placeholder || '';
      inp.value = data[key] ?? '';
      inp.addEventListener('input', () => { data[key] = inp.value; onChange(key, inp.value); });
      wrap.appendChild(inp);
      break;
    }

    // ── Number input ──
    case 'number': {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'cc-input cc-input-number';
      inp.placeholder = placeholder || '';
      if (min !== undefined) inp.min = min;
      if (max !== undefined) inp.max = max;
      inp.value = data[key] ?? defaultValue ?? '';
      inp.addEventListener('input', () => { data[key] = parseFloat(inp.value) || 0; onChange(key, data[key]); });
      wrap.appendChild(inp);
      break;
    }

    // ── Textarea ──
    case 'textarea': {
      const ta = document.createElement('textarea');
      ta.className = 'cc-textarea';
      ta.placeholder = placeholder || '';
      ta.rows = rows || 4;
      ta.value = data[key] ?? '';
      ta.addEventListener('input', () => { data[key] = ta.value; onChange(key, ta.value); });
      wrap.appendChild(ta);
      break;
    }

    // ── Select dropdown ──
    case 'select': {
      const sel = document.createElement('select');
      sel.className = 'cc-select';
      (options || []).forEach(opt => {
        const o = document.createElement('option');
        if (typeof opt === 'string') { o.value = opt; o.textContent = opt; }
        else { o.value = opt.value; o.textContent = opt.label; }
        sel.appendChild(o);
      });
      sel.value = data[key] ?? defaultValue ?? '';
      sel.addEventListener('change', () => { data[key] = sel.value; onChange(key, sel.value); });
      wrap.appendChild(sel);
      break;
    }

    // ── Button group (horizontal toggle buttons) ──
    case 'button_group': {
      const group = document.createElement('div');
      group.className = 'cc-btn-group';
      const current = data[key] ?? defaultValue ?? '';
      (options || []).forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const val = typeof opt === 'string' ? opt : opt.value;
        const lbl = typeof opt === 'string' ? opt : opt.label;
        btn.className = 'cc-btn-opt' + (val === current ? ' active' : '');
        btn.textContent = lbl;
        btn.addEventListener('click', () => {
          data[key] = val;
          group.querySelectorAll('.cc-btn-opt').forEach(b => b.classList.toggle('active', b === btn));
          onChange(key, val);
        });
        group.appendChild(btn);
      });
      if (!data[key] && options.length) data[key] = typeof options[0] === 'string' ? options[0] : options[0].value;
      wrap.appendChild(group);
      break;
    }

    // ── Range slider ──
    case 'range': {
      const row = document.createElement('div');
      row.className = 'cc-range-row';
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.className = 'cc-range';
      inp.min = min ?? 0;
      inp.max = max ?? 100;
      inp.value = data[key] ?? defaultValue ?? 50;
      const valDisplay = document.createElement('span');
      valDisplay.className = 'cc-range-val';
      valDisplay.textContent = inp.value + (unit || '');
      inp.addEventListener('input', () => {
        data[key] = parseFloat(inp.value);
        valDisplay.textContent = inp.value + (unit || '');
        onChange(key, data[key]);
      });
      if (data[key] === undefined) data[key] = parseFloat(inp.value);
      row.appendChild(inp);
      row.appendChild(valDisplay);
      wrap.appendChild(row);
      break;
    }

    // ── Toggle (on/off) ──
    case 'toggle': {
      const tog = document.createElement('label');
      tog.className = 'cc-toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!data[key];
      const slider = document.createElement('span');
      slider.className = 'cc-toggle-slider';
      cb.addEventListener('change', () => { data[key] = cb.checked; onChange(key, cb.checked); });
      tog.appendChild(cb);
      tog.appendChild(slider);
      wrap.appendChild(tog);
      break;
    }

    // ── Image upload ──
    case 'image_upload': {
      const zone = document.createElement('div');
      zone.className = 'cc-upload-zone';
      zone.innerHTML = `<div class="cc-upload-icon">📷</div><div class="cc-upload-text">Drop image or click</div>`;
      const preview = document.createElement('div');
      preview.className = 'cc-upload-preview';
      if (data[key]) {
        preview.style.backgroundImage = `url('${data[key]}')`;
        zone.classList.add('has-file');
      }
      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.accept = accept || 'image/*';
      fileInp.style.display = 'none';

      async function handleFile(file) {
        if (!file) return;
        zone.classList.add('uploading');
        zone.querySelector('.cc-upload-text').textContent = 'Uploading...';
        try {
          const r = await SB.uploadFile(file);
          data[key] = r.url;
          preview.style.backgroundImage = `url('${r.url}')`;
          zone.classList.add('has-file');
          zone.classList.remove('uploading');
          zone.querySelector('.cc-upload-text').textContent = 'Replace';
          onChange(key, r.url);
        } catch (e) {
          zone.classList.remove('uploading');
          zone.querySelector('.cc-upload-text').textContent = 'Failed — try again';
          toast('Upload failed: ' + e.message, 'error');
        }
      }

      fileInp.addEventListener('change', () => { handleFile(fileInp.files[0]); fileInp.value = ''; });
      zone.addEventListener('click', (e) => { if (e.target !== fileInp) fileInp.click(); });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
      zone.appendChild(fileInp);
      zone.appendChild(preview);
      wrap.appendChild(zone);
      break;
    }

    // ── Audio upload ──
    case 'audio_upload': {
      const zone = document.createElement('div');
      zone.className = 'cc-upload-zone cc-upload-audio';
      zone.innerHTML = `<div class="cc-upload-icon">🎧</div><div class="cc-upload-text">Drop audio file or click</div>`;
      if (fieldDef.hint) {
        const h = document.createElement('div');
        h.className = 'cc-upload-hint';
        h.textContent = fieldDef.hint;
        zone.appendChild(h);
      }
      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.accept = 'audio/*';
      fileInp.style.display = 'none';

      async function handleAudio(file) {
        if (!file) return;
        zone.classList.add('uploading');
        zone.querySelector('.cc-upload-text').textContent = 'Uploading...';
        try {
          const r = await SB.uploadFile(file);
          data[key] = r.url;
          zone.classList.add('has-file');
          zone.classList.remove('uploading');
          zone.querySelector('.cc-upload-text').textContent = '✅ ' + file.name;
          onChange(key, r.url);
        } catch (e) {
          zone.classList.remove('uploading');
          zone.querySelector('.cc-upload-text').textContent = 'Failed — try again';
          toast('Upload failed: ' + e.message, 'error');
        }
      }

      fileInp.addEventListener('change', () => { handleAudio(fileInp.files[0]); fileInp.value = ''; });
      zone.addEventListener('click', (e) => { if (e.target !== fileInp) fileInp.click(); });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); handleAudio(e.dataTransfer.files[0]); });
      zone.appendChild(fileInp);
      wrap.appendChild(zone);
      break;
    }

    // ── Repeater (add/remove items) ──
    case 'repeater': {
      const section = document.createElement('div');
      section.className = 'cc-repeater';

      // Header with label
      const header = document.createElement('div');
      header.className = 'cc-repeater-header';
      const headerLabel = document.createElement('span');
      headerLabel.className = 'cc-label';
      headerLabel.textContent = label || key;
      header.appendChild(headerLabel);
      section.appendChild(header);

      if (fieldDef.hint) {
        const h = document.createElement('div');
        h.className = 'cc-hint';
        h.textContent = fieldDef.hint;
        section.appendChild(h);
      }

      // Initialize array in data if missing
      if (!Array.isArray(data[key])) {
        data[key] = clone(defaults || [{}]);
      }

      const listEl = document.createElement('div');
      listEl.className = 'cc-repeater-list';

      function renderItems() {
        listEl.innerHTML = '';
        const items = data[key];
        items.forEach((item, idx) => {
          const card = document.createElement('div');
          card.className = 'cc-repeater-item';

          // Item header with index and delete
          const itemHead = document.createElement('div');
          itemHead.className = 'cc-repeater-item-head';
          itemHead.innerHTML = `<span class="cc-repeater-idx">${idx + 1}</span>`;
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'cc-repeater-del';
          delBtn.textContent = '×';
          delBtn.title = 'Remove';
          const minCount = fieldDef.min ?? 0;
          if (items.length <= minCount) delBtn.style.display = 'none';
          delBtn.addEventListener('click', () => {
            items.splice(idx, 1);
            renderItems();
            onChange(key, items);
          });
          itemHead.appendChild(delBtn);
          card.appendChild(itemHead);

          // Item fields
          const fieldsWrap = document.createElement('div');
          fieldsWrap.className = 'cc-repeater-fields';

          if (flatten) {
            // For flat arrays (e.g., Hero lines): single text input per item
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'cc-input';
            inp.value = typeof item === 'string' ? item : (item.value ?? '');
            inp.placeholder = (itemFields && itemFields[0]?.label) || '';
            inp.addEventListener('input', () => {
              items[idx] = inp.value;
              onChange(key, items);
            });
            fieldsWrap.appendChild(inp);
          } else {
            // Render sub-fields
            let fi = 0;
            while (fi < (itemFields || []).length) {
              const sf = itemFields[fi];
              if (sf.inline && fi + 1 < itemFields.length && itemFields[fi + 1].inline) {
                const row = document.createElement('div');
                row.className = 'cc-field-row';
                row.appendChild(renderCreationField(sf, item, (k, v) => { item[k] = v; onChange(key, items); }));
                row.appendChild(renderCreationField(itemFields[fi + 1], item, (k, v) => { item[k] = v; onChange(key, items); }));
                fieldsWrap.appendChild(row);
                fi += 2;
              } else {
                fieldsWrap.appendChild(renderCreationField(sf, item, (k, v) => { item[k] = v; onChange(key, items); }));
                fi++;
              }
            }
          }

          card.appendChild(fieldsWrap);
          listEl.appendChild(card);
        });
      }

      renderItems();
      section.appendChild(listEl);

      // Add button
      const maxCount = fieldDef.max ?? 20;
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cc-repeater-add';
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', () => {
        if (data[key].length >= maxCount) { toast(`Maximum ${maxCount} items`, 'error'); return; }
        // Clone the first default or create empty object from itemFields
        const template = defaults && defaults[0] ? clone(defaults[0]) : {};
        if (!Object.keys(template).length && itemFields) {
          itemFields.forEach(f => { template[f.key] = f.defaultValue ?? ''; });
        }
        if (flatten) {
          data[key].push('');
        } else {
          data[key].push(template);
        }
        renderItems();
        onChange(key, data[key]);
      });
      section.appendChild(addBtn);

      wrap.appendChild(section);
      break;
    }

    default:
      wrap.textContent = `Unknown field kind: ${kind}`;
  }

  // Hint text below field
  if (hint && kind !== 'repeater' && kind !== 'audio_upload') {
    const h = document.createElement('div');
    h.className = 'cc-hint';
    h.innerHTML = hint;
    wrap.appendChild(h);
  }

  return wrap;
}
```

- [ ] **Step 2: Verify no syntax errors**

Run:
```bash
node -c admin/ui/app.js
```
Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat: add renderCreationField — handles all 11 field kinds for creation cards"
```

---

### Task 3: Add openCreationCard function + AI toggle

The modal function that renders the purpose-built form, handles the "Create" button (including block insertion and post-processing), and includes the AI assistance toggle.

**Files:**
- Modify: `admin/ui/app.js` — insert after `renderCreationField` (added in Task 2)

- [ ] **Step 1: Add openCreationCard function**

Insert immediately after `renderCreationField` closing `}`:

```javascript
// ─────────────────────────── Creation card modal ────────────
// Opens a purpose-built creation form for the given block type.
// opts.insertAfter — block ID to insert after (optional)
function openCreationCard(type, opts = {}) {
  const card = BLOCK_CREATION_CARDS[type];
  if (!card) {
    // Fallback for types without a creation card — use Claude modal
    openClaudeModal({ mode: 'create', type, ...opts });
    return;
  }

  const schemaName = BLOCK_SCHEMAS[type]?.name || type;
  const title = card.headline || schemaName;
  const formData = {};

  openModal(title, (body) => {
    body.innerHTML = '';
    body.className = 'modal-body cc-modal-body';

    // Hint
    if (card.hint) {
      const hint = document.createElement('p');
      hint.className = 'cc-modal-hint';
      hint.textContent = card.hint;
      body.appendChild(hint);
    }

    // Fields container
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'cc-fields' + (card.layout === 'side-by-side-uploads' ? ' cc-layout-side-by-side' : '')
                                             + (card.layout === 'stat-cards' ? ' cc-layout-stat-cards' : '');

    const onFieldChange = (k, v) => { /* live update — data is mutated in place */ };

    // Render fields — handle inline pairs
    let i = 0;
    const fields = card.fields || [];
    while (i < fields.length) {
      const f = fields[i];
      if (f.inline && i + 1 < fields.length && fields[i + 1].inline) {
        const row = document.createElement('div');
        row.className = 'cc-field-row';
        row.appendChild(renderCreationField(f, formData, onFieldChange));
        row.appendChild(renderCreationField(fields[i + 1], formData, onFieldChange));
        fieldsContainer.appendChild(row);
        i += 2;
      } else {
        fieldsContainer.appendChild(renderCreationField(f, formData, onFieldChange));
        i++;
      }
    }
    body.appendChild(fieldsContainer);

    // ── AI toggle section ──
    const aiSection = document.createElement('div');
    aiSection.className = 'cc-ai-section';
    const aiToggle = document.createElement('button');
    aiToggle.type = 'button';
    aiToggle.className = 'cc-ai-toggle';
    aiToggle.innerHTML = '✨ Let Claude help';

    const aiExpanded = document.createElement('div');
    aiExpanded.className = 'cc-ai-expanded';
    aiExpanded.style.display = 'none';
    aiExpanded.innerHTML = `
      <textarea class="cc-ai-textarea" rows="3" placeholder="Describe what you want…"></textarea>
      <button type="button" class="cc-ai-generate primary">🤖 Generate</button>
    `;

    let aiOpen = false;
    aiToggle.addEventListener('click', () => {
      aiOpen = !aiOpen;
      aiExpanded.style.display = aiOpen ? 'block' : 'none';
      aiToggle.classList.toggle('active', aiOpen);
    });
    aiSection.appendChild(aiToggle);
    aiSection.appendChild(aiExpanded);
    body.appendChild(aiSection);

    // AI generate handler
    aiExpanded.querySelector('.cc-ai-generate').addEventListener('click', async () => {
      const prompt = aiExpanded.querySelector('.cc-ai-textarea').value.trim();
      if (!prompt) return;
      const genBtn = aiExpanded.querySelector('.cc-ai-generate');
      const origText = genBtn.textContent;
      genBtn.disabled = true;
      genBtn.textContent = '⏳ Generating…';
      try {
        const r = await SB.generate({
          type, prompt, images: [],
          currentData: null, mode: 'create',
          pageId: state.currentPageId,
          lang: state.doc?.lang || undefined,
        });
        // Populate form fields from AI response
        if (r && r.data) {
          Object.assign(formData, r.data);
          // Re-render fields to show AI-filled values
          fieldsContainer.innerHTML = '';
          let fi = 0;
          while (fi < fields.length) {
            const f = fields[fi];
            if (f.inline && fi + 1 < fields.length && fields[fi + 1].inline) {
              const row = document.createElement('div');
              row.className = 'cc-field-row';
              row.appendChild(renderCreationField(f, formData, onFieldChange));
              row.appendChild(renderCreationField(fields[fi + 1], formData, onFieldChange));
              fieldsContainer.appendChild(row);
              fi += 2;
            } else {
              fieldsContainer.appendChild(renderCreationField(f, formData, onFieldChange));
              fi++;
            }
          }
          toast('Claude filled in the form — review and edit before creating', 'success');
        }
      } catch (e) {
        toast('AI generation failed: ' + e.message, 'error');
      }
      genBtn.disabled = false;
      genBtn.textContent = origText;
    });

    // ── Action buttons ──
    const actions = document.createElement('div');
    actions.className = 'cc-actions';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'ghost';
    skipBtn.textContent = 'Skip — add empty block';
    skipBtn.addEventListener('click', () => {
      closeModal();
      if (!state.doc) { toast('Please create or select a page first', 'error'); return; }
      const block = { id: uid('b'), type, data: defaultDataFor(type) };
      if (opts.insertAfter) {
        const idx = state.doc.blocks.findIndex(b => b.id === opts.insertAfter);
        if (idx !== -1) state.doc.blocks.splice(idx + 1, 0, block);
        else state.doc.blocks.push(block);
      } else {
        state.doc.blocks.push(block);
      }
      state.selectedBlockId = block.id;
      setDirty(true);
      renderBlockList();
      renderEditor();
    });

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'primary';
    createBtn.textContent = 'Create';
    createBtn.addEventListener('click', () => {
      // Validate required fields
      const missing = fields.filter(f => f.required && !formData[f.key]);
      if (missing.length) {
        toast(`Fill in: ${missing.map(f => f.label).join(', ')}`, 'error');
        return;
      }

      if (!state.doc) { toast('Please create or select a page first', 'error'); return; }

      // Post-process if the card defines a postProcess function
      const blockData = card.postProcess ? card.postProcess(formData) : { ...formData };

      // Clean out underscore-prefixed temp keys from blockData (used by postProcess)
      for (const k of Object.keys(blockData)) {
        if (k.startsWith('_')) delete blockData[k];
      }

      // Merge with defaults to fill any schema fields not in the creation card
      const defaults = defaultDataFor(type);
      const merged = { ...defaults, ...blockData };

      const newBlock = { id: uid('b'), type, data: merged };
      if (opts.insertAfter) {
        const idx = state.doc.blocks.findIndex(b => b.id === opts.insertAfter);
        if (idx !== -1) state.doc.blocks.splice(idx + 1, 0, newBlock);
        else state.doc.blocks.push(newBlock);
      } else {
        state.doc.blocks.push(newBlock);
      }
      state.selectedBlockId = newBlock.id;
      setDirty(true);
      closeModal();
      renderBlockList();
      renderEditor();
      refreshPreview();
      toast(`${schemaName} created`, 'success');
    });

    actions.appendChild(skipBtn);
    actions.appendChild(createBtn);
    body.appendChild(actions);
  }, '');
}
```

- [ ] **Step 2: Verify no syntax errors**

Run:
```bash
node -c admin/ui/app.js
```
Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat: add openCreationCard — purpose-built creation modal with AI toggle"
```

---

### Task 4: Add creation card CSS

All `.cc-*` styles for the creation card modal, fields, upload zones, repeaters, button groups, and AI toggle.

**Files:**
- Modify: `admin/ui/styles.css` — append at end of file

- [ ] **Step 1: Read the end of styles.css to find insertion point**

Read the last 10 lines of `admin/ui/styles.css` to confirm where to append.

- [ ] **Step 2: Append creation card CSS**

Append this block at the end of `admin/ui/styles.css`:

```css
/* ─────────────────────────── Creation Cards ─────────────────── */
.cc-modal-body { padding: 20px; }
.cc-modal-hint { color: #57606a; font-size: 13px; margin: 0 0 16px; }

/* Fields container */
.cc-fields { display: flex; flex-direction: column; gap: 14px; }

/* Side-by-side layout (e.g., ImageCompare before/after) */
.cc-layout-side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cc-layout-side-by-side .cc-field:not(.cc-field-inline) { grid-column: 1 / -1; }

/* Stat cards layout */
.cc-layout-stat-cards .cc-repeater-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.cc-layout-stat-cards .cc-repeater-item { border-radius: 10px; }

/* Individual field */
.cc-field { display: flex; flex-direction: column; gap: 4px; }
.cc-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cc-label { font-size: 12.5px; font-weight: 600; color: #1f2328; }
.cc-req { color: #cf222e; }
.cc-hint { font-size: 11.5px; color: #656d76; margin-top: 2px; }

/* Text input */
.cc-input {
  padding: 8px 10px; border: 1.5px solid #d0d7de; border-radius: 8px;
  font-size: 14px; background: #fff; color: #1f2328;
  transition: border-color 0.15s;
}
.cc-input:focus { outline: none; border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,0.12); }
.cc-input-number { width: 100%; }

/* Textarea */
.cc-textarea {
  padding: 8px 10px; border: 1.5px solid #d0d7de; border-radius: 8px;
  font-size: 14px; font-family: inherit; background: #fff; color: #1f2328;
  resize: vertical; transition: border-color 0.15s;
}
.cc-textarea:focus { outline: none; border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,0.12); }

/* Select */
.cc-select {
  padding: 8px 10px; border: 1.5px solid #d0d7de; border-radius: 8px;
  font-size: 14px; background: #fff; color: #1f2328; cursor: pointer;
}
.cc-select:focus { outline: none; border-color: #0969da; }

/* Button group */
.cc-btn-group { display: flex; gap: 0; border: 1.5px solid #d0d7de; border-radius: 8px; overflow: hidden; }
.cc-btn-opt {
  flex: 1; padding: 7px 12px; font-size: 13px; font-weight: 500;
  border: none; background: #fff; color: #57606a; cursor: pointer;
  transition: all 0.15s; border-right: 1px solid #d0d7de;
}
.cc-btn-opt:last-child { border-right: none; }
.cc-btn-opt:hover { background: #f6f8fa; color: #1f2328; }
.cc-btn-opt.active { background: #1f2328; color: #fff; }

/* Range slider */
.cc-range-row { display: flex; align-items: center; gap: 10px; }
.cc-range { flex: 1; accent-color: #0969da; }
.cc-range-val { font-size: 13px; font-weight: 600; color: #1f2328; min-width: 40px; text-align: right; }

/* Toggle */
.cc-toggle { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
.cc-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.cc-toggle-slider {
  width: 36px; height: 20px; background: #d0d7de; border-radius: 10px;
  transition: background 0.2s; position: relative;
}
.cc-toggle-slider::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: #fff; border-radius: 50%;
  transition: transform 0.2s;
}
.cc-toggle input:checked + .cc-toggle-slider { background: #1f883d; }
.cc-toggle input:checked + .cc-toggle-slider::after { transform: translateX(16px); }

/* Upload zone */
.cc-upload-zone {
  border: 2px dashed #d0d7de; border-radius: 10px; padding: 24px 16px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; cursor: pointer; transition: all 0.2s; position: relative;
  min-height: 80px; background: #fafbfc;
}
.cc-upload-zone:hover, .cc-upload-zone.drag-over {
  border-color: #0969da; background: #f0f6ff;
}
.cc-upload-zone.uploading { opacity: 0.6; pointer-events: none; }
.cc-upload-zone.has-file { border-style: solid; border-color: #1f883d; background: #f0fff4; }
.cc-upload-icon { font-size: 24px; }
.cc-upload-text { font-size: 12.5px; color: #57606a; font-weight: 500; }
.cc-upload-hint { font-size: 11px; color: #8b949e; }
.cc-upload-preview {
  position: absolute; inset: 4px; border-radius: 8px;
  background-size: cover; background-position: center;
  pointer-events: none;
}
.cc-upload-zone.has-file .cc-upload-icon { display: none; }
.cc-upload-zone.has-file .cc-upload-text {
  position: relative; z-index: 1; background: rgba(255,255,255,0.85);
  padding: 2px 8px; border-radius: 4px; font-size: 11px;
}

/* Audio upload */
.cc-upload-audio { min-height: 60px; }
.cc-upload-audio.has-file { border-color: #1f883d; }

/* Repeater */
.cc-repeater { display: flex; flex-direction: column; gap: 8px; }
.cc-repeater-header { display: flex; align-items: center; gap: 8px; }
.cc-repeater-list { display: flex; flex-direction: column; gap: 8px; }
.cc-repeater-item {
  background: #f6f8fa; border: 1px solid #d8dee4; border-radius: 10px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
}
.cc-repeater-item-head { display: flex; align-items: center; justify-content: space-between; }
.cc-repeater-idx {
  font-size: 11px; font-weight: 700; color: #57606a; background: #e1e4e8;
  width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
}
.cc-repeater-del {
  border: none; background: none; font-size: 16px; color: #8b949e; cursor: pointer;
  width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
}
.cc-repeater-del:hover { background: #ffebe9; color: #cf222e; }
.cc-repeater-fields { display: flex; flex-direction: column; gap: 8px; }
.cc-repeater-add {
  align-self: flex-start; padding: 6px 14px; font-size: 13px; font-weight: 500;
  border: 1.5px dashed #d0d7de; border-radius: 8px; background: #fff; color: #57606a;
  cursor: pointer; transition: all 0.15s;
}
.cc-repeater-add:hover { border-color: #0969da; color: #0969da; background: #f0f6ff; }

/* AI toggle section */
.cc-ai-section {
  margin-top: 16px; padding-top: 16px; border-top: 1px solid #d8dee4;
}
.cc-ai-toggle {
  padding: 8px 16px; font-size: 13px; font-weight: 500;
  border: 1.5px solid #d0d7de; border-radius: 8px; background: #fff; color: #57606a;
  cursor: pointer; transition: all 0.15s; width: 100%; text-align: center;
}
.cc-ai-toggle:hover { border-color: #0969da; color: #0969da; }
.cc-ai-toggle.active { background: #f0f6ff; border-color: #0969da; color: #0969da; }

.cc-ai-expanded { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.cc-ai-textarea {
  padding: 8px 10px; border: 1.5px solid #d0d7de; border-radius: 8px;
  font-size: 14px; font-family: inherit; resize: vertical; background: #fffbeb;
}
.cc-ai-textarea:focus { outline: none; border-color: #0969da; }
.cc-ai-generate { align-self: flex-end; padding: 7px 16px; font-size: 13px; }

/* Action buttons */
.cc-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  margin-top: 16px; padding-top: 16px; border-top: 1px solid #d8dee4;
}

/* Mobile responsive */
@media (max-width: 600px) {
  .cc-layout-side-by-side { grid-template-columns: 1fr; }
  .cc-field-row { grid-template-columns: 1fr; }
  .cc-actions { flex-direction: column; }
  .cc-actions button { width: 100%; }
}
```

- [ ] **Step 3: Verify the CSS file is valid**

Run:
```bash
wc -l admin/ui/styles.css
```
Expected: line count increased by ~170 lines.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/styles.css
git commit -m "feat: add creation card CSS — fields, uploads, repeaters, AI toggle"
```

---

### Task 5: Wire palette handlers, bump cache, deploy

Update both `renderPalette` and `renderPaletteWithInsert` to call `openCreationCard` instead of `openClaudeModal` for block creation. Also update the `addBlock` legacy wrapper. Bump the cache-bust version in `index.html`. Deploy.

**Files:**
- Modify: `admin/ui/app.js:1731-1733` — palette handler
- Modify: `admin/ui/app.js:1770-1772` — palette insert handler
- Modify: `admin/ui/app.js:1785` — legacy `addBlock` wrapper
- Modify: `admin/ui/index.html` — bump cache version

- [ ] **Step 1: Update renderPalette click handler**

In `admin/ui/app.js`, find this in `renderPalette`:
```javascript
      card.addEventListener('click', () => {
        closeModal();
        openClaudeModal({ mode: 'create', type });
      });
```

Replace with:
```javascript
      card.addEventListener('click', () => {
        closeModal();
        openCreationCard(type);
      });
```

- [ ] **Step 2: Update renderPaletteWithInsert click handler**

In `admin/ui/app.js`, find this in `renderPaletteWithInsert`:
```javascript
      card.addEventListener('click', () => {
        closeModal();
        openClaudeModal({ mode: 'create', type, insertAfter: afterBlockId });
      });
```

Replace with:
```javascript
      card.addEventListener('click', () => {
        closeModal();
        openCreationCard(type, { insertAfter: afterBlockId });
      });
```

- [ ] **Step 3: Update legacy addBlock wrapper**

In `admin/ui/app.js`, find:
```javascript
function addBlock(type) { openClaudeModal({ mode: 'create', type }); }
```

Replace with:
```javascript
function addBlock(type) { openCreationCard(type); }
```

- [ ] **Step 4: Bump cache-bust version in index.html**

In `admin/ui/index.html`, replace all `?v=20260517a` with `?v=20260517b`.

- [ ] **Step 5: Verify no syntax errors**

Run:
```bash
node -c admin/ui/app.js
```
Expected: no output (clean parse).

- [ ] **Step 6: Commit**

```bash
git add admin/ui/app.js admin/ui/index.html
git commit -m "feat: wire palette to creation cards — all 24 block types use purpose-built forms"
```

- [ ] **Step 7: Deploy to Cloudflare Pages**

Run:
```bash
npx wrangler pages deploy . --project-name=scrollycms --branch=main
```
Expected: deployment succeeds with "Deployment complete!" message.

- [ ] **Step 8: Smoke test**

Open the admin at the deployed URL. Verify:
1. Click "+ Add" → palette opens as before
2. Select any block type (e.g., "Before & After") → creation card opens with labeled fields
3. Upload an image to a labeled upload zone → preview shows
4. Click "Create" → block is inserted into the page
5. Click "Let Claude help" → AI text area expands
6. "Skip — add empty block" → creates block with defaults
7. Test on mobile — card is responsive, fields stack vertically
8. The "Enhance" button on existing blocks still opens the Claude modal (regression check)
