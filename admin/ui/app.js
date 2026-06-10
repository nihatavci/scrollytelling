// Admin dashboard — vanilla JS, no build.
// State + UI for editing a page document loaded from /admin/api/pages/:id.

(() => {
'use strict';

// ─────────────────────────── State ───────────────────────────
const state = {
  pages: [],
  currentPageId: null,
  doc: null,             // The page document being edited
  selectedBlockId: null,
  selectedItemIdx: null, // For editorial sub-items
  dirty: false,
  savedVersion: null,
  visualEditMode: false,
};

// ─────────────────────────── HTML sanitization ──────────────
// Strip dangerous tags/attributes, keep safe formatting
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  // Remove script, style, iframe, object, embed, form tags
  const dangerous = div.querySelectorAll('script, style, iframe, object, embed, form, link, meta, base');
  dangerous.forEach(el => el.remove());
  // Remove event handler attributes from all elements
  div.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc' || attr.name === 'formaction') {
        el.removeAttribute(attr.name);
      }
      // Strip javascript: URLs
      if (['href', 'src', 'action', 'data'].includes(attr.name) &&
          attr.value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML;
}

// ─────────────────────────── Block type schemas ──────────────
// Drives the form generator. Each block type lists its top-level fields.
// Editorial uses a separate content[] editor for inline items.
const BLOCK_SCHEMAS = {
  // ── Opening & Structure ──────────────────────────────────────
  Hero: {
    name: 'Cover',
    description: 'The opening scene — first thing your reader sees. Sets the emotional register of the entire story.',
    fields: [
      { key: 'brand',          label: 'Brand line (small caps at top)',     kind: 'text', group: 'content' },
      { key: 'titleHtml',      label: 'Headline',                           kind: 'textarea', group: 'content',
        hint: 'Wrap a word in <code>&lt;span&gt;…&lt;/span&gt;</code> to highlight it. Use <code>&lt;br&gt;</code> for a line break.' },
      { key: 'subtitle',       label: 'Deck (subtitle)',      kind: 'text', group: 'content' },
      { key: 'scrollCueText',  label: 'Scroll-down cue text',   kind: 'text', group: 'style' },
      { key: 'lines',          label: 'Intro lines (appear one by one before the headline)', kind: 'lines', group: 'data' },
    ],
  },
  ChapterDivider: {
    name: 'Section Break',
    description: 'Signals a new act. Resets the reader\'s attention between major story chapters — like a film cut.',
    fields: [
      { key: 'number',   label: 'Number / label (optional)',     kind: 'text', group: 'content', hint: 'e.g. <code>I</code>, <code>01</code>, <code>Kapitel 2</code>' },
      { key: 'title',    label: 'Scene title',                    kind: 'text', group: 'content' },
      { key: 'subtitle', label: 'Subtitle (optional)',            kind: 'textarea', group: 'content' },
    ],
  },
  ProgressNav: {
    name: 'Progress Bar',
    description: 'Shows the reader where they are in the story. Chapter dots + reading progress bar.',
    fields: [
      { key: 'mode',           label: 'Mode',           kind: 'text', group: 'content', hint: 'bar (default)' },
      { key: 'autoGenerate',   label: 'Auto-generate',  kind: 'text', group: 'content', hint: 'true (auto-detect chapters) or false' },
      { key: 'showPercentage', label: 'Show %',         kind: 'text', group: 'content', hint: 'true or false' },
    ]
  },

  // ── The Narrative ────────────────────────────────────────────
  Editorial: {
    name: 'Text',
    description: 'The storytelling voice — prose paragraphs, inline quotes, images, drop caps. The backbone of your story.',
    fields: [
      { key: 'content', label: 'Content', kind: 'editorial_items', group: 'data' },
    ],
  },
  Scrolly: {
    name: 'Scroll Story',
    description: 'The signature scrollytelling moment. A sticky image while text cards scroll past — each step reveals a new layer of the story.',
    fields: [
      { key: 'imageSize',   label: 'Image size', kind: 'text', group: 'layout', hint: 'small (35%), medium (50%), large (65%), full, or any CSS value like "40%"' },
      { key: 'imageHeight', label: 'Image height', kind: 'text', group: 'layout', hint: 'CSS height: 100vh, 80vh, 60vh, 400px etc.' },
      { key: 'imageRadius', label: 'Image corner radius', kind: 'text', group: 'layout', hint: '0 (sharp), 12px, 24px etc.' },
      { key: 'maxWidth',    label: 'Max width', kind: 'text', group: 'layout', hint: '1400px (default), 1100px (editorial), 900px (narrow)' },
      { key: 'steps',       label: 'Steps', kind: 'scrolly_steps', group: 'data' },
    ],
  },
  DataScrolly: {
    name: 'Animated Chart',
    description: 'Chart-driven revelation — each scroll step builds the argument. The reader watches data tell the story.',
    fields: [
      { key: 'title',     label: 'Chart title',     kind: 'text', group: 'content' },
      { key: 'subtitle',  label: 'Chart subtitle',  kind: 'text', group: 'content' },
      { key: 'source',    label: 'Data source',     kind: 'text', group: 'meta', hint: 'Citation or <code>[estimated illustrative values]</code>' },
      { key: 'chartSpec', label: 'Chart',           kind: 'chart_spec', group: 'data' },
      { key: 'steps',     label: 'Steps',           kind: 'data_scrolly_steps', group: 'data' },
    ],
  },

  // ── Immersive Moments ────────────────────────────────────────
  FullBleed: {
    name: 'Full-Screen Banner',
    description: 'Full-viewport cinematic moment — image or video that fills the screen. The Snow Fall signature. Stops the reader cold.',
    fields: [
      { key: 'mediaSrc',         label: 'Image 1 (main)',  kind: 'image', group: 'media' },
      { key: 'mediaSrc2',        label: 'Image 2 (optional)', kind: 'image', group: 'media' },
      { key: 'mediaSrc3',        label: 'Image 3 (optional)', kind: 'image', group: 'media' },
      { key: 'mediaSrc4',        label: 'Image 4 (optional)', kind: 'image', group: 'media' },
      { key: 'slideInterval',    label: 'Slide interval (seconds)', kind: 'text', group: 'media', hint: 'How long each image shows. Default: 5' },
      { key: 'slideFadeSec',     label: 'Fade duration (seconds)',  kind: 'text', group: 'media', hint: 'Crossfade transition length. Default: 1.5' },
      { key: 'slideShuffle',     label: 'Shuffle order',   kind: 'select', group: 'media', options: ['yes', 'no'] },
      { key: 'mediaType',        label: 'Media type',      kind: 'select', group: 'layout', options: ['image', 'video', 'loop'] },
      { key: 'videoSrc',         label: 'Video file',      kind: 'video', group: 'media' },
      { key: 'posterSrc',        label: 'Poster image',    kind: 'image', group: 'media' },
      { key: 'overlayPosition',  label: 'Text position',   kind: 'select', group: 'layout', options: ['bottom-left', 'bottom-right', 'center', 'top-left'] },
      { key: 'scrimOpacity',     label: 'Scrim opacity',   kind: 'text', group: 'layout', hint: '0 to 1, default 0.4' },
      { key: 'height',           label: 'Height',          kind: 'select', group: 'layout', options: ['100vh', '75vh', '50vh'] },
      { key: 'title',            label: 'Title (HTML)',     kind: 'textarea_html', group: 'content' },
      { key: 'subtitle',         label: 'Subtitle',        kind: 'text', group: 'content' },
      { key: 'body',             label: 'Body text',       kind: 'textarea_html', group: 'content' },
    ]
  },
  FullscreenImage: {
    name: 'Full-Screen Photo',
    description: 'A dramatic photograph that establishes place, mood, or scale. Full viewport with Ken Burns animation and text overlay.',
    fields: [
      { key: 'imageSrc',         label: 'Image',              kind: 'image', group: 'media' },
      { key: 'imageAlt',         label: 'Alt text',           kind: 'text', group: 'media' },
      { key: 'kicker',           label: 'Kicker (optional)',   kind: 'text', group: 'content', hint: 'Small category label, e.g. "INVESTIGATION"' },
      { key: 'title',            label: 'Title (HTML)',        kind: 'textarea_html', group: 'content', hint: 'Use <code>&lt;span&gt;word&lt;/span&gt;</code> for accent color' },
      { key: 'subtitle',         label: 'Subtitle',           kind: 'text', group: 'content' },
      { key: 'body',             label: 'Body text',          kind: 'textarea_html', group: 'content' },
      { key: 'overlayPosition',  label: 'Text position',      kind: 'select', group: 'layout', options: ['bottom-left', 'bottom-right', 'center', 'top-left'] },
      { key: 'scrimOpacity',     label: 'Scrim opacity',      kind: 'text', group: 'layout', inline: true, hint: '0 to 1, default 0.45' },
      { key: 'scrimDirection',   label: 'Scrim direction',    kind: 'select', group: 'layout', inline: true, options: ['bottom', 'top', 'radial'] },
      { key: 'kenBurns',         label: 'Ken Burns animation', kind: 'select', group: 'style', inline: true, options: ['true', 'false'] },
      { key: 'scrollCue',        label: 'Scroll indicator',   kind: 'select', group: 'style', inline: true, options: ['true', 'false'] },
      { key: 'caption',          label: 'Caption',            kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',           label: 'Credit',             kind: 'text', group: 'meta', inline: true },
    ]
  },
  VideoEmbed: {
    name: 'Video',
    description: 'Moving image evidence — interviews, event recordings, scene-setting footage. Embedded from YouTube or Vimeo.',
    fields: [
      { key: 'url',     label: 'Video URL', kind: 'text', group: 'media', hint: 'Paste a YouTube or Vimeo URL.' },
      { key: 'caption', label: 'Caption',   kind: 'textarea', group: 'meta' },
      { key: 'credit',  label: 'Credit (optional)', kind: 'text', group: 'meta', hint: 'e.g. <code>via NYT</code>' },
    ],
  },
  AudioPlayer: {
    name: 'Audio',
    description: 'Sound brings the story to life — field recordings, interviews, ambient atmosphere. With waveform and transcript.',
    fields: [
      { key: 'audioSrc',       label: 'Audio file',        kind: 'audio', group: 'media' },
      { key: 'title',          label: 'Title',             kind: 'text', group: 'content' },
      { key: 'subtitle',       label: 'Subtitle',          kind: 'text', group: 'content', hint: 'Series name or context' },
      { key: 'description',    label: 'Description',       kind: 'textarea', group: 'content' },
      { key: 'duration',       label: 'Duration',          kind: 'text', group: 'content', hint: 'e.g. 4:32' },
      { key: 'waveformColor',  label: 'Waveform color',    kind: 'text', group: 'style', inline: true, hint: 'Hex color, default accent' },
      { key: 'accentColor',    label: 'Accent color',      kind: 'text', group: 'style', inline: true, hint: 'Play button & progress color' },
      { key: 'coverSrc',       label: 'Cover art',         kind: 'image', group: 'media' },
      { key: 'transcript',     label: 'Transcript',        kind: 'textarea', group: 'content', hint: 'Full transcript text (expandable)' },
      { key: 'caption',        label: 'Caption',           kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',         label: 'Credit',            kind: 'text', group: 'meta', inline: true },
    ]
  },

  Scene3D: {
    name: '3D Model',
    description: 'A 3D model the reader scrolls through — camera snaps between up to 4 saved viewpoints.',
    fields: [
      { key: 'glbUrl',      label: '3D Model (GLB / GLTF / STL) — required', kind: 'model3d', group: 'media', required: true },
      { key: 'bg',          label: 'Background', kind: 'select', group: 'settings',
        options: ['studio', 'dark', 'page'],
        hint: 'studio = soft light gradient · dark = deep gradient · page = transparent (shows the page background).' },
      { key: '_comingSoon', label: 'Status', kind: 'select', group: 'settings',
        options: ['false', 'true'],
        hint: '"true" shows a Coming Soon overlay on the public page — the block is fully built but visually gated.' },
      { key: 'textMode',    label: 'Text mode', kind: 'select', group: 'settings', options: ['cards', 'flow'] },
      { key: 'flowText',    label: 'Article text (flow mode)', kind: 'textarea', group: 'content', hint: 'Plain paragraphs, blank line between. Flows around the model.' },
      { key: 'flowColumns', label: 'Columns (flow mode)', kind: 'select', group: 'layout', options: ['1','2','3'] },
      { key: 'flowMargin',  label: 'Text margin (flow mode)', kind: 'select', group: 'layout', options: ['tight','normal','wide'] },
      { key: 'flowPlate', label: 'Text backing (flow mode)', kind: 'select', group: 'layout', options: ['subtle','solid','none'], hint: 'A plate behind text so it stays readable over the model. subtle = recommended.' },
    ],
  },

  WebGLGradient: {
    name: 'Shader Gradient',
    description: 'A living, flowing gradient rendered with a WebGL shader. Optional headline overlay.',
    fields: [
      { key: 'colorsCsv', label: 'Colors (comma-separated hex)', kind: 'text', group: 'media', hint: 'Up to 4. Default: spectrum #c679c4,#fa3d1d,#ffb005,#0358f7' },
      { key: 'speed',     label: 'Animation speed', kind: 'select', group: 'settings', options: ['0.15','0.3','0.5','0.8'] },
      { key: 'height',    label: 'Height', kind: 'select', group: 'layout', options: ['100vh','75vh','50vh'] },
      { key: 'title',     label: 'Title (HTML)', kind: 'textarea_html', group: 'content' },
      { key: 'subtitle',  label: 'Subtitle', kind: 'text', group: 'content' },
      { key: 'overlayPosition', label: 'Text position', kind: 'select', group: 'layout', options: ['center','bottom-left','bottom-right'] },
    ],
  },
  WebGLFlowmap: {
    name: 'Flowmap Image',
    description: 'An image that ripples and distorts as the reader moves the pointer — fluid WebGL trail.',
    fields: [
      { key: 'imageSrc',  label: 'Image — required', kind: 'image', group: 'media', required: true },
      { key: 'intensity', label: 'Distortion intensity', kind: 'select', group: 'settings', options: ['0.1','0.18','0.28','0.4'] },
      { key: 'height',    label: 'Height', kind: 'select', group: 'layout', options: ['100vh','75vh','50vh'] },
    ],
  },
  WebGLParticles: {
    name: 'Particle Dissolve',
    description: 'An image that assembles from / dissolves into GPU particles as the reader scrolls.',
    fields: [
      { key: 'imageSrc', label: 'Image — required', kind: 'image', group: 'media', required: true },
      { key: 'density',  label: 'Particle density', kind: 'select', group: 'settings', options: ['low','medium','high'] },
      { key: 'height',   label: 'Height', kind: 'select', group: 'layout', options: ['100vh','75vh','50vh'] },
    ],
  },

  // ── Evidence & Proof ─────────────────────────────────────────
  ImageCompare: {
    name: 'Before & After',
    description: 'Show change over time. The reader drags to reveal the truth — satellite imagery, reconstructions, transformations.',
    fields: [
      { key: 'beforeSrc',       label: 'Before image URL',  kind: 'text', group: 'media' },
      { key: 'beforeLabel',     label: 'Before label',      kind: 'text', group: 'content' },
      { key: 'afterSrc',        label: 'After image URL',   kind: 'text', group: 'media' },
      { key: 'afterLabel',      label: 'After label',       kind: 'text', group: 'content' },
      { key: 'initialPosition', label: 'Start position %',  kind: 'text', group: 'layout', hint: '0-100, default 50' },
      { key: 'caption',         label: 'Caption',           kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',          label: 'Credit',            kind: 'text', group: 'meta', inline: true },
    ]
  },
  ImageHotspot: {
    name: 'Labeled Image',
    description: 'Interactive guided look — numbered markers on an image reveal details on click. Great for evidence and explainers.',
    fields: [
      { key: 'src',     label: 'Image URL',   kind: 'text', group: 'media' },
      { key: 'alt',     label: 'Alt text',     kind: 'text', group: 'content' },
      { key: 'caption', label: 'Caption',      kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',  label: 'Credit',       kind: 'text', group: 'meta', inline: true },
      { key: 'hotspots', label: 'Hotspots',    kind: 'textarea_html', group: 'data', hint: 'AI generates these — use Enhance to add/modify hotspots' },
    ]
  },
  ImageGrid: {
    name: 'Image Gallery',
    description: 'A collection of photographs — proves the point, shows scale, or documents the scene. Auto-layouts from count.',
    fields: [
      { key: 'images',  label: 'Images',  kind: 'array', group: 'media', itemFields: [
        { key: 'src',     label: 'Image URL', kind: 'text' },
        { key: 'alt',     label: 'Alt text',  kind: 'text' },
        { key: 'caption', label: 'Caption',   kind: 'text', hint: 'Shows on hover' },
      ]},
      { key: 'layout',  label: 'Layout',  kind: 'text', group: 'layout', hint: 'Auto-detects from count. Or: "wide", "bleed", "editorial", "2 grid", "3 columns", "masonry", "row", "stack"' },
      { key: 'title',   label: 'Title',   kind: 'text', group: 'layout', hint: 'Optional heading above images' },
      { key: 'caption', label: 'Overall caption', kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',  label: 'Photo credit',    kind: 'text', group: 'meta', inline: true },
    ]
  },
  EmbedBlock: {
    name: 'Embed',
    description: 'Third-party visualization — Datawrapper charts, Flourish graphics, Twitter embeds, or any iframe.',
    fields: [
      { key: 'provider',      label: 'Provider',      kind: 'text', group: 'content', hint: 'datawrapper, flourish, twitter, etc.' },
      { key: 'url',           label: 'Embed URL',     kind: 'text', group: 'content' },
      { key: 'embedHtml',     label: 'Raw HTML',      kind: 'textarea_html', group: 'content', hint: 'Paste iframe code here instead of URL' },
      { key: 'aspectRatio',   label: 'Aspect ratio',  kind: 'text', group: 'content', hint: '16:9, 4:3, 1:1, or auto' },
      { key: 'maxWidth',      label: 'Max width',     kind: 'text', group: 'content', hint: 'e.g. 720px' },
      { key: 'caption',       label: 'Caption',       kind: 'textarea', group: 'content' },
      { key: 'lazyLoad',      label: 'Lazy load',     kind: 'text', group: 'content', hint: 'true (default) or false' },
      { key: 'fallbackImage', label: 'Fallback image', kind: 'text', group: 'content' },
    ]
  },

  // ── Voices & Data ────────────────────────────────────────────
  Quote: {
    name: 'Quote',
    description: 'A real voice from the story — testimony that humanizes the data. Large quote with optional portrait.',
    fields: [
      { key: 'text',         label: 'Quote (without surrounding quote marks)', kind: 'textarea', group: 'content' },
      { key: 'attribution',  label: 'Name',                                    kind: 'text', group: 'content' },
      { key: 'role',         label: 'Role / context (optional)',                kind: 'text', group: 'content' },
      { key: 'portraitSrc',  label: 'Portrait (optional)',                      kind: 'image', group: 'media' },
      { key: 'sourceUrl',    label: 'Source URL (optional)',                    kind: 'text', group: 'meta' },
      { key: 'sourceLabel',  label: 'Source link label (optional)',             kind: 'text', group: 'meta' },
    ],
  },
  StatRow: {
    name: 'Big Numbers',
    description: 'The number that lands — 2–4 large statistics that make scale visceral. Place after narrative setup for maximum punch.',
    fields: [
      { key: 'title', label: 'Heading (optional)', kind: 'text', group: 'content' },
      { key: 'stats', label: 'Stats',              kind: 'stat_list', group: 'data' },
    ],
  },
  Map2D: {
    name: 'Map',
    description: 'Geographic narrative — the map flies between locations as the reader scrolls. Trace routes, reveal markers, show territory.',
    fields: [
      { key: 'title',         label: 'Title (optional)', kind: 'text', group: 'content' },
      { key: 'subtitle',      label: 'Subtitle (optional)', kind: 'text', group: 'content' },
      { key: 'source',        label: 'Source attribution', kind: 'text', group: 'meta' },
      { key: 'layout',        label: 'Layout', kind: 'select', group: 'layout', options: ['behind', 'side'] },
      { key: 'tileStyle',     label: 'Tile style', kind: 'select', group: 'layout', options: ['default', 'clean', 'toner', 'toner-lite', 'watercolor', 'dark', 'osm'] },
      { key: 'height',        label: 'Map height', kind: 'text', group: 'layout', hint: '100vh, 80vh, 500px, etc.' },
      { key: 'maxWidth',      label: 'Max width', kind: 'text', group: 'layout', hint: '1400px (default), 1100px, 100%' },
      { key: 'initialCenter', label: 'Initial center [lat, lng]', kind: 'text', group: 'layout', hint: 'e.g. 52.52, 13.405 for Berlin' },
      { key: 'initialZoom',   label: 'Initial zoom (1-18)', kind: 'text', group: 'layout', hint: '6=country, 12=city, 15=neighborhood' },
      { key: 'flyDuration',   label: 'Fly duration (seconds)', kind: 'text', group: 'layout', hint: 'Default 2. Slower = more dramatic.' },
      { key: 'markers',       label: 'Markers (JSON)', kind: 'textarea', group: 'data', hint: 'Array of {id, lat, lng, label, popupHtml, color}. Use ✨ Enhance to generate.' },
      { key: 'routes',        label: 'Routes (JSON)', kind: 'textarea', group: 'data', hint: 'Array of {id, points, color, weight, animate, label}. Use ✨ Enhance.' },
      { key: 'areas',         label: 'Areas (JSON)', kind: 'textarea', group: 'data', hint: 'Array of {id, points, color, fillOpacity, label}. Use ✨ Enhance.' },
      { key: 'steps',         label: 'Steps (JSON)', kind: 'textarea', group: 'data', hint: 'Array of {badgeKind, badgeLabel, body, mapState}. Use ✨ Enhance to edit.' },
      { key: 'caption',       label: 'Caption', kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',        label: 'Credit', kind: 'text', group: 'meta', inline: true },
    ],
  },
  Timeline: {
    name: 'Timeline',
    description: 'Events across time — establishes sequence and causality. Vertical timeline with dates, titles, and narrative.',
    fields: [
      { key: 'title',  label: 'Heading (optional)', kind: 'text', group: 'content' },
      { key: 'events', label: 'Events',             kind: 'timeline_events', group: 'data' },
    ],
  },

  // ── Supporting ───────────────────────────────────────────────
  Aside: {
    name: 'Callout',
    description: 'Background the reader needs without breaking the narrative — methodology note, definition, or supplementary fact.',
    fields: [
      { key: 'tone',  label: 'Tone', kind: 'tone_select', group: 'style' },
      { key: 'title', label: 'Title (optional)', kind: 'text', group: 'content' },
      { key: 'body',  label: 'Body (separate paragraphs with a blank line)', kind: 'textarea', group: 'content' },
    ],
  },
  AccordionBlock: {
    name: 'Expandable Section',
    description: 'Expandable sections — methodology, FAQ, glossary, or detailed evidence the curious reader can open.',
    fields: [
      { key: 'title',     label: 'Section title',  kind: 'text', group: 'content' },
      { key: 'multiOpen', label: 'Allow multi-open', kind: 'text', group: 'content', hint: 'true or false, default false' },
      { key: 'items',     label: 'Items',           kind: 'textarea_html', group: 'data', hint: 'AI generates these — use Enhance to add/modify' },
    ]
  },
  Outro: {
    name: 'Ending',
    description: 'The closing reflection — final paragraphs, a lingering thought, and source credits. How you leave the reader.',
    fields: [
      { key: 'h2',          label: 'Heading',     kind: 'text', group: 'content' },
      { key: 'paragraphs',  label: 'Paragraphs',  kind: 'string_list', group: 'content' },
      { key: 'finalLine',   label: 'Final emphasized line',  kind: 'text', group: 'content' },
      { key: 'sourcesHtml', label: 'Sources',     kind: 'textarea_html', group: 'meta',
        hint: 'Separate citations with " · ". Use <code>&lt;br&gt;</code> for line breaks.' },
    ],
  },
  VizPanel: {
    name: 'Dashboard',
    description: 'Shared interactive chart container that scroll-reveal sections drive. Advanced — for multi-step data stories.',
    fields: [
      { key: 'initialTitle', label: 'Chart title (initial)',    kind: 'text', group: 'content' },
      { key: 'initialSub',   label: 'Chart subtitle (initial)', kind: 'text', group: 'content' },
    ],
  },
};

// Friendly labels for badge colors (was technical: pyramid/data/explain/future/voice)
const BADGE_OPTIONS = [
  { value: 'pyramid', label: 'Orange',  color: '#c06830' },
  { value: 'data',    label: 'Blue',    color: '#3d7a94' },
  { value: 'explain', label: 'Purple',  color: '#7a5a90' },
  { value: 'future',  label: 'Green',   color: '#3d7a4a' },
  { value: 'voice',   label: 'Pink',    color: '#7a3d7a' },
];

// Friendly labels for Editorial item kinds
const EDITORIAL_ITEM_FRIENDLY = {
  kicker:        { label: 'Kicker',         hint: 'small caps label above the heading' },
  h2:            { label: 'Heading',        hint: '' },
  lead:          { label: 'Lead',           hint: 'larger opening paragraph' },
  p:             { label: 'Paragraph',      hint: '' },
  pullquote:     { label: 'Pull quote',     hint: 'with citation' },
  separator:     { label: 'Separator',      hint: 'horizontal line' },
  figureSingle:  { label: 'Image',          hint: '' },
  figurePair:    { label: 'Image pair',     hint: 'two images side by side' },
  captionInline: { label: 'Caption',        hint: 'italic, under a figure' },
  captionCenter: { label: 'Caption (centered)', hint: '' },
  whatsappCard:  { label: 'WhatsApp card',  hint: 'styled chat bubble' },
  bigNumber:     { label: 'Big number',     hint: 'large stat with label' },
  customHTML:    { label: 'Custom HTML',    hint: 'advanced — raw HTML escape hatch' },
  callout:       { label: 'Callout', hint: 'highlighted box' },
  dropcap:       { label: 'Drop-cap paragraph', hint: 'paragraph with large initial letter' },
  list:          { label: 'List', hint: 'bulleted or numbered' },
  stepList:      { label: 'Step-by-step',  hint: 'numbered how-to steps with title + body each' },
  highlight:     { label: 'Highlight',     hint: 'marker-style emphasized paragraph' },
  footnote:      { label: 'Footnote',      hint: 'inline ref → endnote at bottom of page' },
  factCheck:     { label: 'Fact check',    hint: 'claim + TRUE/FALSE/MISLEADING verdict' },
};

const EDITORIAL_ITEM_KINDS = [
  { kind: 'h2',            label: 'Heading' },
  { kind: 'kicker',        label: 'Kicker' },
  { kind: 'lead',          label: 'Lead' },
  { kind: 'p',             label: 'Paragraph' },
  { kind: 'dropcap',       label: 'Drop-cap paragraph' },
  { kind: 'list',          label: 'List' },
  { kind: 'stepList',      label: 'Step-by-step list' },
  { kind: 'bigNumber',     label: 'Big number' },
  { kind: 'callout',       label: 'Callout' },
  { kind: 'pullquote',     label: 'Pull quote' },
  { kind: 'highlight',     label: 'Highlighted paragraph' },
  { kind: 'footnote',      label: 'Footnote' },
  { kind: 'factCheck',     label: 'Fact check' },
  { kind: 'figureSingle',  label: 'Image' },
  { kind: 'figurePair',    label: 'Image pair' },
  { kind: 'captionInline', label: 'Caption' },
  { kind: 'captionCenter', label: 'Caption (centered)' },
  { kind: 'separator',     label: 'Separator' },
  { kind: 'whatsappCard',  label: 'WhatsApp card' },
];

// Palette organized by narrative function — what does this moment in your story need?
const PALETTE_CATEGORIES = [
  {
    label: 'Immersive (WebGL)',
    hint: 'GPU-powered showpieces — 3D models and shader scenes',
    types: ['Scene3D'],
  },
  {
    label: 'Page Structure',
    hint: 'Cover, section breaks, progress bar, and the ending',
    types: ['Hero', 'ChapterDivider', 'ProgressNav', 'Outro'],
  },
  {
    label: 'Text',
    hint: 'Paragraphs, quotes, callouts, and expandable sections',
    types: ['Editorial', 'Quote', 'Aside', 'AccordionBlock'],
  },
  {
    label: 'Images & Media',
    hint: 'Photos, galleries, video, audio, and 3D models',
    types: ['FullscreenImage', 'FullBleed', 'ImageGrid', 'ImageCompare', 'ImageHotspot', 'VideoEmbed', 'AudioPlayer'],
  },
  {
    label: 'Scroll Animations',
    hint: 'Content that moves and changes as the reader scrolls',
    types: ['Scrolly', 'DataScrolly'],
  },
  {
    label: 'Data & Facts',
    hint: 'Big numbers, timelines, maps, and dashboards',
    types: ['StatRow', 'Timeline', 'Map2D', 'VizPanel'],
  },
  {
    label: 'Embeds',
    hint: 'Embed an external interactive page or widget',
    types: ['EmbedBlock'],
  },
  {
    label: 'Advanced effects (experimental)',
    hint: 'Shader and particle effects — powerful but fiddly. Skip these while you get started.',
    types: ['WebGLGradient', 'WebGLFlowmap', 'WebGLParticles'],
  },
];
// Flat list for backward compat (used by DIRECT_MODE_DISABLED check etc.)
const PALETTE_BLOCKS = PALETTE_CATEGORIES.flatMap(c => c.types.map(type => ({
  type, desc: BLOCK_SCHEMAS[type]?.description || ''
})));

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
const _CAT_FALLBACK = { key:'other', tint:'ti-slate', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>' };
// type → CAT_META, built once at module load (avoids a linear scan per block render).
const _CAT_BY_TYPE = (() => {
  const m = {};
  PALETTE_CATEGORIES.forEach(c => { const meta = CAT_META[c.label]; if (meta) c.types.forEach(t => { m[t] = meta; }); });
  return m;
})();
function categoryOf(type) {
  return _CAT_BY_TYPE[type] || _CAT_FALLBACK;
}

// Tiny inline mockups shown inside the palette cards and at the top of the
// Claude-generation modal so the user sees what the component looks like
// before generating. Each is plain HTML using common admin colors — NOT the
// rendered component itself.
const BLOCK_PREVIEWS = {
  Hero: `
    <div style="text-align:center;padding:8px 0;">
      <div style="font:500 5.5px 'DM Sans',sans-serif;letter-spacing:.2em;color:#888;text-transform:uppercase;">INVESTIGATION</div>
      <div style="font:300 20px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:6px;letter-spacing:-.03em;line-height:1.1;">The Story That <span style="color:#c06830;">Changed</span> Everything</div>
      <div style="font:400 8px 'DM Sans',sans-serif;color:#888;margin-top:4px;">How a single discovery rewrote the rules</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:2px;color:#bbb;">
        <div style="font:400 5.5px 'DM Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;">BEGIN</div>
        <div style="width:6px;height:6px;border-right:1.5px solid #bbb;border-bottom:1.5px solid #bbb;transform:rotate(45deg);"></div>
      </div>
    </div>`,
  ChapterDivider: `
    <div style="text-align:center;padding:10px 0;">
      <div style="font:500 7px 'DM Sans',sans-serif;letter-spacing:.15em;color:#888;text-transform:uppercase;">ACT II</div>
      <div style="font:300 17px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:5px;letter-spacing:-.02em;">The Turning Point</div>
      <div style="font:400 7.5px 'DM Sans',sans-serif;color:#888;margin-top:3px;">Where the story takes a new direction</div>
      <div style="margin:8px auto 0;width:36px;height:2px;background:linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#e1e1fe,#0358f7);border-radius:2px;"></div>
    </div>`,
  Editorial: `
    <div>
      <div style="font:500 6px 'DM Sans',sans-serif;letter-spacing:.12em;color:#c06830;text-transform:uppercase;margin-bottom:4px;">EYEWITNESS</div>
      <div style="font:500 13px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;letter-spacing:-.01em;">Nobody Saw It Coming</div>
      <div style="font:400 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.5;margin-top:5px;">The morning began like any other. Then everything changed.</div>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">
        <div style="height:4px;background:#e5e5e5;border-radius:2px;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:90%;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:70%;"></div>
      </div>
      <div style="margin-top:6px;border-left:2px solid #c06830;padding-left:8px;">
        <div style="font:300 9px 'DM Sans',sans-serif;color:#1a1a1a;font-style:italic;line-height:1.35;">"I knew right then that nothing would be the same."</div>
      </div>
    </div>`,
  Scrolly: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.2;background:linear-gradient(135deg,#2c2520 0%,#1a1510 100%);border-radius:6px;display:flex;align-items:center;justify-content:center;min-height:72px;position:relative;overflow:hidden;">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.5) 100%);"></div>
        <div style="position:absolute;top:4px;left:6px;font:600 5px 'DM Sans',sans-serif;color:rgba(255,255,255,.5);letter-spacing:.08em;text-transform:uppercase;">STICKY</div>
        <div style="position:absolute;bottom:5px;left:6px;font:500 6.5px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);line-height:1.2;">The image stays<br>while text scrolls</div>
      </div>
      <div style="flex:0.8;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1.5px solid #c06830;border-radius:6px;padding:5px 6px;">
          <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;">
            <div style="width:4px;height:4px;border-radius:1px;background:#c06830;"></div>
            <div style="font:600 5.5px 'DM Sans',sans-serif;color:#c06830;letter-spacing:.04em;">REVEAL</div>
          </div>
          <div style="font:400 5.5px 'DM Sans',sans-serif;color:#555;line-height:1.3;">First, the reader sees this.</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:5px 6px;opacity:.45;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">Then this...</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:5px 6px;opacity:.3;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">And finally...</div>
        </div>
      </div>
    </div>`,
  DataScrolly: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.3;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:6px 7px;min-height:72px;">
        <div style="font:500 7px 'DM Sans',sans-serif;color:#1a1a1a;margin-bottom:2px;">The numbers tell the story</div>
        <div style="font:400 5.5px 'DM Sans',sans-serif;color:#888;margin-bottom:6px;">Each step reveals a new layer</div>
        <svg viewBox="0 0 100 35" style="width:100%;height:32px;">
          <line x1="8" y1="30" x2="95" y2="30" stroke="#e5e5e5" stroke-width=".5"/>
          <line x1="8" y1="20" x2="95" y2="20" stroke="#e5e5e5" stroke-width=".3" stroke-dasharray="2,2"/>
          <line x1="8" y1="10" x2="95" y2="10" stroke="#e5e5e5" stroke-width=".3" stroke-dasharray="2,2"/>
          <polyline points="10,28 22,24 36,18 50,20 64,12 78,8 92,5" stroke="#c06830" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="64" cy="12" r="2.5" fill="#c06830"/>
          <line x1="64" y1="3" x2="64" y2="30" stroke="#f59e0b" stroke-width=".7" stroke-dasharray="1.5,1.5"/>
        </svg>
        <div style="font:400 5px 'DM Sans',sans-serif;color:#aaa;margin-top:2px;">Source: research data</div>
      </div>
      <div style="flex:0.7;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1.5px solid #c06830;border-radius:5px;padding:4px 5px;">
          <div style="font:600 5px 'DM Sans',sans-serif;color:#c06830;letter-spacing:.04em;margin-bottom:2px;">FINDING 1</div>
          <div style="font:400 5px 'DM Sans',sans-serif;color:#555;line-height:1.3;">It started slowly...</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.4;">
          <div style="font:500 5px 'DM Sans',sans-serif;color:#888;">Finding 2</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.25;">
          <div style="font:500 5px 'DM Sans',sans-serif;color:#888;">The turning point</div>
        </div>
      </div>
    </div>`,
  Quote: `
    <div style="padding:6px 0;">
      <div style="font:300 12px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.3;letter-spacing:-.02em;padding-left:10px;position:relative;">
        <span style="position:absolute;left:-2px;top:-6px;font-size:26px;color:#c06830;opacity:.3;font-family:Georgia,serif;line-height:1;">&ldquo;</span>
        I saw it happen. Nobody believed us at first.
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;padding-left:10px;">
        <div style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#d4c5b0,#a89880);flex-shrink:0;"></div>
        <div>
          <div style="font:500 7.5px 'DM Sans',sans-serif;color:#1a1a1a;">Maria Kovalenko</div>
          <div style="font:400 6.5px 'DM Sans',sans-serif;color:#888;">Witness · Kyiv, 2024</div>
        </div>
      </div>
    </div>`,
  VideoEmbed: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2a2a 100%);border-radius:6px;height:54px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
      <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
        <div style="width:0;height:0;border-left:9px solid #fff;border-top:5.5px solid transparent;border-bottom:5.5px solid transparent;margin-left:2px;"></div>
      </div>
      <div style="position:absolute;top:5px;left:7px;font:600 5px 'DM Sans',sans-serif;color:rgba(255,255,255,.4);letter-spacing:.06em;text-transform:uppercase;">FOOTAGE</div>
      <div style="position:absolute;bottom:4px;left:6px;right:6px;height:2px;background:rgba(255,255,255,.15);border-radius:1px;">
        <div style="width:35%;height:100%;background:#c06830;border-radius:1px;"></div>
      </div>
    </div>
    <div style="font:400 7px 'DM Sans',sans-serif;color:#888;margin-top:4px;">Interview footage · <span style="font-style:italic;color:#aaa;">recorded on location</span></div>`,
  Timeline: `
    <div style="display:flex;flex-direction:column;gap:8px;padding-left:10px;border-left:2px solid #e5e5e5;position:relative;">
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#c06830;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#c06830;text-transform:uppercase;">MARCH 2020</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">Everything shuts down</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:80%;margin-top:3px;"></div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#e5e5e5;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">JUNE 2021</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">The first signs of recovery</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#e5e5e5;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">TODAY</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">What we learned</div>
        </div>
      </div>
    </div>`,
  StatRow: `
    <div style="display:flex;gap:4px;text-align:center;">
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#c06830;line-height:1;letter-spacing:-.02em;">67%</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">affected</div>
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#c06830;line-height:1;letter-spacing:-.02em;">2.4M</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">displaced</div>
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#c06830;line-height:1;letter-spacing:-.02em;">3x</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">the prior record</div>
      </div>
    </div>`,
  Aside: `
    <div style="border-left:3px solid #c06830;background:rgba(192,104,48,.04);border-radius:0 6px 6px 0;padding:8px 10px;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
        <svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="7" fill="none" stroke="#c06830" stroke-width="1.5"/><path d="M8 5v4M8 11v.5" stroke="#c06830" stroke-width="1.5" stroke-linecap="round"/></svg>
        <div style="font:600 8.5px 'DM Sans',sans-serif;color:#1a1a1a;">Why this matters</div>
      </div>
      <div style="font:400 7.5px 'DM Sans',sans-serif;color:#555;line-height:1.5;">Background context the reader needs to understand the significance of what follows.</div>
    </div>`,
  Outro: `
    <div>
      <div style="font:500 13px 'DM Sans',sans-serif;color:#1a1a1a;letter-spacing:-.01em;">What Happens Next</div>
      <div style="margin-top:5px;display:flex;flex-direction:column;gap:3px;">
        <div style="height:4px;background:#e5e5e5;border-radius:2px;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:85%;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:60%;"></div>
      </div>
      <div style="font:300 9.5px 'DM Sans',sans-serif;color:#1a1a1a;font-style:italic;margin-top:8px;line-height:1.3;letter-spacing:-.01em;">The answer, it turns out, was there all along.</div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e5e5;font:400 6px 'DM Sans',sans-serif;color:#aaa;">Sources · Methodology · Credits</div>
    </div>`,
  FullBleed: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#333 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 20%,rgba(0,0,0,.65) 100%);"></div>
      <div style="position:absolute;top:6px;right:8px;">
        <svg viewBox="0 0 16 16" width="10" height="10" style="opacity:.4;"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
      </div>
      <div style="position:absolute;bottom:8px;left:10px;right:10px;z-index:1;">
        <div style="font:600 14px 'DM Sans',sans-serif;color:#fff;line-height:1.1;letter-spacing:-.02em;">The Moment</div>
        <div style="font:400 7px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);margin-top:3px;">Full-viewport cinematic image or video — stops the reader</div>
      </div>
    </div>`,
  Scene3D: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2a2a 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
      <div style="font-size:22px;">🎲</div>
      <div style="position:absolute;bottom:6px;left:8px;font:700 8px 'DM Sans',sans-serif;color:rgba(255,255,255,.5);letter-spacing:.06em;">SCENE 3D</div>
      <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#0358f7;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.2);"></div>
      </div>
    </div>`,
  WebGLGradient: `<div style="width:100%;height:100%;border-radius:6px;background:linear-gradient(135deg,#c679c4,#fa3d1d 40%,#ffb005 70%,#0358f7);"></div>`,
  WebGLFlowmap: `<div style="width:100%;height:100%;border-radius:6px;background:linear-gradient(120deg,#2a3a5a,#6a4a7a);position:relative;overflow:hidden"><div style="position:absolute;top:40%;left:10%;width:80%;height:3px;background:rgba(255,255,255,.5);filter:blur(1px);transform:rotate(-8deg)"></div></div>`,
  WebGLParticles: `<div style="width:100%;height:100%;border-radius:6px;background:#111;position:relative;overflow:hidden">${Array.from({length:40}).map(()=>`<span style=\"position:absolute;width:2px;height:2px;border-radius:50%;background:#c06830;top:${Math.floor(Math.random()*100)}%;left:${Math.floor(Math.random()*100)}%\"></span>`).join('')}</div>`,
  FullscreenImage: `
    <div style="background:linear-gradient(135deg,#2c1810 0%,#1a1510 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.6) 100%);"></div>
      <div style="position:absolute;bottom:7px;left:10px;z-index:1;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.15em;color:rgba(255,255,255,.6);text-transform:uppercase;">INVESTIGATION</div>
        <div style="font:500 13px 'DM Sans',sans-serif;color:#fff;line-height:1.1;margin-top:2px;">The Place Where It <span style="color:#c06830;">Happened</span></div>
        <div style="font:400 6.5px 'DM Sans',sans-serif;color:rgba(255,255,255,.65);margin-top:2px;">Ken Burns zoom · slow reveal</div>
      </div>
      <div style="position:absolute;bottom:5px;right:8px;display:flex;flex-direction:column;align-items:center;gap:1px;">
        <div style="width:5px;height:5px;border-right:1px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.5);transform:rotate(45deg);"></div>
      </div>
    </div>`,
  ImageCompare: `
    <div style="border-radius:6px;overflow:hidden;height:60px;position:relative;display:flex;">
      <div style="flex:1;background:linear-gradient(135deg,#d4c5b0 0%,#a89880 100%);display:flex;align-items:center;justify-content:center;position:relative;">
        <div style="font:600 5px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;position:absolute;bottom:4px;left:6px;">2019</div>
      </div>
      <div style="width:3px;background:#fff;position:relative;z-index:2;box-shadow:0 0 6px rgba(0,0,0,.3);">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
          <div style="font:700 7px 'DM Sans',sans-serif;color:#888;">⇔</div>
        </div>
      </div>
      <div style="flex:1;background:linear-gradient(135deg,#c06830 0%,#8a4520 100%);display:flex;align-items:center;justify-content:center;position:relative;">
        <div style="font:600 5px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;position:absolute;bottom:4px;right:6px;">2024</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:3px;">
      <div style="font:400 6px 'DM Sans',sans-serif;color:#888;">← Drag to reveal the change →</div>
    </div>`,
  ImageHotspot: `
    <div style="background:linear-gradient(135deg,#e8e4df 0%,#d4cdc5 100%);border-radius:6px;height:64px;position:relative;overflow:hidden;">
      <svg viewBox="0 0 40 40" width="28" height="28" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.12;"><rect x="2" y="6" width="36" height="28" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><circle cx="14" cy="18" r="4" fill="none" stroke="#666" stroke-width="1"/><path d="M2 28l10-8 6 4 8-10 12 8" stroke="#666" stroke-width="1" fill="none"/></svg>
      <div style="position:absolute;top:12px;left:20px;width:16px;height:16px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;">1</div>
      <div style="position:absolute;top:32px;right:24px;width:16px;height:16px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;opacity:.7;">2</div>
      <div style="position:absolute;bottom:10px;left:40px;width:16px;height:16px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;opacity:.45;">3</div>
    </div>
    <div style="font:400 6px 'DM Sans',sans-serif;color:#888;margin-top:3px;">Tap markers to reveal annotations</div>`,
  AccordionBlock: `
    <div style="display:flex;flex-direction:column;gap:3px;">
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">How we investigated</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#c06830;transform:rotate(180deg);">⌃</div>
        </div>
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">
          <div style="height:3px;background:#e5e5e5;border-radius:1px;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:85%;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:55%;"></div>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">Methodology & sources</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#888;">⌃</div>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">Key definitions</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#888;">⌃</div>
        </div>
      </div>
    </div>`,
  VizPanel: `
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px;min-height:68px;">
      <div style="font:500 7px 'DM Sans',sans-serif;color:#1a1a1a;margin-bottom:6px;">Shared chart container</div>
      <svg viewBox="0 0 100 40" style="width:100%;height:36px;">
        <rect x="8" y="28" width="10" height="10" rx="1" fill="#c06830" opacity=".3"/>
        <rect x="22" y="18" width="10" height="20" rx="1" fill="#c06830" opacity=".5"/>
        <rect x="36" y="8" width="10" height="30" rx="1" fill="#c06830" opacity=".7"/>
        <rect x="50" y="14" width="10" height="24" rx="1" fill="#c06830" opacity=".6"/>
        <rect x="64" y="4" width="10" height="34" rx="1" fill="#c06830"/>
        <rect x="78" y="10" width="10" height="28" rx="1" fill="#c06830" opacity=".8"/>
        <line x1="5" y1="38.5" x2="95" y2="38.5" stroke="#e5e5e5" stroke-width=".5"/>
      </svg>
      <div style="font:400 5px 'DM Sans',sans-serif;color:#aaa;margin-top:2px;">Scroll · Reveal sections drive this chart</div>
    </div>`,
  ProgressNav: `
    <div>
      <div style="height:3px;background:#e5e5e5;border-radius:2px;position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:40%;background:linear-gradient(90deg,#c679c4,#c06830,#ffb005);border-radius:2px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;gap:2px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#c06830;display:flex;align-items:center;justify-content:center;">
            <div style="width:3px;height:3px;border-radius:50%;background:#fff;"></div>
          </div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#c06830;">I</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#c06830;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#c06830;">II</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#e5e5e5;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#aaa;">III</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#e5e5e5;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#aaa;">IV</div>
        </div>
      </div>
      <div style="font:400 6px 'DM Sans',sans-serif;color:#888;text-align:center;margin-top:4px;">Where the reader is in your story</div>
    </div>`,
  EmbedBlock: `
    <div style="border:1.5px dashed #d0d0d0;border-radius:6px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
      <svg viewBox="0 0 24 24" width="16" height="16" style="opacity:.35;"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" stroke="#666" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="font:500 7px 'DM Sans',sans-serif;color:#888;">Interactive embed</div>
      <div style="font:400 5.5px 'DM Sans',sans-serif;color:#aaa;">Datawrapper · Flourish · any iframe</div>
    </div>`,
  ImageGrid: `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
      <div style="background:linear-gradient(135deg,#d4cdc5,#a89880);border-radius:4px;height:32px;grid-row:span 2;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="12" height="12" style="opacity:.4;"><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="8" cy="10" r="2" fill="none" stroke="#fff" stroke-width="1"/><path d="M2 16l6-4 3 2 5-6 6 4" stroke="#fff" stroke-width="1" fill="none"/></svg>
      </div>
      <div style="background:linear-gradient(135deg,#e8e4df,#d4cdc5);border-radius:4px;height:14px;"></div>
      <div style="background:linear-gradient(135deg,#e8e4df,#d4cdc5);border-radius:4px;height:14px;"></div>
    </div>
    <div style="font:400 6px 'DM Sans',sans-serif;color:#888;margin-top:3px;text-align:center;">Photo evidence · auto-layout from count</div>`,
  Map2D: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.2;background:linear-gradient(135deg,#e8e4df 0%,#d4cdc5 100%);border-radius:6px;min-height:68px;position:relative;overflow:hidden;">
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.25;">
          <path d="M10 15 Q20 30 40 28 Q60 26 70 40" stroke="#c06830" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <path d="M15 45 Q30 35 50 38 Q65 40 80 30" stroke="#666" stroke-width=".7" fill="none" opacity=".4"/>
        </svg>
        <div style="position:absolute;top:10px;left:14px;width:10px;height:10px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
        <div style="position:absolute;top:28px;right:16px;width:10px;height:10px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:.6;"></div>
        <div style="position:absolute;bottom:8px;left:30px;width:10px;height:10px;border-radius:50%;background:#c06830;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:.35;"></div>
      </div>
      <div style="flex:0.7;display:flex;flex-direction:column;gap:3px;">
        <div style="background:rgba(255,255,255,.9);border:1px solid rgba(192,104,48,.3);border-radius:5px;padding:4px 5px;">
          <div style="font:600 5.5px 'DM Sans',sans-serif;color:#c06830;margin-bottom:2px;">Berlin</div>
          <div style="font:400 5px 'DM Sans',sans-serif;color:#555;">Where it began</div>
        </div>
        <div style="background:rgba(255,255,255,.7);border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.5;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">Istanbul</div>
        </div>
        <div style="background:rgba(255,255,255,.5);border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.3;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">Kyiv</div>
        </div>
      </div>
    </div>`,
  AudioPlayer: `
    <div style="display:flex;gap:8px;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:7px;">
      <div style="width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#c06830 0%,#a05520 100%);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 4h2l4-3v14l-4-3H3a1 1 0 01-1-1V5a1 1 0 011-1z" fill="#fff" opacity=".9"/><path d="M11.5 5.5a3.5 3.5 0 010 5" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/></svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">FIELD RECORDING</div>
        <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">"In Her Own Words"</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
          <div style="width:14px;height:14px;border-radius:50%;background:#c06830;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <div style="width:0;height:0;border-left:5px solid #fff;border-top:3px solid transparent;border-bottom:3px solid transparent;margin-left:1px;"></div>
          </div>
          <div style="flex:1;display:flex;align-items:flex-end;gap:1px;height:14px;">
            ${Array.from({length:24},(_,i)=>`<div style="flex:1;background:#c06830;opacity:${i<8?'.6':'.2'};border-radius:.5px;height:${20+Math.abs(Math.sin(i*.45))*80}%;min-width:1px;"></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`,
};

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
        flatten: true,
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
      // AI generate fills data.content directly — pass it through so the full
      // rich content (pullquotes, separators, bigNumbers, etc.) is preserved.
      if (Array.isArray(data.content) && data.content.length > 0) {
        return { content: data.content };
      }
      // Manual form path: build content from flat fields.
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

// ─────────────────────────── Creation card modal ────────────
// Opens a purpose-built creation form for the given block type.
// opts.insertAfter — block ID to insert after (optional)
function openCreationCard(type, opts = {}) {
  // 3D blocks have no AI-generatable text — skip the Claude modal entirely and
  // open the orbit/upload editor directly by inserting an empty block.
  if (type === 'Scene3D' || type === 'WebGLGradient' || type === 'WebGLFlowmap' || type === 'WebGLParticles') {
    addEmptyBlock(type, opts.insertAfter);
    return;
  }
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
          // Editorial: AI returns {content:[...]} but the creation form shows
          // three flat fields (_kicker, _heading, _body).  Extract the key items
          // so the user can review/edit them before clicking Create.
          // postProcess will use data.content directly, so rich items
          // (pullquotes, separators, etc.) are preserved on Create.
          if (type === 'Editorial' && Array.isArray(r.data.content)) {
            const items = r.data.content;
            const kickerItem = items.find(c => c.kind === 'kicker');
            const h2Item     = items.find(c => c.kind === 'h2');
            const bodyItems  = items.filter(c => c.kind === 'p' || c.kind === 'lead' || c.kind === 'dropcap');
            formData._kicker  = kickerItem?.text || '';
            formData._heading = h2Item?.text || '';
            formData._body    = bodyItems.map(c => c.html || c.text || '').join('\n\n');
          }
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

// ─────────────────────────── DOM refs ────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─────────────────────────── Util ────────────────────────────
function uid(prefix = 'b') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
// Production domain — auto-detect from current origin (supports custom domains)
const PROD_DOMAIN = window.location.origin;

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  document.body.appendChild(t);
  if (window.MX) MX.animateToastIn(t);
  setTimeout(() => {
    if (window.MX) {
      MX.animateToastOut(t).then(() => t.remove());
    } else {
      t.remove();
    }
  }, 2400);
}

// Show a persistent banner with live URL after publish
function showPublishedBanner(url) {
  // Remove any existing banner
  const old = document.getElementById('published-banner');
  if (old) old.remove();

  const banner = document.createElement('div');
  banner.id = 'published-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#000;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px;font-family:var(--font-body);font-size:14px;box-shadow:0 -4px 24px rgba(0,0,0,.15);';
  banner.innerHTML = `
    <span style="color:#4ade80;font-weight:600;">● Live</span>
    <a href="${url}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;text-underline-offset:3px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${url}</a>
    <button id="copy-url-btn" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;">Copy URL</button>
    <button style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;padding:4px 8px;" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(banner);
  if (window.MX) MX.animateBannerIn(banner);

  banner.querySelector('#copy-url-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      const btn = banner.querySelector('#copy-url-btn');
      btn.textContent = 'Copied!';
      btn.style.background = '#4ade80';
      btn.style.color = '#000';
      setTimeout(() => { btn.textContent = 'Copy URL'; btn.style.background = '#333'; btn.style.color = '#fff'; }, 1500);
    });
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 15000);
}

async function getPublicUrl() {
  try {
    const profile = await SB.getProfile();
    const slug = state.currentPageId || 'index';
    const pageSlug = slug === 'index' ? '' : `/${slug}`;
    return `${PROD_DOMAIN}/p/${profile.site_slug}${pageSlug}`;
  } catch {
    return null;
  }
}
function setDirty(d) {
  state.dirty = d;
  // Publish button: enable/disable + pulse dot (null-safe — element may not exist in cached HTML)
  const pub = $('#btn-publish');
  if (pub) pub.disabled = !d;
  const dot = $('#publish-dot');
  if (dot) dot.classList.toggle('active', d);
  if (d) {
    backupToLocal();
    scheduleAutosave();
  }
}

// ── Local backup (crash recovery) ─────────────────────────────────────────
function backupToLocal() {
  if (!state.doc || !state.currentPageId) return;
  try {
    const key = `scrollycms_backup_${state.currentPageId}`;
    localStorage.setItem(key, JSON.stringify({
      doc: state.doc,
      ts: Date.now(),
      version: state.doc.version || 0,
    }));
  } catch (e) { /* localStorage full or disabled — ignore */ }
}

function getLocalBackup(id) {
  try {
    const key = `scrollycms_backup_${id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const backup = JSON.parse(raw);
    // Expire backups older than 24 hours
    if (Date.now() - backup.ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return backup;
  } catch (e) { return null; }
}

function clearLocalBackup(id) {
  try { localStorage.removeItem(`scrollycms_backup_${id}`); } catch (e) {}
}

// ── Save indicator (Webflow-style pill) ──────────────────────────────────
let _siHideTimer = null;
function showSaveIndicator(status) {
  const el = $('#save-indicator');
  if (!el) return;
  const icon = el.querySelector('.save-indicator__icon');
  const text = el.querySelector('.save-indicator__text');
  clearTimeout(_siHideTimer);

  // Reset
  el.className = 'save-indicator';

  switch (status) {
    case 'saving':
      icon.innerHTML = '<span class="spinner"></span>';
      text.textContent = 'Saving';
      el.classList.add('saving', 'visible');
      break;
    case 'saved':
      icon.innerHTML = '<span class="check"></span>';
      text.textContent = 'Saved';
      el.classList.add('saved', 'visible');
      _siHideTimer = setTimeout(() => el.classList.remove('visible'), 2200);
      break;
    case 'error':
      icon.innerHTML = '<span class="err-icon"></span>';
      text.textContent = 'Save failed';
      el.classList.add('error', 'visible');
      el.onclick = () => { el.onclick = null; runAutosave(); };
      break;
    case 'publishing':
      icon.innerHTML = '<span class="spinner"></span>';
      text.textContent = 'Publishing';
      el.classList.add('publishing', 'visible');
      break;
    case 'published':
      icon.innerHTML = '<span class="check"></span>';
      text.textContent = 'Published';
      el.classList.add('published', 'visible');
      _siHideTimer = setTimeout(() => el.classList.remove('visible'), 2800);
      break;
    default:
      el.classList.remove('visible');
  }
}
// Backward compat alias (some code paths still call this)
function setSaveStatus(s) { showSaveIndicator(s); }
// ─────────────────────────── API (Supabase-backed) ─────────
// SB.* functions from supabase-client.js replace the old fetch-based api().

// ─────────────────────────── Auth ────────────────────────────
async function checkSession() {
  // Password-recovery links land on /admin with a recovery token in the URL hash.
  // Don't auto-enter the editor — let the recovery handler show the set-password form.
  if (location.hash.includes('type=recovery')) {
    showAuth();
    return;
  }
  try {
    const { loggedIn } = await SB.checkSession();
    if (loggedIn) { showApp(); return; }
  } catch { /* ignore */ }
  // Not logged in — show the full-screen auth gate.
  showAuth();
}
function showAuth() {
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadPages();
}

// Tab switcher
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', which !== 'login');
    document.getElementById('signup-form').classList.toggle('hidden', which !== 'signup');
    document.getElementById('auth-success').classList.add('hidden');
    document.getElementById('reset-request-form').classList.add('hidden');
    document.getElementById('set-password-form').classList.add('hidden');
  });
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-pwd').value;
  document.getElementById('login-error').textContent = '';
  try {
    await SB.login(email, pwd);
    localStorage.setItem('scrollycms_email', email);
    document.getElementById('login-email').value = '';
    document.getElementById('login-pwd').value = '';
    showApp();
  } catch (err) {
    const raw = err.message || 'Login failed';
    document.getElementById('login-error').textContent =
      /not confirmed|confirm/i.test(raw)
        ? 'Please confirm your email first — check your inbox for the confirmation link.'
        : raw;
  }
});

// Signup
let _pendingConfirmEmail = '';
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pwd = document.getElementById('signup-pwd').value;
  document.getElementById('signup-error').textContent = '';
  try {
    const r = await SB.signup(email, pwd, name);
    if (r.needsConfirmation) {
      _pendingConfirmEmail = email;
      document.getElementById('signup-form').classList.add('hidden');
      document.getElementById('auth-success').classList.remove('hidden');
    } else {
      showApp();
    }
  } catch (err) {
    document.getElementById('signup-error').textContent = err.message || 'Signup failed';
  }
});

// Resend confirmation
document.getElementById('resend-confirm').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const msg = document.getElementById('resend-msg');
  if (!_pendingConfirmEmail) {
    msg.textContent = 'Sign up first, then resend.';
    msg.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Sending…';
  try {
    await SB.resendConfirmation(_pendingConfirmEmail);
    msg.style.color = '#1a7f37';
    msg.textContent = 'Sent. Check your inbox (and spam).';
  } catch {
    // Generic message — don't surface raw errors that could reveal account state.
    msg.style.color = '';
    msg.textContent = 'Could not resend right now. Please try again in a moment.';
  }
  msg.style.display = 'block';
  // Respect Supabase rate limits — re-enable after a short delay.
  setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 20000);
});

// Forgot password — toggle the request form
document.getElementById('forgot-link').addEventListener('click', () => {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('reset-request-form').classList.remove('hidden');
  document.getElementById('reset-email').value =
    document.getElementById('login-email').value.trim();
  document.getElementById('reset-email').focus();
});
document.getElementById('reset-cancel').addEventListener('click', () => {
  document.getElementById('reset-request-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
});
document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type=submit]');
  const email = document.getElementById('reset-email').value.trim();
  const msg = document.getElementById('reset-request-msg');
  btn.disabled = true;
  try {
    await SB.requestPasswordReset(email);
  } catch { /* ignore — never reveal whether the account exists */ }
  // Neutral message regardless of outcome (no account enumeration).
  msg.style.color = '#1a7f37';
  msg.textContent = 'If that email has an account, we sent a reset link.';
});

// Password recovery — show the set-password form when the recovery link is used
window.addEventListener('scrollycms:password-recovery', () => {
  showAuth();
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('reset-request-form').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
  document.getElementById('set-password-form').classList.remove('hidden');
  document.getElementById('new-pwd').focus();
});
document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('new-pwd').value;
  document.getElementById('set-password-error').textContent = '';
  try {
    await SB.updatePassword(pwd);
    // Clear the recovery token from the URL, then enter the editor.
    history.replaceState(null, '', '/admin');
    document.getElementById('new-pwd').value = '';
    showApp();
  } catch (err) {
    document.getElementById('set-password-error').textContent = err.message || 'Could not update password.';
  }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await SB.logout().catch(() => {});
  state.doc = null;
  showAuth();
});

// ─────────────────────────── Pages ───────────────────────────
// Build a small, valid demo page from default block data (+ Hero overrides).
function buildDemoContent() {
  const mk = (type, over) => ({ id: uid('b'), type, data: { ...defaultDataFor(type), ...(over || {}) } });
  return {
    id: 'welcome',
    version: 1,
    lang: 'de',
    theme: 'claude',
    meta: { title: 'Welcome to ScrollyCMS' },
    blocks: [
      mk('Hero', {
        brand: 'GETTING STARTED',
        titleHtml: 'Welcome to <span>ScrollyCMS</span>',
        subtitle: 'This is a demo page we made for you. Open the blocks on the left, edit them, add new ones with "+ Add", then hit Publish. Delete this page whenever you like.',
        scrollCueText: 'Scroll to explore',
      }),
      mk('Editorial'),
      mk('Quote'),
      mk('ImageGrid'),
    ],
  };
}

async function loadPages(preferId) {
  let { pages, pageRows } = await SB.listPages();

  // First-login onboarding: zero pages + not yet onboarded → seed a demo page.
  // Uses getSession() (cached, no network) rather than the unauthenticated getUser endpoint.
  try {
    const uid_ = (await SB.client.auth.getSession()).data.session?.user?.id;
    const flagKey = uid_ ? `scrollycms_onboarded_${uid_}` : null;
    if (uid_ && flagKey && !localStorage.getItem(flagKey)) {
      if (pages.length === 0) {
        const seeded = await SB.seedDemoPage(buildDemoContent());
        preferId = seeded.id || 'welcome';
        ({ pages, pageRows } = await SB.listPages());
        localStorage.setItem(flagKey, '1');
        if (window.Onboarding) window.Onboarding.maybeRun(uid_);
      } else {
        // Existing user who already has pages — mark onboarded so that deleting
        // every page later never re-triggers the demo seed / welcome modal.
        localStorage.setItem(flagKey, '1');
      }
    }
  } catch (e) {
    console.warn('[onboarding] seeding skipped:', e?.message || e);
  }

  state.pages = pages;
  state.pageRows = pageRows;
  const sel = $('#page-select');
  sel.innerHTML = pageRows.map(r => `<option value="${escapeAttr(r.slug)}">${escapeText(r.title || r.slug)}</option>`).join('');
  const toLoad = preferId && pages.includes(preferId) ? preferId : (state.currentPageId && pages.includes(state.currentPageId) ? state.currentPageId : pages[0]);
  if (toLoad) {
    sel.value = toLoad;
    loadPage(toLoad);
  }
  if (typeof updatePageTitleUI === 'function') updatePageTitleUI();
}
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
        ? '<div class="asset-thumb" style="background-image:url(\'' + encodeURI(f.url).replace(/'/g, '%27') + '\')"></div>'
        : '<div class="asset-thumb asset-thumb--icon ' + cls + '">' + (badge==='VIDEO'?'▶':badge==='AUDIO'?'♪':'⎙') + '</div>';
      row.innerHTML = thumb +
        '<div class="asset-meta"><div class="asset-name">' + escapeText(f.displayName || f.name) + '</div><div class="asset-sub">' + _fmtSize(f.size) + '</div></div>' +
        '<span class="asset-badge ' + cls + '">' + badge + '</span>';
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<div class="side-empty">Couldn\'t load files.</div>';
  }
}

$('#page-select').addEventListener('change', (e) => loadPage(e.target.value));

// ── Click-to-edit page title + custom page switcher ─────────────────
function updatePageTitleUI() {
  const txt = document.getElementById('page-title-text');
  if (!txt) return;
  const sel = document.getElementById('page-select');
  const current = (state.pageRows || []).find(r => r.slug === (sel && sel.value));
  txt.textContent = current ? (current.title || current.slug) : 'No page selected';
  txt.classList.toggle('page-title-text--empty', !current);
}

function beginRenameTitle() {
  const txt = document.getElementById('page-title-text');
  const sel = document.getElementById('page-select');
  if (!txt || !sel || !sel.value) return;
  const slug = sel.value;
  const currentTitle = txt.textContent;
  const input = document.createElement('input');
  input.className = 'page-title-input';
  input.value = currentTitle;
  txt.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return; done = true;
    const newTitle = input.value.trim();
    const restore = document.createElement('span');
    restore.id = 'page-title-text';
    restore.className = 'page-title-text';
    restore.title = 'Click to rename';
    restore.addEventListener('click', beginRenameTitle);
    input.replaceWith(restore);
    if (commit && newTitle && newTitle !== currentTitle && sel.value === slug) {
      try {
        await SB.renamePage(slug, newTitle);
        const row = (state.pageRows || []).find(r => r.slug === slug);
        if (row) row.title = newTitle;
        const opt = [...sel.options].find(o => o.value === slug);
        if (opt) opt.textContent = newTitle;
        toast('Page renamed', 'success');
      } catch (e) { toast(e.message || 'Rename failed', 'error'); }
    }
    updatePageTitleUI();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function togglePageSwitcher(forceClose) {
  const menu = document.getElementById('page-switcher-menu');
  const sel = document.getElementById('page-select');
  if (!menu || !sel) return;
  if (forceClose || !menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = '';
  (state.pageRows || []).forEach(r => {
    const b = document.createElement('button');
    b.textContent = r.title || r.slug;
    if (r.slug === sel.value) b.classList.add('active');
    b.addEventListener('click', () => {
      menu.hidden = true;
      sel.value = r.slug;
      loadPage(r.slug);
      updatePageTitleUI();
    });
    menu.appendChild(b);
  });
  menu.hidden = false;
}

document.getElementById('page-title-text').addEventListener('click', beginRenameTitle);
document.getElementById('page-switcher-btn').addEventListener('click', (e) => { e.stopPropagation(); togglePageSwitcher(); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('#page-title-wrap')) togglePageSwitcher(true);
});

// + New page
$('#btn-new-page').addEventListener('click', () => {
  openModal('Create a new page', (body) => {
    body.innerHTML = '';
    const hint = document.createElement('p');
    hint.style.cssText = 'color:#57606a;font-size:12.5px;margin-bottom:12px;line-height:1.5;';
    hint.innerHTML = `Give your page a title — we'll turn it into a web address (URL) for you.<br>You can edit the URL below. Lowercase letters, numbers and dashes only.`;
    body.appendChild(hint);

    // 1) Page title (first field)
    const titleLabel = document.createElement('label');
    titleLabel.className = 'field-label';
    titleLabel.textContent = 'Page title';
    body.appendChild(titleLabel);
    const titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.placeholder = 'My new page';
    titleInp.style.marginBottom = '12px';
    body.appendChild(titleInp);

    // 2) Page ID / slug (second field, auto-derived from title)
    const slugLabel = document.createElement('label');
    slugLabel.className = 'field-label';
    slugLabel.textContent = 'Page URL (auto-generated)';
    body.appendChild(slugLabel);
    const slugInp = document.createElement('input');
    slugInp.type = 'text';
    slugInp.placeholder = 'my-new-page';
    slugInp.style.marginBottom = '12px';
    body.appendChild(slugInp);

    // Theme picker
    const themeLabel = document.createElement('label');
    themeLabel.className = 'field-label';
    themeLabel.textContent = 'Theme';
    themeLabel.style.marginTop = '12px';
    body.appendChild(themeLabel);
    const themeSel = document.createElement('select');
    themeSel.innerHTML = `
      <option value="dia">Dia — Warm editorial (default)</option>
      <option value="scrolli">Scrolli — Modern indigo</option>
      <option value="claude">Claude — Clean modern</option>
      <option value="miranda">Miranda — Vintage newsprint (dark)</option>
    `;
    themeSel.style.marginBottom = '12px';
    body.appendChild(themeSel);

    // Auto-slug from title until the user manually edits the slug.
    let slugTouched = false;
    const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    titleInp.addEventListener('input', () => {
      if (!slugTouched) slugInp.value = slugify(titleInp.value);
    });
    slugInp.addEventListener('input', () => { slugTouched = true; });

    const err = document.createElement('div');
    err.className = 'error';
    err.style.textAlign = 'left';
    body.appendChild(err);

    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    const create = document.createElement('button');
    create.className = 'primary';
    create.textContent = 'Create page';
    create.addEventListener('click', async () => {
      const id = slugInp.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      slugInp.value = id;
      const title = titleInp.value.trim();
      if (!id) { err.textContent = 'Page URL cannot be empty.'; return; }
      if (id.length < 2) { err.textContent = 'Page URL must be at least 2 characters.'; return; }
      if (id.length > 80) { err.textContent = 'Page URL is too long (max 80 characters).'; return; }
      if (!/^[a-z0-9-]+$/.test(id)) { err.textContent = 'ID must be lowercase letters, numbers, and dashes only.'; return; }
      if (id === 'admin') { err.textContent = '"admin" is reserved.'; return; }
      create.disabled = true;
      try {
        await SB.createPage(id, title || id, themeSel.value);
        toast(`Page "${id}" created`, 'success');
        closeModal();
        await loadPages(id);
      } catch (e) {
        err.textContent = e.message;
        create.disabled = false;
      }
    });
    actions.appendChild(cancel);
    actions.appendChild(create);
    body.appendChild(actions);
    setTimeout(() => titleInp.focus(), 50);
  }, '');
});

// ── Rename page ── (btn-rename-page removed from DOM in Task 7; guard against null)
$('#btn-rename-page')?.addEventListener('click', () => {
  if (!state.currentPageId) return;
  const row = state.pageRows?.find(r => r.slug === state.currentPageId);
  const currentTitle = row?.title || state.currentPageId;
  openModal('Rename page', (body) => {
    body.innerHTML = '';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Page title';
    body.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.placeholder = 'Page title';
    body.appendChild(input);
    const err = document.createElement('div');
    err.className = 'error';
    err.style.textAlign = 'left';
    body.appendChild(err);
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    const save = document.createElement('button');
    save.className = 'primary';
    save.textContent = 'Rename';
    save.addEventListener('click', async () => {
      const newTitle = input.value.trim();
      if (!newTitle) { err.textContent = 'Title cannot be empty.'; return; }
      save.disabled = true;
      try {
        await SB.renamePage(state.currentPageId, newTitle);
        toast('Page renamed', 'success');
        closeModal();
        await loadPages(state.currentPageId);
      } catch (e) {
        err.textContent = e.message;
        save.disabled = false;
      }
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    body.appendChild(actions);
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }, '');
});

// ── Delete page — two-click arm/confirm (no modal) ──
$('#btn-delete-page').addEventListener('click', async function() {
  const btn = this;
  if (btn.dataset.confirming) {
    // Second click — execute delete
    clearTimeout(btn._delTimer);
    delete btn.dataset.confirming;
    btn.textContent = '🗑';
    btn.style.cssText = '';
    if (!state.currentPageId) return;
    const row = state.pageRows?.find(r => r.slug === state.currentPageId);
    const label = row?.title || state.currentPageId;
    btn.disabled = true;
    try {
      await SB.deletePage(state.currentPageId);
      toast(`Page "${label}" deleted`, 'success');
      state.currentPageId = null;
      await loadPages();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
    btn.disabled = false;
    return;
  }
  // First click — arm with guard checks
  if (!state.currentPageId) return;
  if (state.pages && state.pages.length <= 1) {
    toast('Cannot delete the only page', 'error');
    return;
  }
  btn.dataset.confirming = '1';
  btn.textContent = '⚠️ Confirm?';
  btn.style.cssText = 'background:#fa3d1d;color:#fff;border-color:#fa3d1d;';
  // Auto-reset after 3 s if user doesn't confirm
  btn._delTimer = setTimeout(() => {
    delete btn.dataset.confirming;
    btn.textContent = '🗑';
    btn.style.cssText = '';
  }, 3000);
});

// Update "View" link to point at the current page (full production URL)
async function updateViewLink() {
  const link = $('#link-view-page');
  try {
    const url = await getPublicUrl();
    link.href = url || '#';
    // Show the bare host+path (no protocol) as the centered identity url, Framer-style.
    link.textContent = url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  } catch {
    link.href = '#';
    link.textContent = '';
  }
}

async function loadPage(id) {
  // No "discard changes?" prompt — flush any pending edits silently before switching.
  if (state.dirty) { await flushAutosave(); }
  state.currentPageId = id;
  state.doc = await SB.getPage(id);
  state.savedVersion = state.doc.version || 0;

  // Silently recover a local backup of unsaved work (e.g. a reload that beat the autosave
  // debounce). Backups are cleared on every successful autosave, so one existing here means
  // there were edits not yet confirmed-saved. Guard against rolling back a newer published
  // version (e.g. published from another tab/device): only restore if the backup is at least
  // as new as the server doc; otherwise it's stale — discard it.
  const backup = getLocalBackup(id);
  let restored = false;
  if (backup && backup.doc && (backup.version || 0) >= (state.doc.version || 0)) {
    state.doc = backup.doc;
    restored = true;
  } else if (backup) {
    clearLocalBackup(id);
  }

  state.selectedBlockId = null;
  state.selectedItemIdx = null;
  // Dirty only when we recovered unsaved work — that re-arms autosave so the recovered
  // doc is actually re-persisted (a plain server load stays clean).
  setDirty(restored);
  _animateNextBlockList = true; // entrance animation on page switch
  renderBlockList();
  renderEditor();
  updateViewLink();
  // Animate content swap
  if (window.MX) MX.animatePageSwap(document.querySelector('.blocks'));
  // Reload the preview iframe to show the new page
  const iframe = $('#preview-frame');
  iframe.src = pageUrl();
  if (typeof updatePageTitleUI === 'function') updatePageTitleUI();
}

// ─────────────────────────── Blocks list (with drag & drop) ──
let _dragIdx = null;
let _animateNextBlockList = false; // set true before renderBlockList to trigger entrance animation

// ─── Touch drag polyfill ───
// Touch devices don't support HTML5 drag & drop natively. This adds
// touch-move-based reorder to any list. `kind` is 'block' or 'subitem'.
function setupTouchDrag(el, idx, listEl, kind) {
  let _touchStartY = 0;
  let _touchClone = null;
  let _touchActive = false;
  const handle = el.querySelector('.drag-handle');
  const target = handle || el;

  target.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    _touchStartY = e.touches[0].clientY;
    _touchActive = false;
    // Long-press detection — start drag after 150ms hold
    el._touchTimer = setTimeout(() => {
      _touchActive = true;
      _dragIdx = idx;
      el.classList.add('dragging');
      // Create floating clone
      _touchClone = el.cloneNode(true);
      _touchClone.style.cssText = `position:fixed;left:16px;right:16px;top:${_touchStartY - 20}px;z-index:9999;opacity:0.9;background:white;border-radius:12px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.2);pointer-events:none;font-size:12px;`;
      _touchClone.classList.remove('dragging');
      document.body.appendChild(_touchClone);
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 150);
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!_touchActive) {
      // Cancel if moved too far before long-press fires
      const dy = Math.abs(e.touches[0].clientY - _touchStartY);
      if (dy > 10) { clearTimeout(el._touchTimer); return; }
      return;
    }
    e.preventDefault();
    const y = e.touches[0].clientY;
    if (_touchClone) _touchClone.style.top = (y - 20) + 'px';

    // Find which item we're over
    const items = Array.from(listEl.querySelectorAll(kind === 'block' ? '.block-item' : '.subitem'));
    listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y > rect.top && y < rect.bottom && item !== el) {
        item.classList.add('drag-over');
        break;
      }
    }
  }, { passive: false });

  const endTouch = () => {
    clearTimeout(el._touchTimer);
    if (!_touchActive) return;
    _touchActive = false;
    el.classList.remove('dragging');
    if (_touchClone) { _touchClone.remove(); _touchClone = null; }

    // Find the drop target
    const items = Array.from(listEl.querySelectorAll(kind === 'block' ? '.block-item' : '.subitem'));
    const overItem = items.find(it => it.classList.contains('drag-over'));
    listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (overItem && _dragIdx !== null) {
      const targetIdx = Number(overItem.dataset.idx);
      if (!isNaN(targetIdx) && targetIdx !== _dragIdx) {
        if (kind === 'block') {
          const blocks = state.doc.blocks;
          const [moved] = blocks.splice(_dragIdx, 1);
          blocks.splice(targetIdx, 0, moved);
          state.selectedBlockId = moved.id;
          setDirty(true);
          renderBlockList();
          renderEditor();
          refreshPreview();
        }
        // Sub-item reorder is handled by the caller via a callback
      }
    }
    _dragIdx = null;
  };
  target.addEventListener('touchend', endTouch);
  target.addEventListener('touchcancel', endTouch);
}

// Reusable drag handlers for sub-item rows (.subitem)
function attachSubitemDrag(row, list, i, onChange) {
  row.draggable = true;
  row.dataset.idx = i;

  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
    // Clean custom drag image — the native snapshot gets clipped by the sidebar's
    // scroll container (looks cropped/doubled). Use a compact labelled chip instead.
    try {
      const kind = (row.querySelector('.subitem-kind')?.textContent || 'Item').trim();
      const ghost = document.createElement('div');
      ghost.className = 'subitem-drag-ghost';
      ghost.textContent = kind;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 14, 14);
      setTimeout(() => ghost.remove(), 0);
    } catch (_) { /* setDragImage unsupported — fall back to native */ }
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    document.querySelectorAll('.subitem.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.subitem.drag-over').forEach(el => el.classList.remove('drag-over'));
    const dragging = row.parentElement?.querySelector('.subitem.dragging');
    if (dragging && dragging !== row) row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove('drag-over');
    const dragging = row.parentElement?.querySelector('.subitem.dragging');
    if (!dragging) return;
    const fromIdx = Number(dragging.dataset.idx);
    const toIdx = i;
    if (isNaN(fromIdx) || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);
    onChange();
    renderEditor();
  });
}

function renderBlockList() {
  const ol = $('#block-list');
  ol.innerHTML = '';
  if (!state.doc) return;

  // Number repeated section types so duplicates are distinguishable (e.g. Text 1, Text 2).
  // Unique types stay unnumbered. Custom labels are never numbered.
  const _typeTotals = {};
  state.doc.blocks.forEach(b => { _typeTotals[b.type] = (_typeTotals[b.type] || 0) + 1; });
  const _typeSeen = {};

  state.doc.blocks.forEach((block, idx) => {
    const li = document.createElement('li');
    li.className = 'block-item' + (block.id === state.selectedBlockId ? ' active' : '');
    li.draggable = true;
    li.dataset.idx = idx;
    li.dataset.blockId = block.id;
    const schemaName = BLOCK_SCHEMAS[block.type]?.name || block.type;
    const cm = categoryOf(block.type);
    const label = block.data?._label || '';
    _typeSeen[block.type] = (_typeSeen[block.type] || 0) + 1;
    const displayName = label || (_typeTotals[block.type] > 1 ? `${schemaName} ${_typeSeen[block.type]}` : schemaName);
    const conf = block.data?._confidence;
    const confBadge = conf === 'low' ? '<span class="conf-badge conf-low" title="Low confidence — AI filled gaps">🔴</span>'
      : conf === 'medium' ? '<span class="conf-badge conf-medium" title="Medium confidence — AI performed synthesis">🟡</span>'
      : '';
    li.innerHTML = `
      <div class="block-header">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <span class="block-icon lucide-box ${cm.tint}">${cm.icon}</span>
        <span class="block-name" title="Double-click to rename">${escapeText(displayName)}</span>
        ${label ? `<span class="block-type-badge">${escapeText(schemaName)}</span>` : ''}
        ${confBadge}
        <span class="block-chevron">›</span>
      </div>
      <div class="block-body"></div>`;

    // Inline rename: double-click the name to edit it in place (no popup)
    const nameEl = li.querySelector('.block-name');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (nameEl.dataset.editing) return;
      nameEl.dataset.editing = '1';
      const original = block.data?._label || '';
      nameEl.textContent = original || schemaName;
      nameEl.contentEditable = 'true';
      nameEl.classList.add('editing');
      nameEl.focus();
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(nameEl); sel.removeAllRanges(); sel.addRange(range);
      let committed = false;
      const commit = (save) => {
        if (committed) return;   // Enter then blur both fire — only commit once
        committed = true;
        nameEl.contentEditable = 'false';
        nameEl.classList.remove('editing');
        delete nameEl.dataset.editing;
        if (save) {
          const val = nameEl.textContent.trim();
          if (!block.data) block.data = {};
          if (val && val !== schemaName) block.data._label = val; else delete block.data._label;
          setDirty(true);
        }
        renderBlockList();
      };
      nameEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      });
      nameEl.addEventListener('blur', () => commit(true), { once: true });
    });

    // Drag & drop handlers
    li.addEventListener('dragstart', (e) => {
      _dragIdx = idx;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      // Custom drag image (compact)
      const ghost = li.cloneNode(true);
      ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;width:200px;opacity:0.9;background:white;border-radius:12px;padding:6px 10px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:12px;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 20, 15);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      _dragIdx = null;
      ol.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      ol.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (_dragIdx !== null && _dragIdx !== idx) {
        li.classList.add('drag-over');
      }
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (_dragIdx === null || _dragIdx === idx) return;
      const blocks = state.doc.blocks;
      const [moved] = blocks.splice(_dragIdx, 1);
      blocks.splice(idx, 0, moved);
      _dragIdx = null;
      // Preserve selection
      state.selectedBlockId = moved.id;
      setDirty(true);
      renderBlockList();
      renderEditor();
      refreshPreview();
    });

    // Touch drag support
    setupTouchDrag(li, idx, ol, 'block');

    // Click header to toggle accordion
    li.querySelector('.block-header').addEventListener('click', (e) => {
      if (e.target.closest('.drag-handle') || e.target.closest('.block-label-edit')) return;
      // Toggle: collapse if already active, expand otherwise
      if (state.selectedBlockId === block.id) {
        state.selectedBlockId = null;
      } else {
        state.selectedBlockId = block.id;
      }
      state.selectedItemIdx = null;
      renderBlockList();
      renderEditor();
      // Scroll expanded block into view
      if (state.selectedBlockId) {
        requestAnimationFrame(() => {
          const active = document.querySelector('.block-item.active');
          if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      // Scroll preview to this block in visual edit mode
      if (state.visualEditMode && state.selectedBlockId) {
        var iframe = $('#preview-frame');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'visual-edit-response',
            action: 'scroll-to-block',
            blockId: state.selectedBlockId,
          }, '*');
        }
      }
    });
    ol.appendChild(li);
  });

  // Drop-at-end zone
  const endZone = document.createElement('li');
  endZone.className = 'drop-end-zone';
  endZone.textContent = 'Drop here';
  endZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    ol.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    endZone.classList.add('drag-over');
  });
  endZone.addEventListener('dragleave', () => endZone.classList.remove('drag-over'));
  endZone.addEventListener('drop', (e) => {
    e.preventDefault();
    endZone.classList.remove('drag-over');
    if (_dragIdx === null) return;
    const blocks = state.doc.blocks;
    const [moved] = blocks.splice(_dragIdx, 1);
    blocks.push(moved);
    _dragIdx = null;
    state.selectedBlockId = moved.id;
    setDirty(true);
    renderBlockList();
    renderEditor();
    refreshPreview();
  });
  ol.appendChild(endZone);

  // Staggered entrance animation — only on page load, not accordion toggles
  if (window.MX && _animateNextBlockList) {
    _animateNextBlockList = false;
    const items = ol.querySelectorAll('.block-item');
    MX.animateBlockListIn(items);
  }
}

function blockSummary(block) {
  const d = block.data || {};
  switch (block.type) {
    case 'Hero':      return d.brand || 'Hero';
    case 'VizPanel':  return d.initialTitle || 'Viz';
    case 'Editorial': {
      const h2 = (d.content || []).find(c => c.kind === 'h2');
      return h2?.text || 'Editorial';
    }
    case 'Scrolly':   return d.scrollyId || `${(d.steps || []).length} steps`;
    case 'Outro':     return d.h2 || 'Outro';
    case 'FullBleed':     return d.title?.replace(/<[^>]+>/g, '') || 'Full Bleed';
    case 'ImageCompare':  return `${d.beforeLabel || '?'} → ${d.afterLabel || '?'}`;
    case 'ImageHotspot': return `${(d.hotspots || []).length} hotspots`;
    case 'AccordionBlock': return d.title || `${(d.items || []).length} items`;
    case 'ProgressNav': return 'Progress bar';
    case 'EmbedBlock': return d.provider || (d.url ? 'Embed' : 'Empty embed');
    case 'ImageGrid': return `${(d.images || []).length} images` + (d.layout ? ` · ${d.layout}` : '');
    case 'Map2D': return `${(d.steps || []).length} steps · ${(d.markers || []).length} markers` + (d.tileStyle && d.tileStyle !== 'default' ? ` · ${d.tileStyle}` : '');
    case 'FullscreenImage': return d.title?.replace(/<[^>]+>/g, '') || 'Fullscreen Image';
    case 'AudioPlayer': return d.title || 'Audio Player';
    case 'Scene3D': {
      const n = (d.scenes || []).filter(Boolean).length;
      return n ? `${n} scene${n !== 1 ? 's' : ''}${d.glbUrl ? '' : ' · no model'}` : 'No scenes saved yet';
    }
    default:          return block.id;
  }
}

function blockDetailSummary(block) {
  const d = block.data || {};
  const lines = [];
  switch (block.type) {
    case 'Hero':
      if (d.brand) lines.push(`<strong>Brand:</strong> ${escapeText(d.brand)}`);
      if (d.titleHtml) lines.push(`<strong>Title:</strong> ${escapeText(d.titleHtml.replace(/<[^>]+>/g, ' '))}`);
      if (d.subtitle) lines.push(`<strong>Subtitle:</strong> ${escapeText(d.subtitle).slice(0, 120)}${d.subtitle.length > 120 ? '...' : ''}`);
      if (d.lines?.length) lines.push(`<strong>Lines:</strong> ${d.lines.length} cinematic lines`);
      break;
    case 'Editorial':
      (d.content || []).forEach(c => {
        if (c.kind === 'kicker') lines.push(`<strong>Kicker:</strong> ${escapeText(c.text).slice(0, 60)}`);
        if (c.kind === 'h2') lines.push(`<strong>Heading:</strong> ${escapeText(c.text).slice(0, 80)}`);
        if (c.kind === 'lead') lines.push(`<strong>Lead:</strong> ${escapeText(c.text).slice(0, 100)}...`);
        if (c.kind === 'p') lines.push(`<strong>Para:</strong> ${escapeText(c.text).slice(0, 80)}...`);
        if (c.kind === 'figure') lines.push(`<strong>Image:</strong> ${escapeText(c.alt || c.src || 'figure')}`);
      });
      break;
    case 'Scrolly':
      if (d.steps?.length) {
        lines.push(`<strong>Steps:</strong> ${d.steps.length}`);
        d.steps.slice(0, 3).forEach((s, i) => {
          lines.push(`&nbsp;&nbsp;${i + 1}. ${escapeText((s.h3 || s.body || '').slice(0, 60))}${(s.h3 || s.body || '').length > 60 ? '...' : ''}`);
        });
        if (d.steps.length > 3) lines.push(`&nbsp;&nbsp;... +${d.steps.length - 3} more`);
      }
      break;
    case 'DataScrolly':
      if (d.chartTitle) lines.push(`<strong>Chart:</strong> ${escapeText(d.chartTitle)}`);
      if (d.steps?.length) lines.push(`<strong>Steps:</strong> ${d.steps.length}`);
      if (d.csvData) lines.push(`<strong>Data:</strong> ${d.csvData.split('\\n').length - 1} rows`);
      break;
    case 'Outro':
      if (d.h2) lines.push(`<strong>Heading:</strong> ${escapeText(d.h2)}`);
      if (d.paragraphs?.length) lines.push(`<strong>Paragraphs:</strong> ${d.paragraphs.length}`);
      break;
    case 'Quote':
      if (d.text) lines.push(`<strong>Quote:</strong> "${escapeText(d.text).slice(0, 100)}..."`);
      if (d.attribution) lines.push(`<strong>By:</strong> ${escapeText(d.attribution)}`);
      break;
    case 'Timeline':
      if (d.events?.length) lines.push(`<strong>Events:</strong> ${d.events.length}`);
      break;
    case 'StatRow':
      if (d.stats?.length) lines.push(`<strong>Stats:</strong> ${d.stats.length} items`);
      break;
    case 'FullBleed':
      if (d.title) lines.push(`<strong>Title:</strong> ${escapeText(d.title.replace(/<[^>]+>/g, ' ')).slice(0, 80)}`);
      if (d.mediaSrc) lines.push(`<strong>Image:</strong> ${escapeText(d.mediaSrc).slice(0, 60)}`);
      if (d.height) lines.push(`<strong>Height:</strong> ${d.height}`);
      if (d.overlayPosition) lines.push(`<strong>Position:</strong> ${d.overlayPosition}`);
      break;
    case 'ImageCompare':
      if (d.beforeLabel) lines.push(`<strong>Before:</strong> ${escapeText(d.beforeLabel)}`);
      if (d.afterLabel) lines.push(`<strong>After:</strong> ${escapeText(d.afterLabel)}`);
      if (d.caption) lines.push(`<strong>Caption:</strong> ${escapeText(d.caption).slice(0, 80)}`);
      break;
    case 'ImageHotspot':
      if (d.src) lines.push(`<strong>Image:</strong> ${escapeText(d.alt || d.src).slice(0, 60)}`);
      if (d.hotspots?.length) {
        lines.push(`<strong>Hotspots:</strong> ${d.hotspots.length}`);
        d.hotspots.slice(0, 3).forEach((hs, i) => {
          lines.push(`&nbsp;&nbsp;${hs.label || i + 1}. ${escapeText(hs.title || '').slice(0, 50)}`);
        });
      }
      break;
    case 'AccordionBlock':
      if (d.title) lines.push(`<strong>Title:</strong> ${escapeText(d.title)}`);
      if (d.items?.length) {
        lines.push(`<strong>Items:</strong> ${d.items.length}`);
        d.items.slice(0, 3).forEach((item, i) => {
          lines.push(`&nbsp;&nbsp;${i + 1}. ${escapeText(item.heading || '').slice(0, 50)}`);
        });
      }
      break;
    case 'ProgressNav':
      lines.push(`<strong>Mode:</strong> ${d.mode || 'bar'}`);
      lines.push(`<strong>Auto-generate:</strong> ${d.autoGenerate !== false ? 'yes' : 'no'}`);
      break;
    case 'EmbedBlock':
      if (d.provider) lines.push(`<strong>Provider:</strong> ${escapeText(d.provider)}`);
      if (d.url) lines.push(`<strong>URL:</strong> ${escapeText(d.url).slice(0, 60)}`);
      if (d.caption) lines.push(`<strong>Caption:</strong> ${escapeText(d.caption).slice(0, 60)}`);
      break;
    case 'ImageGrid':
      lines.push(`<strong>Images:</strong> ${(d.images || []).length}`);
      if (d.layout) lines.push(`<strong>Layout:</strong> ${escapeText(d.layout)}`);
      if (d.caption) lines.push(`<strong>Caption:</strong> ${escapeText(d.caption).slice(0, 60)}`);
      (d.images || []).slice(0, 3).forEach((img, i) => {
        lines.push(`<strong>${i + 1}.</strong> ${escapeText((img.alt || img.src || '').slice(0, 50))}`);
      });
      break;
    case 'Map2D':
      if (d.title) lines.push(`<strong>Title:</strong> ${escapeText(d.title)}`);
      if (d.layout) lines.push(`<strong>Layout:</strong> ${d.layout}`);
      if (d.tileStyle) lines.push(`<strong>Tiles:</strong> ${d.tileStyle}`);
      if (d.markers?.length) lines.push(`<strong>Markers:</strong> ${d.markers.length}`);
      if (d.routes?.length) lines.push(`<strong>Routes:</strong> ${d.routes.length}`);
      if (d.steps?.length) {
        lines.push(`<strong>Steps:</strong> ${d.steps.length}`);
        d.steps.slice(0, 3).forEach((s, i) => {
          lines.push(`&nbsp;&nbsp;${i + 1}. ${escapeText((s.body || '').slice(0, 60))}${(s.body || '').length > 60 ? '...' : ''}`);
        });
      }
      break;
    case 'FullscreenImage':
      if (d.title) lines.push(`<strong>Title:</strong> ${escapeText(d.title.replace(/<[^>]+>/g, ' ')).slice(0, 80)}`);
      if (d.kicker) lines.push(`<strong>Kicker:</strong> ${escapeText(d.kicker)}`);
      if (d.imageSrc) lines.push(`<strong>Image:</strong> ${escapeText(d.imageSrc).slice(0, 60)}`);
      if (d.overlayPosition) lines.push(`<strong>Position:</strong> ${d.overlayPosition}`);
      if (d.kenBurns !== undefined) lines.push(`<strong>Ken Burns:</strong> ${d.kenBurns ? 'on' : 'off'}`);
      break;
    case 'AudioPlayer':
      if (d.title) lines.push(`<strong>Title:</strong> ${escapeText(d.title)}`);
      if (d.subtitle) lines.push(`<strong>Series:</strong> ${escapeText(d.subtitle)}`);
      if (d.audioSrc) lines.push(`<strong>Audio:</strong> ${escapeText(d.audioSrc).slice(0, 60)}`);
      if (d.duration) lines.push(`<strong>Duration:</strong> ${escapeText(d.duration)}`);
      if (d.transcript) lines.push(`<strong>Transcript:</strong> ${escapeText(d.transcript).slice(0, 60)}...`);
      break;
    default:
      const keys = Object.keys(d);
      if (keys.length) lines.push(`<strong>Fields:</strong> ${keys.slice(0, 5).join(', ')}`);
  }
  return lines.length ? lines.join('<br>') : '<em>Empty block</em>';
}

function duplicateBlock(idx) {
  const copy = clone(state.doc.blocks[idx]);
  copy.id = uid('b');
  state.doc.blocks.splice(idx + 1, 0, copy);
  setDirty(true);
  renderBlockList();
  refreshPreview({ immediate: true });
}
function deleteBlock(idx) {
  const block = state.doc.blocks[idx];
  if (!block) return;
  if (block.id === state.selectedBlockId) state.selectedBlockId = null;
  state.doc.blocks.splice(idx, 1);
  setDirty(true);
  renderBlockList();
  renderEditor();
  refreshPreview({ immediate: true });
}

// Full Article builder button
const btnArticleBuilder = document.getElementById('btn-article-builder');
if (btnArticleBuilder) {
  btnArticleBuilder.addEventListener('click', () => {
    if (window.openArticleBuilder) window.openArticleBuilder();
  });
}

// ── Component library (in-sidebar, Framer-style — no popup) ──
// Opening replaces the sidebar tabs/panes with the categorized list; hovering a
// category opens a flyout of real-preview cards that overlaps the canvas.
function openLibrary(afterBlockId) {
  const lib = document.getElementById('side-library');
  if (!lib) return;
  state._libAfterId = afterBlockId || null;
  const tabs = document.getElementById('side-tabs');
  if (tabs) tabs.hidden = true;
  document.querySelectorAll('.side-pane').forEach(p => { p.hidden = true; });
  lib.hidden = false;
  const title = lib.querySelector('.lib-head-title');
  if (title) title.textContent = afterBlockId ? 'Insert a section' : 'Add a section';
  renderLibrary(document.getElementById('lib-body'), afterBlockId);
}

function closeLibrary() {
  const lib = document.getElementById('side-library');
  if (lib) lib.hidden = true;
  state._libAfterId = null;
  document.querySelectorAll('.lib-flyout.lib-pop').forEach(f => f.remove()); // remove body-level flyout
  const tabs = document.getElementById('side-tabs');
  if (tabs) tabs.hidden = false;
  const activeName = tabs?.querySelector('.side-tab.on')?.getAttribute('data-pane') || 'sections';
  document.querySelectorAll('.side-pane').forEach(p => { p.hidden = (p.getAttribute('data-pane') !== activeName); });
}

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

document.getElementById('lib-back')?.addEventListener('click', closeLibrary);

// "+ Add" opens the library in the sidebar (replaces the old popup)
$('#btn-add-block').addEventListener('click', () => openLibrary());

function renderLibrary(body, afterBlockId) {
  body.innerHTML = '';
  document.querySelectorAll('.lib-flyout.lib-pop').forEach(f => f.remove()); // clear any stale flyout
  const dock = document.createElement('div');
  dock.className = 'lib-dock';
  const list = document.createElement('div');
  list.className = 'lib-list';
  // Flyout lives on <body> so the sidebar's backdrop-filter can't clip it.
  const fly = document.createElement('div');
  fly.className = 'lib-flyout lib-pop';
  fly.style.display = 'none';
  dock.appendChild(list); body.appendChild(dock); document.body.appendChild(fly);

  let closeTimer = null;
  const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } };
  function hideFly(){ fly.style.display = 'none'; list.querySelectorAll('.lib-cat').forEach(r => r.classList.remove('on')); }
  const scheduleClose = () => { cancelClose(); closeTimer = setTimeout(hideFly, 280); };

  PALETTE_CATEGORIES.forEach(cat => {
    const meta = CAT_META[cat.label] || categoryOf(cat.types[0]);
    const row = document.createElement('div');
    row.className = 'lib-cat';
    row.innerHTML = '<span class="lucide-box ' + meta.tint + '">' + meta.icon + '</span>' +
      '<span class="lib-cat-label">' + cat.label + '</span>' +
      '<span class="lib-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>';
    row.addEventListener('mouseenter', () => { cancelClose(); openFly(cat, row); });
    list.appendChild(row);
  });
  list.addEventListener('mouseleave', scheduleClose);
  fly.addEventListener('mouseenter', cancelClose);
  fly.addEventListener('mouseleave', scheduleClose);

  function openFly(cat, row){
    list.querySelectorAll('.lib-cat').forEach(r => r.classList.toggle('on', r===row));
    // Position the flyout flush to the sidebar's right edge, top-aligned.
    // Fixed positioning avoids clipping by the sidebar's overflow.
    const sb = document.querySelector('.blocks.sidebar');
    if (!sb) return;
    const sRect = sb.getBoundingClientRect();
    fly.style.left = Math.round(sRect.right) + 'px';     // flush to the sidebar edge (no gap)
    fly.style.top = Math.round(sRect.top) + 'px';        // full height: fill from the sidebar's top…
    fly.style.height = Math.round(sRect.height) + 'px';  // …to its bottom (fills the top & bottom gaps)
    fly.innerHTML = '';
    cat.types.forEach(type => {
      const schema = BLOCK_SCHEMAS[type];
      if (!schema) return;
      const card = document.createElement('div');
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
    });
    fly.style.display = 'flex';
  }
}
// Legacy name kept for backwards-compat; routes through the Claude flow.
function addBlock(type) { openCreationCard(type); }

// Block types where Direct mode doesn't make sense (need AI to generate structured data)
const DIRECT_MODE_DISABLED = new Set([
  'Map2D', 'DataScrolly', 'Scrolly', 'StatRow', 'Timeline',
  'ImageCompare', 'ImageHotspot', 'AccordionBlock', 'ImageGrid',
  'VizPanel', 'ProgressNav', 'EmbedBlock', 'VideoEmbed',
]);

// ─────────────────────────── Claude-powered create / improve ──
// opts: { mode: 'create' | 'improve', type, block? (for improve) }
function openClaudeModal(opts) {
  const isImprove = opts.mode === 'improve';
  const type = isImprove ? opts.block.type : opts.type;
  const schemaDisplayName = BLOCK_SCHEMAS[type]?.name || type;
  const title = isImprove ? `✨ Enhance ${schemaDisplayName}` : `✨ New ${schemaDisplayName} — Describe with Claude`;
  let uploadedImages = [];

  openModal(title, (body) => {
    body.innerHTML = '';

    if (BLOCK_PREVIEWS[type]) {
      const previewBox = document.createElement('div');
      previewBox.className = 'claude-modal-preview';
      const previewLabel = document.createElement('div');
      previewLabel.className = 'claude-modal-preview-label';
      previewLabel.textContent = schemaDisplayName;
      const previewMock = document.createElement('div');
      previewMock.className = 'claude-modal-preview-mock';
      previewMock.innerHTML = BLOCK_PREVIEWS[type];
      previewBox.appendChild(previewLabel);
      previewBox.appendChild(previewMock);
      body.appendChild(previewBox);
    }

    // Show current block data summary for improve mode
    if (isImprove && opts.block) {
      const dataCard = document.createElement('div');
      dataCard.className = 'claude-modal-data';
      dataCard.innerHTML = `<div class="claude-modal-data-label">Current content</div>${blockDetailSummary(opts.block)}`;
      body.appendChild(dataCard);
    }

    // ── Mode toggle: AI Enhanced ↔ Direct Paste ──
    let aiMode = true; // true = AI enhanced, false = direct paste
    const canDirect = !DIRECT_MODE_DISABLED.has(type);
    const toggle = document.createElement('div');
    toggle.className = 'claude-modal-mode-toggle';
    const aiBtn = document.createElement('button');
    aiBtn.type = 'button';
    aiBtn.className = 'claude-modal-mode-btn active';
    aiBtn.innerHTML = '✨ AI Enhanced';
    const directBtn = document.createElement('button');
    directBtn.type = 'button';
    directBtn.className = 'claude-modal-mode-btn';
    directBtn.innerHTML = '📝 Direct';
    if (!canDirect) { directBtn.disabled = true; directBtn.title = `${type} requires AI to generate structured data`; directBtn.style.opacity = '0.35'; directBtn.style.cursor = 'not-allowed'; }
    toggle.appendChild(aiBtn);
    toggle.appendChild(directBtn);
    body.appendChild(toggle);

    const hint = document.createElement('div');
    hint.className = 'claude-modal-hint';

    const aiHintIntro = isImprove
      ? `Tell Claude what to change — <strong>anything</strong> goes:`
      : `Describe what this section should be about. Claude writes the content (German, matching the existing voice):`;
    const aiHintExamples = isImprove
      ? [
          'Make the hero cover the full viewport',
          'Rewrite the text in a more dramatic tone',
          'Add an image of Pacific islands',
          'Change the stats to show 5 items instead of 3',
          'Make the title shorter and punchier',
        ]
      : [
          'A section about how Watergate changed investigative journalism',
          '3 scrolly steps explaining what NLP is',
          'A pull quote from Hannah Arendt and 2 paragraphs about press freedom',
        ];
    const directHintIntro = isImprove
      ? `Paste your text below — Claude will place it in the right fields but <strong>won't rewrite</strong> a single word:`
      : `Paste or type your content — Claude will structure it into the right fields but <strong>keep every word exactly as you wrote it</strong>:`;

    function updateHint() {
      if (aiMode) {
        hint.innerHTML = `<span>${aiHintIntro}</span><div class="claude-modal-examples">${aiHintExamples.map(e => `<div class="claude-modal-example">${e}</div>`).join('')}</div>`;
      } else {
        hint.innerHTML = `<span>${directHintIntro}</span>`;
      }
    }
    updateHint();
    body.appendChild(hint);

    // Prompt textarea
    const ta = document.createElement('textarea');
    ta.className = 'claude-modal-textarea';
    ta.rows = 5;

    function updateTextarea() {
      if (aiMode) {
        ta.placeholder = isImprove ? 'Describe the change you want…' : `Describe the ${type.toLowerCase()} you want…`;
      } else {
        ta.placeholder = isImprove ? 'Paste your updated text here…' : `Paste your ${type.toLowerCase()} content here…`;
      }
    }
    updateTextarea();
    body.appendChild(ta);

    // Toggle handler
    function setMode(ai) {
      aiMode = ai;
      aiBtn.classList.toggle('active', ai);
      directBtn.classList.toggle('active', !ai);
      updateHint();
      updateTextarea();
      // Update action button text
      if (genBtn) {
        genBtn.textContent = ai
          ? (isImprove ? '✨ Enhance with Claude' : '✨ Generate with Claude')
          : (isImprove ? 'Apply text' : 'Create block');
      }
    }
    aiBtn.addEventListener('click', () => setMode(true));
    directBtn.addEventListener('click', () => setMode(false));

    // File upload area — accepts type-relevant files (audio for AudioPlayer, images for others)
    const isAudioBlock = type === 'AudioPlayer';
    const isVideoBlock = type === 'VideoEmbed' || type === 'FullBleed';
    const acceptTypes = isAudioBlock ? 'audio/*' : isVideoBlock ? 'image/*,video/*' : 'image/*';
    const attachLabel = isAudioBlock ? 'Attach audio files (optional)' : 'Attach files (optional)';
    const attachSub = isAudioBlock ? 'Upload audio for Claude to reference' : 'Claude will use these in the section';

    const imgsWrap = document.createElement('div');
    imgsWrap.className = 'claude-modal-upload';
    const imgsLabel = document.createElement('div');
    imgsLabel.className = 'claude-modal-upload-label';
    imgsLabel.textContent = attachLabel;
    const imgsSub = document.createElement('div');
    imgsSub.className = 'claude-modal-upload-sublabel';
    imgsSub.textContent = attachSub;
    imgsWrap.appendChild(imgsLabel);
    imgsWrap.appendChild(imgsSub);
    const filePick = document.createElement('input');
    filePick.type = 'file';
    filePick.accept = acceptTypes;
    filePick.multiple = true;
    const previewWrap = document.createElement('div');
    previewWrap.className = 'claude-modal-thumbs';

    async function handleModalUpload(files) {
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
      for (const f of Array.from(files)) {
        if (f.size > MAX_UPLOAD_SIZE) {
          toast(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`, 'error');
          continue;
        }
        try {
          const r = await SB.uploadFile(f);
          uploadedImages.push(r.url);
          const thumb = document.createElement('div');
          thumb.className = 'claude-modal-thumb';
          if (f.type.startsWith('audio/')) {
            thumb.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--fog,#eaeef2);';
            thumb.textContent = '🎵';
          } else if (f.type.startsWith('video/')) {
            thumb.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--fog,#eaeef2);';
            thumb.textContent = '🎬';
          } else {
            thumb.style.backgroundImage = `url('${encodeURI(r.url)}')`;
          }
          thumb.title = r.url;
          previewWrap.appendChild(thumb);
        } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
      }
    }

    filePick.addEventListener('change', async () => {
      await handleModalUpload(filePick.files);
      filePick.value = '';
    });
    imgsWrap.appendChild(filePick);
    imgsWrap.appendChild(previewWrap);
    // Click anywhere on the upload zone to trigger file picker
    imgsWrap.addEventListener('click', (e) => { if (e.target !== filePick && e.target !== previewWrap && !e.target.closest('.claude-modal-thumb')) filePick.click(); });
    // Drag & drop
    imgsWrap.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); imgsWrap.classList.add('drag-active'); });
    imgsWrap.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); imgsWrap.classList.remove('drag-active'); });
    imgsWrap.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); imgsWrap.classList.remove('drag-active');
      if (e.dataTransfer.files.length) await handleModalUpload(e.dataTransfer.files);
    });
    body.appendChild(imgsWrap);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'claude-modal-actions';
    const manualBtn = document.createElement('button');
    manualBtn.className = 'ghost';
    manualBtn.textContent = isImprove ? 'Cancel' : 'Skip — add empty block';
    manualBtn.addEventListener('click', () => {
      closeModal();
      if (!isImprove) addEmptyBlock(type);
    });
    const genBtn = document.createElement('button');
    genBtn.className = 'primary';
    genBtn.textContent = isImprove ? '✨ Enhance with Claude' : '✨ Generate with Claude';
    genBtn.addEventListener('click', async () => {
      const prompt = ta.value.trim();
      if (!prompt) { ta.focus(); return; }
      if (prompt.length < 3) { toast('Please enter a longer prompt', 'error'); ta.focus(); return; }
      if (prompt.length > 10000) { toast('Prompt is too long (max 10,000 characters). Try shortening it.', 'error'); ta.focus(); return; }

      // ── Both modes go through AI — direct just tells it to preserve text verbatim ──
      const origBtnText = genBtn.textContent;
      genBtn.disabled = true;
      genBtn.textContent = '⏳ Generating…';
      manualBtn.disabled = true;
      const spinner = document.createElement('div');
      spinner.className = 'claude-modal-spinner loading';
      spinner.textContent = aiMode ? 'Claude is writing… (this can take 30–60 seconds)' : 'Structuring your text… (a few seconds)';
      body.appendChild(spinner);
      try {
        const r = await SB.generate({
          type,
          prompt,
          images: uploadedImages,
          currentData: isImprove ? opts.block.data : null,
          mode: isImprove ? 'improve' : 'create',
          pageId: state.currentPageId,
          lang: state.doc?.lang || undefined,
          direct: !aiMode || undefined,
        });
        if (isImprove) {
          // Deep merge — AI response overwrites matched fields, preserves unmentioned ones
          function deepMerge(target, source) {
            const result = { ...target };
            for (const key of Object.keys(source)) {
              if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
                  && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                result[key] = deepMerge(target[key], source[key]);
              } else {
                result[key] = source[key];
              }
            }
            return result;
          }
          opts.block.data = deepMerge(opts.block.data || {}, r.data);
          setDirty(true);
          renderBlockList();
          if (opts.block.id === state.selectedBlockId) renderEditor();
          toast(aiMode ? `${type} enhanced by Claude` : `${type} updated — text preserved`, 'success');
        } else {
          // If no page is loaded yet, auto-create one first
          if (!state.doc) {
            const title = prompt.slice(0, 40) || 'New Page';
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
            const created = await SB.createPage(slug, title);
            state.currentPageId = created.id;
            state.doc = await SB.getPage(created.id);
            state.savedVersion = state.doc.version || 0;
            await loadPages(created.id);
          }
          const newBlock = { id: uid('b'), type, data: r.data };
          if (opts.insertAfter) {
            const insertIdx = state.doc.blocks.findIndex(b => b.id === opts.insertAfter);
            if (insertIdx !== -1) {
              state.doc.blocks.splice(insertIdx + 1, 0, newBlock);
            } else {
              state.doc.blocks.push(newBlock);
            }
          } else {
            state.doc.blocks.push(newBlock);
          }
          state.selectedBlockId = newBlock.id;
          setDirty(true);
          renderBlockList();
          renderEditor();
          toast(aiMode ? `${type} block created by Claude` : `${type} block created — text preserved`, 'success');
        }
        closeModal();
        refreshPreview();
      } catch (e) {
        spinner.className = 'claude-modal-spinner error';
        spinner.textContent = 'Failed: ' + e.message;
        genBtn.disabled = false;
        genBtn.textContent = origBtnText;
        manualBtn.disabled = false;
      }
    });
    actions.appendChild(manualBtn);
    actions.appendChild(genBtn);
    body.appendChild(actions);

    setTimeout(() => ta.focus(), 50);
  }, '');
}

async function addEmptyBlock(type, insertAfterId) {
  if (!state.doc) {
    toast('Please create or select a page first', 'error');
    return;
  }
  const block = { id: uid('b'), type, data: defaultDataFor(type) };
  if (insertAfterId) {
    const i = state.doc.blocks.findIndex(b => b.id === insertAfterId);
    if (i !== -1) state.doc.blocks.splice(i + 1, 0, block);
    else state.doc.blocks.push(block);
  } else {
    state.doc.blocks.push(block);
  }
  state.selectedBlockId = block.id;
  setDirty(true);
  renderBlockList();
  renderEditor();
  refreshPreview();
}

function defaultDataFor(type) {
  switch (type) {
    case 'Hero':      return { brand: 'New brand', lines: [], titleHtml: 'Title', subtitle: 'Subtitle', scrollCueText: 'Scroll down' };
    case 'VizPanel':  return { initialTitle: 'Title', initialSub: 'Subtitle' };
    case 'Editorial': return { content: [{ kind: 'h2', text: 'New section' }, { kind: 'p', html: 'New paragraph.' }] };
    case 'Scrolly':   return { scrollyId: 'scrolly-X', stepsId: 'steps-X', imageSize: 'medium', imageHeight: '80vh', imageRadius: '12px', maxWidth: '1400px', steps: [{ stepIndex: 0, badgeKind: 'pyramid', badgeLabel: 'Label', imageSrc: '', body: 'Step body.' }] };
    case 'Outro':     return { h2: 'Outro', paragraphs: ['Final paragraph.'], finalLine: '', sourcesHtml: '' };
    case 'StatRow':   return { title: '', stats: [{value:'',label:'',context:''}, {value:'',label:'',context:''}, {value:'',label:'',context:''}] };
    case 'Timeline':  return { title: '', events: [{when:'',title:'',body:''}, {when:'',title:'',body:''}, {when:'',title:'',body:''}] };
    case 'Aside':     return { tone: 'info', title: '', body: '' };
    case 'ChapterDivider': return { number: '', title: 'Chapter title', subtitle: '' };
    case 'Quote': return { text: 'Type the quote here.', attribution: 'Name', role: '', portraitSrc: '', sourceUrl: '', sourceLabel: '' };
    case 'VideoEmbed': return { url: '', caption: '', credit: '' };
    case 'DataScrolly': return {
      title: 'New chart',
      subtitle: '',
      source: '[estimated illustrative values]',
      chartSpec: {
        kind: 'line',
        data: [{ year: 2000, value: 10 }, { year: 2010, value: 25 }, { year: 2020, value: 40 }],
        xField: 'year',
        yField: 'value',
        xLabel: 'Year',
        yLabel: 'Value',
      },
      steps: [
        { badgeKind: 'data', badgeLabel: 'Start',   body: 'In 2000 the value started at 10.', vizState: { highlightX: 2000, annotation: '10' } },
        { badgeKind: 'data', badgeLabel: 'Middle',  body: 'By 2010 it had grown to 25.',      vizState: { highlightX: 2010, annotation: '25' } },
        { badgeKind: 'data', badgeLabel: 'Today',   body: 'In 2020 it reached 40.',           vizState: { highlightX: 2020, annotation: '40' } },
      ],
    };
    case 'Map2D': return { title: '', subtitle: '', source: '', layout: 'behind', tileStyle: 'default', height: '100vh', maxWidth: '100%', initialCenter: [52.52, 13.405], initialZoom: 6, flyDuration: 2, scrollZoom: false, markers: [{ id: 'marker-1', lat: 52.52, lng: 13.405, label: '1', name: 'Berlin', popupHtml: '<strong>Berlin</strong>', color: '#c06830' }], routes: [], areas: [], steps: [{ badgeKind: 'data', badgeLabel: 'Start', body: 'Story begins here.', mapState: { center: [52.52, 13.405], zoom: 13, showMarkers: ['marker-1'], showAreas: [], animateRoute: null } }], caption: '', credit: 'OpenStreetMap' };
    case 'FullscreenImage': return { imageSrc: '', imageAlt: '', kicker: '', title: 'Title', subtitle: '', body: '', overlayPosition: 'bottom-left', scrimOpacity: 0.45, scrimDirection: 'bottom', kenBurns: true, scrollCue: false, caption: '', credit: '' };
    case 'AudioPlayer': return { audioSrc: '', title: 'New audio', subtitle: '', description: '', duration: '', waveformColor: '#c06830', accentColor: '#c06830', coverSrc: '', transcript: '', caption: '', credit: '' };
    case 'Scene3D': return { glbUrl: '', scenes: [], _comingSoon: 'false', textMode: 'cards', flowText: '', flowColumns: '2', flowMargin: 'normal', flowPlate: 'subtle' };
    case 'WebGLGradient': return { colorsCsv: '', speed: '0.3', height: '100vh', title: '', subtitle: '', overlayPosition: 'center' };
    case 'WebGLFlowmap': return { imageSrc: '', intensity: '0.18', height: '100vh' };
    case 'WebGLParticles': return { imageSrc: '', density: 'medium', height: '100vh' };
    default:          return {};
  }
}

// Which effects make sense per block type (modifier model).
const FX_ALL = ['reveal', 'parallax', 'tilt', 'wipe', 'zoom', 'glass', 'gradientText', 'genBg'];
const FX_APPLICABLE = {
  Hero: ['reveal', 'gradientText', 'genBg'],
  ChapterDivider: ['reveal', 'gradientText', 'genBg'],
  Editorial: ['reveal', 'parallax', 'wipe', 'glass', 'gradientText'],
  Quote: ['reveal', 'tilt', 'glass', 'gradientText'],
  Aside: ['reveal', 'tilt', 'glass'],
  StatRow: ['reveal', 'glass', 'gradientText'],
  Timeline: ['reveal'],
  FullscreenImage: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  FullBleed: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  ImageGrid: ['reveal', 'parallax', 'tilt', 'wipe', 'zoom'],
  ImageCompare: ['reveal', 'tilt'],
  ImageHotspot: ['reveal', 'tilt'],
  VideoEmbed: ['reveal'],
  AudioPlayer: ['reveal', 'glass'],
  Scene3D: ['reveal'],
  Outro: ['reveal', 'gradientText', 'genBg'],
  VizPanel: ['reveal', 'glass'],
  EmbedBlock: ['reveal'],
  AccordionBlock: ['reveal', 'glass'],
  ProgressNav: [],
  Scrolly: ['reveal'],
  DataScrolly: ['reveal'],
};
const FX_LABELS = {
  reveal: 'Reveal on scroll', parallax: 'Parallax', tilt: '3D tilt', wipe: 'Scroll wipe',
  zoom: 'Slow zoom', glass: 'Glass', gradientText: 'Gradient text', genBg: 'Generative backdrop',
};

function renderFxGroup(block, form, onFieldChange) {
  const keys = FX_APPLICABLE[block.type] || [];
  if (!keys.length) return;
  if (!block.data._fx) block.data._fx = {};
  const fx = block.data._fx;

  const section = document.createElement('div');
  section.className = 'editor-group';
  const header = document.createElement('button');
  header.className = 'editor-group-header'; header.type = 'button';
  header.innerHTML = `<span class="editor-group-arrow">▸</span> ✨ Effects`;
  const body = document.createElement('div');
  body.className = 'editor-group-body collapsed';
  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    header.querySelector('.editor-group-arrow').textContent = body.classList.contains('collapsed') ? '▸' : '▼';
  });

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:8px;line-height:1.45;';
  note.textContent = 'Effects enhance this block. Unsupported browsers fall back gracefully.';
  body.appendChild(note);

  // Square tile grid — each effect is a tile; active = highlighted.
  const FX_GLYPH = { reveal: '↑', parallax: '🌀', tilt: '🃏', wipe: '▤', zoom: '🔍', glass: '🧊', gradientText: '🌈', genBg: '✨' };
  const isOn = (k) => k === 'reveal' ? !!fx.reveal : k === 'parallax' ? !!fx.parallax : !!fx[k];
  const grid = document.createElement('div'); grid.className = 'fx-tiles';
  ['reveal', 'parallax', 'tilt', 'wipe', 'zoom', 'glass', 'gradientText', 'genBg'].forEach(k => {
    if (!keys.includes(k)) return;
    const tile = document.createElement('button'); tile.type = 'button';
    tile.className = 'fx-tile' + (isOn(k) ? ' active' : '');
    tile.innerHTML = `<span class="fx-tile-glyph">${FX_GLYPH[k]}</span><span class="fx-tile-label">${FX_LABELS[k]}</span>`;
    tile.addEventListener('click', (e) => {
      e.preventDefault();
      if (k === 'reveal') { fx.reveal = fx.reveal ? '' : 'up'; if (!fx.reveal) delete fx.revealDelay; }
      else if (k === 'parallax') { fx.parallax = fx.parallax ? 0 : 0.2; }
      else { fx[k] = !fx[k]; }
      onFieldChange(); renderEditor();
    });
    grid.appendChild(tile);
  });
  body.appendChild(grid);

  // Options appear only when reveal / parallax are active.
  if (keys.includes('reveal') && fx.reveal) {
    const f = document.createElement('div'); f.className = 'fx-opts';
    f.innerHTML = `<label class="field-label">Reveal direction</label>`;
    const row = document.createElement('div'); row.className = 'fx-chips';
    [['up', 'Up'], ['left', 'Left'], ['right', 'Right'], ['scale', 'Scale'], ['fade', 'Fade']].forEach(([v, t]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'fx-chip' + ((fx.reveal === v) ? ' active' : ''); c.textContent = t;
      c.addEventListener('click', (e) => { e.preventDefault(); fx.reveal = v; onFieldChange(); renderEditor(); });
      row.appendChild(c);
    });
    f.appendChild(row);
    const dl = document.createElement('div'); dl.className = 'fx-chips'; dl.style.marginTop = '4px';
    [0, 0.1, 0.2, 0.3].forEach(d => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'fx-chip' + (((fx.revealDelay || 0) === d) ? ' active' : '');
      c.textContent = d === 0 ? 'No delay' : d + 's';
      c.addEventListener('click', (e) => { e.preventDefault(); fx.revealDelay = d; onFieldChange(); renderEditor(); });
      dl.appendChild(c);
    });
    f.appendChild(dl); body.appendChild(f);
  }
  if (keys.includes('parallax') && fx.parallax) {
    const f = document.createElement('div'); f.className = 'fx-opts';
    f.innerHTML = `<label class="field-label">Parallax strength</label>`;
    const row = document.createElement('div'); row.className = 'fx-chips';
    [[0.1, 'Subtle'], [0.2, 'Medium'], [0.3, 'Strong']].forEach(([v, t]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'fx-chip' + ((fx.parallax === v) ? ' active' : ''); c.textContent = t;
      c.addEventListener('click', (e) => { e.preventDefault(); fx.parallax = v; onFieldChange(); renderEditor(); });
      row.appendChild(c);
    });
    f.appendChild(row); body.appendChild(f);
  }

  section.appendChild(header); section.appendChild(body);
  form.appendChild(section);
}

// ─────────────────────────── Editor form ─────────────────────
function renderEditor() {
  if (!state.selectedBlockId) return;
  // Render into the accordion body of the active block
  const bodyWrap = document.querySelector('.block-item.active .block-body');
  if (!bodyWrap) return;
  const block = state.doc.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) { state.selectedBlockId = null; return; }
  const schema = BLOCK_SCHEMAS[block.type];
  bodyWrap.innerHTML = '';
  const form = document.createElement('div');
  form.className = 'block-body-inner';
  bodyWrap.appendChild(form);

  // Action toolbar — Enhance, Duplicate, Delete
  const idx = state.doc.blocks.indexOf(block);
  const toolbar = document.createElement('div');
  toolbar.className = 'block-actions';
  // Some blocks (e.g. 3D models) have no AI-generatable text — hide Enhance.
  const noEnhance = block.type === 'Scene3D' || block.type === 'WebGLGradient' || block.type === 'WebGLFlowmap' || block.type === 'WebGLParticles';
  toolbar.innerHTML = `
    ${noEnhance ? '' : '<button data-act="claude" class="enhance-btn" title="Enhance with Claude">✨ Enhance</button>'}
    <span class="block-actions-spacer"></span>
    <button data-act="dup" title="Duplicate block">Duplicate</button>
    <button data-act="del" class="danger" title="Delete block">Delete</button>`;
  toolbar.querySelector('[data-act="claude"]')?.addEventListener('click', (e) => { e.stopPropagation(); openClaudeModal({ mode: 'improve', block }); });
  toolbar.querySelector('[data-act="dup"]').addEventListener('click', (e) => { e.stopPropagation(); duplicateBlock(idx); });
  toolbar.querySelector('[data-act="del"]').addEventListener('click', function(e) {
    e.stopPropagation();
    const btn = this;
    if (btn.dataset.confirming) {
      clearTimeout(btn._delTimer);
      delete btn.dataset.confirming;
      btn.textContent = 'Delete';
      btn.style.cssText = '';
      deleteBlock(idx);
    } else {
      btn.dataset.confirming = '1';
      btn.textContent = '⚠️ Confirm?';
      btn.style.cssText = 'background:#fa3d1d;color:#fff;border-color:#fa3d1d;';
      btn._delTimer = setTimeout(() => {
        delete btn.dataset.confirming;
        btn.textContent = 'Delete';
        btn.style.cssText = '';
      }, 3000);
    }
  });
  form.appendChild(toolbar);

  if (!schema) {
    const p = document.createElement('p');
    p.textContent = `Unknown block type: ${block.type}. Raw JSON editing not yet supported in v1.`;
    form.appendChild(p);
    return;
  }

  // Group fields by their group property
  const groups = {};
  schema.fields.forEach(field => {
    const g = field.group || 'content';
    if (!groups[g]) groups[g] = [];
    groups[g].push(field);
  });

  const GROUP_ORDER = ['content', 'media', 'settings', 'data', 'layout', 'style', 'meta', 'advanced'];
  const GROUP_LABELS = {
    content: 'Content', media: 'Media', settings: 'Settings', data: 'Data',
    layout: 'Layout & Position', style: 'Style & Animation',
    meta: 'Caption & Credits', advanced: 'Advanced',
  };
  const OPEN_GROUPS = new Set(['content', 'media', 'data']);

  const onFieldChange = () => { setDirty(true); refreshPreview(); updateBlockSummary(); };

  GROUP_ORDER.forEach(groupKey => {
    const fields = groups[groupKey];
    if (!fields || !fields.length) return;

    const section = document.createElement('div');
    section.className = 'editor-group';

    const header = document.createElement('button');
    header.className = 'editor-group-header';
    header.type = 'button';
    const isOpen = OPEN_GROUPS.has(groupKey);
    header.innerHTML = `<span class="editor-group-arrow">${isOpen ? '▼' : '▸'}</span> ${GROUP_LABELS[groupKey] || groupKey}`;

    const body = document.createElement('div');
    body.className = 'editor-group-body' + (isOpen ? '' : ' collapsed');

    // Render fields — handle inline pairs
    let i = 0;
    while (i < fields.length) {
      if (fields[i].inline && i + 1 < fields.length && fields[i + 1].inline) {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.appendChild(renderField(fields[i], block.data, onFieldChange));
        row.appendChild(renderField(fields[i + 1], block.data, onFieldChange));
        body.appendChild(row);
        i += 2;
      } else {
        body.appendChild(renderField(fields[i], block.data, onFieldChange));
        i++;
      }
    }

    header.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      header.querySelector('.editor-group-arrow').textContent = body.classList.contains('collapsed') ? '▸' : '▼';
    });

    section.appendChild(header);
    section.appendChild(body);
    form.appendChild(section);
  });

  // ── Premium effects panel ──
  renderFxGroup(block, form, onFieldChange);

  // ── Universal: background opacity per block ──
  if (state.doc.background && state.doc.background.imageSrc) {
    const bgWrap = document.createElement('div');
    bgWrap.className = 'field';
    bgWrap.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #eaeef2;';
    const bgLabel = document.createElement('label');
    bgLabel.className = 'field-label';
    bgLabel.innerHTML = 'Background opacity <span style="font-weight:400;color:#8c959f;font-size:11px;">for this block</span>';
    bgWrap.appendChild(bgLabel);
    const bgHint = document.createElement('div');
    bgHint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:5px;line-height:1.45;';
    bgHint.textContent = 'Controls page background image visibility when this block is in viewport. Empty = use page default.';
    bgWrap.appendChild(bgHint);
    const bgRow = document.createElement('div');
    bgRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const bgRange = document.createElement('input');
    bgRange.type = 'range';
    bgRange.min = '0'; bgRange.max = '1'; bgRange.step = '0.05';
    bgRange.value = block.data.bgOpacity != null ? String(block.data.bgOpacity) : '';
    bgRange.style.cssText = 'flex:1;';
    const bgValSpan = document.createElement('span');
    bgValSpan.style.cssText = 'font-size:12px;color:#57606a;font-variant-numeric:tabular-nums;min-width:32px;';
    bgValSpan.textContent = block.data.bgOpacity != null ? String(block.data.bgOpacity) : '—';
    const bgClear = document.createElement('button');
    bgClear.className = 'ghost';
    bgClear.style.cssText = 'font-size:11px;padding:2px 8px;';
    bgClear.textContent = 'Reset';
    bgClear.title = 'Use page default opacity';
    bgRange.addEventListener('input', () => {
      const v = parseFloat(bgRange.value);
      block.data.bgOpacity = v;
      bgValSpan.textContent = String(v);
      setDirty(true);
      refreshPreview();
    });
    bgClear.addEventListener('click', () => {
      delete block.data.bgOpacity;
      bgRange.value = '';
      bgValSpan.textContent = '—';
      setDirty(true);
      refreshPreview();
    });
    bgRow.appendChild(bgRange);
    bgRow.appendChild(bgValSpan);
    bgRow.appendChild(bgClear);
    bgWrap.appendChild(bgRow);
    form.appendChild(bgWrap);
  }
}

function renderField(field, data, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = field.label;
  wrap.appendChild(label);
  if (field.hint) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:5px;line-height:1.45;';
    hint.innerHTML = field.hint;
    wrap.appendChild(hint);
  }

  const val = data[field.key];

  switch (field.kind) {
    case 'text': {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = val ?? '';
      input.addEventListener('input', () => { data[field.key] = input.value; onChange(); updateBlockSummary(); });
      wrap.appendChild(input);
      break;
    }
    case 'textarea':
    case 'textarea_html': {
      const ta = document.createElement('textarea');
      ta.rows = field.kind === 'textarea_html' ? 6 : 3;
      ta.value = val ?? '';
      ta.addEventListener('input', () => {
        data[field.key] = field.kind === 'textarea_html' ? sanitizeHtml(ta.value) : ta.value;
        onChange(); updateBlockSummary();
      });
      wrap.appendChild(ta);
      break;
    }
    case 'string_list': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((str, i) => wrap.appendChild(stringListRow(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add paragraph';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push(''); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'lines': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      // Auto-assign style class (cin-l1..cin-l6) based on position. Hidden from user.
      const ensureCls = () => list.forEach((l, i) => { l.cls = `cin-l${(i % 6) + 1}`; });
      ensureCls();
      list.forEach((line, i) => {
        const row = document.createElement('div');
        row.className = 'subitem';
        row.innerHTML = `
          <div class="subitem-head">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <span class="subitem-kind">Line ${i + 1}</span>
            <span class="subitem-actions">
              <button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">✕</button>
            </span>
          </div>`;
        const ta = document.createElement('textarea'); ta.rows = 2; ta.value = line.text || '';
        ta.placeholder = 'One line of intro narration…';
        ta.addEventListener('input', () => { line.text = ta.value; onChange(); });
        row.appendChild(ta);
        attachSubitemDrag(row, list, i, onChange);
        row.querySelector('[data-a="up"]').addEventListener('click', (e) => { e.preventDefault(); if (i>0) { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="down"]').addEventListener('click', (e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); ensureCls(); onChange(); renderEditor(); });
        wrap.appendChild(row);
      });
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add line';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ cls: '', text: '' }); ensureCls(); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'scrolly_steps': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((step, i) => wrap.appendChild(scrollyStepEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add step';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ stepIndex: list.length ? list[list.length-1].stepIndex+1 : 0, badgeKind: 'pyramid', badgeLabel: 'Label', body: 'Step body.' }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'stat_list': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((stat, i) => wrap.appendChild(statRowEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add stat';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ value: '', label: '', context: '' }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'tone_select': {
      const sel = document.createElement('select');
      ['info','note','warning'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if ((val||'info') === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { data[field.key] = sel.value; onChange(); });
      wrap.appendChild(sel);
      break;
    }
    case 'select': {
      const sel = document.createElement('select');
      (field.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (String(val) === String(opt)) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        let v = sel.value;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        data[field.key] = v;
        onChange();
      });
      wrap.appendChild(sel);
      break;
    }
    case 'timeline_events': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((ev, i) => wrap.appendChild(timelineEventEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add event';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ when:'', title:'', body:'' }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'editorial_items': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((item, i) => wrap.appendChild(editorialItemEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add item';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); openItemKindPicker(kind => { list.push(defaultItemFor(kind)); onChange(); renderEditor(); }); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'chart_spec': {
      const spec = (val && typeof val === 'object') ? val : {};
      data[field.key] = spec;
      // Chart kind selector (bar, line, area, scatter, grouped-bar)
      spec.kind = spec.kind || spec.type || 'bar';
      const kindRow = document.createElement('div');
      kindRow.className = 'field';
      kindRow.innerHTML = `<label class="field-label">Initial chart type</label>
        <select id="_cs_kind">
          <option value="bar" ${spec.kind==='bar'?'selected':''}>Bar</option>
          <option value="line" ${spec.kind==='line'?'selected':''}>Line</option>
          <option value="area" ${spec.kind==='area'?'selected':''}>Area</option>
          <option value="scatter" ${spec.kind==='scatter'?'selected':''}>Scatter</option>
          <option value="grouped-bar" ${spec.kind==='grouped-bar'?'selected':''}>Grouped bar</option>
        </select>
        <div style="font-size:11px;color:#8c959f;margin-top:4px;">Steps can override this with their own chart type for morphing transitions.</div>`;
      kindRow.querySelector('#_cs_kind').addEventListener('change', (e) => { spec.kind = e.target.value; delete spec.type; onChange(); });
      wrap.appendChild(kindRow);

      function smallField(label, key, placeholder) {
        const w = document.createElement('div');
        w.className = 'field';
        const lab = document.createElement('label'); lab.className = 'field-label'; lab.textContent = label;
        w.appendChild(lab);
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = spec[key] || ''; inp.placeholder = placeholder || '';
        inp.addEventListener('input', () => { spec[key] = inp.value; onChange(); });
        w.appendChild(inp);
        return w;
      }
      wrap.appendChild(smallField('X field name', 'xField', 'e.g. year'));
      wrap.appendChild(smallField('Y field name', 'yField', 'e.g. value'));
      wrap.appendChild(smallField('X axis label', 'xLabel', 'e.g. Year'));
      wrap.appendChild(smallField('Y axis label', 'yLabel', 'e.g. Daily copies'));

      // Data rows: JSON textarea with parse-on-change
      const dataField = document.createElement('div');
      dataField.className = 'field';
      const dl = document.createElement('label'); dl.className = 'field-label'; dl.textContent = 'Data rows (JSON array)';
      dataField.appendChild(dl);
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:5px;line-height:1.45;';
      hint.innerHTML = 'One row per data point. Use the field names above for keys.';
      dataField.appendChild(hint);
      const ta = document.createElement('textarea');
      ta.rows = 8;
      ta.style.fontFamily = "'SF Mono','Menlo',monospace";
      ta.value = JSON.stringify(spec.data || [], null, 2);
      const errBox = document.createElement('div');
      errBox.style.cssText = 'font-size:11px;color:#cf222e;margin-top:4px;min-height:14px;';
      ta.addEventListener('input', () => {
        try {
          const parsed = JSON.parse(ta.value);
          if (!Array.isArray(parsed)) throw new Error('Must be a JSON array.');
          spec.data = parsed;
          errBox.textContent = '';
          onChange();
        } catch (e) {
          errBox.textContent = 'JSON parse error: ' + e.message;
        }
      });
      dataField.appendChild(ta);
      dataField.appendChild(errBox);
      wrap.appendChild(dataField);
      break;
    }
    case 'data_scrolly_steps': {
      const list = Array.isArray(val) ? val : [];
      data[field.key] = list;
      list.forEach((step, i) => wrap.appendChild(dataScrollyStepEditor(list, i, onChange)));
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add step';
      addBtn.className = 'small';
      addBtn.addEventListener('click', (e) => { e.preventDefault(); list.push({ badgeKind: 'data', badgeLabel: 'Step', body: '', vizState: { highlightX: null, annotation: '' } }); onChange(); renderEditor(); });
      wrap.appendChild(addBtn);
      break;
    }
    case 'model3d': {
      // Full orbit editor — initialised async after wrap is in the DOM
      wrap.classList.add('field--model3d');
      wrap.style.minHeight = '320px';
      requestAnimationFrame(() => {
        if (typeof window.initScene3DEditor === 'function') {
          window.initScene3DEditor(wrap, data, () => { onChange(); updateBlockSummary(); });
        } else {
          const msg = document.createElement('p');
          msg.style.cssText = 'font-size:12px;color:#aaa;padding:8px;';
          msg.textContent = 'Scene3D editor loading…';
          wrap.appendChild(msg);
        }
      });
      break;
    }
    case 'image': {
      const mf = mediaField(val ?? '', (v) => { data[field.key] = v; onChange(); updateBlockSummary(); }, { accept: 'image/*', kind: 'image', browseFilter: 'image' });
      wrap.appendChild(mf);
      break;
    }
    case 'video': {
      const mf = mediaField(val ?? '', (v) => { data[field.key] = v; onChange(); updateBlockSummary(); }, { accept: 'video/*', kind: 'video', browseFilter: 'video' });
      wrap.appendChild(mf);
      break;
    }
    default:
      wrap.appendChild(document.createTextNode(`Unsupported field kind: ${field.kind}`));
  }
  return wrap;
}

function stringListRow(list, i, onChange) {
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Item ${i + 1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
  const ta = document.createElement('textarea');
  ta.rows = 3;
  ta.value = list[i] || '';
  ta.addEventListener('input', () => { list[i] = ta.value; onChange(); });
  row.appendChild(ta);
  attachSubitemDrag(row, list, i, onChange);
  row.querySelector('[data-a="up"]').addEventListener('click', (e) => { e.preventDefault(); if (i>0) { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click', (e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}

function scrollyStepEditor(list, i, onChange) {
  const step = list[i];
  // stepIndex is auto-managed (hidden from user) — but we still need unique values per page.
  // Keep the existing value if present; otherwise assign sequentially.
  if (typeof step.stepIndex !== 'number') step.stepIndex = i;

  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Step ${i + 1}</span><span class="subitem-actions"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">Badge color</label>
    <select data-k="badgeKind">${BADGE_OPTIONS.map(o=>`<option value="${o.value}"${step.badgeKind===o.value?' selected':''}>${o.label}</option>`).join('')}</select>
    <label class="field-label">Badge text</label>
    <input type="text" data-k="badgeLabel" value="${escapeAttr(step.badgeLabel||'')}" placeholder="Short label, e.g. Korpus">
    <label class="field-label" style="align-self:flex-start;padding-top:4px;">Text</label>
    <textarea data-k="body" rows="3" placeholder="1–2 sentences for this step…">${escapeText(step.body||'')}</textarea>`;
  row.appendChild(grid);
  attachSubitemDrag(row, list, i, onChange);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input', () => { step[el.dataset.k] = el.value; onChange(); });
    el.addEventListener('change', () => { step[el.dataset.k] = el.value; onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click', (e) => { e.preventDefault(); if (i>0) { [list[i-1], list[i]] = [list[i], list[i-1]]; reindexSteps(list); onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click', (e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; reindexSteps(list); onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); reindexSteps(list); onChange(); renderEditor(); });
  return row;
}

function dataScrollyStepEditor(list, i, onChange) {
  const step = list[i];
  if (!step.vizState) step.vizState = {};
  const vs = step.vizState;
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Step ${i+1}</span><span class="subitem-actions"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:110px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">Badge color</label>
    <select data-k="badgeKind">${BADGE_OPTIONS.map(o=>`<option value="${o.value}"${step.badgeKind===o.value?' selected':''}>${o.label}</option>`).join('')}</select>
    <label class="field-label">Badge text</label>
    <input type="text" data-k="badgeLabel" value="${escapeAttr(step.badgeLabel||'')}" placeholder="Short label">
    <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
    <textarea data-k="body" rows="3" placeholder="1–2 sentences referencing the data…">${escapeText(step.body||'')}</textarea>
    <label class="field-label" style="grid-column:1/-1;margin-top:6px;color:var(--graphite);font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Chart transition</label>
    <label class="field-label">Chart type</label>
    <select data-vk="chartType">
      <option value="" ${!vs.chartType?'selected':''}>— inherit from spec —</option>
      <option value="bar" ${vs.chartType==='bar'?'selected':''}>Bar</option>
      <option value="line" ${vs.chartType==='line'?'selected':''}>Line</option>
      <option value="area" ${vs.chartType==='area'?'selected':''}>Area</option>
      <option value="scatter" ${vs.chartType==='scatter'?'selected':''}>Scatter</option>
      <option value="grouped-bar" ${vs.chartType==='grouped-bar'?'selected':''}>Grouped bar</option>
    </select>
    <label class="field-label">Highlight X</label>
    <input type="text" data-vk="highlightX" value="${escapeAttr(vs.highlightX ?? '')}" placeholder="x value to mark (e.g. 2010 or 1980er)">
    <label class="field-label">Annotation</label>
    <input type="text" data-vk="annotation" value="${escapeAttr(vs.annotation||'')}" placeholder="Label at the marked point">
    <label class="field-label">Sort</label>
    <select data-vk="sort">
      <option value="" ${!vs.sort?'selected':''}>— none —</option>
      <option value="ascending" ${vs.sort==='ascending'?'selected':''}>Ascending</option>
      <option value="descending" ${vs.sort==='descending'?'selected':''}>Descending</option>
    </select>`;
  row.appendChild(grid);
  attachSubitemDrag(row, list, i, onChange);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input',  () => { step[el.dataset.k] = el.value; onChange(); });
    el.addEventListener('change', () => { step[el.dataset.k] = el.value; onChange(); });
  });
  grid.querySelectorAll('[data-vk]').forEach(el => {
    el.addEventListener('input', () => { _updateVizState(el, vs); onChange(); });
    el.addEventListener('change', () => { _updateVizState(el, vs); onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}

function _updateVizState(el, vs) {
  const k = el.dataset.vk;
  let v = el.value;
  if (k === 'highlightX') {
    // Allow both numeric and string values (e.g. "1980er")
    const n = Number(v);
    v = v === '' ? null : (Number.isNaN(n) ? v : n);
  }
  if (k === 'chartType' || k === 'sort') {
    v = v || undefined; // remove empty strings
  }
  if (v === undefined || v === null || v === '') {
    delete vs[k];
  } else {
    vs[k] = v;
  }
}

function statRowEditor(list, i, onChange) {
  const stat = list[i];
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Stat ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">Value</label>    <input type="text" data-k="value"   value="${escapeAttr(stat.value||'')}"   placeholder="e.g. 67% or 8,527 or 3×">
    <label class="field-label">Label</label>    <input type="text" data-k="label"   value="${escapeAttr(stat.label||'')}"   placeholder="what the number means">
    <label class="field-label">Context</label>  <input type="text" data-k="context" value="${escapeAttr(stat.context||'')}" placeholder="optional sub-line">`;
  row.appendChild(grid);
  attachSubitemDrag(row, list, i, onChange);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input', () => { stat[el.dataset.k] = el.value; onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)              { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1)  { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}

function timelineEventEditor(list, i, onChange) {
  const ev = list[i];
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Event ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">When</label>  <input type="text" data-k="when"  value="${escapeAttr(ev.when||'')}"  placeholder="e.g. 1969 or March 2020">
    <label class="field-label">Title</label> <input type="text" data-k="title" value="${escapeAttr(ev.title||'')}" placeholder="short event title">
    <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
    <textarea data-k="body" rows="2">${escapeText(ev.body||'')}</textarea>`;
  row.appendChild(grid);
  attachSubitemDrag(row, list, i, onChange);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input', () => { ev[el.dataset.k] = el.value; onChange(); });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}

// Assign stepIndex sequentially within a Scrolly block.
// Across the whole page, we make sure each Scrolly's steps occupy a unique
// range by offsetting per block at save time (see ensureScrollyIds).
function reindexSteps(list) { list.forEach((s, i) => { s.stepIndex = i; }); }

// Editorial content[] item editor — fields vary by kind.
function editorialItemEditor(list, i, onChange) {
  const item = list[i];
  const friendly = EDITORIAL_ITEM_FRIENDLY[item.kind] || { label: item.kind, hint: '' };
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <span class="subitem-kind">${friendly.label}</span>
    ${friendly.hint ? `<span style="font-weight:400;color:#8c959f;font-size:11px;">${friendly.hint}</span>` : ''}
    <span class="subitem-actions"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">✕</button></span>
  </div>`;
  const fieldsBox = document.createElement('div');
  row.appendChild(fieldsBox);
  attachSubitemDrag(row, list, i, onChange);

  const fields = editorialFieldsFor(item.kind);
  fields.forEach(f => {
    if (f.advanced) return; // skip; rendered inside the Advanced section below
    fieldsBox.appendChild(simpleField(f, item, onChange));
  });
  // Advanced section (collapsed by default) for power-user-only fields
  const advFields = fields.filter(f => f.advanced);
  if (advFields.length) {
    const det = document.createElement('details');
    det.style.cssText = 'margin-top:6px;';
    const sum = document.createElement('summary');
    sum.textContent = 'Advanced';
    sum.style.cssText = 'font-size:11.5px;color:#8c959f;cursor:pointer;user-select:none;';
    det.appendChild(sum);
    advFields.forEach(f => det.appendChild(simpleField(f, item, onChange)));
    fieldsBox.appendChild(det);
  }

  row.querySelector('[data-a="up"]').addEventListener('click', (e) => { e.preventDefault(); if (i>0) { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click', (e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}

function editorialFieldsFor(kind) {
  switch (kind) {
    case 'kicker':
    case 'h2':
    case 'lead':
    case 'captionInline':
    case 'captionCenter':
      return [{ key: 'text', label: 'Text', kind: 'textarea' }];
    case 'p':
      return [{ key: 'html', label: 'Text', kind: 'textarea' }];
    case 'dropcap':
      return [{ key: 'html', label: 'Text', kind: 'textarea' }];
    case 'pullquote':
      return [{ key: 'text', label: 'Quote', kind: 'textarea' },
              { key: 'cite', label: 'Attribution',     kind: 'text' }];
    case 'separator':
      return [];
    case 'figureSingle':
      return [{ key: 'src',     label: 'Image',   kind: 'image' },
              { key: 'alt',     label: 'Alt text (for accessibility)', kind: 'text' },
              { key: 'caption', label: 'Caption (optional)', kind: 'textarea' },
              { key: 'italic',  label: 'Show caption in italic', kind: 'bool', defaultTrue: true, advanced: true }];
    case 'figurePair':
      return [{ key: 'images', label: 'Images', kind: 'image_pair' },
              { key: 'align',  label: 'Vertical align (advanced — flex-start / center)', kind: 'text', advanced: true },
              { key: 'gap',    label: 'Gap between images (advanced — e.g. 1.5rem)',     kind: 'text', advanced: true },
              { key: 'wrap',   label: 'Wrap each image in a flex container (advanced)',  kind: 'bool', defaultTrue: true, advanced: true }];
    case 'whatsappCard':
      return [{ key: 'senderName',    label: 'Sender name', kind: 'text' },
              { key: 'senderInitial', label: 'Avatar letter (1 char)', kind: 'text' },
              { key: 'message',       label: 'Message',     kind: 'text' },
              { key: 'time',          label: 'Time stamp',  kind: 'text' },
              { key: 'image.src',     label: 'Attached image (optional)', kind: 'image_nested', subKey: 'image' },
              { key: 'image.alt',     label: 'Alt text', kind: 'text_nested', subKey: 'image', advanced: true }];
    case 'bigNumber':
      return [
        { key: 'value',   label: 'Value',   kind: 'text' },
        { key: 'label',   label: 'Label',   kind: 'text' },
        { key: 'context', label: 'Context (optional small line)', kind: 'text' },
      ];
    case 'callout':
      return [
        { key: 'tone',  label: 'Tone', kind: 'tone_select' },
        { key: 'title', label: 'Title (optional)', kind: 'text' },
        { key: 'body',  label: 'Body', kind: 'textarea' },
      ];
    case 'customHTML':
      return [{ key: 'html', label: 'Raw HTML (be careful)', kind: 'textarea_html' }];
    case 'list':
      return [
        { key: 'ordered', label: 'Numbered list (uncheck for bullets)', kind: 'bool' },
        { key: 'items',   label: 'Items',                                kind: 'string_list_inline' },
      ];
    case 'footnote':
      return [
        { key: 'ref',  label: 'Reference number', kind: 'text', hint: 'Numeric, e.g. <code>1</code>. Used to link to the endnote.' },
        { key: 'note', label: 'Note text',        kind: 'textarea' },
      ];
    case 'highlight':
      return [
        { key: 'html', label: 'Highlighted text', kind: 'textarea' },
      ];
    case 'stepList':
      return [
        { key: 'title', label: 'Heading (optional)', kind: 'text' },
        { key: 'steps', label: 'Steps',              kind: 'step_list_field' },
      ];
    case 'factCheck':
      return [
        { key: 'claim',       label: 'Claim being checked', kind: 'textarea' },
        { key: 'verdict',     label: 'Verdict',             kind: 'verdict_select' },
        { key: 'explanation', label: 'Explanation',         kind: 'textarea' },
        { key: 'source',      label: 'Source (optional)',   kind: 'text' },
      ];
    default: return [];
  }
}

function defaultItemFor(kind) {
  switch (kind) {
    case 'kicker':         return { kind, text: 'Kicker text' };
    case 'h2':             return { kind, text: 'New heading' };
    case 'lead':           return { kind, text: 'Lead paragraph.' };
    case 'p':              return { kind, html: 'New paragraph.' };
    case 'dropcap':        return { kind, html: 'A first paragraph with a large drop-capital initial.' };
    case 'pullquote':      return { kind, text: '"Pull quote."', cite: '— Author' };
    case 'separator':      return { kind };
    case 'figureSingle':   return { kind, src: '', alt: '', caption: '' };
    case 'figurePair':     return { kind, images: [{ src:'', alt:'' }, { src:'', alt:'' }] };
    case 'captionInline':  return { kind, text: 'Caption.' };
    case 'captionCenter':  return { kind, text: 'Caption.' };
    case 'whatsappCard':   return { kind, senderInitial:'A', senderName:'Friend', message:'Hi!', time:'12:00 ✓✓', image:{src:'',alt:''} };
    case 'bigNumber':      return { kind, value: '0', label: 'label', context: '' };
    case 'callout':        return { kind, tone: 'info', title: '', body: 'A short callout.' };
    case 'customHTML':     return { kind, html: '<div></div>' };
    case 'list':           return { kind, ordered: false, items: ['First item', 'Second item'] };
    case 'footnote':       return { kind, ref: 1, note: 'The note text.' };
    case 'highlight':      return { kind, html: 'A short highlighted phrase.' };
    case 'stepList': return { kind, title: '', steps: [
      { title: 'Step one', body: 'Describe what to do.' },
      { title: 'Step two', body: 'Describe what to do.' },
    ]};
    case 'factCheck': return { kind, claim: 'The claim being checked.', verdict: 'true', explanation: 'Why the verdict is what it is.', source: '' };
    default: return { kind };
  }
}

function openItemKindPicker(cb) {
  openModal('Add content item', (body) => {
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    EDITORIAL_ITEM_KINDS.forEach(({ kind, label }) => {
      const hint = EDITORIAL_ITEM_FRIENDLY[kind]?.hint || '';
      const c = document.createElement('button');
      c.className = 'palette-card';
      c.innerHTML = `<span class="name">${label}</span>${hint ? `<span class="desc">${hint}</span>` : ''}`;
      c.addEventListener('click', () => { closeModal(); cb(kind); });
      grid.appendChild(c);
    });
    body.appendChild(grid);
  }, '');
}

function simpleField(f, obj, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.className = 'field-label';
  lab.textContent = f.label;
  wrap.appendChild(lab);

  const setVal = (v) => {
    if (f.subKey) {
      if (!obj[f.subKey]) obj[f.subKey] = {};
      const tail = f.key.split('.').slice(1).join('.');
      obj[f.subKey][tail] = v;
    } else obj[f.key] = v;
    onChange();
  };
  const getVal = () => {
    if (f.subKey) {
      const tail = f.key.split('.').slice(1).join('.');
      return obj[f.subKey]?.[tail];
    }
    return obj[f.key];
  };

  switch (f.kind) {
    case 'text':
    case 'text_nested': {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = getVal() ?? '';
      inp.addEventListener('input', () => setVal(inp.value));
      wrap.appendChild(inp); break;
    }
    case 'textarea':
    case 'textarea_html': {
      const ta = document.createElement('textarea');
      ta.rows = f.kind === 'textarea_html' ? 5 : 3;
      ta.value = getVal() ?? '';
      ta.addEventListener('input', () => setVal(f.kind === 'textarea_html' ? sanitizeHtml(ta.value) : ta.value));
      wrap.appendChild(ta); break;
    }
    case 'tone_select': {
      const sel = document.createElement('select');
      ['info','note','warning'].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if ((getVal()||'info') === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => setVal(sel.value));
      wrap.appendChild(sel);
      break;
    }
    case 'bool': {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const curr = getVal();
      cb.checked = curr === undefined ? !!f.defaultTrue : !!curr;
      cb.addEventListener('change', () => setVal(cb.checked));
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;gap:6px;align-items:center;font-weight:normal;';
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + f.label));
      wrap.innerHTML = '';
      wrap.appendChild(lbl);
      break;
    }
    case 'image':
    case 'image_nested': {
      wrap.appendChild(mediaField(getVal() ?? '', (v) => setVal(v), { accept: 'image/*', kind: 'image', browseFilter: 'image' }));
      break;
    }
    case 'audio': {
      wrap.appendChild(mediaField(getVal() ?? '', (v) => setVal(v), { accept: 'audio/*', kind: 'audio', browseFilter: 'audio' }));
      break;
    }
    case 'video': {
      wrap.appendChild(mediaField(getVal() ?? '', (v) => setVal(v), { accept: 'video/*', kind: 'video', browseFilter: 'video' }));
      break;
    }
    case 'media': {
      wrap.appendChild(mediaField(getVal() ?? '', (v) => setVal(v), { accept: 'image/*,audio/*,video/*', kind: 'media', browseFilter: 'all' }));
      break;
    }
    case 'image_pair': {
      let arr = getVal();
      const needInit = !Array.isArray(arr);
      if (needInit) arr = [];
      let padded = false;
      while (arr.length < 2) { arr.push({ src: '', alt: '' }); padded = true; }
      // Only mark dirty if we actually had to backfill missing data
      if (needInit) setVal(arr);
      else if (padded) { if (f.subKey) { /* not used here */ } else obj[f.key] = arr; }
      arr.forEach((img, idx) => {
        const sub = document.createElement('div');
        sub.style.cssText = 'border-left:3px solid #d0d7de;padding-left:8px;margin-bottom:6px;';
        const lbl = document.createElement('div');
        lbl.className = 'field-label';
        lbl.textContent = `Image ${idx + 1}`;
        sub.appendChild(lbl);
        sub.appendChild(imageField(img.src || '', (v) => { img.src = v; onChange(); }));
        const altInp = document.createElement('input');
        altInp.type='text'; altInp.placeholder='Alt text'; altInp.value = img.alt || '';
        altInp.style.marginTop = '4px';
        altInp.addEventListener('input', () => { img.alt = altInp.value; onChange(); });
        sub.appendChild(altInp);
        wrap.appendChild(sub);
      });
      break;
    }
    case 'string_list_inline': {
      const arr = Array.isArray(getVal()) ? getVal() : [];
      if (!Array.isArray(getVal())) setVal(arr);
      arr.forEach((str, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin-bottom:4px;';
        const ta = document.createElement('textarea');
        ta.rows = 1;
        ta.value = str;
        ta.style.flex = '1';
        ta.addEventListener('input', () => { arr[i] = ta.value; onChange(); });
        const del = document.createElement('button');
        del.textContent = '✕';
        del.className = 'small';
        del.addEventListener('click', (e) => { e.preventDefault(); arr.splice(i,1); onChange(); renderEditor(); });
        row.appendChild(ta);
        row.appendChild(del);
        wrap.appendChild(row);
      });
      const add = document.createElement('button');
      add.textContent = '+ Add item';
      add.className = 'small';
      add.addEventListener('click', (e) => { e.preventDefault(); arr.push(''); onChange(); renderEditor(); });
      wrap.appendChild(add);
      break;
    }
    case 'step_list_field': {
      let arr = getVal();
      if (!Array.isArray(arr)) { arr = []; setVal(arr); }
      arr.forEach((step, i) => {
        const row = document.createElement('div');
        row.className = 'subitem';
        row.innerHTML = `<div class="subitem-head"><span class="drag-handle" title="Drag to reorder">⠿</span><span class="subitem-kind">Step ${i+1}</span><span class="subitem-actions"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del">✕</button></span></div>`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:80px 1fr;gap:6px 8px;align-items:center;';
        grid.innerHTML = `
          <label class="field-label">Title</label>
          <input type="text" data-k="title" value="${escapeAttr(step.title||'')}" placeholder="Short step title">
          <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
          <textarea data-k="body" rows="2">${escapeText(step.body||'')}</textarea>`;
        row.appendChild(grid);
        attachSubitemDrag(row, arr, i, onChange);
        grid.querySelectorAll('[data-k]').forEach(el => {
          el.addEventListener('input', () => { step[el.dataset.k] = el.value; onChange(); });
        });
        row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<arr.length-1) { [arr[i+1], arr[i]] = [arr[i], arr[i+1]]; onChange(); renderEditor(); } });
        row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); arr.splice(i,1); onChange(); renderEditor(); });
        wrap.appendChild(row);
      });
      const add = document.createElement('button');
      add.textContent = '+ Add step';
      add.className = 'small';
      add.addEventListener('click', (e) => { e.preventDefault(); arr.push({ title: '', body: '' }); onChange(); renderEditor(); });
      wrap.appendChild(add);
      break;
    }
    case 'verdict_select': {
      const sel = document.createElement('select');
      [['true','True'],['false','False'],['misleading','Misleading']].forEach(([v,l]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        if ((getVal()||'true') === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => setVal(sel.value));
      wrap.appendChild(sel);
      break;
    }
    default:
      wrap.appendChild(document.createTextNode(`?? ${f.kind}`));
  }
  return wrap;
}

// Generic media upload field — supports image, audio, video with drag-drop
function mediaField(initial, onChange, opts = {}) {
  const accept = opts.accept || 'image/*';
  const kind = opts.kind || 'image'; // 'image' | 'audio' | 'video' | 'media'
  const browseFilter = opts.browseFilter || kind;

  const box = document.createElement('div');
  box.className = 'img-field';

  // Thumbnail / preview
  const thumb = document.createElement('div');
  thumb.className = 'img-thumb';
  if (kind === 'audio') {
    thumb.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--fog,#eaeef2);';
    thumb.textContent = initial ? '🔊' : '🎵';
  } else {
    if (initial) thumb.style.backgroundImage = `url('${encodeURI(initial)}')`;
  }

  function updatePreview(url) {
    if (kind === 'audio') {
      thumb.textContent = url ? '🔊' : '🎵';
    } else {
      thumb.style.backgroundImage = url ? `url('${encodeURI(url)}')` : '';
    }
  }

  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = initial || '';
  inp.placeholder = kind === 'audio' ? 'audio file URL or upload…' : 'images/...';
  inp.addEventListener('input', () => { onChange(inp.value); updatePreview(inp.value); });

  // Upload handler (reused by button + drag-drop)
  async function handleFiles(files) {
    const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_SIZE) {
        toast(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`, 'error');
        continue;
      }
      try {
        const r = await SB.uploadFile(f);
        inp.value = r.url;
        onChange(r.url);
        updatePreview(r.url);
        toast('Uploaded · ' + r.url, 'success');
      } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
    }
  }

  const actions = document.createElement('div');
  actions.className = 'img-field-actions';
  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload…';
  uploadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = accept;
    file.addEventListener('change', () => { if (file.files.length) handleFiles(file.files); });
    file.click();
  });
  const browseBtn = document.createElement('button');
  browseBtn.textContent = 'Browse…';
  browseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFilePicker(browseFilter, (url) => { inp.value = url; onChange(url); updatePreview(url); });
  });
  actions.appendChild(uploadBtn);
  actions.appendChild(browseBtn);

  // Drag & drop zone
  box.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.add('drag-active'); });
  box.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('drag-active'); });
  box.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); box.classList.remove('drag-active');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  box.appendChild(thumb);
  const col = document.createElement('div');
  col.className = 'img-field-col';
  col.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  col.appendChild(inp);
  box.appendChild(col);
  box.appendChild(actions);
  return box;
}

// Backward compat wrapper
function imageField(initial, onChange) {
  return mediaField(initial, onChange, { accept: 'image/*', kind: 'image', browseFilter: 'image' });
}

// Generic file picker (images, audio, video)
function openFilePicker(filter, onSelect) {
  if (filter === 'image') {
    // Use existing image picker
    openImagePicker(onSelect);
    return;
  }
  // For audio/video/all — fetch from storage and show a simple list modal
  openModal('Browse files', async (body) => {
    body.innerHTML = '<div style="text-align:center;color:#8c959f;padding:2rem;">Loading…</div>';
    try {
      const { files } = await SB.listFiles(filter);
      if (!files.length) { body.innerHTML = '<div style="text-align:center;color:#8c959f;padding:2rem;">No files found. Upload one first.</div>'; return; }
      body.innerHTML = '';
      files.forEach(f => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .15s;';
        row.addEventListener('mouseenter', () => { row.style.background = '#f6f8fa'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:20px;flex-shrink:0;';
        icon.textContent = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name) ? '🎵' : /\.(mp4|webm|mov)$/i.test(f.name) ? '🎬' : '📄';
        const name = document.createElement('span');
        name.style.cssText = 'flex:1;font-size:13px;color:#24292f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        name.textContent = f.name;
        const size = document.createElement('span');
        size.style.cssText = 'font-size:11px;color:#8c959f;flex-shrink:0;';
        size.textContent = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : f.size > 1024 ? Math.round(f.size / 1024) + ' KB' : f.size + ' B';
        row.appendChild(icon);
        row.appendChild(name);
        row.appendChild(size);
        row.addEventListener('click', () => { onSelect(f.url); closeModal(); });
        body.appendChild(row);
      });
    } catch (err) { body.innerHTML = `<div style="color:#cf222e;padding:1rem;">Failed: ${err.message}</div>`; }
  }, '');
}

// Upload one or more files via Supabase; calls onUrl(url) for each successful upload.
// Live upload-progress pill (bottom-center). Returns { set(pct), done(), fail() }.
function uploadProgressUI(label) {
  let el = document.getElementById('upload-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'upload-progress';
    el.className = 'upload-progress';
    el.innerHTML = '<div class="up-bar"><div class="up-fill"></div></div><div class="up-label"></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('err');
  const fill = el.querySelector('.up-fill');
  const lab = el.querySelector('.up-label');
  const base = label || 'Uploading…';
  fill.style.width = '2%';
  lab.textContent = base;
  requestAnimationFrame(() => el.classList.add('show'));
  return {
    set(pct){ fill.style.width = Math.max(2, pct) + '%'; lab.textContent = base + ' · ' + pct + '%'; },
    done(){ fill.style.width = '100%'; lab.textContent = 'Uploaded'; setTimeout(() => el.classList.remove('show'), 900); },
    fail(){ el.classList.add('err'); lab.textContent = 'Upload failed'; setTimeout(() => el.classList.remove('show'), 1800); },
  };
}

async function uploadPickedFiles(files, onUrl) {
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
  const arr = Array.from(files);
  for (let i = 0; i < arr.length; i++) {
    const f = arr[i];
    if (f.size > MAX_UPLOAD_SIZE) {
      toast(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`, 'error');
      continue;
    }
    const prog = uploadProgressUI(arr.length > 1 ? `Uploading ${i + 1}/${arr.length}` : 'Uploading');
    try {
      const r = await SB.uploadFile(f, (pct) => prog.set(pct));
      prog.done();
      if (onUrl) onUrl(r.url);
    } catch (err) { prog.fail(); toast('Upload failed: ' + err.message, 'error'); }
  }
}

async function openImagePicker(cb) {
  openModal('Pick image', async (body) => {
    async function render() {
      body.innerHTML = 'Loading…';
      let images = [];
      try { ({ images } = await SB.listImages()); }
      catch (e) { body.innerHTML = ''; }
      body.innerHTML = '';

      // Upload zone (button + drag-and-drop) — always available, even with no images.
      const zone = document.createElement('div');
      zone.className = 'pick-upload-zone';
      zone.innerHTML = '<span class="pick-upload-ic">⬆</span><span>Drop an image here, or <b>browse</b></span>';
      const fileInp = document.createElement('input');
      fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.style.display = 'none';
      zone.appendChild(fileInp);
      zone.addEventListener('click', () => fileInp.click());
      fileInp.addEventListener('change', async () => {
        if (!fileInp.files.length) return;
        await uploadPickedFiles(fileInp.files, (url) => { closeModal(); cb(url); });
      });
      ['dragover','dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-active'); }));
      ['dragleave','dragend'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('drag-active')));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault(); zone.classList.remove('drag-active');
        if (e.dataTransfer?.files?.length) await uploadPickedFiles(e.dataTransfer.files, (url) => { closeModal(); cb(url); });
      });
      body.appendChild(zone);

      if (!images.length) {
        const empty = document.createElement('div');
        empty.className = 'side-empty'; empty.textContent = 'No images yet — upload one above.';
        body.appendChild(empty);
        return;
      }
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;';
      images.forEach(img => {
        const card = document.createElement('button');
        card.style.cssText = 'border:1px solid #d0d7de;border-radius:6px;padding:4px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:center;';
        card.innerHTML = `<div style="width:100%;height:80px;background:#eaeef2 center/cover no-repeat;background-image:url('${encodeURI(img.url).replace(/'/g, '%27')}');border-radius:4px;"></div>
                          <div style="font-size:10px;color:#57606a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${img.url.split('/').pop()}</div>`;
        card.title = img.url;
        card.addEventListener('click', () => { closeModal(); cb(img.url); });
        grid.appendChild(card);
      });
      body.appendChild(grid);
    }
    await render();
  }, '');
}

function updateBlockSummary() {
  // Re-render only the active row's summary text without rebuilding the list
  const block = state.doc.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  const li = document.querySelector('.block-item.active');
  if (li) {
    const summaryEl = li.querySelector('.block-summary');
    if (summaryEl) summaryEl.textContent = blockSummary(block);
  }
}

// ─────────────────────────── Save / Publish ──────────────────
// Right before save: auto-assign scrollyId, stepsId, and unique stepIndex across the page.
// These are technical identifiers the user shouldn't have to think about — we manage them.
function ensureScrollyIds(doc) {
  let scrollyNum = 0;
  let stepCounter = 0;
  for (const block of doc.blocks) {
    if (block.type === 'Scrolly') {
      scrollyNum++;
      if (!block.data) block.data = {};
      if (!block.data.scrollyId) block.data.scrollyId = `scrolly-${scrollyNum}`;
      if (!block.data.stepsId)   block.data.stepsId   = `steps-${scrollyNum}`;
      if (Array.isArray(block.data.steps)) {
        block.data.steps.forEach(s => { s.stepIndex = stepCounter++; });
      }
    }
  }
}

$('#btn-publish').addEventListener('click', async () => {
  if (!state.doc) return;
  // Publish validation
  if (!state.doc.blocks || state.doc.blocks.length === 0) {
    toast('Cannot publish an empty page — add at least one block', 'error');
    return;
  }
  const hero = state.doc.blocks.find(b => b.type === 'Hero');
  if (hero && (!hero.data?.titleHtml || hero.data.titleHtml.trim() === '')) {
    if (!confirm('Your Hero block has no title. Publish anyway?')) return;
  }
  ensureScrollyIds(state.doc);
  $('#btn-publish').disabled = true;
  setSaveStatus('publishing');
  try {
    const r = await SB.saveDraft(state.currentPageId, state.doc);
    state.doc.version = r.version;
    state.savedVersion = r.version;
    setDirty(false);
    clearLocalBackup(state.currentPageId);
    setSaveStatus('published');
    toast(`Published · v${r.version}`, 'success');
    refreshPreview();

    // Show live URL banner
    const liveUrl = await getPublicUrl();
    if (liveUrl) showPublishedBanner(liveUrl);
  } catch (e) {
    setSaveStatus('error');
    toast('Save failed: ' + e.message, 'error');
    $('#btn-publish').disabled = false;
  }
});

// Preview
function pageUrl() {
  return getPreviewBlobUrl();
}

function getPreviewBlobUrl() {
  if (!state.doc) return 'about:blank';
  const doc = state.doc;
  const origin = window.location.origin;
  const theme = doc.theme || 'dia';
  const themeLink = theme !== 'dia' ? `<link rel="stylesheet" href="${origin}/themes/${theme}.css">` : '';
  const veScript = state.visualEditMode ? `<script src="${origin}/js/visual-edit.js" defer><\/script>` : '';
  const html = `<!DOCTYPE html>
<html lang="${doc.lang || 'de'}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${origin}/css/site.css">
${themeLink}
<script>window.__PAGE_DATA__ = ${JSON.stringify(doc).replace(/<\//g, '<\\/')};<\/script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\/script>
<base href="${origin}/">
</head>
<body>
<main id="page-root"></main>
<script type="module">
import { render } from '${origin}/js/render.js?v=20260608a';
render();
<\/script>
${veScript}</body></html>`;
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
}
// refreshPreview(opts)
//   opts.reload === true  → force a full iframe reload (needed for first load,
//                           page switch, theme change, or visual-edit toggle,
//                           which all change the iframe's <head>/scripts).
//   otherwise             → in-place soft refresh: post the updated doc into the
//                           already-loaded iframe and re-render without navigation,
//                           so the reader's scroll position is preserved (no jump).
function refreshPreview(opts = {}) {
  const run = () => {
    const iframe = $('#preview-frame');
    const cw = iframe.contentWindow;
    const samePage = iframe._loadedPageId && iframe._loadedPageId === state.currentPageId;

    if (!opts.reload && samePage && cw) {
      try {
        cw.postMessage({ type: 'soft-refresh', doc: state.doc }, '*');
        return;
      } catch (_) { /* fall through to full reload */ }
    }

    // Full reload (revoke old blob URL to avoid memory leaks)
    if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
    const url = pageUrl();
    iframe._blobUrl = url;
    iframe._loadedPageId = state.currentPageId;
    iframe.src = url;
  };

  clearTimeout(refreshPreview._t);
  if (opts.immediate) { run(); return; }
  refreshPreview._t = setTimeout(run, 150);
}
$('#btn-preview').addEventListener('click', () => window.open(pageUrl(), '_blank'));
$('#btn-refresh-preview').addEventListener('click', () => {
  const iframe = $('#preview-frame');
  if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
  const url = pageUrl();
  iframe._blobUrl = url;
  iframe._loadedPageId = state.currentPageId;
  iframe.src = url;
});
$('#btn-visual-edit').addEventListener('click', () => {
  state.visualEditMode = !state.visualEditMode;
  const b = $('#btn-visual-edit');
  b.classList.toggle('active', state.visualEditMode); // icon-only button — toggle highlight, keep the SVG
  b.title = state.visualEditMode ? 'Editing on the preview — click to stop' : 'Edit text & images directly on the preview';
  refreshPreview({ reload: true }); // toggling VE injects/removes a script → needs reload
});

// ── Fullscreen preview toggle ──
(function initFullscreenPreview() {
  const layout = document.querySelector('.layout');
  const previewAside = layout.querySelector('.preview');
  const btn = $('#btn-fullscreen-preview');
  if (!btn) return; // fullscreen toggle removed from the toolbar

  // Create floating back toolbar inside the preview aside
  const backToolbar = document.createElement('div');
  backToolbar.className = 'fullscreen-back-toolbar';
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Back';
  backBtn.title = 'Exit fullscreen preview';
  backToolbar.appendChild(backBtn);
  previewAside.style.position = 'relative';
  previewAside.appendChild(backToolbar);

  function toggleFullscreen() {
    const isFS = layout.classList.toggle('preview-fullscreen');
    btn.textContent = isFS ? '✖' : '⛶';
    btn.title = isFS ? 'Exit fullscreen preview' : 'Expand preview to full width';
  }

  btn.addEventListener('click', toggleFullscreen);
  backBtn.addEventListener('click', toggleFullscreen);

  // ESC exits fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layout.classList.contains('preview-fullscreen')) {
      toggleFullscreen();
    }
  });
})();

// Visual edit postMessage handler (receives events from visual-edit.js inside the preview iframe)
window.addEventListener('message', async (evt) => {
  // Only accept editor messages from our own preview iframe's window — not any other
  // frame/popup. (Checked by source rather than origin: the preview is a blob: URL whose
  // reported origin is unreliable across browsers.)
  const _pf = document.getElementById('preview-frame');
  if (!_pf || evt.source !== _pf.contentWindow) return;
  if (!evt.data || evt.data.type !== 'visual-edit') return;
  const { action, blockId, field, subfield, index, value, valueType, currentSrc } = evt.data;

  if (action === 'text-change') {
    const block = state.doc.blocks.find(b => b.id === blockId);
    if (!block) return;
    const safeValue = (valueType === 'html') ? sanitizeHtml(value) : value;
    if (index != null && subfield) {
      const arr = block.data[field];
      if (Array.isArray(arr) && arr[index] != null) {
        if (typeof arr[index] === 'string') {
          arr[index] = safeValue;
        } else {
          arr[index][subfield] = safeValue;
        }
      }
    } else if (index != null) {
      if (!Array.isArray(block.data[field])) return;
      block.data[field][index] = safeValue;
    } else {
      block.data[field] = safeValue;
    }
    setDirty(true);
    if (block.id === state.selectedBlockId) renderEditor();
    updateBlockSummary();
  }

  if (action === 'image-pick') {
    const block = state.doc.blocks.find(b => b.id === blockId);
    if (!block) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
      if (file.size > MAX_UPLOAD_SIZE) {
        toast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`, 'error');
        return;
      }
      try {
        toast('Uploading image…', 'info');
        const r = await SB.uploadFile(file);
        const newSrc = r.url;
        if (index != null && subfield) {
          const arr = block.data[field];
          if (Array.isArray(arr) && arr[index] != null) {
            if (typeof arr[index] === 'string') {
              arr[index] = newSrc;
            } else {
              arr[index][subfield] = newSrc;
            }
          }
        } else if (index != null) {
          if (!Array.isArray(block.data[field])) return;
          block.data[field][index] = newSrc;
        } else {
          block.data[field] = newSrc;
        }
        setDirty(true);
        if (block.id === state.selectedBlockId) renderEditor();
        updateBlockSummary();
        const previewFrame = $('#preview-frame');
        if (previewFrame && previewFrame.contentWindow) {
          previewFrame.contentWindow.postMessage(
            { type: 'visual-edit-response', action: 'image-replaced', blockId, field, index, newSrc },
            '*'
          );
        }
        toast('Image replaced', 'success');
      } catch (err) {
        toast('Upload failed: ' + err.message, 'error');
      } finally {
        input.remove();
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  if (action === 'select-block') {
    const block = state.doc.blocks.find(b => b.id === blockId);
    if (block && block.id !== state.selectedBlockId) {
      state.selectedBlockId = block.id;
      renderBlockList();
      renderEditor();
    }
  }

  // Insert block at position (from visual-edit hover zones) — open the in-sidebar library
  if (action === 'insert-block') {
    const afterId = evt.data.afterBlockId;
    openLibrary(afterId);
  }

  // Scroll-spy: highlight the Sections row matching the block currently in view in the preview
  if (action === 'active-block') {
    const id = evt.data.blockId;
    let row = null;
    document.querySelectorAll('#block-list .block-item').forEach(li => {
      const on = li.dataset.blockId === id;
      li.classList.toggle('in-view', on);
      if (on) row = li;
    });
    // Keep the highlighted row visible in the sidebar without yanking it around.
    if (row && !row.classList.contains('active')) row.scrollIntoView({ block: 'nearest' });
    return;
  }

  // Drag-and-drop from the component library onto the preview
  if (action === 'drop-block') {
    const blockType = evt.data.blockType;
    const afterId = evt.data.afterBlockId || null;
    // Only insert known block types — never persist an unrenderable junk block.
    if (blockType && BLOCK_SCHEMAS[blockType]) {
      closeLibrary();
      await addEmptyBlock(blockType, afterId);
    }
    return;
  }
});

// Page settings (theme, title, meta)
$('#btn-settings').addEventListener('click', () => {
  if (!state.doc) { toast('Select a page first', 'error'); return; }
  openModal('Page settings', (body) => {
    body.innerHTML = '';

    const themeLabel = document.createElement('label');
    themeLabel.className = 'field-label';
    themeLabel.textContent = 'Theme';
    body.appendChild(themeLabel);
    const themeSel = document.createElement('select');
    themeSel.innerHTML = `
      <option value="dia" ${state.doc.theme === 'dia' || !state.doc.theme ? 'selected' : ''}>Dia — Warm editorial (default)</option>
      <option value="scrolli" ${state.doc.theme === 'scrolli' ? 'selected' : ''}>Scrolli — Modern indigo</option>
      <option value="claude" ${state.doc.theme === 'claude' ? 'selected' : ''}>Claude — Clean modern</option>
      <option value="miranda" ${state.doc.theme === 'miranda' ? 'selected' : ''}>Miranda — Vintage newsprint (dark)</option>
    `;
    body.appendChild(themeSel);

    const titleLabel = document.createElement('label');
    titleLabel.className = 'field-label';
    titleLabel.textContent = 'Page title';
    titleLabel.style.marginTop = '14px';
    body.appendChild(titleLabel);
    const titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.value = state.doc.meta?.title || '';
    body.appendChild(titleInp);

    const langLabel = document.createElement('label');
    langLabel.className = 'field-label';
    langLabel.textContent = 'Language';
    langLabel.style.marginTop = '14px';
    body.appendChild(langLabel);
    const langSel = document.createElement('select');
    langSel.innerHTML = `<option value="de" ${state.doc.lang === 'de' ? 'selected' : ''}>Deutsch</option><option value="en" ${state.doc.lang === 'en' ? 'selected' : ''}>English</option>`;
    body.appendChild(langSel);

    // ── Smooth scroll ──
    const scrollSep = document.createElement('div');
    scrollSep.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px solid #eaeef2;';
    body.appendChild(scrollSep);
    const scrollRow = document.createElement('label');
    scrollRow.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
    const scrollChk = document.createElement('input');
    scrollChk.type = 'checkbox';
    scrollChk.checked = !!state.doc.smoothScroll;
    scrollRow.appendChild(scrollChk);
    const scrollTxt = document.createElement('span');
    scrollTxt.style.cssText = 'font-size:13px;color:#24292f;';
    scrollTxt.textContent = 'Smooth scroll';
    scrollRow.appendChild(scrollTxt);
    body.appendChild(scrollRow);
    const scrollHint = document.createElement('div');
    scrollHint.style.cssText = 'font-size:11px;color:#8c959f;margin-top:3px;line-height:1.45;';
    scrollHint.textContent = 'Enables Lenis buttery-smooth scrolling (wheel + touch).';
    body.appendChild(scrollHint);

    // ── Background image ──
    const bgData = state.doc.background || {};

    const bgSep = document.createElement('div');
    bgSep.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid #eaeef2;';
    const bgTitle = document.createElement('div');
    bgTitle.style.cssText = 'font-weight:600;font-size:13px;color:#24292f;margin-bottom:10px;';
    bgTitle.textContent = 'Page background image';
    bgSep.appendChild(bgTitle);
    body.appendChild(bgSep);

    const bgImgLabel = document.createElement('label');
    bgImgLabel.className = 'field-label';
    bgImgLabel.textContent = 'Background image URL';
    body.appendChild(bgImgLabel);
    const bgImgHint = document.createElement('div');
    bgImgHint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:5px;line-height:1.45;';
    bgImgHint.textContent = 'Fixed behind all content. Per-block bgOpacity (0–1) controls visibility as user scrolls.';
    body.appendChild(bgImgHint);
    const bgImgInp = document.createElement('input');
    bgImgInp.type = 'text';
    bgImgInp.placeholder = '/images/texture.jpg or full URL';
    bgImgInp.value = bgData.imageSrc || '';
    body.appendChild(bgImgInp);

    // Upload button for background
    const bgUploadRow = document.createElement('div');
    bgUploadRow.style.cssText = 'margin-top:6px;display:flex;gap:8px;align-items:center;';
    const bgUploadBtn = document.createElement('button');
    bgUploadBtn.className = 'ghost';
    bgUploadBtn.textContent = '📎 Upload image';
    bgUploadBtn.style.fontSize = '12px';
    const bgUploadFile = document.createElement('input');
    bgUploadFile.type = 'file';
    bgUploadFile.accept = 'image/*,video/*';
    bgUploadFile.style.display = 'none';
    bgUploadBtn.addEventListener('click', () => bgUploadFile.click());
    bgUploadFile.addEventListener('change', async () => {
      if (!bgUploadFile.files.length) return;
      const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
      if (bgUploadFile.files[0].size > MAX_UPLOAD_SIZE) {
        toast(`File too large (${(bgUploadFile.files[0].size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`, 'error');
        bgUploadFile.value = '';
        return;
      }
      try {
        bgUploadBtn.textContent = 'Uploading…';
        bgUploadBtn.disabled = true;
        const r = await SB.uploadImage(bgUploadFile.files[0]);
        bgImgInp.value = r.url;
        toast('Background image uploaded', 'success');
      } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
      bgUploadBtn.textContent = '📎 Upload image';
      bgUploadBtn.disabled = false;
      bgUploadFile.value = '';
    });
    bgUploadRow.appendChild(bgUploadBtn);
    bgUploadRow.appendChild(bgUploadFile);
    body.appendChild(bgUploadRow);

    const bgOpLabel = document.createElement('label');
    bgOpLabel.className = 'field-label';
    bgOpLabel.textContent = 'Default opacity (0–1)';
    bgOpLabel.style.marginTop = '12px';
    body.appendChild(bgOpLabel);
    const bgOpHint = document.createElement('div');
    bgOpHint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:5px;line-height:1.45;';
    bgOpHint.textContent = 'Used when a block doesn\'t specify its own bgOpacity. 0 = invisible, 1 = fully visible.';
    body.appendChild(bgOpHint);
    const bgOpInp = document.createElement('input');
    bgOpInp.type = 'range';
    bgOpInp.min = '0'; bgOpInp.max = '1'; bgOpInp.step = '0.05';
    bgOpInp.value = bgData.defaultOpacity != null ? String(bgData.defaultOpacity) : '0.15';
    bgOpInp.style.cssText = 'width:100%;margin-bottom:2px;';
    const bgOpVal = document.createElement('span');
    bgOpVal.style.cssText = 'font-size:12px;color:#57606a;font-variant-numeric:tabular-nums;';
    bgOpVal.textContent = bgOpInp.value;
    bgOpInp.addEventListener('input', () => { bgOpVal.textContent = bgOpInp.value; });
    body.appendChild(bgOpInp);
    body.appendChild(bgOpVal);

    // ── AI Model (workspace-level, stored in localStorage) ──
    const aiDivider = document.createElement('div');
    aiDivider.style.cssText = 'margin:18px 0 10px;border-top:1px solid #e6eaef;padding-top:14px;';
    aiDivider.innerHTML = '<span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#8c959f;">AI Model</span>';
    body.appendChild(aiDivider);

    const aiModelLabel = document.createElement('label');
    aiModelLabel.className = 'field-label';
    aiModelLabel.textContent = 'Model used for all ✨ Generate actions';
    body.appendChild(aiModelLabel);
    const aiModelSel = document.createElement('select');
    aiModelSel.style.cssText = 'width:100%;margin-bottom:4px;';
    aiModelSel.innerHTML = `
      <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">Llama 3.3 70B — fast, default</option>
      <option value="deepseek-v4-pro">DeepSeek V4 Pro — strongest, external API</option>
    `;
    const savedModel = localStorage.getItem('scrollycms_ai_model') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    aiModelSel.value = savedModel;
    body.appendChild(aiModelSel);
    const aiModelHint = document.createElement('div');
    aiModelHint.style.cssText = 'font-size:11px;color:#8c959f;margin-bottom:4px;line-height:1.5;';
    aiModelHint.textContent = 'Applies to all pages. DeepSeek V4 Pro is a 1M-context model via the DeepSeek API — requires DEEPSEEK_API_KEY worker secret.';
    body.appendChild(aiModelHint);

    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.className = 'ghost'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    const save = document.createElement('button');
    save.className = 'primary'; save.textContent = 'Apply';
    save.addEventListener('click', () => {
      // Save AI model preference (workspace-level, not page-level)
      localStorage.setItem('scrollycms_ai_model', aiModelSel.value);
      state.doc.theme = themeSel.value;
      state.doc.lang = langSel.value;
      if (!state.doc.meta) state.doc.meta = {};
      state.doc.meta.title = titleInp.value.trim();
      // Background
      const bgSrc = bgImgInp.value.trim();
      if (bgSrc) {
        state.doc.background = {
          imageSrc: bgSrc,
          defaultOpacity: parseFloat(bgOpInp.value) || 0.15,
        };
      } else {
        delete state.doc.background;
      }
      state.doc.smoothScroll = scrollChk.checked;
      setDirty(true);
      refreshPreview({ reload: true }); // theme / bg / <head> changes need a full reload
      closeModal();
      toast('Settings updated — publish to apply', 'success');
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    body.appendChild(actions);
  }, '');
});

// History
function formatHistoryDate(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  // Relative time for recent entries
  let relative;
  if (diffMin < 1) relative = 'just now';
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffHr < 24) relative = `${diffHr}h ago`;
  else {
    const days = Math.floor(diffHr / 24);
    relative = days === 1 ? 'yesterday' : `${days}d ago`;
  }

  // Absolute time
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return { relative, absolute: `${dateStr}, ${timeStr}` };
}

$('#btn-history').addEventListener('click', async () => {
  openModal('Version history', async (body) => {
    body.innerHTML = 'Loading…';
    try {
      const { snapshots } = await SB.listHistory(state.currentPageId);
      body.innerHTML = '';
      if (!snapshots.length) {
        body.innerHTML = '<p style="color:#666;text-align:center;padding:2rem 0;">No history yet.<br><span style="font-size:12px;">Publishing creates snapshots automatically.</span></p>';
        return;
      }

      let restoredId = null;

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      const renderHistoryList = () => {
        list.innerHTML = '';
        // Restored item floats to top, rest stay in original order
        const sorted = restoredId
          ? [...snapshots].sort((a, b) => (a.id === restoredId ? -1 : b.id === restoredId ? 1 : 0))
          : snapshots;

        sorted.forEach((s, i) => {
          const { relative, absolute } = formatHistoryDate(s.ts);
          const isRestored = s.id === restoredId;
          const isLatest = !restoredId && i === 0;

          const row = document.createElement('div');
          row.style.cssText = [
            'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;gap:12px;transition:background .15s,opacity .15s;',
            isRestored
              ? 'background:#f0fdf4;border:1px solid #bbf7d0;cursor:default;'
              : 'background:#f9f9f9;border:1px solid transparent;cursor:pointer;',
          ].join('');

          if (!isRestored) {
            row.addEventListener('mouseenter', () => { row.style.background = '#f0f0f0'; });
            row.addEventListener('mouseleave', () => { row.style.background = '#f9f9f9'; });
          }

          row.innerHTML = `
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <span style="font-weight:600;font-size:13px;color:#111;">v${s.version || '?'}</span>
                <span style="font-size:11px;color:#888;background:#eee;padding:1px 7px;border-radius:4px;">${relative}</span>
                ${isRestored ? '<span style="font-size:10px;color:#16a34a;background:#dcfce7;padding:2px 7px;border-radius:4px;font-weight:600;">✓ Restored</span>' : ''}
                ${isLatest ? '<span style="font-size:10px;color:#0969da;background:#ddf4ff;padding:1px 6px;border-radius:4px;font-weight:500;">latest</span>' : ''}
              </div>
              <div style="font-size:11px;color:#666;">${absolute} · ${s.blockCount} block${s.blockCount !== 1 ? 's' : ''}</div>
            </div>
            ${!isRestored ? '<span style="font-size:11px;color:#aaa;flex-shrink:0;">Restore →</span>' : ''}`;

          if (!isRestored) {
            row.addEventListener('click', async () => {
              row.style.opacity = '0.45';
              row.style.pointerEvents = 'none';
              try {
                await SB.restoreSnapshot(state.currentPageId, s.id);
                restoredId = s.id;
                // Update editor state directly — avoids the full loadPage + animation crash
                const restored = await SB.getPage(state.currentPageId);
                state.doc = restored;
                state.savedVersion = restored.version || 0;
                state.selectedBlockId = null;
                setDirty(false);
                renderBlockList();
                refreshPreview();
                renderHistoryList();
                toast(`Restored to v${s.version}`, 'success');
              } catch (err) {
                row.style.opacity = '';
                row.style.pointerEvents = '';
                console.error('[restore] failed:', err);
                toast('Restore failed: ' + err.message, 'error');
              }
            });
          }

          list.appendChild(row);
        });
      };

      renderHistoryList();
      body.appendChild(list);
    } catch (e) { body.textContent = 'Error: ' + e.message; }
  });
});

// ─────────────────────────── Modal ────────────────────────────
function openModal(title, renderBody, footerBtn) {
  // Instant clear — no animation when transitioning between modals
  $('#modal-root').innerHTML = '';
  const root = $('#modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head"><span>${escapeText(title)}</span><button class="ghost close-x">✕</button></div>
      <div class="modal-body"></div>
      ${footerBtn === '' ? '' : `<div class="modal-foot"><button class="close-x">Close</button></div>`}
    </div>`;
  root.appendChild(backdrop);
  const body = backdrop.querySelector('.modal-body');
  const res = renderBody(body);
  if (res instanceof Promise) res.catch(e => { body.textContent = 'Error: ' + e.message; });
  // Animate in
  if (window.MX) MX.animateModalIn(backdrop, backdrop.querySelector('.modal'));
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelectorAll('.close-x').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() {
  const root = $('#modal-root');
  const backdrop = root.querySelector('.modal-backdrop');
  if (!backdrop) { root.innerHTML = ''; return; }
  if (window.MX) {
    // Animate out, then remove only this specific backdrop (not innerHTML reset)
    MX.animateModalOut(backdrop, backdrop.querySelector('.modal')).then(() => {
      backdrop.remove();
    });
  } else {
    root.innerHTML = '';
  }
}

// ─────────────────────────── Helpers ──────────────────────────
function escapeText(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

// No "leave site?" prompt. Work is auto-saved continuously, and a synchronous
// localStorage backup is taken before the page is hidden/closed so nothing is lost
// even if the tab is closed mid-debounce. The backup is restored silently on next load.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.dirty) {
    backupToLocal();          // synchronous, survives an immediate close
    runAutosave();            // fire-and-forget server flush (best effort)
  }
});
window.addEventListener('pagehide', () => { if (state.dirty) backupToLocal(); });

// ─────────────────────────── Autosave ──────────────────────────
// Debounced autosave — triggers shortly after the last change.
// Does NOT publish or create history — just persists so you never lose work.
let _autosaveDebounce = null;
let _autosaving = false;
let _autosavePromise = null;
let _autosaveFailCount = 0;

function scheduleAutosave() {
  clearTimeout(_autosaveDebounce);
  _autosaveDebounce = setTimeout(runAutosave, 900);
}

// Cancel the pending debounce and persist immediately (used before switching pages).
// Awaits any in-flight save too, so the "flush before switch" guarantee actually holds.
async function flushAutosave() {
  clearTimeout(_autosaveDebounce);
  await runAutosave();
}

function runAutosave() {
  if (_autosaving) return _autosavePromise || Promise.resolve();   // await the in-flight save
  if (!state.dirty || !state.doc || !state.currentPageId) return Promise.resolve();
  if (_autosaveFailCount >= 3) return Promise.resolve();
  _autosaving = true;
  showSaveIndicator('saving');
  // Snapshot the target at fire time so a page swap mid-flight can't mismatch page↔doc.
  const pageId = state.currentPageId;
  const doc = state.doc;
  _autosavePromise = (async () => {
    try {
      await SB.autoSave(pageId, doc);
      clearLocalBackup(pageId);
      _autosaveFailCount = 0;
      showSaveIndicator('saved');
    } catch (e) {
      console.error('Autosave failed:', e.message);
      _autosaveFailCount++;
      showSaveIndicator('error');
      if (_autosaveFailCount >= 3) {
        toast('Autosave paused — changes backed up locally. Check connection.', 'error');
      }
    } finally {
      _autosaving = false;
    }
  })();
  return _autosavePromise;
}

// Auth expiry — save locally before showing login prompt
window.addEventListener('scrollycms:auth-expired', () => {
  backupToLocal();
  toast('Session expired — your work is saved locally. Please log in again.', 'error');
  setTimeout(() => { location.reload(); }, 3000);
});

// ── Mobile overflow menu (bottom sheet) ───────────────────────────────────────
(function initOverflowMenu() {
  var trigger = document.getElementById('btn-overflow');
  var menu = document.getElementById('overflow-menu');
  var backdrop = document.getElementById('overflow-backdrop');
  if (!trigger || !menu) return;

  var isSheet = function() { return window.innerWidth <= 900; }; // mobile = bottom sheet, desktop = dropdown
  function openMenu() {
    if (backdrop) { backdrop.classList.add('open'); backdrop.style.visibility = 'visible'; }
    menu.classList.add('open');
    menu.style.visibility = 'visible';
    trigger.classList.add('active');
    if (window.MX && isSheet()) MX.animateSheetOpen(menu, backdrop);
  }
  function closeMenu() {
    trigger.classList.remove('active');
    if (window.MX && isSheet()) {
      MX.animateSheetClose(menu, backdrop).then(() => {
        menu.classList.remove('open');
        menu.style.visibility = 'hidden';
        if (backdrop) { backdrop.classList.remove('open'); backdrop.style.visibility = 'hidden'; }
      });
    } else {
      if (backdrop) { backdrop.classList.remove('open'); backdrop.style.visibility = 'hidden'; }
      menu.classList.remove('open');
      menu.style.visibility = 'hidden';
    }
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.contains('open') ? closeMenu() : openMenu();
  });

  if (backdrop) backdrop.addEventListener('click', closeMenu);
  menu.addEventListener('click', function(e) { e.stopPropagation(); });

  // Delegate actions to original buttons
  menu.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-overflow]');
    if (!btn) return;
    closeMenu();
    // Rename now happens via the inline click-to-edit page title.
    if (btn.getAttribute('data-overflow') === 'rename') {
      if (typeof beginRenameTitle === 'function') beginRenameTitle();
      return;
    }
    var map = {
      'new-page':    'btn-new-page',
      'delete-page': 'btn-delete-page',
      'view':     'link-view-page',
      'preview':  'btn-preview',
      'history':  'btn-history',
      'settings': 'btn-settings',
      'logout':   'btn-logout',
    };
    var target = document.getElementById(map[btn.getAttribute('data-overflow')]);
    if (target) target.click();
  });
})();

// ── Mobile FAB (floating add button) ─────────────────────────────────────────
(function initFab() {
  var fab = document.getElementById('fab-add');
  var addBtn = document.getElementById('btn-add-block');
  if (!fab || !addBtn) return;
  fab.addEventListener('click', function() { addBtn.click(); });
})();

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
document.getElementById('side-new-page')?.addEventListener('click', () => document.getElementById('btn-new-page')?.click());
document.getElementById('side-upload')?.addEventListener('click', () => {
  // Direct upload: open the OS file dialog, upload, then refresh the Assets list.
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.accept = 'image/*,video/*,audio/*,.gif';
  inp.addEventListener('change', async () => {
    if (!inp.files.length) return;
    await uploadPickedFiles(inp.files, null);
    renderAssetsPane();
  });
  inp.click();
});

// ── Sidebar toggle (glass pill ☰) ────────────────────────────────────────────
(function initSidebarToggle() {
  var btn = document.getElementById('btn-sidebar-toggle');     // in-sidebar footer (collapse)
  var reopen = document.getElementById('btn-sidebar-reopen');  // floating, shown only when collapsed
  var blocks = document.querySelector('.blocks');
  if (!blocks) return;
  // Cancel any WAAPI animations on .blocks before toggling so motion.js's
  // animatePageSwap fill doesn't fight the CSS transition.
  function toggle() {
    blocks.getAnimations().forEach(function(a) { a.cancel(); });
    var collapsed = blocks.classList.toggle('is-collapsed');
    if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
  }
  if (btn) btn.onclick = toggle;
  if (reopen) reopen.onclick = toggle;
})();

// ─────────────────────────── Article Builder bridge ──────────────
// Exposed on window so article-builder.js (separate file) can insert generated blocks
window._insertBlocks = function(blocks) {
  if (!state.doc) return;
  if (!Array.isArray(blocks) || blocks.length === 0) return;
  blocks.forEach(b => {
    state.doc.blocks.push(b);
  });
  setDirty(true);
  renderBlockList();
  renderEditor();
  // Auto-save draft
  saveDraft();
};

// Kickoff
checkSession();
})();
