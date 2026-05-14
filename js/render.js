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

// ─────────────────────────── Vega-Lite ──────────────────────────────
// Vega-Lite libraries are loaded lazily — pages without a DataScrolly never
// pull them. First call kicks off a cached promise; subsequent calls await it.

let _vegaLoadPromise = null;

function loadScript(localSrc, cdnSrc) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = localSrc;
    s.onload = () => resolve();
    s.onerror = () => {
      // Fallback to CDN if vendored file fails (mirrors the d3 loader pattern)
      const s2 = document.createElement('script');
      s2.src = cdnSrc;
      s2.onload = () => resolve();
      s2.onerror = () => reject(new Error('Failed to load ' + cdnSrc));
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
}

function ensureVegaLoaded() {
  if (window.vegaEmbed) return Promise.resolve();
  if (_vegaLoadPromise) return _vegaLoadPromise;
  _vegaLoadPromise = (async () => {
    await loadScript('./vendor/vega.min.js',       'https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js');
    await loadScript('./vendor/vega-lite.min.js',  'https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js');
    await loadScript('./vendor/vega-embed.min.js', 'https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js');
  })();
  return _vegaLoadPromise;
}

// Build a Vega-Lite spec from our chartSpec + an optional per-step vizState.
// chartSpec: { kind, data, xField, yField, xLabel, yLabel, yDomain? }
// vizState:  { highlightX?, annotation? }
function buildVegaLiteSpec(chartSpec, vizState) {
  vizState = vizState || {};
  const cs = chartSpec || {};
  const xField = cs.xField || 'x';
  const yField = cs.yField || 'y';
  const data = Array.isArray(cs.data) ? cs.data : [];

  // Read theme-aware colors from CSS custom properties
  const style = getComputedStyle(document.documentElement);
  const ACCENT   = style.getPropertyValue('--spectrum-red').trim() || '#fa3d1d';
  const INK      = style.getPropertyValue('--ink-black').trim()    || '#000000';
  const GRAPHITE = style.getPropertyValue('--graphite').trim()     || '#636363';
  const FOG      = style.getPropertyValue('--fog').trim()          || '#efefef';
  const FONT     = style.getPropertyValue('--font-body').trim()    || "'DM Sans', sans-serif";

  const layers = [];

  if (cs.kind === 'line') {
    layers.push({
      mark: { type: 'line', strokeWidth: 1.75, color: INK, interpolate: 'monotone' },
      encoding: {
        x: { field: xField, type: 'quantitative', title: cs.xLabel || xField, axis: { format: 'd', labelAngle: 0 } },
        y: { field: yField, type: 'quantitative', title: cs.yLabel || yField,
             scale: cs.yDomain ? { domain: cs.yDomain, nice: false } : { nice: true } },
      },
    });
    // All-points dot layer (small, low-contrast) so reader can see the data resolution
    layers.push({
      mark: { type: 'circle', size: 30, color: INK, opacity: 0.55 },
      encoding: {
        x: { field: xField, type: 'quantitative' },
        y: { field: yField, type: 'quantitative' },
      },
    });
  } else {
    // Unknown kind — render a placeholder text mark so the chart slot is not empty
    layers.push({
      data: { values: [{ msg: 'Unsupported chartSpec.kind: ' + (cs.kind || '(none)') }] },
      mark: { type: 'text', fontSize: 13, color: GRAPHITE },
      encoding: { text: { field: 'msg', type: 'nominal' } },
    });
  }

  // Optional highlight rule + dot + annotation text
  if (vizState.highlightX !== undefined && vizState.highlightX !== null && cs.kind === 'line') {
    const x = Number(vizState.highlightX);
    const matchPoint = data.find(d => Number(d[xField]) === x);
    layers.push({
      data: { values: [{ [xField]: x }] },
      mark: { type: 'rule', stroke: ACCENT, strokeDash: [4, 4], strokeWidth: 1.25, opacity: 0.85 },
      encoding: { x: { field: xField, type: 'quantitative' } },
    });
    if (matchPoint) {
      layers.push({
        data: { values: [matchPoint] },
        mark: { type: 'point', size: 140, color: ACCENT, filled: true, opacity: 1 },
        encoding: {
          x: { field: xField, type: 'quantitative' },
          y: { field: yField, type: 'quantitative' },
        },
      });
      if (vizState.annotation) {
        layers.push({
          data: { values: [{ ...matchPoint, _label: vizState.annotation }] },
          mark: { type: 'text', dy: -18, fontSize: 13, color: INK, fontWeight: 500 },
          encoding: {
            x: { field: xField, type: 'quantitative' },
            y: { field: yField, type: 'quantitative' },
            text: { field: '_label', type: 'nominal' },
          },
        });
      }
    }
  }

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 380,
    data: { values: data },
    layer: layers,
    background: 'transparent',
    config: {
      font: FONT,
      axis: {
        labelFont: FONT, titleFont: FONT,
        labelColor: GRAPHITE, titleColor: INK,
        labelFontSize: 11, titleFontSize: 12,
        titlePadding: 12,
        grid: true, gridColor: FOG, gridOpacity: 1,
        domain: false, ticks: false,
      },
      view: { stroke: null },
    },
  };
}

// CSS for components introduced after the original site. Injected once on first render
// so every page that uses render.js automatically picks up the new component styles.
const COMPONENT_CSS = `
/* ── DropCap ── */
.editorial p.has-dropcap::first-letter{float:left;font-family:var(--font-display);font-size:4.5rem;line-height:.95;padding:.3rem .6rem .1rem 0;color:var(--ink-black);font-weight:300;letter-spacing:-.04em}

/* ── Inline Callout (inside Editorial) ── */
.callout{border-left:3px solid var(--ink-black);background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:0 16px 16px 0;padding:1rem 1.25rem;margin:1.8rem 0;font-family:var(--font-body);color:var(--ink-black);font-size:.95rem;line-height:1.55;box-shadow:var(--shadow-card)}
.callout-note{border-left-color:var(--signal-blue)}
.callout-warning{border-left-color:var(--spectrum-red)}
.callout-title{font-weight:500;margin-bottom:.3rem;font-size:.95rem;color:var(--ink-black);letter-spacing:-.005em}

/* ── BigNumber (inline stat inside Editorial) ── */
.bignumber{display:block;text-align:center;margin:2.5rem 0;font-family:var(--font-display)}
.bignumber-value{font-family:var(--font-display);font-size:clamp(2.8rem,6vw,4.5rem);font-weight:300;color:var(--ink-black);line-height:1.05;letter-spacing:-.04em;background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.bignumber-label{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);margin-top:.6rem;font-weight:500;letter-spacing:.02em}
.bignumber-context{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.3rem;font-style:normal;font-weight:400}

/* ── List (ordered / unordered, inside Editorial) ── */
.editorial ul.ed-list,.editorial ol.ed-list{margin:1.4rem 0 2rem;padding-left:1.4rem;font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);font-weight:400}
.editorial ul.ed-list li,.editorial ol.ed-list li{margin-bottom:.7rem}
.editorial ul.ed-list li::marker{color:var(--ink-black)}
.editorial ol.ed-list li::marker{color:var(--graphite);font-weight:500}

/* ── Timeline block ── */
.timeline-block{max-width:720px;margin:0 auto;padding:4rem 2rem;position:relative;z-index:3;background:var(--canvas)}
.timeline-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2rem;letter-spacing:-.03em;color:var(--ink-black)}
.timeline-list{position:relative;padding-left:1.8rem}
.timeline-list::before{content:'';position:absolute;left:6px;top:8px;bottom:8px;width:1px;background:var(--steel)}
.timeline-event{position:relative;margin-bottom:1.8rem}
.timeline-event::before{content:'';position:absolute;left:-1.8rem;top:.55rem;width:13px;height:13px;border-radius:50%;background:var(--ink-black);box-shadow:0 0 0 3px var(--canvas)}
.timeline-when{font-family:var(--font-body);font-size:.72rem;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--graphite);margin-bottom:.3rem}
.timeline-title{font-family:var(--font-display);font-size:1.25rem;font-weight:500;line-height:1.25;margin-bottom:.4rem;color:var(--ink-black);letter-spacing:-.015em}
.timeline-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--graphite);font-weight:400}

/* ── StatRow block ── */
.statrow-block{max-width:1100px;margin:0 auto;padding:4rem 2rem;position:relative;z-index:3;background:var(--canvas)}
.statrow-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2.4rem;letter-spacing:-.03em;text-align:center;color:var(--ink-black)}
.statrow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:2rem;text-align:center}
.statrow-cell{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.8rem 1.4rem;box-shadow:var(--shadow-card)}
.statrow-cell .v{font-family:var(--font-display);font-size:clamp(2.4rem,5vw,3.5rem);font-weight:300;color:var(--ink-black);line-height:1.05;letter-spacing:-.04em;background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.statrow-cell .l{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);margin-top:.7rem;font-weight:500;letter-spacing:.01em}
.statrow-cell .c{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.3rem;font-style:normal;font-weight:400}

/* ── Aside block ── */
.aside-block{max-width:720px;margin:3rem auto;padding:1.6rem 1.8rem;border-radius:var(--radius-card);background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-left:3px solid var(--ink-black);font-family:var(--font-body);position:relative;z-index:3;box-shadow:var(--shadow-card)}
.aside-block.tone-note{border-left-color:var(--signal-blue)}
.aside-block.tone-warning{border-left-color:var(--spectrum-red)}
.aside-block h3{font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.5rem;color:var(--ink-black);letter-spacing:-.01em}
.aside-block p{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);margin-bottom:.7rem;font-weight:400}
.aside-block p:last-child{margin-bottom:0}

/* ── ChapterDivider ── */
.chapter-divider{max-width:720px;margin:5rem auto 3.5rem;padding:0 2rem;text-align:center;position:relative;z-index:3}
.chapter-number{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.2em;margin-bottom:1rem}
.chapter-title{font-family:var(--font-display);font-size:clamp(1.8rem,4vw,2.75rem);font-weight:300;color:var(--ink-black);line-height:1.18;letter-spacing:-.04em;margin-bottom:.6rem}
.chapter-subtitle{font-family:var(--font-body);font-size:1.0625rem;color:var(--graphite);font-weight:400;line-height:1.5;max-width:560px;margin:0 auto 1.6rem}
.chapter-strip{width:120px;height:2px;background:var(--spectrum-gradient);margin:0 auto;border-radius:2px}

/* ── Quote (featured) ── */
.quote-block{max-width:860px;margin:4rem auto;padding:0 2rem;position:relative;z-index:3}
.quote-figure{margin:0}
.quote-text{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2.25rem);font-weight:300;color:var(--ink-black);line-height:1.25;letter-spacing:-.03em;position:relative;margin:0 0 1.4rem;padding-left:.2em}
.quote-mark{position:absolute;left:-.45em;top:-.18em;font-size:1.5em;line-height:1;color:var(--ink-black);font-family:var(--font-display);font-weight:300;opacity:.18}
.quote-body{display:inline}
.quote-cap{display:flex;align-items:center;gap:1rem;margin-top:1.2rem;padding-left:.2em}
.quote-portrait{width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid rgba(0,0,0,.06)}
.quote-attr-wrap{display:flex;flex-direction:column;gap:.15rem;font-family:var(--font-body);min-width:0}
.quote-attr{font-size:.95rem;font-weight:500;color:var(--ink-black);letter-spacing:-.005em}
.quote-role{font-size:.82rem;color:var(--graphite);font-weight:400}
.quote-source{font-size:.78rem;color:var(--ink-black);text-decoration:underline;text-decoration-color:var(--steel);text-underline-offset:3px;margin-top:.25rem;transition:text-decoration-color .2s}
.quote-source:hover{text-decoration-color:var(--ink-black)}

/* ── VideoEmbed ── */
.video-embed{max-width:1000px;margin:4rem auto;padding:0 2rem;position:relative;z-index:3}
.video-figure{margin:0}
.video-wrap{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--radius-image);overflow:hidden;background:var(--fog);box-shadow:var(--shadow-card)}
.video-iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.video-placeholder{aspect-ratio:16/9;border-radius:var(--radius-image);background:var(--fog);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2rem;text-align:center;color:var(--graphite);font-family:var(--font-body)}
.video-placeholder-icon{font-size:2.4rem;color:var(--steel)}
.video-placeholder-msg{font-size:.9rem;font-weight:500;color:var(--graphite)}
.video-placeholder-link{font-size:.82rem;color:var(--ink-black);text-decoration:underline;word-break:break-all;max-width:90%}
.video-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;display:flex;gap:.7rem;flex-wrap:wrap;font-weight:400;line-height:1.5}
.video-caption{flex:1;min-width:200px}
.video-credit{color:var(--ash);font-style:italic;font-size:.78rem}

/* ── Footnote (inline ref + endnotes section) ── */
.fn-ref{font-size:.65em;line-height:0;vertical-align:super}
.fn-ref a{color:var(--ink-black);text-decoration:none;border-bottom:1px solid var(--steel);padding:0 1px;font-weight:500;transition:border-color .2s,color .2s}
.fn-ref a:hover{color:var(--spectrum-red);border-bottom-color:var(--spectrum-red)}
.endnotes{max-width:720px;margin:4rem auto 5rem;padding:2rem;background:var(--canvas);border-top:1px solid var(--fog);position:relative;z-index:3}
.endnotes-head{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.2em;margin-bottom:1rem}
.endnotes-list{list-style:decimal;padding-left:1.4rem;font-family:var(--font-body);font-size:.92rem;color:var(--graphite);line-height:1.6}
.endnotes-list li{margin-bottom:.6rem}
.endnote-back{color:var(--ink-black);text-decoration:none;margin-left:.3rem;font-size:.85rem;opacity:.6;transition:opacity .2s}
.endnote-back:hover{opacity:1}

/* ── Highlight (marker style) ── */
.highlight{background:linear-gradient(180deg,transparent 55%,#ffe98a 55%);padding:0 .15em;color:var(--ink-black);border-radius:1px}

/* ── StepList (numbered how-to inside Editorial) ── */
.steplist{margin:2rem 0 2.5rem;font-family:var(--font-body)}
.steplist-title{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.18em;margin-bottom:1.2rem}
.steplist-list{list-style:none;counter-reset:steplist;padding:0;margin:0}
.steplist-step{counter-increment:steplist;position:relative;padding-left:3rem;margin-bottom:1.4rem;min-height:2.2rem}
.steplist-step::before{content:counter(steplist,decimal-leading-zero);position:absolute;left:0;top:.05em;font-family:var(--font-display);font-size:1.5rem;font-weight:300;color:var(--graphite);letter-spacing:-.02em;line-height:1;width:2.2rem}
.steplist-step-title{font-family:var(--font-display);font-size:1.15rem;font-weight:500;color:var(--ink-black);line-height:1.3;letter-spacing:-.015em;margin-bottom:.3rem}
.steplist-step-body{font-family:var(--font-body);font-size:1rem;color:var(--graphite);line-height:1.55;font-weight:400}

/* ── FactCheck ── */
.factcheck{margin:2.4rem 0;padding:1.4rem 1.6rem;border-radius:var(--radius-card);background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(128,128,128,.12);box-shadow:var(--shadow-card);font-family:var(--font-body);position:relative;overflow:hidden}
.factcheck::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px}
.factcheck-true::before{background:var(--signal-blue)}
.factcheck-false::before{background:var(--spectrum-red)}
.factcheck-misleading::before{background:var(--marigold)}
.factcheck-head{display:flex;align-items:center;gap:.7rem;margin-bottom:.9rem}
.factcheck-pill{font-family:var(--font-body);font-size:.7rem;font-weight:500;text-transform:uppercase;letter-spacing:.14em;padding:.3rem .8rem;border-radius:var(--radius-pill);color:#fff;line-height:1}
.factcheck-true .factcheck-pill{background:var(--signal-blue)}
.factcheck-false .factcheck-pill{background:var(--spectrum-red)}
.factcheck-misleading .factcheck-pill{background:var(--marigold);color:var(--ink-black)}
.factcheck-eyebrow{font-size:.7rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.18em}
.factcheck-claim{font-family:var(--font-display);font-size:1.15rem;font-weight:300;color:var(--ink-black);line-height:1.35;letter-spacing:-.015em;margin:0 0 .8rem;padding:0;border:none;font-style:normal}
.factcheck-claim::before{content:'\\201C';margin-right:.1em;opacity:.4}
.factcheck-claim::after{content:'\\201D';margin-left:.1em;opacity:.4}
.factcheck-explanation{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);line-height:1.55;margin-bottom:.6rem;font-weight:400}
.factcheck-source{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);font-style:normal;font-weight:400}

/* ── DataScrolly ── */
.data-scrolly{display:grid;grid-template-columns:1fr 420px;gap:4vw;max-width:1400px;margin:4rem auto;padding:0 2rem;position:relative;z-index:3}
.ds-graphic{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:1.5rem 0}
.ds-chart-title{font-family:var(--font-display);font-size:clamp(1.3rem,2.2vw,1.6rem);font-weight:500;color:var(--ink-black);letter-spacing:-.02em;line-height:1.25}
.ds-chart-sub{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.3rem;line-height:1.45;margin-bottom:1rem}
.ds-chart{width:100%;max-width:760px;min-height:380px;position:relative}
.ds-chart svg{width:100%!important;height:auto!important;display:block}
.ds-chart-error{font-family:var(--font-body);font-size:.85rem;color:var(--spectrum-red);padding:1rem;background:rgba(250,61,29,.05);border-radius:8px}
.ds-chart-source{font-family:var(--font-body);font-size:.7rem;color:var(--ash);margin-top:1rem;font-style:normal}
.ds-steps{padding:30vh 0;display:flex;flex-direction:column}
.ds-step{min-height:85vh;display:flex;align-items:center;padding:1.5rem 0}
.ds-step:first-child{padding-top:8vh}.ds-step:last-child{margin-bottom:20vh}
.ds-step-card{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.4rem 1.6rem 1.5rem;border:none;max-width:420px;box-shadow:var(--shadow-card);opacity:.4;transition:opacity .3s,box-shadow .3s}
.ds-step.is-active .ds-step-card{opacity:1;box-shadow:rgba(0,0,0,.12) 0 0 16px 0}
.ds-step-badge{display:inline-block;margin-bottom:.7rem}
.ds-step-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);font-weight:400}

@media(max-width:900px){
  .timeline-block,.statrow-block{padding:3rem 1.25rem}
  .aside-block{margin:2.5rem 1.25rem}
  .chapter-divider{margin:3.5rem auto 2.5rem;padding:0 1.25rem}
  .quote-block{margin:3rem auto;padding:0 1.25rem}
  .quote-portrait{width:48px;height:48px}
  .video-embed{margin:3rem auto;padding:0 1.25rem}
  .data-scrolly{grid-template-columns:1fr;gap:0;margin:3rem auto;padding:0 1.25rem}
  .ds-graphic{position:relative;height:auto;padding:2rem 0;align-items:center}
  .ds-chart{max-width:100%}
  .ds-steps{padding:0}
  .ds-step{min-height:auto;padding:1rem 0}
  .ds-step-card{opacity:1;max-width:100%}
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
  Hero:           renderHero,
  VizPanel:       renderVizPanel,
  Editorial:      renderEditorial,
  Scrolly:        renderScrolly,
  Outro:          renderOutro,
  StatRow:        renderStatRow,
  Timeline:       renderTimeline,
  Aside:          renderAside,
  ChapterDivider: renderChapterDivider,
  Quote:          renderQuote,
  VideoEmbed:     renderVideoEmbed,
  DataScrolly:    renderDataScrolly,
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

  let doc;
  if (window.__PAGE_DATA__) {
    // Embedded by CF Pages Function or admin preview blob
    doc = window.__PAGE_DATA__;
  } else {
    if (!jsonUrl) jsonUrl = defaultContentUrl();
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${jsonUrl}: ${res.status}`);
    doc = await res.json();
  }

  if (doc.meta?.title) document.title = doc.meta.title;
  if (doc.lang)        document.documentElement.lang = doc.lang;
  applyMeta(doc.meta || {});

  // Load theme CSS (dia = default, claude, miranda)
  const theme = doc.theme || 'dia';
  if (theme !== 'dia') {
    // For non-default themes, inject the theme stylesheet
    const base = document.querySelector('base')?.href || '';
    const themeUrl = base ? `${base}themes/${theme}.css` : `/themes/${theme}.css`;
    if (!document.querySelector(`link[data-theme="${theme}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = themeUrl;
      link.dataset.theme = theme;
      document.head.appendChild(link);
      // Wait for theme to load before rendering
      await new Promise(r => { link.onload = r; link.onerror = r; });
    }
  }
  document.documentElement.dataset.theme = theme;

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

  // Collect all footnote refs into a single endnotes section at the bottom.
  const refs = root.querySelectorAll('sup.fn-ref');
  if (refs.length) {
    // De-dupe by (ref number) — first occurrence wins for note text.
    const seen = new Map();
    refs.forEach(s => {
      const n = s.firstChild?.textContent;
      const note = s.getAttribute('data-note') || '';
      if (n && !seen.has(n)) seen.set(n, note);
    });
    const endnotes = document.createElement('aside');
    endnotes.className = 'endnotes';
    endnotes.setAttribute('aria-label', 'Footnotes');
    const head = document.createElement('h3');
    head.className = 'endnotes-head';
    head.textContent = 'Notes';
    endnotes.appendChild(head);
    const ol = document.createElement('ol');
    ol.className = 'endnotes-list';
    for (const [n, note] of seen) {
      const li = document.createElement('li');
      li.id = 'fn-' + n;
      li.className = 'endnote';
      const noteSpan = document.createElement('span');
      noteSpan.innerHTML = note;
      li.appendChild(noteSpan);
      const back = document.createElement('a');
      back.href = '#fnref-' + n;
      back.className = 'endnote-back';
      back.setAttribute('aria-label', 'Back to reference ' + n);
      back.textContent = '↩';
      li.appendChild(document.createTextNode(' '));
      li.appendChild(back);
      ol.appendChild(li);
    }
    endnotes.appendChild(ol);
    root.appendChild(endnotes);
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

    case 'list': {
      const tag = item.ordered ? 'ol' : 'ul';
      const list = el(tag, { class: 'ed-list' });
      (item.items || []).forEach(text => {
        const li = el('li');
        li.innerHTML = text;
        list.appendChild(li);
      });
      return list;
    }

    case 'footnote': {
      // Render an inline numbered superscript link. The actual note text travels
      // through an attribute; the post-render collector reads it.
      const sup = el('sup', { class: 'fn-ref', 'data-note': item.note || '' });
      const a = el('a', {
        href: '#fn-' + (item.ref || 1),
        id: 'fnref-' + (item.ref || 1),
        'aria-label': 'Footnote ' + (item.ref || 1),
      }, String(item.ref || 1));
      sup.appendChild(a);
      return sup;
    }
    case 'highlight': {
      const wrap = el('mark', { class: 'highlight' });
      wrap.innerHTML = item.html || '';
      return wrap;
    }
    case 'stepList': {
      const wrap = el('div', { class: 'steplist' });
      if (item.title) wrap.appendChild(el('div', { class: 'steplist-title' }, item.title));
      const ol = el('ol', { class: 'steplist-list' });
      (item.steps || []).forEach((s) => {
        const li = el('li', { class: 'steplist-step' });
        if (s.title) {
          const t = el('div', { class: 'steplist-step-title' });
          t.innerHTML = s.title;
          li.appendChild(t);
        }
        if (s.body) {
          const b = el('div', { class: 'steplist-step-body' });
          b.innerHTML = s.body;
          li.appendChild(b);
        }
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
      return wrap;
    }
    case 'factCheck': {
      const verdict = (item.verdict || 'true').toLowerCase();
      const verdictLabel = { true: 'True', false: 'False', misleading: 'Misleading' }[verdict] || verdict;
      const wrap = el('aside', { class: `factcheck factcheck-${verdict}`, 'aria-label': 'Fact check: ' + verdictLabel });
      const head = el('div', { class: 'factcheck-head' });
      head.appendChild(el('span', { class: 'factcheck-pill' }, verdictLabel));
      head.appendChild(el('span', { class: 'factcheck-eyebrow' }, 'Fact check'));
      wrap.appendChild(head);
      if (item.claim) {
        const claim = el('blockquote', { class: 'factcheck-claim' });
        claim.innerHTML = item.claim;
        wrap.appendChild(claim);
      }
      if (item.explanation) {
        const exp = el('div', { class: 'factcheck-explanation' });
        exp.innerHTML = item.explanation;
        wrap.appendChild(exp);
      }
      if (item.source) {
        const src = el('div', { class: 'factcheck-source' });
        src.innerHTML = 'Source: ' + (item.source || '');
        wrap.appendChild(src);
      }
      return wrap;
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

// ─────────────────────────── DataScrolly ──────────────────────────────
// A new block type — its own sticky chart per block, driven by Vega-Lite.
// Each step's vizState updates the chart by re-embedding with a new spec.

function renderDataScrolly(d, block) {
  const sec = el('section', { class: 'data-scrolly', 'data-ds-id': block.id });

  // Sticky graphic on the left
  const graphic = el('div', { class: 'ds-graphic' });
  if (d.title) graphic.appendChild(el('div', { class: 'ds-chart-title' }, d.title));
  if (d.subtitle) graphic.appendChild(el('div', { class: 'ds-chart-sub' }, d.subtitle));
  const chartHost = el('div', { class: 'ds-chart', id: 'ds-chart-' + block.id });
  graphic.appendChild(chartHost);
  if (d.source) graphic.appendChild(el('div', { class: 'ds-chart-source' }, 'Source: ' + d.source));
  sec.appendChild(graphic);

  // Steps on the right
  const stepsCol = el('div', { class: 'ds-steps' });
  (d.steps || []).forEach((step, i) => {
    const stepEl = el('div', {
      class: 'ds-step',
      'data-ds-id': block.id,
      'data-ds-idx': String(i),
    });
    const card = el('div', { class: 'ds-step-card' });
    card.appendChild(el('div', {
      class: 'ds-step-badge badge b-' + (step.badgeKind || 'data'),
    }, step.badgeLabel || ''));
    const body = el('div', { class: 'ds-step-body' });
    body.innerHTML = step.body || '';
    card.appendChild(body);
    stepEl.appendChild(card);
    stepsCol.appendChild(stepEl);
  });
  sec.appendChild(stepsCol);

  // Schedule chart wiring after the section is inserted into the DOM.
  // The render() caller appends `sec` to root immediately after this returns,
  // so a microtask is enough to ensure the chartHost is reachable.
  Promise.resolve().then(() => wireDataScrolly(block.id, d));
  return sec;
}

// One observer per DataScrolly. Steps fire as they cross the trigger band.
// On step change, we re-embed the chart with the new vizState.
async function wireDataScrolly(blockId, d) {
  try {
    await ensureVegaLoaded();
  } catch (err) {
    console.error('Vega failed to load:', err);
    const host = document.getElementById('ds-chart-' + blockId);
    if (host) host.innerHTML = '<div class="ds-chart-error">Chart libraries failed to load. Refresh to try again.</div>';
    return;
  }
  const host = document.getElementById('ds-chart-' + blockId);
  if (!host) return;
  const steps = Array.from(document.querySelectorAll('.ds-step[data-ds-id="' + blockId + '"]'));
  if (!steps.length) return;

  let currentIdx = -1;

  async function showStep(idx) {
    if (idx === currentIdx) return;
    currentIdx = idx;
    const step = (d.steps || [])[idx];
    const vizState = step ? (step.vizState || {}) : {};
    const spec = buildVegaLiteSpec(d.chartSpec || {}, vizState);
    try {
      await window.vegaEmbed(host, spec, { renderer: 'svg', actions: false });
    } catch (err) {
      console.error('vegaEmbed failed:', err);
      host.innerHTML = '<div class="ds-chart-error">Chart render failed: ' + (err.message || err) + '</div>';
    }
  }

  // Initial render = first step's vizState
  await showStep(0);

  const obs = new IntersectionObserver((entries) => {
    // Pick the entry closest to the trigger band's center that is intersecting
    const intersecting = entries.filter(e => e.isIntersecting);
    if (!intersecting.length) return;
    // Sort by data-ds-idx descending — most-recently-entered step wins
    intersecting.sort((a, b) => Number(b.target.dataset.dsIdx) - Number(a.target.dataset.dsIdx));
    const idx = Number(intersecting[0].target.dataset.dsIdx);
    if (!Number.isNaN(idx)) {
      showStep(idx);
      // Active class for opacity transition
      steps.forEach(s => s.classList.toggle('is-active', Number(s.dataset.dsIdx) === idx));
    }
  }, { rootMargin: '-40% 0px -55% 0px' });

  steps.forEach(s => obs.observe(s));
}

function renderChapterDivider(d) {
  const sec = el('section', { class: 'chapter-divider', 'aria-label': 'Chapter break' });
  if (d.number) sec.appendChild(el('div', { class: 'chapter-number' }, d.number));
  if (d.title) {
    const h = el('h2', { class: 'chapter-title' });
    h.innerHTML = d.title;
    sec.appendChild(h);
  }
  if (d.subtitle) sec.appendChild(el('div', { class: 'chapter-subtitle' }, d.subtitle));
  // Decorative gradient strip below the heading
  sec.appendChild(el('div', { class: 'chapter-strip', 'aria-hidden': 'true' }));
  return sec;
}

function renderQuote(d) {
  const sec = el('section', { class: 'quote-block' });
  const fig = el('figure', { class: 'quote-figure' });
  const bq = el('blockquote', { class: 'quote-text' });
  // Decorative open-quote glyph
  const openMark = el('span', { class: 'quote-mark', 'aria-hidden': 'true' }, '“');
  bq.appendChild(openMark);
  const span = el('span', { class: 'quote-body' });
  span.innerHTML = d.text || '';
  bq.appendChild(span);
  fig.appendChild(bq);

  const cap = el('figcaption', { class: 'quote-cap' });
  if (d.portraitSrc) {
    cap.appendChild(el('img', { class: 'quote-portrait', src: d.portraitSrc, alt: d.attribution || '' }));
  }
  const ttext = el('div', { class: 'quote-attr-wrap' });
  if (d.attribution) ttext.appendChild(el('div', { class: 'quote-attr' }, d.attribution));
  if (d.role)        ttext.appendChild(el('div', { class: 'quote-role' }, d.role));
  if (d.sourceUrl)   {
    const a = el('a', { class: 'quote-source', href: d.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, d.sourceLabel || 'Source');
    ttext.appendChild(a);
  }
  cap.appendChild(ttext);
  fig.appendChild(cap);
  sec.appendChild(fig);
  return sec;
}

// Parse YouTube / Vimeo share URLs into an embed URL.
// Returns { src, kind } or null if unsupported.
function parseVideoUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const url = raw.trim();
  // YouTube: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
          url.match(/youtube\.com\/watch\?(?:[^"]*[&?])?v=([A-Za-z0-9_-]{6,})/) ||
          url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, kind: 'youtube' };
  // Vimeo: vimeo.com/<id>, player.vimeo.com/video/<id>
  m = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/) ||
      url.match(/player\.vimeo\.com\/video\/(\d{5,})/);
  if (m) return { src: `https://player.vimeo.com/video/${m[1]}`, kind: 'vimeo' };
  return null;
}

function renderVideoEmbed(d) {
  const sec = el('section', { class: 'video-embed' });
  const fig = el('figure', { class: 'video-figure' });
  const parsed = parseVideoUrl(d.url);
  if (parsed) {
    const wrap = el('div', { class: 'video-wrap' });
    const iframe = el('iframe', {
      class: 'video-iframe',
      src: parsed.src,
      title: d.caption || 'Embedded video',
      loading: 'lazy',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: 'true',
      referrerpolicy: 'strict-origin-when-cross-origin',
      frameborder: '0',
    });
    wrap.appendChild(iframe);
    fig.appendChild(wrap);
  } else {
    // Unsupported / empty URL → render a clear placeholder + clickable link if URL present
    const ph = el('div', { class: 'video-placeholder' });
    ph.appendChild(el('div', { class: 'video-placeholder-icon', 'aria-hidden': 'true' }, '▶'));
    const msg = el('div', { class: 'video-placeholder-msg' },
      d.url ? 'Unsupported video URL. Only YouTube and Vimeo are supported.' : 'No video URL set.');
    ph.appendChild(msg);
    if (d.url) {
      ph.appendChild(el('a', { class: 'video-placeholder-link', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.url));
    }
    fig.appendChild(ph);
  }
  if (d.caption || d.credit) {
    const cap = el('figcaption', { class: 'video-cap' });
    if (d.caption) cap.appendChild(el('span', { class: 'video-caption' }, d.caption));
    if (d.credit) cap.appendChild(el('span', { class: 'video-credit' }, d.credit));
    fig.appendChild(cap);
  }
  sec.appendChild(fig);
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
