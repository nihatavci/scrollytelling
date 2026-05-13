// js/render.js — Hydrates the page from a JSON content document.
// The output DOM is intentionally byte-for-byte close to the original
// hand-written index.html so all existing page JS (cinematic intro, viz,
// scrolly observer) continues to work unchanged.
//
// Public API:
//   render(jsonUrl, rootSelector?) -> Promise<void>
//
// Each block type has its own render function. Add new types by adding
// a function to BLOCK_RENDERERS.

// CSS for components introduced after the original site. Injected once on first render
// so every page that uses render.js automatically picks up the new component styles.
const COMPONENT_CSS = `
/* ── DropCap ── */
.editorial p.has-dropcap::first-letter{float:left;font-family:'Source Serif 4',serif;font-size:4.2rem;line-height:.95;padding:.3rem .55rem .1rem 0;color:var(--accent);font-weight:700}

/* ── Inline Callout (inside Editorial) ── */
.callout{border-left:4px solid var(--accent);background:#fff8f1;border-radius:0 8px 8px 0;padding:.9rem 1.1rem .95rem;margin:1.6rem 0;font-family:'DM Sans',sans-serif;color:var(--text);font-size:1rem;line-height:1.6}
.callout-note{background:#f1f6fb;border-left-color:#3d7a94}
.callout-warning{background:#fdf2eb;border-left-color:#c45b5b}
.callout-title{font-weight:600;margin-bottom:.25rem;font-size:.95rem;color:var(--text)}

/* ── BigNumber (inline stat inside Editorial) ── */
.bignumber{display:block;text-align:center;margin:2rem 0;font-family:'DM Sans',sans-serif}
.bignumber-value{font-family:'Source Serif 4',serif;font-size:clamp(2.6rem,6vw,4.6rem);font-weight:700;color:var(--accent);line-height:1;letter-spacing:-.02em}
.bignumber-label{font-size:.95rem;color:var(--text);margin-top:.4rem;font-weight:500}
.bignumber-context{font-size:.78rem;color:var(--muted);margin-top:.25rem;font-style:italic}

/* ── List (ordered / unordered, inside Editorial) ── */
.editorial ul.ed-list,.editorial ol.ed-list{margin:1.2rem 0 1.8rem;padding-left:1.4rem;font-family:'Source Serif 4',serif;font-size:1.15rem;line-height:1.85;color:var(--text)}
.editorial ul.ed-list li,.editorial ol.ed-list li{margin-bottom:.6rem}
.editorial ul.ed-list li::marker{color:var(--accent)}

/* ── Timeline block ── */
.timeline-block{max-width:720px;margin:0 auto;padding:3rem 2rem;position:relative;z-index:3;background:var(--bg)}
.timeline-block h3{font-family:'Source Serif 4',serif;font-size:1.6rem;font-weight:700;margin-bottom:1.6rem;letter-spacing:-.02em}
.timeline-list{position:relative;padding-left:1.6rem}
.timeline-list::before{content:'';position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:#e6e1da}
.timeline-event{position:relative;margin-bottom:1.4rem}
.timeline-event::before{content:'';position:absolute;left:-1.6rem;top:.45rem;width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--bg)}
.timeline-when{font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.15rem}
.timeline-title{font-family:'Source Serif 4',serif;font-size:1.2rem;font-weight:700;line-height:1.3;margin-bottom:.25rem}
.timeline-body{font-family:'Source Serif 4',serif;font-size:1rem;line-height:1.6;color:var(--text)}

/* ── StatRow block ── */
.statrow-block{max-width:1100px;margin:0 auto;padding:3rem 2rem;position:relative;z-index:3;background:var(--bg)}
.statrow-block h3{font-family:'Source Serif 4',serif;font-size:1.6rem;font-weight:700;margin-bottom:1.6rem;letter-spacing:-.02em;text-align:center}
.statrow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1.6rem;text-align:center}
.statrow-cell .v{font-family:'Source Serif 4',serif;font-size:clamp(2.4rem,5vw,3.6rem);font-weight:700;color:var(--accent);line-height:1;letter-spacing:-.02em}
.statrow-cell .l{font-family:'DM Sans',sans-serif;font-size:.95rem;color:var(--text);margin-top:.5rem;font-weight:500}
.statrow-cell .c{font-family:'DM Sans',sans-serif;font-size:.78rem;color:var(--muted);margin-top:.25rem;font-style:italic}

/* ── Aside block ── */
.aside-block{max-width:720px;margin:2.5rem auto;padding:1.4rem 1.6rem;border-radius:10px;background:#fff8f1;border-left:4px solid var(--accent);font-family:'DM Sans',sans-serif;position:relative;z-index:3}
.aside-block.tone-note{background:#f1f6fb;border-left-color:#3d7a94}
.aside-block.tone-warning{background:#fdf2eb;border-left-color:#c45b5b}
.aside-block h3{font-family:'Source Serif 4',serif;font-size:1.1rem;font-weight:700;margin-bottom:.4rem}
.aside-block p{font-size:1rem;line-height:1.65;color:var(--text);margin-bottom:.6rem}
.aside-block p:last-child{margin-bottom:0}

@media(max-width:900px){
  .timeline-block,.statrow-block{padding:2.5rem 1.25rem}
  .aside-block{margin:2rem 1.25rem}
}
`;

function injectComponentCSS() {
  if (document.getElementById('__component_css__')) return;
  const tag = document.createElement('style');
  tag.id = '__component_css__';
  tag.textContent = COMPONENT_CSS;
  document.head.appendChild(tag);
}

const BLOCK_RENDERERS = {
  Hero:       renderHero,
  VizPanel:   renderVizPanel,
  Editorial:  renderEditorial,
  Scrolly:    renderScrolly,
  Outro:      renderOutro,
  StatRow:    renderStatRow,
  Timeline:   renderTimeline,
  Aside:      renderAside,
};

// Resolve which content file to load based on the current URL path.
//   /                          → content/index.json
//   /index.rendered.html       → content/index.json
//   /pressefreiheit            → content/pressefreiheit.json
//   /pressefreiheit.rendered.html → content/pressefreiheit.json
function defaultContentUrl() {
  const m = location.pathname.match(/^\/([A-Za-z0-9_-]+)(?:\.rendered\.html)?\/?$/);
  const slug = (m && m[1]) ? m[1] : 'index';
  return `./content/${slug === 'index.rendered' ? 'index' : slug}.json`;
}

export async function render(jsonUrl, rootSelector = '#page-root') {
  injectComponentCSS();
  if (!jsonUrl) jsonUrl = defaultContentUrl();
  const res = await fetch(jsonUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${jsonUrl}: ${res.status}`);
  const doc = await res.json();

  if (doc.meta?.title) document.title = doc.meta.title;
  if (doc.lang)        document.documentElement.lang = doc.lang;
  applyMeta(doc.meta || {});

  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`render: root ${rootSelector} not found`);

  for (const block of (doc.blocks || [])) {
    const fn = BLOCK_RENDERERS[block.type];
    if (!fn) {
      console.warn('Unknown block type:', block.type, block.id);
      continue;
    }
    const node = fn(block.data || {}, block);
    if (node) root.appendChild(node);
  }

  document.dispatchEvent(new CustomEvent('content:ready', { detail: { doc } }));
}

// ───────── Meta tags ─────────
function applyMeta(meta) {
  const set = (sel, attr, val) => {
    if (val == null) return;
    let el = document.head.querySelector(sel);
    if (!el) return;
    el.setAttribute(attr, val);
  };
  set('meta[property="og:title"]',       'content', meta.ogTitle);
  set('meta[property="og:description"]', 'content', meta.ogDescription);
  set('meta[name="description"]',        'content', meta.description);
}

// ───────── Hero (cinematic intro) ─────────
function renderHero(d) {
  const sec = el('section', { class: 'cin-intro', id: 'cin-intro' });
  sec.appendChild(el('div', { class: 'cin-brand', id: 'cin-brand' }, d.brand || ''));
  const svgWrap = el('div', { class: 'cin-svg-wrap' });
  svgWrap.innerHTML = '<svg id="cin-svg"></svg>';
  sec.appendChild(svgWrap);

  const textLayer = el('div', { class: 'cin-text-layer', id: 'cin-text-layer' });
  (d.lines || []).forEach(line => {
    textLayer.appendChild(el('div', { class: `cin-line ${line.cls || ''}`.trim() }, line.text || ''));
  });
  sec.appendChild(textLayer);

  const titleLayer = el('div', { class: 'cin-title-layer', id: 'cin-title-layer' });
  const h1 = el('h1', { class: 'cin-main-title' });
  h1.innerHTML = d.titleHtml || '';
  titleLayer.appendChild(h1);
  titleLayer.appendChild(el('p', { class: 'cin-sub-title' }, d.subtitle || ''));
  sec.appendChild(titleLayer);

  const cue = el('div', { class: 'cin-scroll-cue', id: 'cin-cue' });
  cue.appendChild(el('span', {}, d.scrollCueText || ''));
  cue.appendChild(el('div', { class: 'arr' }));
  sec.appendChild(cue);
  return sec;
}

// ───────── Shared visualization panel ─────────
function renderVizPanel(d) {
  const panel = el('div', { class: 'viz-panel', id: 'viz-panel' });
  panel.innerHTML = `
    <div id="chart-content">
      <div class="viz-header">
        <div class="viz-title" id="viz-title">${escapeHtml(d.initialTitle || '')}</div>
        <div class="viz-sub" id="viz-sub">${escapeHtml(d.initialSub || '')}</div>
      </div>
      <div class="viz-wrap"><svg id="viz" viewBox="0 0 800 520"></svg></div>
      <div class="viz-source" id="viz-source"></div>
    </div>`;
  return panel;
}

// ───────── Editorial section ─────────
function renderEditorial(d) {
  const section = el('section', { class: 'editorial' });
  (d.content || []).forEach(item => {
    const node = renderEditorialItem(item);
    if (node) section.appendChild(node);
  });
  return section;
}

function renderEditorialItem(item) {
  switch (item.kind) {
    case 'kicker':         return el('div', { class: 'kicker' }, item.text);
    case 'h2':             return el('h2', {}, item.text);
    case 'lead':           return el('p', { class: 'lead' }, item.text);
    case 'p': {
      const p = el('p');
      p.innerHTML = item.html ?? item.text ?? '';
      return p;
    }
    case 'pullquote': {
      const q = el('div', { class: 'pullquote' });
      q.appendChild(document.createTextNode(item.text || ''));
      if (item.cite) q.appendChild(el('cite', {}, item.cite));
      return q;
    }
    case 'separator':      return el('div', { class: 'separator' });

    case 'captionCenter': {
      // Matches: <p style="text-align:center;font-size:.82rem;color:var(--muted);font-family:'DM Sans',sans-serif;margin-top:-.5rem;margin-bottom:1.5rem;font-style:italic;">
      return el('p', {
        style: "text-align:center;font-size:.82rem;color:var(--muted);font-family:'DM Sans',sans-serif;margin-top:-.5rem;margin-bottom:1.5rem;font-style:italic;"
      }, item.text);
    }
    case 'captionInline': {
      // Matches: <p style="font-size:.85rem;color:var(--muted);font-style:italic;margin-top:-.8rem;margin-bottom:1.5rem;">
      // 'light' variant matches: <p style="font-size:.9rem;color:var(--muted);margin-top:-.5rem;">
      if (item.variant === 'light') {
        return el('p', {
          style: 'font-size:.9rem;color:var(--muted);margin-top:-.5rem;'
        }, item.text);
      }
      return el('p', {
        style: 'font-size:.85rem;color:var(--muted);font-style:italic;margin-top:-.8rem;margin-bottom:1.5rem;'
      }, item.text);
    }

    case 'figureSingle': {
      const fig = el('figure', { style: 'margin:2rem 0;' });
      const img = el('img', {
        src: item.src,
        alt: item.alt || '',
        style: `max-width:${item.maxWidth || '100%'};border-radius:8px;`
      });
      fig.appendChild(img);
      if (item.caption) {
        const italic = item.italic !== false; // default italic
        fig.appendChild(el('figcaption', {
          style: `font-size:${item.captionFontSize || '.85rem'};color:var(--muted);margin-top:${item.captionMarginTop || '.6rem'};${italic ? 'font-style:italic;' : ''}`
        }, item.caption));
      }
      return fig;
    }

    case 'figurePair': {
      const align = item.align === 'center' ? 'center' : 'flex-start';
      const gap = item.gap || '1.5rem';
      const fig = el('figure', {
        style: `display:flex;gap:${gap};margin:2rem 0;align-items:${align};flex-wrap:wrap;`
      });
      const wrap = item.wrap !== false; // default: wrap each img in a flex div
      (item.images || []).forEach(img => {
        if (wrap) {
          const w = el('div', {
            style: `flex:${img.flex ?? 1};min-width:${img.minWidth ? img.minWidth + 'px' : '140px'};`
          });
          const styleParts = ['width:100%', 'border-radius:8px'];
          if (img.maxWidth) styleParts.push(`max-width:${img.maxWidth}`);
          w.appendChild(el('img', {
            src: img.src,
            alt: img.alt || '',
            style: styleParts.join(';') + ';'
          }));
          fig.appendChild(w);
        } else {
          // Direct <img> children — styles applied to the image itself.
          const styleParts = [`flex:${img.flex ?? 1}`];
          if (img.maxWidth) styleParts.push(`max-width:${img.maxWidth}`);
          styleParts.push('border-radius:8px');
          fig.appendChild(el('img', {
            src: img.src,
            alt: img.alt || '',
            style: styleParts.join(';') + ';'
          }));
        }
      });
      return fig;
    }

    case 'whatsappCard': {
      // Reproduces the WhatsApp-styled card in editorial 1 verbatim.
      const wrap = el('div', { style: 'display:flex;justify-content:center;margin:2rem 0;' });
      const card = el('div', { style: 'max-width:320px;background:#fff;border-radius:18px;padding:0;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);' });
      // Header
      const header = el('div', { style: 'background:#075E54;padding:.6rem 1rem;display:flex;align-items:center;gap:.6rem;' });
      header.appendChild(el('div', { style: 'width:32px;height:32px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:700;' }, item.senderInitial || ''));
      header.appendChild(el('span', { style: "color:#fff;font-size:.88rem;font-weight:600;font-family:'DM Sans',sans-serif;" }, item.senderName || ''));
      card.appendChild(header);
      // Body
      const body = el('div', { style: 'padding:.75rem 1rem 1rem;background:#ECE5DD;' });
      const bubble = el('div', { style: 'background:#fff;border-radius:12px 12px 12px 2px;padding:.6rem .85rem;display:inline-block;max-width:85%;box-shadow:0 1px 2px rgba(0,0,0,.12);' });
      if (item.image?.src) {
        bubble.appendChild(el('img', {
          src: item.image.src,
          alt: item.image.alt || '',
          style: 'width:100%;border-radius:8px;display:block;margin-bottom:.4rem;',
          onerror: "this.style.display='none'"
        }));
      }
      bubble.appendChild(el('p', { style: "margin:0;font-size:.92rem;font-family:'DM Sans',sans-serif;color:#303030;" }, item.message || ''));
      bubble.appendChild(el('p', { style: "margin:.25rem 0 0;font-size:.7rem;color:#667781;text-align:right;font-family:'DM Sans',sans-serif;" }, item.time || ''));
      body.appendChild(bubble);
      card.appendChild(body);
      wrap.appendChild(card);
      return wrap;
    }

    case 'customHTML': {
      const tpl = document.createElement('template');
      tpl.innerHTML = item.html || '';
      return tpl.content;
    }

    case 'bigNumber': {
      const wrap = el('div', { class: 'bignumber' });
      wrap.appendChild(el('div', { class: 'bignumber-value' }, item.value ?? ''));
      if (item.label)   wrap.appendChild(el('div', { class: 'bignumber-label' },   item.label));
      if (item.context) wrap.appendChild(el('div', { class: 'bignumber-context' }, item.context));
      return wrap;
    }

    case 'callout': {
      const wrap = el('div', { class: `callout callout-${item.tone || 'info'}` });
      if (item.title) wrap.appendChild(el('div', { class: 'callout-title' }, item.title));
      const body = el('div');
      body.innerHTML = item.body || '';
      wrap.appendChild(body);
      return wrap;
    }

    case 'dropcap': {
      const p = el('p', { class: 'has-dropcap' });
      p.innerHTML = item.html ?? item.text ?? '';
      return p;
    }

    default:
      console.warn('Unknown editorial item kind:', item.kind);
      return null;
  }
}

// ───────── Scrolly section ─────────
function renderScrolly(d) {
  const section = el('section', { class: 'scrolly', id: d.scrollyId || '' });
  const steps = el('div', { class: 'scrolly__steps', id: d.stepsId || '' });
  (d.steps || []).forEach(step => {
    const stepEl = el('div', { class: 'step', 'data-step': String(step.stepIndex) });
    const sc = el('div', { class: 'sc' });
    sc.appendChild(el('div', { class: `badge b-${step.badgeKind || 'pyramid'}` }, step.badgeLabel || ''));
    sc.appendChild(el('h3', {}, step.body || ''));
    stepEl.appendChild(sc);
    steps.appendChild(stepEl);
  });
  section.appendChild(steps);
  return section;
}

// ───────── Outro ─────────
function renderOutro(d) {
  const section = el('section', { class: 'outro' });
  if (d.h2) section.appendChild(el('h2', {}, d.h2));
  (d.paragraphs || []).forEach(p => section.appendChild(el('p', {}, p)));
  if (d.finalLine) section.appendChild(el('div', { class: 'final-line' }, d.finalLine));
  if (d.sourcesHtml) {
    const block = el('div', { class: 'source-block' });
    block.innerHTML = d.sourcesHtml;
    section.appendChild(block);
  }
  return section;
}

function renderStatRow(d) {
  const sec = el('section', { class: 'statrow-block' });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  const grid = el('div', { class: 'statrow-grid' });
  (d.stats || []).forEach(s => {
    const cell = el('div', { class: 'statrow-cell' });
    cell.appendChild(el('div', { class: 'v' }, s.value ?? ''));
    if (s.label)   cell.appendChild(el('div', { class: 'l' }, s.label));
    if (s.context) cell.appendChild(el('div', { class: 'c' }, s.context));
    grid.appendChild(cell);
  });
  sec.appendChild(grid);
  return sec;
}

function renderTimeline(d) {
  const sec = el('section', { class: 'timeline-block' });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  const list = el('div', { class: 'timeline-list' });
  (d.events || []).forEach(ev => {
    const item = el('div', { class: 'timeline-event' });
    if (ev.when)  item.appendChild(el('div', { class: 'timeline-when' },  ev.when));
    if (ev.title) item.appendChild(el('div', { class: 'timeline-title' }, ev.title));
    if (ev.body) {
      const body = el('div', { class: 'timeline-body' });
      body.innerHTML = ev.body;  // allow inline <em>
      item.appendChild(body);
    }
    list.appendChild(item);
  });
  sec.appendChild(list);
  return sec;
}

function renderAside(d) {
  const sec = el('aside', { class: `aside-block tone-${d.tone || 'info'}` });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  (String(d.body || '').split(/\n\n+/)).forEach(p => {
    if (!p.trim()) return;
    const para = el('p');
    para.innerHTML = p;
    sec.appendChild(para);
  });
  return sec;
}

// ───────── Tiny DOM helpers ─────────
function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    node.setAttribute(k, v);
  }
  if (text != null) node.appendChild(document.createTextNode(text));
  return node;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
