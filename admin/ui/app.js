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
  Hero: {
    name: 'Hero',
    description: 'Top of page — brand line, big title, animated intro lines',
    fields: [
      { key: 'brand',          label: 'Brand line (small caps at top)',     kind: 'text', group: 'content' },
      { key: 'titleHtml',      label: 'Title',                              kind: 'textarea', group: 'content',
        hint: 'Wrap a word in <code>&lt;span&gt;…&lt;/span&gt;</code> to highlight it in orange. Use <code>&lt;br&gt;</code> for a line break.' },
      { key: 'subtitle',       label: 'Subtitle',      kind: 'text', group: 'content' },
      { key: 'scrollCueText',  label: 'Scroll-down cue text',   kind: 'text', group: 'style' },
      { key: 'lines',          label: 'Intro lines (appear one by one before the title)', kind: 'lines', group: 'data' },
    ],
  },
  VizPanel: {
    name: 'Visualization',
    description: 'Shared interactive chart that scrolly sections drive',
    fields: [
      { key: 'initialTitle', label: 'Chart title (initial)',    kind: 'text', group: 'content' },
      { key: 'initialSub',   label: 'Chart subtitle (initial)', kind: 'text', group: 'content' },
    ],
  },
  Editorial: {
    name: 'Editorial',
    description: 'Long-form text section — paragraphs, quotes, images',
    fields: [
      { key: 'content', label: 'Content', kind: 'editorial_items', group: 'data' },
    ],
  },
  Scrolly: {
    name: 'Scrolly',
    description: 'Sticky-chart section with stepped narrative on the side',
    fields: [
      { key: 'imageSize',   label: 'Image size', kind: 'text', group: 'layout', hint: 'small (35%), medium (50%), large (65%), full, or any CSS value like "40%"' },
      { key: 'imageHeight', label: 'Image height', kind: 'text', group: 'layout', hint: 'CSS height: 100vh, 80vh, 60vh, 400px etc.' },
      { key: 'imageRadius', label: 'Image corner radius', kind: 'text', group: 'layout', hint: '0 (sharp), 12px, 24px etc.' },
      { key: 'maxWidth',    label: 'Max width', kind: 'text', group: 'layout', hint: '1400px (default), 1100px (editorial), 900px (narrow)' },
      { key: 'steps',       label: 'Steps', kind: 'scrolly_steps', group: 'data' },
    ],
  },
  Outro: {
    name: 'Outro',
    description: 'Closing section — paragraphs, final emphasized line, sources',
    fields: [
      { key: 'h2',          label: 'Heading',     kind: 'text', group: 'content' },
      { key: 'paragraphs',  label: 'Paragraphs',  kind: 'string_list', group: 'content' },
      { key: 'finalLine',   label: 'Final emphasized line',  kind: 'text', group: 'content' },
      { key: 'sourcesHtml', label: 'Sources',     kind: 'textarea_html', group: 'meta',
        hint: 'Separate citations with " · ". Use <code>&lt;br&gt;</code> for line breaks.' },
    ],
  },
  StatRow: {
    name: 'Stat row',
    description: 'A horizontal row of 2–4 large numbers with labels',
    fields: [
      { key: 'title', label: 'Heading (optional)', kind: 'text', group: 'content' },
      { key: 'stats', label: 'Stats',              kind: 'stat_list', group: 'data' },
    ],
  },
  Timeline: {
    name: 'Timeline',
    description: 'Vertical timeline — dated events with title and body',
    fields: [
      { key: 'title',  label: 'Heading (optional)', kind: 'text', group: 'content' },
      { key: 'events', label: 'Events',             kind: 'timeline_events', group: 'data' },
    ],
  },
  Aside: {
    name: 'Aside',
    description: 'Full-width highlighted callout box',
    fields: [
      { key: 'tone',  label: 'Tone', kind: 'tone_select', group: 'style' },
      { key: 'title', label: 'Title (optional)', kind: 'text', group: 'content' },
      { key: 'body',  label: 'Body (separate paragraphs with a blank line)', kind: 'textarea', group: 'content' },
    ],
  },
  ChapterDivider: {
    name: 'Chapter divider',
    description: 'Chapter break — number, title, optional subtitle',
    fields: [
      { key: 'number',   label: 'Number / label (optional)',     kind: 'text', group: 'content', hint: 'e.g. <code>I</code>, <code>01</code>, <code>Kapitel 2</code>' },
      { key: 'title',    label: 'Title',                          kind: 'text', group: 'content' },
      { key: 'subtitle', label: 'Subtitle (optional)',            kind: 'textarea', group: 'content' },
    ],
  },
  Quote: {
    name: 'Quote',
    description: 'Featured money quote — large, optional portrait',
    fields: [
      { key: 'text',         label: 'Quote (without surrounding quote marks)', kind: 'textarea', group: 'content' },
      { key: 'attribution',  label: 'Attribution (Name)',                       kind: 'text', group: 'content' },
      { key: 'role',         label: 'Role / context (optional)',                kind: 'text', group: 'content' },
      { key: 'portraitSrc',  label: 'Portrait (optional)',                      kind: 'image', group: 'media' },
      { key: 'sourceUrl',    label: 'Source URL (optional)',                    kind: 'text', group: 'meta' },
      { key: 'sourceLabel',  label: 'Source link label (optional)',             kind: 'text', group: 'meta' },
    ],
  },
  VideoEmbed: {
    name: 'Video embed',
    description: 'YouTube or Vimeo video with caption',
    fields: [
      { key: 'url',     label: 'Video URL', kind: 'text', group: 'media', hint: 'Paste a YouTube or Vimeo URL.' },
      { key: 'caption', label: 'Caption',   kind: 'textarea', group: 'meta' },
      { key: 'credit',  label: 'Credit (optional)', kind: 'text', group: 'meta', hint: 'e.g. <code>via NYT</code>' },
    ],
  },
  DataScrolly: {
    name: 'Data scrolly',
    description: 'Sticky chart + stepped narrative — each step updates the chart',
    fields: [
      { key: 'title',     label: 'Chart title',     kind: 'text', group: 'content' },
      { key: 'subtitle',  label: 'Chart subtitle',  kind: 'text', group: 'content' },
      { key: 'source',    label: 'Data source',     kind: 'text', group: 'meta', hint: 'Citation or <code>[estimated illustrative values]</code>' },
      { key: 'chartSpec', label: 'Chart',           kind: 'chart_spec', group: 'data' },
      { key: 'steps',     label: 'Steps',           kind: 'data_scrolly_steps', group: 'data' },
    ],
  },
  ImageCompare: {
    name: 'Image Compare',
    label: 'Image Compare',
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
    name: 'Image Hotspot',
    label: 'Image Hotspot',
    fields: [
      { key: 'src',     label: 'Image URL',   kind: 'text', group: 'media' },
      { key: 'alt',     label: 'Alt text',     kind: 'text', group: 'content' },
      { key: 'caption', label: 'Caption',      kind: 'textarea', group: 'meta', inline: true },
      { key: 'credit',  label: 'Credit',       kind: 'text', group: 'meta', inline: true },
      { key: 'hotspots', label: 'Hotspots',    kind: 'textarea_html', group: 'data', hint: 'AI generates these — use Enhance to add/modify hotspots' },
    ]
  },
  AccordionBlock: {
    name: 'Accordion',
    label: 'Accordion',
    fields: [
      { key: 'title',     label: 'Section title',  kind: 'text', group: 'content' },
      { key: 'multiOpen', label: 'Allow multi-open', kind: 'text', group: 'content', hint: 'true or false, default false' },
      { key: 'items',     label: 'Items',           kind: 'textarea_html', group: 'data', hint: 'AI generates these — use Enhance to add/modify' },
    ]
  },
  FullBleed: {
    name: 'Full Bleed',
    label: 'Full Bleed',
    fields: [
      { key: 'mediaSrc',         label: 'Image / poster',  kind: 'image', group: 'media' },
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
  ProgressNav: {
    name: 'Progress Nav',
    label: 'Progress Nav',
    fields: [
      { key: 'mode',           label: 'Mode',           kind: 'text', group: 'content', hint: 'bar (default)' },
      { key: 'autoGenerate',   label: 'Auto-generate',  kind: 'text', group: 'content', hint: 'true (auto-detect chapters) or false' },
      { key: 'showPercentage', label: 'Show %',         kind: 'text', group: 'content', hint: 'true or false' },
    ]
  },
  EmbedBlock: {
    name: 'Embed',
    label: 'Embed',
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
  ImageGrid: {
    name: 'Image Grid',
    label: 'Image Grid',
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
  FullscreenImage: {
    name: 'Fullscreen Image',
    label: 'Fullscreen Image',
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
  AudioPlayer: {
    name: 'Audio Player',
    label: 'Audio Player',
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
  Map2D: {
    name: 'Map 2D',
    description: 'Scrollytelling map — fly between locations as the reader scrolls',
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
};

const BLOCK_ICONS = {
  Hero: '\u{1F3E0}', VizPanel: '\u{1F4CA}', Editorial: '\u{1F4DD}', Scrolly: '\u{1F4DC}',
  Outro: '\u{1F51A}', StatRow: '\u{1F522}', Timeline: '\u{1F4C5}', Aside: '\u{1F4A1}',
  ChapterDivider: '\u{2550}', Quote: '\u{1F4AC}', VideoEmbed: '\u{1F3AC}',
  DataScrolly: '\u{1F4C8}', FullBleed: '\u{1F5BC}', ImageCompare: '\u{2696}\u{FE0F}',
  ImageHotspot: '\u{1F4CC}', AccordionBlock: '\u{1FA97}', ProgressNav: '\u{25B0}',
  EmbedBlock: '\u{1F9E9}', ImageGrid: '\u{1F3D7}', Map2D: '\u{1F5FA}',
  FullscreenImage: '\u{1F5BC}', AudioPlayer: '\u{1F3B5}',
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

const PALETTE_BLOCKS = [
  { type: 'Hero',           desc: 'Title section at the top of a page' },
  { type: 'ChapterDivider', desc: 'Chapter break — number, title, optional subtitle' },
  { type: 'Editorial',      desc: 'Long-form text with paragraphs, images, quotes' },
  { type: 'DataScrolly',    desc: 'Sticky chart + stepped narrative (data-driven)' },
  { type: 'Scrolly',        desc: 'Legacy scrolly tied to the journalism viz (existing pages)' },
  { type: 'Quote',          desc: 'Featured money quote — large, optional portrait' },
  { type: 'VideoEmbed',     desc: 'YouTube or Vimeo video with caption' },
  { type: 'Timeline',       desc: 'Vertical dated events' },
  { type: 'StatRow',        desc: 'Row of 2–4 large statistics' },
  { type: 'Aside',          desc: 'Highlighted callout box' },
  { type: 'Outro',          desc: 'Closing section with paragraphs and sources' },
  { type: 'FullBleed',      desc: 'Full-viewport image/video with text overlay — the Snow Fall signature' },
  { type: 'ImageCompare',   desc: 'Before/after draggable image comparison slider' },
  { type: 'ImageHotspot',   desc: 'Annotated image with interactive numbered markers' },
  { type: 'AccordionBlock', desc: 'Collapsible sections — methodology, FAQ, glossary' },
  { type: 'VizPanel',       desc: 'Advanced — visualization container' },
  { type: 'ProgressNav',    desc: 'Reading progress bar + chapter navigation dots' },
  { type: 'EmbedBlock',     desc: 'Datawrapper, Flourish, Twitter, or any iframe embed' },
  { type: 'ImageGrid',      desc: 'Smart image grid — auto-detects layout from count. Paste URLs or upload.' },
  { type: 'Map2D',          desc: 'Scrollytelling map — fly between locations, animate routes, reveal markers as reader scrolls' },
  { type: 'FullscreenImage', desc: 'Full-viewport immersive image with text overlay, Ken Burns zoom, and scroll cue' },
  { type: 'AudioPlayer',     desc: 'Professional audio player with waveform, progress bar, and optional transcript' },
];

// Tiny inline mockups shown inside the palette cards and at the top of the
// Claude-generation modal so the user sees what the component looks like
// before generating. Each is plain HTML using common admin colors — NOT the
// rendered component itself.
const BLOCK_PREVIEWS = {
  Hero: `
    <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.18em;color:#8c8078;text-transform:uppercase;">BRAND</div>
    <div style="font:700 18px 'Source Serif 4',serif;line-height:1.05;margin-top:6px;color:#2a2320;">Title <span style="color:#c06830;">word</span></div>
    <div style="font:400 9px 'DM Sans',sans-serif;color:#8c8078;margin-top:3px;">subtitle</div>`,
  Editorial: `
    <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.1em;color:#c06830;text-transform:uppercase;">KICKER</div>
    <div style="font:700 13px 'Source Serif 4',serif;color:#2a2320;line-height:1.2;margin-top:4px;">Heading text</div>
    <div style="margin-top:6px;height:5px;background:#eaeef2;border-radius:2px;"></div>
    <div style="margin-top:3px;height:5px;background:#eaeef2;border-radius:2px;width:85%;"></div>
    <div style="margin-top:3px;height:5px;background:#eaeef2;border-radius:2px;width:60%;"></div>`,
  Scrolly: `
    <div style="display:flex;gap:8px;">
      <div style="flex:1;background:#fde8d8;border-radius:4px;height:48px;display:flex;align-items:center;justify-content:center;font:700 10px 'DM Sans',sans-serif;color:#c06830;">CHART</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
        <div style="background:#fff;border:1px solid #d4c5ff;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#6639ba;">STEP 1</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#8c8078;opacity:.6;">STEP 2</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 5px;font:600 7px 'DM Sans',sans-serif;color:#8c8078;opacity:.6;">STEP 3</div>
      </div>
    </div>`,
  Timeline: `
    <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px;border-left:2px solid #eaeef2;position:relative;">
      ${[1,2,3].map(i => `
        <div style="display:flex;align-items:flex-start;gap:6px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#c06830;margin-left:-12px;margin-top:3px;flex-shrink:0;"></div>
          <div>
            <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.08em;color:#c06830;text-transform:uppercase;">1969</div>
            <div style="font:700 9px 'Source Serif 4',serif;color:#2a2320;">Event ${i}</div>
          </div>
        </div>`).join('')}
    </div>`,
  StatRow: `
    <div style="display:flex;gap:6px;justify-content:space-around;text-align:center;">
      ${[{v:'67%',l:'label'}, {v:'8.5k',l:'items'}, {v:'3×',l:'more'}].map(s => `
        <div>
          <div style="font:700 18px 'Source Serif 4',serif;color:#c06830;line-height:1;">${s.v}</div>
          <div style="font:500 7px 'DM Sans',sans-serif;color:#2a2320;margin-top:3px;">${s.l}</div>
        </div>`).join('')}
    </div>`,
  Aside: `
    <div style="border-left:3px solid #c06830;background:#fff8f1;border-radius:0 4px 4px 0;padding:6px 8px;">
      <div style="font:700 9px 'Source Serif 4',serif;color:#2a2320;margin-bottom:3px;">Aside title</div>
      <div style="font:400 8px 'DM Sans',sans-serif;color:#2a2320;line-height:1.4;">Highlighted side note.</div>
    </div>`,
  Outro: `
    <div style="font:700 12px 'Source Serif 4',serif;color:#2a2320;">Closing</div>
    <div style="margin-top:5px;height:4px;background:#eaeef2;border-radius:2px;"></div>
    <div style="margin-top:3px;height:4px;background:#eaeef2;border-radius:2px;width:80%;"></div>
    <div style="margin-top:8px;font:600 italic 9px 'Source Serif 4',serif;color:#c06830;">Final emphasized line.</div>`,
  VizPanel: `
    <div style="background:#fde8d8;border-radius:4px;height:48px;display:flex;align-items:center;justify-content:center;font:700 11px 'DM Sans',sans-serif;color:#c06830;letter-spacing:.05em;">VIZ</div>`,
  ChapterDivider: `
    <div style="text-align:center;padding:6px 0;">
      <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.2em;color:#636363;text-transform:uppercase;">CHAPTER I</div>
      <div style="font:300 16px 'DM Sans',sans-serif;color:#000;margin-top:6px;letter-spacing:-.02em;">Chapter title</div>
      <div style="margin:6px auto 0;width:30px;height:2px;background:linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#e1e1fe,#0358f7);border-radius:2px;"></div>
    </div>`,
  Quote: `
    <div style="padding:8px 0;">
      <div style="font:300 13px 'DM Sans',sans-serif;color:#000;line-height:1.25;letter-spacing:-.02em;position:relative;padding-left:10px;">
        <span style="position:absolute;left:-3px;top:-4px;font-size:22px;color:#000;opacity:.2;line-height:1;">&ldquo;</span>
        The single most-important quotation.
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;padding-left:10px;">
        <div style="width:18px;height:18px;border-radius:50%;background:#eaeef2;flex-shrink:0;"></div>
        <div>
          <div style="font:500 8px 'DM Sans',sans-serif;color:#000;">Speaker name</div>
          <div style="font:400 7px 'DM Sans',sans-serif;color:#636363;">role · year</div>
        </div>
      </div>
    </div>`,
  VideoEmbed: `
    <div style="background:#eaeef2;border-radius:6px;height:54px;display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="width:0;height:0;border-left:11px solid #aeaeae;border-top:7px solid transparent;border-bottom:7px solid transparent;margin-left:3px;"></div>
    </div>
    <div style="font:400 7px 'DM Sans',sans-serif;color:#636363;margin-top:5px;line-height:1.4;">Caption goes here · <span style="font-style:italic;color:#7c7c7c;">credit</span></div>`,
  DataScrolly: `
    <div style="display:flex;gap:8px;">
      <div style="flex:1.4;background:#fff;border:1px solid #eaeef2;border-radius:6px;padding:6px 7px;">
        <div style="font:500 7px 'DM Sans',sans-serif;color:#000;margin-bottom:4px;">Chart title</div>
        <svg viewBox="0 0 80 30" style="width:100%;height:30px;">
          <polyline points="2,26 18,22 34,16 50,18 66,10 78,6" stroke="#000" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="50" y1="4" x2="50" y2="28" stroke="#fa3d1d" stroke-width="1" stroke-dasharray="2 2"/>
          <circle cx="50" cy="18" r="2.2" fill="#fa3d1d"/>
        </svg>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1px solid #d6e8f0;border-radius:4px;padding:3px 4px;font:600 6px 'DM Sans',sans-serif;color:#3d7a94;">DATA · STEP 1</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 4px;font:600 6px 'DM Sans',sans-serif;color:#8c8078;opacity:.55;">STEP 2</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:4px;padding:3px 4px;font:600 6px 'DM Sans',sans-serif;color:#8c8078;opacity:.55;">STEP 3</div>
      </div>
    </div>`,
  Map2D: `
    <div style="display:flex;gap:6px;">
      <div style="flex:1;background:linear-gradient(135deg,#e8e4df 0%,#d4cdc5 100%);border-radius:6px;height:48px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:6px;left:8px;width:8px;height:8px;border-radius:50%;background:#c06830;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3);"></div>
        <div style="position:absolute;top:22px;right:12px;width:8px;height:8px;border-radius:50%;background:#5d8fa8;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3);"></div>
        <svg style="position:absolute;top:0;left:0;width:100%;height:100%;"><path d="M16 10 Q30 24 48 26" stroke="#c06830" stroke-width="1.5" fill="none" stroke-dasharray="3,2"/></svg>
        <div style="position:absolute;bottom:2px;left:4px;font:400 5px 'DM Sans',sans-serif;color:#8c8078;">OpenStreetMap</div>
      </div>
      <div style="flex:0 0 36%;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1px solid #d4c5ff;border-radius:3px;padding:2px 4px;font:600 6px 'DM Sans',sans-serif;color:#6639ba;">📍 Berlin</div>
        <div style="background:#fff;border:1px solid #eaeef2;border-radius:3px;padding:2px 4px;font:500 6px 'DM Sans',sans-serif;color:#8c8078;opacity:.5;">📍 Frankfurt</div>
      </div>
    </div>`,
  FullscreenImage: `
    <div style="background:linear-gradient(135deg,#2a2320 0%,#1a1510 100%);border-radius:6px;height:56px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.7) 100%);"></div>
      <div style="position:absolute;bottom:6px;left:8px;z-index:1;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.12em;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:2px;">KICKER</div>
        <div style="font:700 12px 'Source Serif 4',serif;color:#fff;line-height:1.1;">Title <span style="color:#c06830;">word</span></div>
        <div style="font:400 6px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);margin-top:2px;">subtitle text</div>
      </div>
      <div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-right:1px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.5);transform:translateX(-50%) rotate(45deg);"></div>
    </div>`,
  AudioPlayer: `
    <div style="display:flex;gap:8px;background:#fff;border:1px solid #eaeef2;border-radius:6px;padding:6px;">
      <div style="width:28px;height:28px;border-radius:6px;background:#f4ebe3;flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.06em;color:#8c8078;text-transform:uppercase;">SERIES</div>
        <div style="font:700 9px 'Source Serif 4',serif;color:#2a2320;line-height:1.2;">Episode title</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
          <div style="width:16px;height:16px;border-radius:50%;background:#c06830;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <div style="width:0;height:0;border-left:5px solid #fff;border-top:3px solid transparent;border-bottom:3px solid transparent;margin-left:1px;"></div>
          </div>
          <div style="flex:1;display:flex;align-items:flex-end;gap:1px;height:12px;">
            ${Array.from({length:20},(_,i)=>`<div style="flex:1;background:#c06830;opacity:.3;border-radius:0.5px;height:${25+Math.abs(Math.sin(i*0.5))*75}%;"></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`,
};

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
  setTimeout(() => t.remove(), 2400);
}

// Show a persistent banner with live URL after publish
function showPublishedBanner(url) {
  // Remove any existing banner
  const old = document.getElementById('published-banner');
  if (old) old.remove();

  const banner = document.createElement('div');
  banner.id = 'published-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#000;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px;font-family:var(--font-body);font-size:14px;box-shadow:0 -4px 24px rgba(0,0,0,.15);animation:slideUp .3s ease';
  banner.innerHTML = `
    <span style="color:#4ade80;font-weight:600;">● Live</span>
    <a href="${url}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;text-underline-offset:3px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${url}</a>
    <button id="copy-url-btn" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;">Copy URL</button>
    <button style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;padding:4px 8px;" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(banner);

  // Inject slideUp keyframes if not present
  if (!document.getElementById('__slideup_kf__')) {
    const style = document.createElement('style');
    style.id = '__slideup_kf__';
    style.textContent = '@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
    document.head.appendChild(style);
  }

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
  const s = $('#page-status');
  s.className = 'status ' + (d ? 'dirty' : 'saved');
  s.textContent = d ? '● Unsaved changes' : (state.savedVersion ? `Saved · v${state.savedVersion}` : 'Loaded');
  $('#btn-publish').disabled = !d;
  if (d) backupToLocal();
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

// ── Save status indicator ─────────────────────────────────────────────────
function setSaveStatus(status) {
  const el = $('#save-status');
  if (!el) return;
  el.className = 'save-status';
  switch (status) {
    case 'saving':
      el.textContent = 'Saving…';
      el.classList.add('status-saving');
      break;
    case 'saved':
      el.textContent = 'Saved ✓';
      el.classList.add('status-saved');
      setTimeout(() => { if (el.textContent === 'Saved ✓') el.textContent = ''; }, 3000);
      break;
    case 'error':
      el.textContent = 'Save failed';
      el.classList.add('status-error');
      break;
    case 'publishing':
      el.textContent = 'Publishing…';
      el.classList.add('status-saving');
      break;
    case 'published':
      el.textContent = 'Published ✓';
      el.classList.add('status-saved');
      setTimeout(() => { if (el.textContent === 'Published ✓') el.textContent = ''; }, 3000);
      break;
    default:
      el.textContent = '';
  }
}
// ─────────────────────────── API (Supabase-backed) ─────────
// SB.* functions from supabase-client.js replace the old fetch-based api().

// ─────────────────────────── Auth ────────────────────────────
async function checkSession() {
  try {
    const { loggedIn } = await SB.checkSession();
    if (loggedIn) { showApp(); return; }
  } catch { /* ignore */ }
  // Not logged in — show inline login bar inside the app
  showAppWithAuth();
}
function showAuth() {
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  dismissInlineAuth();
  loadPages();
}
function showAppWithAuth() {
  // Show the app shell immediately with an inline login bar — no full-screen gate
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  showInlineAuth();
}
function showInlineAuth() {
  if (document.getElementById('inline-auth')) return;
  const bar = document.createElement('div');
  bar.id = 'inline-auth';
  bar.style.cssText = 'background:#1a1a2e;color:#fff;padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:13px;position:sticky;top:0;z-index:100;';
  const lastEmail = localStorage.getItem('scrollycms_email') || '';
  bar.innerHTML = `
    <span style="font-weight:500;margin-right:auto;">Sign in to start editing</span>
    <input id="ia-email" type="email" placeholder="Email" value="${lastEmail}" style="padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:13px;width:200px;font-family:inherit;">
    <input id="ia-pwd" type="password" placeholder="Password" style="padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:13px;width:160px;font-family:inherit;">
    <button id="ia-go" style="padding:7px 16px;border-radius:8px;background:#fff;color:#1a1a2e;border:none;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;">Go</button>
    <span id="ia-err" style="color:#ff6b6b;font-size:12px;width:100%;display:none;"></span>`;
  document.getElementById('app').prepend(bar);
  const goBtn = bar.querySelector('#ia-go');
  const doLogin = async () => {
    const email = bar.querySelector('#ia-email').value.trim();
    const pwd = bar.querySelector('#ia-pwd').value;
    if (!email || !pwd) return;
    goBtn.disabled = true;
    goBtn.textContent = '...';
    try {
      await SB.login(email, pwd);
      localStorage.setItem('scrollycms_email', email);
      showApp();
    } catch (e) {
      const errEl = bar.querySelector('#ia-err');
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      goBtn.disabled = false;
      goBtn.textContent = 'Go';
    }
  };
  goBtn.addEventListener('click', doLogin);
  bar.querySelector('#ia-pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  bar.querySelector('#ia-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') bar.querySelector('#ia-pwd').focus(); });
  // Auto-focus the right field
  if (lastEmail) bar.querySelector('#ia-pwd').focus();
  else bar.querySelector('#ia-email').focus();
}
function dismissInlineAuth() {
  const bar = document.getElementById('inline-auth');
  if (bar) bar.remove();
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
    document.getElementById('login-error').textContent = err.message || 'Login failed';
  }
});

// Signup
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pwd = document.getElementById('signup-pwd').value;
  document.getElementById('signup-error').textContent = '';
  try {
    const r = await SB.signup(email, pwd, name);
    if (r.needsConfirmation) {
      document.getElementById('signup-form').classList.add('hidden');
      document.getElementById('auth-success').classList.remove('hidden');
    } else {
      showApp();
    }
  } catch (err) {
    document.getElementById('signup-error').textContent = err.message || 'Signup failed';
  }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await SB.logout().catch(() => {});
  state.doc = null;
  showAuth();
});

// ─────────────────────────── Pages ───────────────────────────
async function loadPages(preferId) {
  const { pages } = await SB.listPages();
  state.pages = pages;
  const sel = $('#page-select');
  sel.innerHTML = pages.map(id => `<option value="${id}">${id}</option>`).join('');
  const toLoad = preferId && pages.includes(preferId) ? preferId : (state.currentPageId && pages.includes(state.currentPageId) ? state.currentPageId : pages[0]);
  if (toLoad) {
    sel.value = toLoad;
    loadPage(toLoad);
  }
}
$('#page-select').addEventListener('change', (e) => loadPage(e.target.value));

// + New page
$('#btn-new-page').addEventListener('click', () => {
  openModal('Create a new page', (body) => {
    body.innerHTML = '';
    const hint = document.createElement('p');
    hint.style.cssText = 'color:#57606a;font-size:12.5px;margin-bottom:12px;line-height:1.5;';
    hint.innerHTML = `Each page has its own URL. Use lowercase letters, numbers and dashes only.<br>Example: <code>pressefreiheit</code> → reachable at <code>http://localhost:4000/pressefreiheit</code>`;
    body.appendChild(hint);

    const slugLabel = document.createElement('label');
    slugLabel.className = 'field-label';
    slugLabel.textContent = 'Page ID (URL slug)';
    body.appendChild(slugLabel);
    const slugInp = document.createElement('input');
    slugInp.type = 'text';
    slugInp.placeholder = 'my-new-page';
    slugInp.style.marginBottom = '12px';
    body.appendChild(slugInp);

    const titleLabel = document.createElement('label');
    titleLabel.className = 'field-label';
    titleLabel.textContent = 'Page title (shown in browser tab)';
    body.appendChild(titleLabel);
    const titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.placeholder = 'My new page';
    body.appendChild(titleInp);

    // Theme picker
    const themeLabel = document.createElement('label');
    themeLabel.className = 'field-label';
    themeLabel.textContent = 'Theme';
    themeLabel.style.marginTop = '12px';
    body.appendChild(themeLabel);
    const themeSel = document.createElement('select');
    themeSel.innerHTML = `
      <option value="dia">Dia — Warm editorial (default)</option>
      <option value="claude">Claude — Clean modern</option>
      <option value="miranda">Miranda — Vintage newsprint (dark)</option>
    `;
    themeSel.style.marginBottom = '12px';
    body.appendChild(themeSel);

    // Live slugify hint
    titleInp.addEventListener('input', () => {
      if (!slugInp.value && titleInp.value) {
        slugInp.value = titleInp.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      }
    });

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

// Update "View" link to point at the current page (full production URL)
async function updateViewLink() {
  const link = $('#link-view-page');
  try {
    const url = await getPublicUrl();
    link.href = url || '#';
  } catch {
    link.href = '#';
  }
}

async function loadPage(id) {
  if (state.dirty && !confirm('Discard unsaved changes?')) {
    $('#page-select').value = state.currentPageId;
    return;
  }
  state.currentPageId = id;
  state.doc = await SB.getPage(id);
  state.savedVersion = state.doc.version || 0;

  // Check for local backup that's newer than server version
  const backup = getLocalBackup(id);
  if (backup && backup.ts > (state.doc._lastSaveTs || 0)) {
    const recover = confirm(
      `Found unsaved local changes from ${new Date(backup.ts).toLocaleString()}.\n\nRecover them?`
    );
    if (recover) {
      state.doc = backup.doc;
      setDirty(true);
      toast('Local backup restored', 'success');
    } else {
      clearLocalBackup(id);
    }
  }

  state.selectedBlockId = null;
  state.selectedItemIdx = null;
  setDirty(false);
  renderBlockList();
  renderEditor();
  updateViewLink();
  // Reload the preview iframe to show the new page
  const iframe = $('#preview-frame');
  iframe.src = pageUrl();
}

// ─────────────────────────── Blocks list (with drag & drop) ──
let _dragIdx = null;

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

  state.doc.blocks.forEach((block, idx) => {
    const li = document.createElement('li');
    li.className = 'block-item' + (block.id === state.selectedBlockId ? ' active' : '');
    li.draggable = true;
    li.dataset.idx = idx;
    const schemaName = BLOCK_SCHEMAS[block.type]?.name || block.type;
    const icon = BLOCK_ICONS[block.type] || '';
    li.innerHTML = `
      <div class="block-item-left">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <span class="block-icon">${icon}</span>
      </div>
      <div class="block-item-center">
        <span class="block-name">${schemaName}</span>
        <span class="block-summary">${blockSummary(block)}</span>
      </div>
      <span class="block-ctrl">
        <button data-act="claude" title="Enhance with Claude" class="enhance-btn">✨</button>
        <button data-act="dup"    title="Duplicate">⧉</button>
        <button data-act="del"    title="Delete">✕</button>
      </span>`;

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

    // Click to select
    li.addEventListener('click', (e) => {
      if (e.target.closest('.block-ctrl') || e.target.closest('.drag-handle')) return;
      state.selectedBlockId = block.id;
      state.selectedItemIdx = null;
      renderBlockList();
      renderEditor();
      // Scroll preview to this block in visual edit mode
      if (state.visualEditMode) {
        var iframe = $('#preview-frame');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'visual-edit-response',
            action: 'scroll-to-block',
            blockId: block.id,
          }, '*');
        }
      }
    });
    li.querySelector('[data-act="claude"]').addEventListener('click', (e) => { e.stopPropagation(); openClaudeModal({ mode: 'improve', block }); });
    li.querySelector('[data-act="dup"]').addEventListener('click', (e) => { e.stopPropagation(); duplicateBlock(idx); });
    li.querySelector('[data-act="del"]').addEventListener('click', (e) => { e.stopPropagation(); deleteBlock(idx); });
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
}
function deleteBlock(idx) {
  const block = state.doc.blocks[idx];
  if (!block) return;
  const name = block.type + (block.data?.title ? `: ${block.data.title}` : '');
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  if (block.id === state.selectedBlockId) state.selectedBlockId = null;
  state.doc.blocks.splice(idx, 1);
  setDirty(true);
  renderBlockList();
  renderEditor();
}

// Add block palette
$('#btn-add-block').addEventListener('click', () => {
  openModal('Add a block', renderPalette, '');
});
function renderPalette(body) {
  body.innerHTML = '';
  const intro = document.createElement('p');
  intro.style.cssText = 'margin-bottom:14px;color:#57606a;font-size:12.5px;';
  intro.textContent = 'Pick the kind of section you want to add. Claude will write the content for you on the next step.';
  body.appendChild(intro);
  const grid = document.createElement('div');
  grid.className = 'palette-grid';
  PALETTE_BLOCKS.forEach(({ type, desc }) => {
    const card = document.createElement('button');
    card.className = 'palette-card with-preview';
    card.innerHTML = `
      <div class="palette-preview">${BLOCK_PREVIEWS[type] || ''}</div>
      <span class="name">${type}</span>
      <span class="desc">${desc}</span>`;
    card.addEventListener('click', () => {
      closeModal();
      openClaudeModal({ mode: 'create', type });
    });
    grid.appendChild(card);
  });
  body.appendChild(grid);
}
// Palette variant that inserts after a specific block ID
function renderPaletteWithInsert(body, afterBlockId) {
  body.innerHTML = '';
  const intro = document.createElement('p');
  intro.style.cssText = 'margin-bottom:14px;color:#57606a;font-size:12.5px;';
  intro.textContent = 'Pick the kind of section to insert here. Claude will write the content for you on the next step.';
  body.appendChild(intro);
  const grid = document.createElement('div');
  grid.className = 'palette-grid';
  PALETTE_BLOCKS.forEach(({ type, desc }) => {
    const card = document.createElement('button');
    card.className = 'palette-card with-preview';
    card.innerHTML = `
      <div class="palette-preview">${BLOCK_PREVIEWS[type] || ''}</div>
      <span class="name">${type}</span>
      <span class="desc">${desc}</span>`;
    card.addEventListener('click', () => {
      closeModal();
      openClaudeModal({ mode: 'create', type, insertAfter: afterBlockId });
    });
    grid.appendChild(card);
  });
  body.appendChild(grid);
}
// Legacy name kept for backwards-compat; routes through the Claude flow.
function addBlock(type) { openClaudeModal({ mode: 'create', type }); }

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
  const title = isImprove ? `✨ Enhance ${type}` : `✨ New ${type} — Describe with Claude`;
  let uploadedImages = [];

  openModal(title, (body) => {
    body.innerHTML = '';

    if (BLOCK_PREVIEWS[type]) {
      const previewBox = document.createElement('div');
      previewBox.className = 'claude-modal-preview';
      const previewLabel = document.createElement('div');
      previewLabel.className = 'claude-modal-preview-label';
      previewLabel.textContent = `${type} preview`;
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

async function addEmptyBlock(type) {
  if (!state.doc) {
    toast('Please create or select a page first', 'error');
    return;
  }
  const block = { id: uid('b'), type, data: defaultDataFor(type) };
  state.doc.blocks.push(block);
  state.selectedBlockId = block.id;
  setDirty(true);
  renderBlockList();
  renderEditor();
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
    default:          return {};
  }
}

// ─────────────────────────── Editor form ─────────────────────
function renderEditor() {
  const empty = $('#editor-empty');
  const form  = $('#editor-form');
  if (!state.selectedBlockId) {
    empty.classList.remove('hidden');
    form.classList.add('hidden');
    form.innerHTML = '';
    return;
  }
  const block = state.doc.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) { state.selectedBlockId = null; renderEditor(); return; }
  const schema = BLOCK_SCHEMAS[block.type];
  empty.classList.add('hidden');
  form.classList.remove('hidden');
  form.innerHTML = '';

  // Form title — pill shows type, text shows description, ✨ Improve button
  const title = document.createElement('div');
  title.className = 'form-title';
  const desc = schema?.description || '';
  title.innerHTML = `<span class="type-pill">${block.type}</span>` +
    (desc ? `<span style="font-weight:400;color:#57606a;font-size:13px;flex:1;">${desc}</span>` : '<span style="flex:1;"></span>') +
    `<button id="form-claude-btn" style="background:#f3f0ff;color:#6639ba;border-color:#d4c5ff;font-weight:600;">✨ Enhance with Claude</button>`;
  form.appendChild(title);
  title.querySelector('#form-claude-btn').addEventListener('click', () => openClaudeModal({ mode: 'improve', block }));

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

  const GROUP_ORDER = ['content', 'media', 'data', 'layout', 'style', 'meta', 'advanced'];
  const GROUP_LABELS = {
    content: 'Content', media: 'Media', data: 'Data',
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
  col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;';
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

async function openImagePicker(cb) {
  openModal('Pick image', async (body) => {
    body.innerHTML = 'Loading…';
    try {
      const { images } = await SB.listImages();
      body.innerHTML = '';
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
      images.forEach(img => {
        const card = document.createElement('button');
        card.style.cssText = 'border:1px solid #d0d7de;border-radius:6px;padding:4px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:4px;text-align:center;';
        card.innerHTML = `<div style="width:100%;height:80px;background:#eaeef2 center/cover no-repeat;background-image:url('${encodeURI(img.url)}');border-radius:4px;"></div>
                          <div style="font-size:10px;color:#57606a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${img.url.split('/').pop()}</div>`;
        card.title = img.url;
        card.addEventListener('click', () => { closeModal(); cb(img.url); });
        grid.appendChild(card);
      });
      body.appendChild(grid);
    } catch (e) { body.textContent = 'Error: ' + e.message; }
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
import { render } from '${origin}/js/render.js';
render();
<\/script>
${veScript}</body></html>`;
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
}
function refreshPreview() {
  // Debounced reload of the iframe — blob URLs don't support query params
  clearTimeout(refreshPreview._t);
  refreshPreview._t = setTimeout(() => {
    const iframe = $('#preview-frame');
    // Revoke old blob URL to avoid memory leaks
    if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
    const url = pageUrl();
    iframe._blobUrl = url;
    iframe.src = url;
  }, 400);
}
$('#btn-preview').addEventListener('click', () => window.open(pageUrl(), '_blank'));
$('#btn-refresh-preview').addEventListener('click', () => {
  const iframe = $('#preview-frame');
  if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
  const url = pageUrl();
  iframe._blobUrl = url;
  iframe.src = url;
});
$('#btn-visual-edit').addEventListener('click', () => {
  state.visualEditMode = !state.visualEditMode;
  $('#btn-visual-edit').classList.toggle('active', state.visualEditMode);
  $('#btn-visual-edit').textContent = state.visualEditMode ? '✏️ Editing' : '✏️ Edit';
  refreshPreview();
});

// ── Fullscreen preview toggle ──
(function initFullscreenPreview() {
  const layout = document.querySelector('.layout');
  const previewAside = layout.querySelector('.preview');
  const btn = $('#btn-fullscreen-preview');

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

  // Insert block at position (from visual-edit hover zones)
  if (action === 'insert-block') {
    const afterId = evt.data.afterBlockId;
    openModal('Add a block', (body) => {
      renderPaletteWithInsert(body, afterId);
    }, '');
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

    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
    const cancel = document.createElement('button');
    cancel.className = 'ghost'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    const save = document.createElement('button');
    save.className = 'primary'; save.textContent = 'Apply';
    save.addEventListener('click', () => {
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
      setDirty(true);
      refreshPreview();
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
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
      snapshots.forEach((s, i) => {
        const { relative, absolute } = formatHistoryDate(s.ts);
        const row = document.createElement('div');
        row.className = 'history-row';
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f9f9f9;border-radius:8px;gap:12px;';
        row.innerHTML = `
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
              <span style="font-weight:600;font-size:13px;color:#111;">v${s.version || '?'}</span>
              <span style="font-size:11px;color:#888;background:#eee;padding:1px 7px;border-radius:4px;">${relative}</span>
              ${i === 0 ? '<span style="font-size:10px;color:#0969da;background:#ddf4ff;padding:1px 6px;border-radius:4px;font-weight:500;">latest</span>' : ''}
            </div>
            <div style="font-size:11px;color:#666;">${absolute} · ${s.blockCount} block${s.blockCount !== 1 ? 's' : ''}</div>
          </div>
          <button class="small" style="flex-shrink:0;">Restore</button>`;
        row.querySelector('button').addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const r = await SB.restoreSnapshot(state.currentPageId, s.id);
            toast(`Restored to v${s.version}`, 'success');
            closeModal();
            await loadPage(state.currentPageId);
            refreshPreview();
          } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
        });
        list.appendChild(row);
      });
      body.appendChild(list);
    } catch (e) { body.textContent = 'Error: ' + e.message; }
  });
});

// ─────────────────────────── Modal ────────────────────────────
function openModal(title, renderBody, footerBtn) {
  closeModal();
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
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelectorAll('.close-x').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() { $('#modal-root').innerHTML = ''; }

// ─────────────────────────── Helpers ──────────────────────────
function escapeText(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

// Beforeunload warning
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ─────────────────────────── Autosave ──────────────────────────
// Quietly saves to Supabase every 5 seconds when there are unsaved changes.
// Does NOT publish or create history — just persists the draft so you never lose work.
let _autosaveTimer = null;
let _autosaving = false;
let _autosaveFailCount = 0;

function startAutosave() {
  if (_autosaveTimer) return;
  _autosaveTimer = setInterval(async () => {
    if (!state.dirty || !state.doc || !state.currentPageId || _autosaving) return;
    if (_autosaveFailCount >= 3) return; // Stop retrying after 3 failures
    _autosaving = true;
    setSaveStatus('saving');
    try {
      await SB.autoSave(state.currentPageId, state.doc);
      clearLocalBackup(state.currentPageId);
      _autosaveFailCount = 0;
      setSaveStatus('saved');
      // Don't clear dirty — dirty means "unpublished changes"
      // But update status to show autosave happened
      const s = $('#page-status');
      s.textContent = '● Autosaved (unpublished)';
      s.className = 'status dirty';
    } catch (e) {
      console.error('Autosave failed:', e.message);
      _autosaveFailCount++;
      setSaveStatus('error');
      const s = $('#page-status');
      if (_autosaveFailCount >= 3) {
        s.textContent = '⚠ Autosave disabled — check connection';
        s.className = 'status dirty';
        toast('Autosave has failed 3 times. Your changes are backed up locally. Check your connection.', 'error');
      } else {
        s.textContent = '⚠ Autosave failed';
        s.className = 'status dirty';
      }
    } finally {
      _autosaving = false;
    }
  }, 5000);
}

// Auth expiry — save locally before showing login prompt
window.addEventListener('scrollycms:auth-expired', () => {
  backupToLocal();
  toast('Session expired — your work is saved locally. Please log in again.', 'error');
  setTimeout(() => { location.reload(); }, 3000);
});

// Start autosave once authenticated
startAutosave();

// Kickoff
checkSession();
})();
