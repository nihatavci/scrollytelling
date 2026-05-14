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
};

// ─────────────────────────── Block type schemas ──────────────
// Drives the form generator. Each block type lists its top-level fields.
// Editorial uses a separate content[] editor for inline items.
const BLOCK_SCHEMAS = {
  Hero: {
    name: 'Hero',
    description: 'Top of page — brand line, big title, animated intro lines',
    fields: [
      { key: 'brand',          label: 'Brand line (small caps at top)',     kind: 'text' },
      { key: 'titleHtml',      label: 'Title',                              kind: 'textarea',
        hint: 'Wrap a word in <code>&lt;span&gt;…&lt;/span&gt;</code> to highlight it in orange. Use <code>&lt;br&gt;</code> for a line break.' },
      { key: 'subtitle',       label: 'Subtitle',      kind: 'text' },
      { key: 'scrollCueText',  label: 'Scroll-down cue text',   kind: 'text' },
      { key: 'lines',          label: 'Intro lines (appear one by one before the title)', kind: 'lines' },
    ],
  },
  VizPanel: {
    name: 'Visualization',
    description: 'Shared interactive chart that scrolly sections drive',
    fields: [
      { key: 'initialTitle', label: 'Chart title (initial)',    kind: 'text' },
      { key: 'initialSub',   label: 'Chart subtitle (initial)', kind: 'text' },
    ],
  },
  Editorial: {
    name: 'Editorial',
    description: 'Long-form text section — paragraphs, quotes, images',
    fields: [
      { key: 'content', label: 'Content', kind: 'editorial_items' },
    ],
  },
  Scrolly: {
    name: 'Scrolly',
    description: 'Sticky-chart section with stepped narrative on the side',
    fields: [
      { key: 'steps',     label: 'Steps', kind: 'scrolly_steps' },
    ],
  },
  Outro: {
    name: 'Outro',
    description: 'Closing section — paragraphs, final emphasized line, sources',
    fields: [
      { key: 'h2',          label: 'Heading',     kind: 'text' },
      { key: 'paragraphs',  label: 'Paragraphs',  kind: 'string_list' },
      { key: 'finalLine',   label: 'Final emphasized line',  kind: 'text' },
      { key: 'sourcesHtml', label: 'Sources',     kind: 'textarea_html',
        hint: 'Separate citations with " · ". Use <code>&lt;br&gt;</code> for line breaks.' },
    ],
  },
  StatRow: {
    name: 'Stat row',
    description: 'A horizontal row of 2–4 large numbers with labels',
    fields: [
      { key: 'title', label: 'Heading (optional)', kind: 'text' },
      { key: 'stats', label: 'Stats',              kind: 'stat_list' },
    ],
  },
  Timeline: {
    name: 'Timeline',
    description: 'Vertical timeline — dated events with title and body',
    fields: [
      { key: 'title',  label: 'Heading (optional)', kind: 'text' },
      { key: 'events', label: 'Events',             kind: 'timeline_events' },
    ],
  },
  Aside: {
    name: 'Aside',
    description: 'Full-width highlighted callout box',
    fields: [
      { key: 'tone',  label: 'Tone', kind: 'tone_select' },
      { key: 'title', label: 'Title (optional)', kind: 'text' },
      { key: 'body',  label: 'Body (separate paragraphs with a blank line)', kind: 'textarea' },
    ],
  },
  ChapterDivider: {
    name: 'Chapter divider',
    description: 'Chapter break — number, title, optional subtitle',
    fields: [
      { key: 'number',   label: 'Number / label (optional)',     kind: 'text', hint: 'e.g. <code>I</code>, <code>01</code>, <code>Kapitel 2</code>' },
      { key: 'title',    label: 'Title',                          kind: 'text' },
      { key: 'subtitle', label: 'Subtitle (optional)',            kind: 'textarea' },
    ],
  },
  Quote: {
    name: 'Quote',
    description: 'Featured money quote — large, optional portrait',
    fields: [
      { key: 'text',         label: 'Quote (without surrounding quote marks)', kind: 'textarea' },
      { key: 'attribution',  label: 'Attribution (Name)',                       kind: 'text' },
      { key: 'role',         label: 'Role / context (optional)',                kind: 'text' },
      { key: 'portraitSrc',  label: 'Portrait (optional)',                      kind: 'image' },
      { key: 'sourceUrl',    label: 'Source URL (optional)',                    kind: 'text' },
      { key: 'sourceLabel',  label: 'Source link label (optional)',             kind: 'text' },
    ],
  },
  VideoEmbed: {
    name: 'Video embed',
    description: 'YouTube or Vimeo video with caption',
    fields: [
      { key: 'url',     label: 'Video URL', kind: 'text', hint: 'Paste a YouTube or Vimeo URL.' },
      { key: 'caption', label: 'Caption',   kind: 'textarea' },
      { key: 'credit',  label: 'Credit (optional)', kind: 'text', hint: 'e.g. <code>via NYT</code>' },
    ],
  },
  DataScrolly: {
    name: 'Data scrolly',
    description: 'Sticky chart + stepped narrative — each step updates the chart',
    fields: [
      { key: 'title',     label: 'Chart title',     kind: 'text' },
      { key: 'subtitle',  label: 'Chart subtitle',  kind: 'text' },
      { key: 'source',    label: 'Data source',     kind: 'text', hint: 'Citation or <code>[estimated illustrative values]</code>' },
      { key: 'chartSpec', label: 'Chart',           kind: 'chart_spec' },
      { key: 'steps',     label: 'Steps',           kind: 'data_scrolly_steps' },
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
  { type: 'VizPanel',       desc: 'Advanced — visualization container' },
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
};

// ─────────────────────────── DOM refs ────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─────────────────────────── Util ────────────────────────────
function uid(prefix = 'b') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function setDirty(d) {
  state.dirty = d;
  const s = $('#page-status');
  s.className = 'status ' + (d ? 'dirty' : 'saved');
  s.textContent = d ? '● Unsaved changes' : (state.savedVersion ? `Saved · v${state.savedVersion}` : 'Loaded');
  $('#btn-publish').disabled = !d;
}
// ─────────────────────────── API (Supabase-backed) ─────────
// SB.* functions from supabase-client.js replace the old fetch-based api().

// ─────────────────────────── Auth ────────────────────────────
async function checkSession() {
  try {
    const { loggedIn } = await SB.checkSession();
    if (loggedIn) showApp(); else showAuth();
  } catch { showAuth(); }
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
      const id = slugInp.value.trim();
      const title = titleInp.value.trim();
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

// Update "View" link to point at the current page
async function updateViewLink() {
  const link = $('#link-view-page');
  try {
    const profile = await SB.getProfile();
    const base = `/p/${profile.site_slug}`;
    link.href = state.currentPageId === 'index'
      ? `${base}/`
      : `${base}/${state.currentPageId}`;
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
    li.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span class="block-type">${block.type}</span>
      <span class="block-title">${blockSummary(block)}</span>
      <span class="block-ctrl">
        <button data-act="claude" title="Improve with Claude" class="claude-btn">✨</button>
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
    default:          return block.id;
  }
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
  if (!confirm(`Delete this ${block.type} block? This cannot be undone (until you Publish — drafts revert on reload).`)) return;
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
// Legacy name kept for backwards-compat; routes through the Claude flow.
function addBlock(type) { openClaudeModal({ mode: 'create', type }); }
// ─────────────────────────── Claude-powered create / improve ──
// opts: { mode: 'create' | 'improve', type, block? (for improve) }
function openClaudeModal(opts) {
  const isImprove = opts.mode === 'improve';
  const type = isImprove ? opts.block.type : opts.type;
  const title = isImprove ? `✨ Improve ${type}` : `✨ New ${type} — Describe with Claude`;
  let uploadedImages = [];

  openModal(title, (body) => {
    body.innerHTML = '';

    if (BLOCK_PREVIEWS[type]) {
      const previewBox = document.createElement('div');
      previewBox.style.cssText = 'border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:14px;background:#faf7f2;';
      const previewLabel = document.createElement('div');
      previewLabel.style.cssText = 'font-size:10px;font-weight:600;color:#8c959f;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;';
      previewLabel.textContent = `${type} preview (rough mock)`;
      const previewMock = document.createElement('div');
      previewMock.style.cssText = 'max-width:280px;margin:0 auto;';
      previewMock.innerHTML = BLOCK_PREVIEWS[type];
      previewBox.appendChild(previewLabel);
      previewBox.appendChild(previewMock);
      body.appendChild(previewBox);
    }

    const hint = document.createElement('p');
    hint.style.cssText = 'margin-bottom:12px;color:#57606a;font-size:12.5px;line-height:1.5;';
    hint.innerHTML = isImprove
      ? `Tell Claude how to <strong>change</strong> this block. Examples:<br>• "Make it more dramatic"<br>• "Add a pull quote from Hannah Arendt"<br>• "Rewrite in a more conversational tone"`
      : `Describe what this section should be about. Claude writes the content (German, matching the existing voice). Examples:<br>• "A section about how Watergate changed investigative journalism"<br>• "3 scrolly steps explaining what NLP is"<br>• "A pull quote from Hannah Arendt and 2 paragraphs about press freedom"`;
    body.appendChild(hint);

    // Prompt textarea
    const ta = document.createElement('textarea');
    ta.rows = 5;
    ta.placeholder = isImprove
      ? 'Describe the change you want…'
      : `Describe the ${type.toLowerCase()} you want…`;
    body.appendChild(ta);

    // Image upload area (only for create, since improve preserves existing images)
    const imgsWrap = document.createElement('div');
    imgsWrap.style.cssText = 'margin-top:14px;';
    const imgsLabel = document.createElement('label');
    imgsLabel.className = 'field-label';
    imgsLabel.textContent = 'Images (optional) — Claude will use these in the section';
    imgsWrap.appendChild(imgsLabel);
    const filePick = document.createElement('input');
    filePick.type = 'file';
    filePick.accept = 'image/*';
    filePick.multiple = true;
    filePick.style.cssText = 'margin-top:4px;';
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
    filePick.addEventListener('change', async () => {
      for (const f of Array.from(filePick.files)) {
        try {
          const r = await SB.uploadImage(f);
          uploadedImages.push(r.url);
          const thumb = document.createElement('div');
          thumb.style.cssText = `width:60px;height:60px;background:url('${encodeURI(r.url)}') center/cover no-repeat;border:1px solid #d0d7de;border-radius:4px;`;
          thumb.title = r.url;
          previewWrap.appendChild(thumb);
        } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
      }
      filePick.value = '';
    });
    imgsWrap.appendChild(filePick);
    imgsWrap.appendChild(previewWrap);
    body.appendChild(imgsWrap);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
    const manualBtn = document.createElement('button');
    manualBtn.className = 'ghost';
    manualBtn.textContent = isImprove ? 'Cancel' : 'Skip — add empty block';
    manualBtn.addEventListener('click', () => {
      closeModal();
      if (!isImprove) addEmptyBlock(type);
    });
    const genBtn = document.createElement('button');
    genBtn.className = 'primary';
    genBtn.textContent = '✨ Generate with Claude';
    genBtn.addEventListener('click', async () => {
      const prompt = ta.value.trim();
      if (!prompt) { ta.focus(); return; }
      genBtn.disabled = true;
      manualBtn.disabled = true;
      const spinner = document.createElement('div');
      spinner.style.cssText = 'margin-top:14px;padding:10px;background:#ddf4ff;border-radius:6px;font-size:12.5px;color:#0969da;';
      spinner.textContent = 'Claude is writing… (this can take 30–60 seconds)';
      body.appendChild(spinner);
      try {
        const r = await SB.generate({
          type,
          prompt,
          images: uploadedImages,
          currentData: isImprove ? opts.block.data : null,
          mode: isImprove ? 'improve' : 'create',
          pageId: state.currentPageId,
        });
        if (isImprove) {
          opts.block.data = r.data;
          setDirty(true);
          renderBlockList();
          if (opts.block.id === state.selectedBlockId) renderEditor();
          toast('Block updated by Claude', 'success');
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
          state.doc.blocks.push(newBlock);
          state.selectedBlockId = newBlock.id;
          setDirty(true);
          renderBlockList();
          renderEditor();
          toast(`${type} block created by Claude`, 'success');
        }
        closeModal();
        refreshPreview();
      } catch (e) {
        spinner.style.background = '#ffebe9';
        spinner.style.color = '#cf222e';
        spinner.textContent = 'Failed: ' + e.message;
        genBtn.disabled = false;
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
    case 'Scrolly':   return { scrollyId: 'scrolly-X', stepsId: 'steps-X', steps: [{ stepIndex: 0, badgeKind: 'pyramid', badgeLabel: 'Label', body: 'Step body.' }] };
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
    `<button id="form-claude-btn" style="background:#f3f0ff;color:#6639ba;border-color:#d4c5ff;font-weight:600;">✨ Improve with Claude</button>`;
  form.appendChild(title);
  title.querySelector('#form-claude-btn').addEventListener('click', () => openClaudeModal({ mode: 'improve', block }));

  if (!schema) {
    const p = document.createElement('p');
    p.textContent = `Unknown block type: ${block.type}. Raw JSON editing not yet supported in v1.`;
    form.appendChild(p);
    return;
  }

  schema.fields.forEach(field => {
    form.appendChild(renderField(field, block.data, () => { setDirty(true); refreshPreview(); updateBlockSummary(); }));
  });
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
      ta.addEventListener('input', () => { data[field.key] = ta.value; onChange(); updateBlockSummary(); });
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
      ta.addEventListener('input', () => setVal(ta.value));
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
      wrap.appendChild(imageField(getVal() ?? '', (v) => setVal(v)));
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

function imageField(initial, onChange) {
  const box = document.createElement('div');
  box.className = 'img-field';
  const thumb = document.createElement('div');
  thumb.className = 'img-thumb';
  if (initial) thumb.style.backgroundImage = `url('${encodeURI(initial)}')`;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = initial; inp.placeholder = 'images/...';
  inp.addEventListener('input', () => {
    onChange(inp.value);
    thumb.style.backgroundImage = inp.value ? `url('${encodeURI(inp.value)}')` : '';
  });

  const actions = document.createElement('div');
  actions.className = 'img-field-actions';
  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload…';
  uploadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try {
        const r = await SB.uploadImage(file.files[0]);
        inp.value = r.url;
        onChange(r.url);
        thumb.style.backgroundImage = `url('${encodeURI(r.url)}')`;
        toast('Uploaded · ' + r.url, 'success');
      } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
    });
    file.click();
  });
  const browseBtn = document.createElement('button');
  browseBtn.textContent = 'Browse…';
  browseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openImagePicker((url) => {
      inp.value = url;
      onChange(url);
      thumb.style.backgroundImage = `url('${encodeURI(url)}')`;
    });
  });
  actions.appendChild(uploadBtn);
  actions.appendChild(browseBtn);

  box.appendChild(thumb);
  const col = document.createElement('div');
  col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;';
  col.appendChild(inp);
  box.appendChild(col);
  box.appendChild(actions);
  return box;
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
  // Re-render only the active row's title text without rebuilding the list
  const block = state.doc.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  const li = document.querySelector(`.block-item.active .block-title`);
  if (li) li.textContent = blockSummary(block);
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
  ensureScrollyIds(state.doc);
  $('#btn-publish').disabled = true;
  try {
    const r = await SB.saveDraft(state.currentPageId, state.doc);
    state.doc.version = r.version;
    state.savedVersion = r.version;
    setDirty(false);
    toast(`Published · v${r.version}`, 'success');
    refreshPreview();
  } catch (e) {
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
  const html = `<!DOCTYPE html>
<html lang="${doc.lang || 'de'}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet">
${themeLink}
<script>window.__PAGE_DATA__ = ${JSON.stringify(doc)};<\/script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\/script>
<base href="${origin}/">
</head>
<body>
<main id="page-root"></main>
<script type="module">
import { render } from '${origin}/js/render.js';
render();
<\/script>
</body></html>`;
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
$('#btn-history').addEventListener('click', async () => {
  openModal('Version history', async (body) => {
    body.innerHTML = 'Loading…';
    try {
      const { snapshots } = await SB.listHistory(state.currentPageId);
      body.innerHTML = '';
      if (!snapshots.length) { body.textContent = 'No history yet. Publishing creates snapshots.'; return; }
      snapshots.forEach(s => {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `<span class="history-ts">${s.ts}</span><span class="history-size">${(s.size/1024).toFixed(1)} KB</span><button class="small">Restore</button>`;
        row.querySelector('button').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Restore snapshot from ${s.ts}? Current state will be snapshotted first.`)) return;
          try {
            const r = await SB.restoreSnapshot(state.currentPageId, s.id);
            toast(`Restored · v${r.version}`, 'success');
            closeModal();
            await loadPage(state.currentPageId);
            refreshPreview();
          } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
        });
        body.appendChild(row);
      });
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

// Kickoff
checkSession();
})();
