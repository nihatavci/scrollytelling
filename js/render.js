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

// ─────────────────────────── D3 Chart Engine ──────────────────────────
// DataScrolly charts are powered by a custom D3 engine (js/ds-chart.js)
// that supports fluid animated transitions between chart types (bar, line,
// area, scatter, grouped-bar) with morphing, highlights, and annotations.
// D3 v7 is already loaded globally via vendor/d3.min.js.

let _dsChartModule = null;

function loadDSChart() {
  if (_dsChartModule) return _dsChartModule;
  // Resolve the module path relative to the page, not the script
  const base = document.querySelector('base')?.href || '';
  const modulePath = base ? `${base}js/ds-chart.js` : '/js/ds-chart.js';
  _dsChartModule = import(modulePath);
  return _dsChartModule;
}

let _leafletReady = null;

function loadLeaflet() {
  if (_leafletReady) return _leafletReady;
  _leafletReady = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.crossOrigin = '';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
  return _leafletReady;
}

// CSS for components introduced after the original site. Injected once on first render
// so every page that uses render.js automatically picks up the new component styles.
const COMPONENT_CSS = `
/* ── Spacing Scale ──
 * Block gap (between top-level blocks): 4.5rem (72px) desktop, 3rem mobile
 * Inner padding: 2rem desktop, 1.25rem tablet, 1rem phone
 * Section max-width: 720px editorial, 1100px wide (StatRow), 1400px full (DataScrolly)
 * All blocks: position:relative; z-index:3; background:var(--canvas)
 */

/* ── Page background image ── */
#page-bg{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .8s ease}
#page-bg-img{width:100%;height:100%;object-fit:cover}
#page-root{position:relative;z-index:1}

/* ── DropCap ── */
.editorial p.has-dropcap::first-letter{float:left;font-family:var(--font-display);font-size:4.5rem;line-height:.95;padding:.3rem .6rem .1rem 0;color:var(--ink-black);font-weight:300;letter-spacing:-.04em}

/* ── Inline Callout (inside Editorial) ── */
.callout{border-left:3px solid var(--ink-black);background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:0 10px 10px 0;padding:1rem 1.25rem;margin:1.8rem 0;font-family:var(--font-body);color:var(--ink-black);font-size:.95rem;line-height:1.55;box-shadow:var(--shadow-card)}
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
.timeline-block{max-width:720px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3;background:var(--canvas)}
.timeline-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2rem;letter-spacing:-.03em;color:var(--ink-black)}
.timeline-list{position:relative;padding-left:1.8rem}
.timeline-list::before{content:'';position:absolute;left:6px;top:8px;bottom:8px;width:1px;background:var(--steel)}
.timeline-event{position:relative;margin-bottom:1.8rem}
.timeline-event::before{content:'';position:absolute;left:-1.8rem;top:.55rem;width:13px;height:13px;border-radius:50%;background:var(--ink-black);box-shadow:0 0 0 3px var(--canvas)}
.timeline-when{font-family:var(--font-body);font-size:.72rem;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--graphite);margin-bottom:.3rem}
.timeline-title{font-family:var(--font-display);font-size:1.25rem;font-weight:500;line-height:1.25;margin-bottom:.4rem;color:var(--ink-black);letter-spacing:-.015em}
.timeline-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--graphite);font-weight:400}

/* ── StatRow block ── */
.statrow-block{max-width:1100px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3;background:var(--canvas)}
.statrow-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2.4rem;letter-spacing:-.03em;text-align:center;color:var(--ink-black)}
.statrow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2rem;text-align:center}
@media(min-width:820px){.statrow-grid{grid-template-columns:repeat(3,1fr)}}
.statrow-cell{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.8rem 1.4rem;box-shadow:var(--shadow-card)}
.statrow-cell .v{font-family:var(--font-display);font-size:clamp(2.4rem,5vw,3.5rem);font-weight:300;color:var(--ink-black);line-height:1.05;letter-spacing:-.04em;background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.statrow-cell .l{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);margin-top:.7rem;font-weight:500;letter-spacing:.01em}
.statrow-cell .c{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.3rem;font-style:normal;font-weight:400}

/* ── Aside block ── */
.aside-block{max-width:720px;margin:4.5rem auto;padding:1.6rem 1.8rem;border-radius:var(--radius-card);background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-left:3px solid var(--ink-black);font-family:var(--font-body);position:relative;z-index:3;box-shadow:var(--shadow-card)}
.aside-block.tone-note{border-left-color:var(--signal-blue)}
.aside-block.tone-warning{border-left-color:var(--spectrum-red)}
.aside-block h3{font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.5rem;color:var(--ink-black);letter-spacing:-.01em}
.aside-block p{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);margin-bottom:.7rem;font-weight:400}
.aside-block p:last-child{margin-bottom:0}

/* ── ChapterDivider ── */
.chapter-divider{max-width:720px;margin:5.5rem auto 2rem;padding:0 2rem;text-align:center;position:relative;z-index:3}
.chapter-number{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--graphite);text-transform:uppercase;letter-spacing:.2em;margin-bottom:1rem}
.chapter-title{font-family:var(--font-display);font-size:clamp(1.8rem,4vw,2.75rem);font-weight:300;color:var(--ink-black);line-height:1.18;letter-spacing:-.04em;margin-bottom:.6rem}
.chapter-subtitle{font-family:var(--font-body);font-size:1.0625rem;color:var(--graphite);font-weight:400;line-height:1.5;max-width:560px;margin:0 auto 1.6rem}
.chapter-strip{width:120px;height:2px;background:var(--spectrum-gradient);margin:0 auto;border-radius:2px}
/* ── ChapterDivider fullscreen hero variant ── */
.chapter-divider.chapter-hero{max-width:none;min-height:100vh;min-height:100dvh;margin:0;padding:0 2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
.chapter-hero .chapter-title{font-size:clamp(2.8rem,7vw,5.5rem);margin-bottom:1rem;max-width:900px}
.chapter-hero .chapter-subtitle{font-size:clamp(1.05rem,1.8vw,1.35rem);max-width:680px;margin-bottom:2.5rem}
.chapter-hero .chapter-number{font-size:.9rem;letter-spacing:.25em;margin-bottom:1.8rem}
.chapter-hero .chapter-strip{width:180px;height:3px}
.chapter-hero .chapter-scroll-cue{position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:.6rem;font-family:var(--font-body);font-size:.78rem;color:var(--graphite);letter-spacing:.1em;text-transform:uppercase;animation:cue-bob 2s ease-in-out infinite}
.chapter-hero .chapter-scroll-cue .cue-arrow{width:1px;height:28px;background:var(--graphite);position:relative}
.chapter-hero .chapter-scroll-cue .cue-arrow::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:8px;height:8px;border-right:1px solid var(--graphite);border-bottom:1px solid var(--graphite);transform:translateX(-50%) rotate(45deg)}
@keyframes cue-bob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(8px)}}

/* ── Quote (featured) ── */
.quote-block{max-width:860px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
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
.video-embed{max-width:1000px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
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
.endnotes{max-width:720px;margin:4.5rem auto;padding:2rem;background:var(--canvas);border-top:1px solid var(--fog);position:relative;z-index:3}
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

/* ── Badge (base) ── */
.badge{display:inline-block;font-family:var(--font-body);font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:.3rem .75rem;border-radius:var(--radius-pill,100px);line-height:1.2;white-space:nowrap;vertical-align:middle}

/* ── Scrolly (sticky image left, text cards right) ── */
/* All sizes driven by --scrolly-img-w and --scrolly-img-h custom props set by renderer */
.scrolly{display:grid;grid-template-columns:var(--scrolly-img-w,1fr) 10px var(--scrolly-card-w,minmax(400px,560px));gap:0;max-width:var(--scrolly-max-w,1400px);margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
/* top: centers sticky panel vertically when imageHeight < 100vh */
.scrolly__sticky{position:sticky;top:max(0px,calc(50vh - var(--scrolly-img-h,100vh) / 2));height:var(--scrolly-img-h,100vh);display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:var(--scrolly-img-radius,0)}
.scrolly__images{position:relative;width:100%;height:100%}
.scrolly__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease;border-radius:var(--scrolly-img-radius,0)}
.scrolly__img.active{opacity:1}
.scrolly__img-ph{display:flex;align-items:center;justify-content:center;background:var(--fog,#f0f0f0);color:var(--graphite,#666)}
.scrolly__ph-label{font-family:var(--font-display);font-size:clamp(1.2rem,3vw,2rem);font-weight:300;letter-spacing:-.02em;opacity:.4;text-align:center;padding:2rem}
/* ── Drag-to-resize handle ── */
.scrolly__resize-handle{position:sticky;top:max(0px,calc(50vh - var(--scrolly-img-h,100vh) / 2));height:var(--scrolly-img-h,100vh);cursor:col-resize;display:flex;align-items:center;justify-content:center;z-index:4;-webkit-user-select:none;user-select:none;touch-action:none}
.scrolly__resize-grip{width:3px;height:44px;background:rgba(128,128,128,.18);border-radius:3px;transition:background .2s,height .2s,width .2s}
.scrolly__resize-handle:hover .scrolly__resize-grip,.scrolly__resize-handle.dragging .scrolly__resize-grip{background:rgba(128,128,128,.48);height:64px;width:4px}
/* ── Snap guide lines (visible during drag) ── */
.scrolly__guides{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s;z-index:10;overflow:hidden}
.scrolly__guides.active{opacity:1}
.scrolly__guide{position:absolute;top:0;bottom:0;width:1px;transform:translateX(-50%);background:rgba(99,102,241,.22)}
.scrolly__guide--major{background:rgba(99,102,241,.4)}
.scrolly__guide-label{position:absolute;top:18px;left:6px;font-size:9px;font-weight:700;color:rgba(99,102,241,.75);font-family:monospace;letter-spacing:.06em;background:rgba(255,255,255,.88);padding:2px 6px;border-radius:3px;white-space:nowrap}
.scrolly__guide.snapped{background:rgba(99,102,241,.9)!important;width:2px}
.scrolly__guide.snapped .scrolly__guide-label{background:rgba(99,102,241,1);color:#fff}
.scrolly__steps{padding:30vh 0;display:flex;flex-direction:column}
.step{min-height:100vh;display:flex;align-items:center;padding:1.5rem 0 1.5rem 2rem}
.step:first-child{padding-top:10vh}.step:last-child{margin-bottom:30vh}
.sc{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.6rem 1.8rem;border:none;max-width:560px;width:100%;box-shadow:var(--shadow-card);opacity:.35;transition:opacity .4s,box-shadow .4s,transform .4s;transform:translateY(8px)}
.step.is-active .sc{opacity:1;box-shadow:rgba(0,0,0,.15) 0 4px 24px;transform:translateY(0)}
.step-body{font-family:var(--font-body);font-size:1rem;line-height:1.6;font-weight:400}
.step-body img{display:none}
.step-heading{font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.4rem}
/* Scrolly without images: full-width text cards, no sticky */
.scrolly--no-images{display:block;max-width:720px}
.scrolly--no-images .scrolly__sticky{display:none}
.scrolly--no-images .scrolly__resize-handle{display:none}
.scrolly--no-images .step{padding-left:0;min-height:auto;padding:2rem 0}
.scrolly--no-images .sc{max-width:100%;opacity:1;transform:none}
@media(max-width:900px){
  .scrolly{display:block;padding:0;margin:3rem auto}
  .scrolly__sticky{position:sticky;top:0;height:100vh;z-index:1;border-radius:0}
  .scrolly__resize-handle{display:none}
  .scrolly__steps{position:relative;z-index:2;margin-top:-100vh;pointer-events:none}
  .step{padding:0 1rem;min-height:90vh;display:flex;align-items:flex-end;padding-bottom:2.5rem}
  .step:first-child{min-height:100vh;padding-top:55vh}
  .step:last-child{margin-bottom:15vh}
  .sc{max-width:100%;pointer-events:auto;border-radius:10px;padding:1.2rem 1.4rem}
}
@media(max-width:600px){
  .scrolly__sticky{height:100vh}
  .step{min-height:85vh;padding-bottom:2rem}
  .sc{padding:1rem 1.2rem}
  .step-body{font-size:.92rem}
}

/* ── DataScrolly ── */
.data-scrolly{display:grid;grid-template-columns:1fr 420px;gap:4vw;max-width:1400px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.ds-graphic{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:1.5rem 0}
.ds-chart-title{font-family:var(--font-display);font-size:clamp(1.3rem,2.2vw,1.6rem);font-weight:500;color:var(--ink-black);letter-spacing:-.02em;line-height:1.25}
.ds-chart-sub{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.3rem;line-height:1.45;margin-bottom:1rem}
.ds-chart{width:100%;max-width:760px;min-height:380px;position:relative;overflow:visible}
.ds-chart svg{width:100%!important;height:auto!important;display:block;overflow:visible}
.ds-chart-error{font-family:var(--font-body);font-size:.85rem;color:var(--spectrum-red);padding:1rem;background:rgba(250,61,29,.05);border-radius:8px}
.ds-chart-source{font-family:var(--font-body);font-size:.7rem;color:var(--ash);margin-top:1rem;font-style:normal}
.ds-steps{padding:30vh 0;display:flex;flex-direction:column}
.ds-step{min-height:85vh;display:flex;align-items:center;padding:1.5rem 0}
.ds-step:first-child{padding-top:8vh}.ds-step:last-child{margin-bottom:20vh}
.ds-step-card{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.6rem 1.8rem 1.6rem;border:none;max-width:420px;box-shadow:var(--shadow-card);opacity:.4;transition:opacity .3s,box-shadow .3s}
.ds-step.is-active .ds-step-card{opacity:1;box-shadow:rgba(0,0,0,.12) 0 0 16px 0}
.ds-step-badge{display:inline-block;margin-bottom:.75rem}
.ds-step-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);font-weight:400}

@media(max-width:900px){
  .timeline-block,.statrow-block{padding:0 1.25rem;margin:3rem auto}
  .aside-block{margin:3rem 1.25rem}
  .chapter-divider{margin:4rem auto 1.5rem;padding:0 1.25rem}
  .quote-block{margin:3rem auto;padding:0 1.25rem}
  .quote-portrait{width:48px;height:48px}
  .video-embed{margin:3rem auto;padding:0 1.25rem}
  .data-scrolly{display:block;padding:0;margin:3rem auto}
  .ds-graphic{position:sticky;top:0;height:100vh;z-index:1;padding:2rem 1.25rem;align-items:center;justify-content:center;background:var(--bg,#f8f8f8)}
  .ds-chart{max-width:100%;min-height:280px}
  .ds-steps{position:relative;z-index:2;margin-top:-100vh;pointer-events:none}
  .ds-step{min-height:80vh;padding:0 1rem;display:flex;align-items:flex-end;padding-bottom:2.5rem}
  .ds-step:first-child{min-height:100vh;padding-top:55vh}
  .ds-step:last-child{margin-bottom:15vh}
  .ds-step-card{opacity:.4;max-width:100%;padding:1.2rem 1.4rem;pointer-events:auto}
  .ds-step.is-active .ds-step-card{opacity:1}
  .ds-step-badge{margin-bottom:.5rem}
}
@media(max-width:600px){
  .data-scrolly{margin:2rem auto}
  .ds-graphic{padding:1.5rem 1rem}
  .ds-chart{min-height:220px}
  .ds-step{min-height:70vh;padding:0 .75rem}
  .ds-step-card{padding:1rem 1.2rem}
  .ds-step-body{font-size:.92rem}
  .badge{font-size:.65rem;padding:.25rem .6rem}
  .ds-chart-title{font-size:1.15rem}
  .ds-chart-sub{font-size:.8rem}
  .timeline-block,.statrow-block{margin:2rem auto;padding:0 1rem}
  .aside-block{margin:2rem 1rem}
  .chapter-divider{margin:3rem auto 1rem;padding:0 1rem}
  .quote-block{margin:2rem auto;padding:0 1rem}
  .video-embed{margin:2rem auto;padding:0 1rem}
}

/* ── ImageCompare (before/after slider) ── */
.imgcompare{max-width:1000px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.imgcompare-container{position:relative;overflow:hidden;border-radius:var(--radius-image);box-shadow:var(--shadow-card);cursor:ew-resize;-webkit-user-select:none;user-select:none;touch-action:pan-y}
.imgcompare-before,.imgcompare-after{display:block;width:100%;vertical-align:middle}
.imgcompare-before{position:absolute;inset:0;object-fit:cover;width:100%;height:100%;clip-path:inset(0 50% 0 0)}
.imgcompare-after{display:block;width:100%;object-fit:cover}
.imgcompare-divider{position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;transform:translateX(-50%);pointer-events:none;z-index:2;box-shadow:0 0 6px rgba(0,0,0,.35)}
.imgcompare-handle{position:absolute;top:50%;left:50%;width:44px;height:44px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(255,255,255,.95);box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:3;pointer-events:none}
.imgcompare-handle::before{content:'◂ ▸';font-size:11px;letter-spacing:2px;color:#333;font-weight:600}
.imgcompare-label{position:absolute;bottom:.8rem;padding:.35rem .7rem;font-family:var(--font-body);font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:var(--radius-pill);z-index:2;pointer-events:none}
.imgcompare-label.label-before{left:.8rem}
.imgcompare-label.label-after{right:.8rem}
.imgcompare-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;line-height:1.5;font-weight:400}
.imgcompare-credit{font-size:.78rem;color:var(--ash);font-style:italic;margin-top:.2rem}
@media(max-width:900px){.imgcompare{margin:3rem auto;padding:0 1.25rem}}
@media(max-width:600px){.imgcompare{margin:2rem auto;padding:0 1rem}.imgcompare-handle{width:36px;height:36px}}

/* ── ImageHotspot (annotated image) ── */
.imghotspot{max-width:1000px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.imghotspot-wrap{position:relative;display:inline-block;width:100%;border-radius:var(--radius-image);overflow:hidden;box-shadow:var(--shadow-card)}
.imghotspot-wrap>img{display:block;width:100%;border-radius:var(--radius-image)}
.imghotspot-marker{position:absolute;width:32px;height:32px;transform:translate(-50%,-50%);border-radius:50%;background:var(--ink-black);color:var(--canvas);font-family:var(--font-body);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:3;border:2px solid var(--canvas);box-shadow:0 2px 8px rgba(0,0,0,.3);transition:transform .2s,box-shadow .2s}
.imghotspot-marker:hover,.imghotspot-marker.is-active{transform:translate(-50%,-50%) scale(1.15);box-shadow:0 4px 16px rgba(0,0,0,.35)}
.imghotspot-marker.style-pulse::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--ink-black);animation:hs-pulse 2s ease-out infinite;opacity:0}
@keyframes hs-pulse{0%{transform:scale(.8);opacity:.6}100%{transform:scale(1.8);opacity:0}}
.imghotspot-tooltip{position:absolute;z-index:4;background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1rem 1.2rem;box-shadow:0 8px 32px rgba(0,0,0,.18);max-width:280px;font-family:var(--font-body);opacity:0;pointer-events:none;transition:opacity .2s;border:1px solid rgba(128,128,128,.1)}
.imghotspot-tooltip.is-visible{opacity:1;pointer-events:auto}
.imghotspot-tooltip-title{font-weight:600;font-size:.95rem;color:var(--ink-black);margin-bottom:.3rem;letter-spacing:-.005em}
.imghotspot-tooltip-body{font-size:.88rem;color:var(--graphite);line-height:1.5;font-weight:400}
.imghotspot-tooltip-close{position:absolute;top:.5rem;right:.6rem;background:none;border:none;color:var(--ash);cursor:pointer;font-size:14px;padding:2px}
.imghotspot-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;line-height:1.5}
.imghotspot-credit{font-size:.78rem;color:var(--ash);font-style:italic;margin-top:.2rem}
@media(max-width:900px){.imghotspot{margin:3rem auto;padding:0 1.25rem}.imghotspot-marker{width:28px;height:28px;font-size:11px}}
@media(max-width:600px){.imghotspot{margin:2rem auto;padding:0 1rem}.imghotspot-tooltip{position:fixed!important;bottom:0!important;left:0!important;right:0!important;top:auto!important;max-width:100%;border-radius:16px 16px 0 0;padding:1.4rem;transform:none!important}}

/* ── AccordionBlock ── */
.accordion-block{max-width:720px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.accordion-block h3{font-family:var(--font-display);font-size:clamp(1.3rem,2.5vw,1.6rem);font-weight:300;margin-bottom:1.2rem;letter-spacing:-.02em;color:var(--ink-black)}
.accordion-list{border-top:1px solid var(--fog)}
.accordion-item{border-bottom:1px solid var(--fog)}
.accordion-trigger{width:100%;background:none;border:none;padding:1rem 0;display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer;text-align:left;font-family:var(--font-display);font-size:1.08rem;font-weight:500;color:var(--ink-black);letter-spacing:-.01em;line-height:1.35;transition:color .2s}
.accordion-trigger:hover{color:var(--graphite)}
.accordion-chevron{flex-shrink:0;width:20px;height:20px;transition:transform .3s ease;color:var(--ash)}
.accordion-chevron svg{display:block}
.accordion-item.is-open .accordion-chevron{transform:rotate(180deg)}
.accordion-panel{overflow:hidden;max-height:0;transition:max-height .35s ease}
.accordion-item.is-open .accordion-panel{max-height:2000px}
.accordion-panel-inner{padding:0 0 1.2rem;font-family:var(--font-body);font-size:1rem;line-height:1.6;color:var(--graphite);font-weight:400}
.accordion-panel-inner p{margin-bottom:.8rem}
.accordion-panel-inner p:last-child{margin-bottom:0}
@media(max-width:900px){.accordion-block{margin:3rem auto;padding:0 1.25rem}}
@media(max-width:600px){.accordion-block{margin:2rem auto;padding:0 1rem}}

/* ── ProgressNav (reading progress bar) ── */
.progress-nav{position:fixed;top:0;left:0;right:0;z-index:999;pointer-events:none}
.progress-nav-bar{height:3px;background:var(--spectrum-gradient,linear-gradient(90deg,var(--ink-black),var(--graphite)));width:0%;transition:width .15s linear}
.progress-nav-dots{position:fixed;right:1rem;top:50%;transform:translateY(-50%);z-index:998;display:flex;flex-direction:column;gap:1.2rem;pointer-events:auto}
.progress-nav-dot{width:10px;height:10px;border-radius:50%;background:var(--pebble);cursor:pointer;transition:background .2s,transform .2s;border:none;padding:0}
.progress-nav-dot.is-active{background:var(--ink-black);transform:scale(1.3)}
.progress-nav-dot:hover{background:var(--graphite)}
.progress-nav-label{position:absolute;right:20px;top:50%;transform:translateY(-50%);background:var(--card);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:.3rem .7rem;border-radius:var(--radius-pill);font-family:var(--font-body);font-size:.72rem;font-weight:500;color:var(--ink-black);white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s;box-shadow:var(--shadow-card)}
.progress-nav-dot:hover .progress-nav-label{opacity:1}
@media(max-width:900px){.progress-nav-dots{display:none}}

/* ── EmbedBlock (third-party embed) ── */
.embed-block{max-width:1000px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.embed-container{position:relative;width:100%;border-radius:var(--radius-card);overflow:hidden;background:var(--fog)}
.embed-container.ar-16-9{aspect-ratio:16/9}
.embed-container.ar-4-3{aspect-ratio:4/3}
.embed-container.ar-1-1{aspect-ratio:1/1}
.embed-container.ar-auto{min-height:300px}
.embed-container iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.embed-container.ar-auto iframe{position:relative;min-height:400px}
.embed-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;line-height:1.5;font-weight:400}
@media(max-width:900px){.embed-block{margin:3rem auto;padding:0 1.25rem}}
@media(max-width:600px){.embed-block{margin:2rem auto;padding:0 1rem}.embed-container.ar-auto iframe{min-height:300px}}

/* ── ImageGrid (named layout presets) ── */
.ig{position:relative;z-index:3;margin:4.5rem auto;max-width:1100px;padding:0 2rem}
.ig-title{font-family:var(--font-display);font-size:clamp(1.3rem,2.5vw,1.8rem);font-weight:300;color:var(--ink-black);letter-spacing:-.03em;margin-bottom:1.2rem;text-align:center}
.ig-grid{display:grid;gap:8px}
/* ── Named layout presets ── */
.ig-grid.ig-side-by-side{grid-template-columns:1fr 1fr}
.ig-grid.ig-feature-left{grid-template-columns:3fr 2fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-feature-left .ig-cell:first-child{grid-row:1/3}
.ig-grid.ig-feature-right{grid-template-columns:2fr 3fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-feature-right .ig-cell:nth-child(1){grid-column:1;grid-row:1}
.ig-grid.ig-feature-right .ig-cell:nth-child(2){grid-column:1;grid-row:2}
.ig-grid.ig-feature-right .ig-cell:nth-child(3){grid-column:2;grid-row:1/3}
.ig-grid.ig-triptych{grid-template-columns:1fr 1fr 1fr}
.ig-grid.ig-quad{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-hero-grid{grid-template-columns:1fr;grid-template-rows:auto auto}
.ig-grid.ig-hero-grid .ig-cell:first-child{grid-column:1/-1}
.ig-grid.ig-hero-grid-row{display:grid;grid-template-columns:repeat(var(--ig-hero-cols,3),1fr);gap:8px}
.ig-grid.ig-mosaic{display:block;columns:3;column-gap:8px}
.ig-grid.ig-mosaic .ig-cell{break-inside:avoid;margin-bottom:8px}
.ig-grid.ig-filmstrip{grid-template-columns:repeat(var(--ig-film-count,4),minmax(260px,1fr));grid-template-rows:1fr;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.ig-grid.ig-filmstrip .ig-cell{scroll-snap-align:start}
/* Auto-detect fallbacks by image count */
.ig-grid.ig-auto-1{grid-template-columns:1fr}
.ig-grid.ig-auto-2{grid-template-columns:1fr 1fr}
.ig-grid.ig-auto-3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-auto-3 .ig-cell:first-child{grid-row:1/3}
.ig-grid.ig-auto-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-auto-many{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
/* ── Cell ── */
.ig-cell{position:relative;overflow:hidden;border-radius:10px;background:var(--fog);min-height:0;display:flex;flex-direction:column}
.ig-cell-media{position:relative;overflow:hidden;flex:1 1 auto;min-height:0}
.ig-cell-media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s cubic-bezier(.25,.46,.45,.94)}
.ig-cell:hover .ig-cell-media img{transform:scale(1.03)}
/* Aspect ratios for grid cells (not filmstrip/mosaic) */
.ig-grid:not(.ig-mosaic):not(.ig-filmstrip) .ig-cell-media{aspect-ratio:4/3}
.ig-grid.ig-auto-1 .ig-cell-media,.ig-grid.ig-hero-grid .ig-cell:first-child .ig-cell-media{aspect-ratio:16/9}
.ig-grid.ig-feature-left .ig-cell:first-child .ig-cell-media,.ig-grid.ig-feature-right .ig-cell:nth-child(3) .ig-cell-media,.ig-grid.ig-auto-3 .ig-cell:first-child .ig-cell-media{aspect-ratio:auto;height:100%}
.ig-grid.ig-filmstrip .ig-cell-media{aspect-ratio:3/4}
/* ── Per-image caption & credit (always visible below image) ── */
.ig-cell-cap{font-family:var(--font-body);font-size:.8rem;color:var(--ink-black,.15,.15,.15);line-height:1.4;padding:.55rem .65rem .15rem;font-weight:400}
.ig-cell-credit{font-family:var(--font-body);font-size:.7rem;color:var(--ash,#888);font-style:italic;padding:0 .65rem .45rem;line-height:1.35;letter-spacing:.01em}
.ig-cell-desc{font-family:var(--font-body);font-size:.75rem;color:var(--graphite,#666);line-height:1.45;padding:.15rem .65rem .5rem}
/* ── Overall caption & credit ── */
.ig-caption{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.9rem;line-height:1.5;font-weight:400;text-align:center;padding:0 2rem}
.ig-credit{font-family:var(--font-body);font-size:.72rem;color:var(--ash);margin-top:.35rem;text-align:center;letter-spacing:.02em;font-style:italic}
/* Broken / placeholder */
.ig-cell-broken{display:flex;align-items:center;justify-content:center}
.ig-cell-ph{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);opacity:.5;text-align:center;padding:1.5rem}
/* ── Responsive: tablet ── */
@media(max-width:900px){
  .ig{margin:3rem auto;padding:0 1.25rem}
  .ig-grid.ig-feature-left,.ig-grid.ig-feature-right{grid-template-columns:1fr 1fr;grid-template-rows:auto}
  .ig-grid.ig-feature-left .ig-cell:first-child,.ig-grid.ig-feature-right .ig-cell:nth-child(3){grid-row:auto;grid-column:1/-1}
  .ig-grid.ig-feature-right .ig-cell:nth-child(1){grid-column:auto;grid-row:auto}
  .ig-grid.ig-feature-right .ig-cell:nth-child(2){grid-column:auto;grid-row:auto}
  .ig-grid.ig-mosaic{columns:2}
}
/* ── Responsive: mobile — single column stack ── */
@media(max-width:600px){
  .ig{margin:2rem auto;padding:0 1rem}
  .ig-grid{gap:6px}
  .ig-grid.ig-side-by-side,.ig-grid.ig-triptych,.ig-grid.ig-quad,.ig-grid.ig-auto-2,.ig-grid.ig-auto-3,.ig-grid.ig-auto-4,.ig-grid.ig-auto-many{grid-template-columns:1fr}
  .ig-grid.ig-feature-left,.ig-grid.ig-feature-right{grid-template-columns:1fr;grid-template-rows:auto}
  .ig-grid.ig-feature-left .ig-cell:first-child,.ig-grid.ig-feature-right .ig-cell:nth-child(3){grid-row:auto;grid-column:auto}
  .ig-grid.ig-feature-right .ig-cell:nth-child(1),.ig-grid.ig-feature-right .ig-cell:nth-child(2){grid-column:auto;grid-row:auto}
  .ig-grid.ig-hero-grid-row{grid-template-columns:1fr}
  .ig-grid.ig-mosaic{columns:1}
  .ig-grid.ig-filmstrip{grid-template-columns:repeat(var(--ig-film-count,4),75vw)}
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
  .ig-cell--text-top{flex-direction:column-reverse!important}
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
.fullbleed{position:relative;z-index:2;width:100%;overflow:hidden;background:#000}
.fullbleed-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fullbleed video.fullbleed-media{object-fit:cover}
.fullbleed-scrim{position:absolute;inset:0;pointer-events:none}
.fullbleed-content{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:flex-end;padding:2rem;min-height:inherit;max-width:720px}
.fullbleed-content.pos-center{justify-content:center;align-items:center;text-align:center;margin:0 auto}
.fullbleed-content.pos-bottom-left{justify-content:flex-end;align-items:flex-start;padding-bottom:4rem}
.fullbleed-content.pos-bottom-right{justify-content:flex-end;align-items:flex-end;text-align:right;margin-left:auto;padding-bottom:4rem}
.fullbleed-title{font-family:var(--font-display);font-size:clamp(2.2rem,5vw,4rem);font-weight:300;color:#fff;line-height:1.1;letter-spacing:-.04em;margin-bottom:.6rem;text-shadow:0 2px 20px rgba(0,0,0,.4)}
.fullbleed-subtitle{font-family:var(--font-body);font-size:clamp(1rem,2vw,1.25rem);color:rgba(255,255,255,.88);line-height:1.5;font-weight:400;max-width:560px;text-shadow:0 1px 10px rgba(0,0,0,.3)}
.fullbleed-body{font-family:var(--font-body);font-size:1.0625rem;color:rgba(255,255,255,.82);line-height:1.6;margin-top:.8rem;max-width:560px;text-shadow:0 1px 8px rgba(0,0,0,.3)}
.fullbleed.h-100{min-height:100vh}
.fullbleed.h-75{min-height:75vh}
.fullbleed.h-50{min-height:50vh}
.fullbleed-media.slow-zoom{animation:fbZoom 28s ease-in-out infinite alternate;transform-origin:center center}
@keyframes fbZoom{0%{transform:scale(1)}100%{transform:scale(1.07)}}
.fullbleed-slides{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
.fullbleed-slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.5s ease;will-change:opacity}
.fullbleed-slide.is-active{opacity:1}
@media(max-width:900px){
  .fullbleed-content{padding:1.5rem 1.25rem}
  .fullbleed-content.pos-bottom-left,.fullbleed-content.pos-bottom-right{padding-bottom:3rem}
}
@media(max-width:600px){
  .fullbleed-content{padding:1.25rem 1rem}
  .fullbleed-title{font-size:clamp(1.8rem,7vw,2.5rem)}
}
/* ── Map2D scrollytelling block — always fullscreen viewport ── */
.map2d-scrolly{display:block;max-width:100%;padding:0;margin:0;position:relative;z-index:3}
.map2d-graphic{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;z-index:1}
.map2d-header{position:absolute;top:1rem;left:1rem;z-index:10;max-width:min(380px,calc(100% - 2rem));background:rgba(255,255,255,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.5);border-radius:10px;padding:.9rem 1.2rem;box-shadow:0 4px 24px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.04);pointer-events:none}
.map2d-graphic-title{font-family:var(--font-display);font-size:clamp(1rem,2vw,1.3rem);font-weight:700;color:var(--ink-black);letter-spacing:-.02em;line-height:1.2;margin:0}
.map2d-graphic-sub{font-family:var(--font-body);font-size:.8rem;color:var(--graphite);margin-top:.25rem;line-height:1.4}
.map2d-graphic-source{position:absolute;bottom:0;left:0;z-index:10;font-family:var(--font-body);font-size:.7rem;color:var(--steel);padding:.5rem 1rem;background:rgba(255,255,255,.6);backdrop-filter:blur(4px);border-radius:0 8px 0 0;pointer-events:none}
.map2d-map-host{position:absolute;inset:0;overflow:hidden}
/* Soft vignette — fades route lines at viewport edges instead of hard clip */
.map2d-map-host::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:600;background:radial-gradient(ellipse 80% 80% at 50% 50%,transparent 55%,rgba(255,255,255,.45) 100%)}
.map2d-scrolly[data-tile-dark] .map2d-map-host::after{background:radial-gradient(ellipse 80% 80% at 50% 50%,transparent 55%,rgba(20,20,24,.5) 100%)}
.map2d-map-host .leaflet-container{width:100%;height:100%;font-family:var(--font-body)}
.map2d-steps{position:relative;z-index:4;max-width:400px;margin-left:auto;margin-right:clamp(1rem,4vw,3rem)}
.map2d-step{min-height:100vh;display:flex;align-items:center;padding:1rem 0}
.map2d-step:first-child{padding-top:45vh}
.map2d-step:last-child{padding-bottom:45vh}
.map2d-step-card{background:rgba(255,255,255,.94);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.6);border-radius:12px;padding:1.4rem 1.6rem;box-shadow:0 4px 24px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);max-width:380px;opacity:.15;transform:translateY(16px);transition:opacity .6s cubic-bezier(.25,.1,.25,1),transform .6s cubic-bezier(.25,.1,.25,1),box-shadow .6s ease}
.map2d-step.is-active .map2d-step-card{opacity:1;transform:translateY(0);box-shadow:0 8px 40px rgba(0,0,0,.12),0 2px 4px rgba(0,0,0,.04)}
.map2d-step-card .badge{display:inline-block;font-size:.65rem;padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:.5rem}
.map2d-step-heading{font-family:var(--font-display);font-size:1.15rem;font-weight:600;color:var(--ink-black);line-height:1.25;letter-spacing:-.01em;margin-bottom:.35rem}
.map2d-step-body{font-family:var(--font-body);font-size:.92rem;line-height:1.65;color:var(--ink-black);font-weight:400}
.map2d-cap{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;line-height:1.5;font-weight:400;padding:0 2rem}
.map2d-credit{font-family:var(--font-body);font-size:.75rem;color:var(--steel);margin-top:.2rem;padding:0 2rem}
/* Hide all Leaflet chrome — zoom, attribution, etc. */
.map2d-scrolly .leaflet-control-zoom{display:none!important}
.map2d-scrolly .leaflet-control-attribution{display:none!important}
.map2d-scrolly .leaflet-control-layers{display:none!important}
/* Leaflet popup styling */
.map2d-scrolly .leaflet-popup-content-wrapper{border-radius:10px;font-family:var(--font-body);font-size:.9rem;box-shadow:0 6px 24px rgba(0,0,0,.14)}
.map2d-scrolly .leaflet-popup-content{margin:14px 18px;line-height:1.5}
.map2d-scrolly .leaflet-popup-tip{display:none}
/* Marker — refined dot + pulse ring on appear */
.map2d-marker-wrap{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .5s ease;pointer-events:auto}
.map2d-marker-wrap.is-hidden{transform:translate(-50%,-50%) scale(0);opacity:0}
.map2d-marker-wrap.is-visible{transform:translate(-50%,-50%) scale(1);opacity:1}
.map2d-marker{position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;color:#fff;font-weight:700;font-size:.72rem;font-family:var(--font-body);box-shadow:0 2px 8px rgba(0,0,0,.3),0 0 0 2.5px rgba(255,255,255,.8);border:2px solid #fff}
.map2d-marker-wrap.is-visible .map2d-marker::after{content:'';position:absolute;inset:-5px;border-radius:50%;border:2px solid currentColor;animation:map2dRing .9s cubic-bezier(.25,.1,.25,1) forwards}
@keyframes map2dRing{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.8);opacity:0}}
.map2d-marker-name{font-family:var(--font-body);font-size:.68rem;font-weight:600;color:var(--ink-black);white-space:nowrap;margin-top:5px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);box-shadow:0 1px 4px rgba(0,0,0,.1);letter-spacing:.01em}
/* Route lines — thin, confident, minimal */
.map2d-scrolly .leaflet-overlay-pane svg path.map2d-route{transition:stroke-dashoffset 2.5s cubic-bezier(.25,.1,.25,1),opacity .8s ease;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 2px rgba(0,0,0,.12))}
.map2d-route-label{background:rgba(255,255,255,.94);backdrop-filter:blur(10px);padding:4px 12px;border-radius:6px;font-family:var(--font-body);font-size:.7rem;font-weight:600;color:var(--ink-black);box-shadow:0 2px 8px rgba(0,0,0,.1);white-space:nowrap;pointer-events:none;transform:translate(-50%,-50%)}
/* Area polygon transitions */
.map2d-scrolly .leaflet-overlay-pane svg path.map2d-area{transition:fill-opacity .6s ease,stroke-opacity .6s ease}
/* layout-behind overrides — fixed instead of sticky */
.map2d-scrolly.layout-behind .map2d-graphic{position:fixed;top:0;left:0;right:0}
@media(max-width:900px){.map2d-steps{max-width:100%;margin-right:1rem;margin-left:1rem}.map2d-step{min-height:80vh}.map2d-step-card{max-width:100%}}
@media(max-width:600px){.map2d-step{min-height:70vh}.map2d-step:first-child{padding-top:30vh}.map2d-step:last-child{padding-bottom:30vh}.map2d-header{top:.5rem;left:.5rem;max-width:calc(100% - 1rem);padding:.7rem 1rem}.map2d-graphic-title{font-size:1rem}.map2d-graphic-sub{font-size:.75rem}}

/* ── FullscreenImage block ── */
.fsimg{position:relative;z-index:2;width:100%;min-height:100vh;overflow:hidden;background:#000;margin:0;padding:0}
.fsimg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fsimg-image.ken-burns{animation:kenBurns 20s ease-in-out infinite alternate}
@keyframes kenBurns{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.08) translate(-1%,-1%)}}
.fsimg-scrim{position:absolute;inset:0;pointer-events:none;z-index:1}
.fsimg-content{position:relative;z-index:2;display:flex;flex-direction:column;min-height:100vh;padding:2rem;max-width:720px;color:#fff}
.fsimg-content.pos-bottom-left{justify-content:flex-end;align-items:flex-start;padding-bottom:5rem}
.fsimg-content.pos-bottom-right{justify-content:flex-end;align-items:flex-end;text-align:right;margin-left:auto;padding-bottom:5rem}
.fsimg-content.pos-center{justify-content:center;align-items:center;text-align:center;margin:0 auto}
.fsimg-content.pos-top-left{justify-content:flex-start;align-items:flex-start;padding-top:5rem}
.fsimg-kicker{font-family:var(--font-body);font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.18em;color:rgba(255,255,255,.85);margin-bottom:.8rem;text-shadow:0 1px 6px rgba(0,0,0,.4)}
.fsimg-title{font-family:var(--font-display);font-size:clamp(2.4rem,6vw,4.5rem);font-weight:300;color:#fff;line-height:1.05;letter-spacing:-.04em;margin-bottom:.6rem;text-shadow:0 2px 24px rgba(0,0,0,.5)}
.fsimg-title span{color:var(--accent,#c06830)}
.fsimg-subtitle{font-family:var(--font-body);font-size:clamp(1rem,2vw,1.3rem);color:rgba(255,255,255,.9);line-height:1.45;font-weight:400;max-width:560px;text-shadow:0 1px 10px rgba(0,0,0,.3);margin-bottom:.5rem}
.fsimg-body{font-family:var(--font-body);font-size:1.0625rem;color:rgba(255,255,255,.82);line-height:1.6;max-width:560px;text-shadow:0 1px 8px rgba(0,0,0,.3);margin-top:.4rem}
.fsimg-meta{position:relative;z-index:3;max-width:720px;margin:0 auto;padding:.6rem 2rem 0}
.fsimg-caption{font-family:var(--font-body);font-size:.85rem;color:var(--graphite,#636363);line-height:1.5;font-style:italic}
.fsimg-credit{font-family:var(--font-body);font-size:.75rem;color:var(--steel,#8c8078);margin-top:.15rem}
.fsimg-scroll-cue{position:absolute;bottom:1.8rem;left:50%;transform:translateX(-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:.3rem;color:rgba(255,255,255,.7);font-family:var(--font-body);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}
.fsimg-scroll-cue .fsimg-chevron{width:20px;height:20px;border-right:2px solid rgba(255,255,255,.7);border-bottom:2px solid rgba(255,255,255,.7);transform:rotate(45deg);animation:fsimgBounce 2s ease-in-out infinite}
@keyframes fsimgBounce{0%,100%{transform:translateY(0) rotate(45deg)}50%{transform:translateY(6px) rotate(45deg)}}
@media(max-width:900px){.fsimg-content{padding:1.5rem 1.25rem}.fsimg-content.pos-bottom-left,.fsimg-content.pos-bottom-right{padding-bottom:4rem}.fsimg-content.pos-top-left{padding-top:4rem}}
@media(max-width:600px){.fsimg-content{padding:1.25rem 1rem}.fsimg-title{font-size:clamp(1.8rem,7vw,2.5rem)}.fsimg-meta{padding:.5rem 1rem 0}}

/* ── AudioPlayer block ── */
.audioplayer{max-width:720px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3;background:var(--canvas,#fff)}
.audioplayer-card{display:flex;gap:1.2rem;background:var(--card,#fff);border-radius:10px;padding:1.5rem;box-shadow:0 2px 16px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}
.audioplayer-cover{width:96px;height:96px;border-radius:10px;object-fit:cover;flex-shrink:0}
.audioplayer-body{flex:1;min-width:0;display:flex;flex-direction:column}
.audioplayer-title{font-family:var(--font-display);font-size:1.3rem;font-weight:500;color:var(--ink-black,#2a2320);line-height:1.2;letter-spacing:-.02em;margin-bottom:.15rem}
.audioplayer-subtitle{font-family:var(--font-body);font-size:.82rem;color:var(--graphite,#636363);font-weight:500;letter-spacing:.04em;text-transform:uppercase;margin-bottom:.4rem}
.audioplayer-desc{font-family:var(--font-body);font-size:.92rem;color:var(--steel,#8c8078);line-height:1.5;margin-bottom:.8rem}
.audioplayer-controls{display:flex;align-items:center;gap:.8rem}
.audioplayer-play{width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease,box-shadow .15s ease}
.audioplayer-play:hover{transform:scale(1.06);box-shadow:0 3px 12px rgba(0,0,0,.15)}
.audioplayer-play svg{width:20px;height:20px;fill:#fff}
.audioplayer-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:.35rem}
.audioplayer-waveform{display:flex;align-items:flex-end;gap:1.5px;height:32px;cursor:pointer;position:relative}
.audioplayer-bar{flex:1;border-radius:1px;transition:background .15s ease;min-width:1px}
.audioplayer-progress{position:relative;height:4px;background:rgba(0,0,0,.08);border-radius:2px;cursor:pointer;overflow:hidden}
.audioplayer-progress-fill{position:absolute;top:0;left:0;height:100%;border-radius:2px;width:0%;transition:width .1s linear}
.audioplayer-time{display:flex;justify-content:space-between;font-family:var(--font-body);font-size:.72rem;color:var(--steel,#8c8078);font-variant-numeric:tabular-nums}
.audioplayer-transcript{margin-top:1rem}
.audioplayer-transcript-toggle{background:none;border:none;cursor:pointer;font-family:var(--font-body);font-size:.85rem;color:var(--accent,#c06830);font-weight:500;padding:0;display:flex;align-items:center;gap:.3rem}
.audioplayer-transcript-toggle::after{content:'\\25BC';font-size:.6rem;transition:transform .2s ease}
.audioplayer-transcript-toggle.open::after{transform:rotate(180deg)}
.audioplayer-transcript-text{font-family:var(--font-body);font-size:.92rem;line-height:1.65;color:var(--ink-black,#2a2320);padding-top:.8rem;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease}
.audioplayer-transcript-text.open{max-height:600px;overflow-y:auto}
.audioplayer-meta{max-width:720px;margin:.5rem auto 0;padding:0 2rem}
.audioplayer-caption{font-family:var(--font-body);font-size:.85rem;color:var(--graphite,#636363);font-style:italic;line-height:1.5}
.audioplayer-credit{font-family:var(--font-body);font-size:.75rem;color:var(--steel,#8c8078);margin-top:.15rem}
@media(max-width:600px){.audioplayer{padding:0 1rem}.audioplayer-card{flex-direction:column;padding:1.2rem}.audioplayer-cover{width:100%;height:160px}.audioplayer-meta{padding:0 1rem}}

/* ── Parallax block ── */
.parallax{position:relative;height:100vh;overflow:hidden;z-index:1;background:#000}
.parallax__layer{position:absolute;inset:-15% 0;height:130%}
.parallax__layer img{width:100%;height:100%;object-fit:cover;display:block;will-change:transform}
.parallax__overlay{position:absolute;z-index:4;padding:2rem;max-width:680px}
.parallax__overlay--center{inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;margin:0 auto}
.parallax__overlay--bottom-left{bottom:0;left:0;padding-bottom:4rem}
.parallax__overlay--bottom-right{bottom:0;right:0;text-align:right;padding-bottom:4rem}
.parallax__overlay--top-left{top:0;left:0;padding-top:4rem}
.parallax__headline{font-family:var(--font-display);font-size:clamp(2rem,5vw,3.5rem);font-weight:300;color:#fff;line-height:1.1;letter-spacing:-.04em;text-shadow:0 2px 20px rgba(0,0,0,.5);margin:0}
.parallax__subtitle{font-family:var(--font-body);font-size:clamp(.95rem,2vw,1.15rem);color:rgba(255,255,255,.88);line-height:1.5;text-shadow:0 1px 10px rgba(0,0,0,.4);margin:.6rem 0 0}
.parallax--tint-dark::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(0,0,0,.45));z-index:3;pointer-events:none}
.parallax--tint-light::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(255,255,255,.15),rgba(255,255,255,.4));z-index:3;pointer-events:none}
.parallax--empty{background:linear-gradient(135deg,#e2e8f0 0%,#cbd5e1 50%,#94a3b8 100%);display:flex;align-items:center;justify-content:center}
.parallax__placeholder{display:flex;flex-direction:column;align-items:center;gap:.75rem;color:rgba(0,0,0,.4);z-index:5;text-align:center;cursor:pointer}
.parallax__ph-icon{opacity:.5}
.parallax__ph-title{font-family:var(--font-display);font-size:1.1rem;font-weight:500;letter-spacing:-.01em}
.parallax__ph-hint{font-size:.8rem;opacity:.6;max-width:240px;line-height:1.4}
.parallax__headline--ghost,.parallax__subtitle--ghost{opacity:.35;font-style:italic}
@media(max-width:600px){.parallax{height:75vh}.parallax__overlay{padding:1.5rem}}
/* ── Scene3D scrollytelling block ── */
.scene3d{position:relative;width:100%}
.scene3d-sticky{position:sticky;top:0;height:100vh;overflow:hidden;background:#1a1a1a}
.scene3d-canvas{width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease}
.scene3d-dots{position:absolute;right:1.5rem;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;z-index:2}
.scene3d-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.2);transition:background .3s,transform .3s;cursor:default}
.scene3d-dot.active{background:#0358f7;transform:scale(1.4)}
.scene3d-progress{position:absolute;left:0;top:0;width:3px;height:100%;background:rgba(0,0,0,.08);z-index:2}
.scene3d-progress-fill{width:100%;height:0%;background:linear-gradient(180deg,#c679c4,#fa3d1d,#ffb005,#0358f7);border-radius:0 0 2px 2px;transition:height .4s ease}
.scene3d-cards{position:relative;z-index:2}
.scene3d-card{min-height:100vh;display:flex;align-items:center;padding:0 1.5rem;pointer-events:none}
.scene3d-card-inner{background:var(--snow,#fff);border-radius:16px;padding:1.5rem 1.75rem;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.scene3d-card-num{font-size:10px;font-weight:700;color:#0358f7;letter-spacing:.1em;margin-bottom:.4rem}
.scene3d-card-caption{font-size:1rem;font-weight:500;color:#000;line-height:1.5}
.scene3d-coming-soon{position:absolute;inset:0;display:none;align-items:center;justify-content:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(248,248,248,.5);z-index:10;pointer-events:none}
.scene3d--coming-soon .scene3d-coming-soon{display:flex}
.scene3d-coming-soon span{background:#fa3d1d;color:#fff;font-weight:700;font-size:.875rem;letter-spacing:.08em;padding:10px 24px;border-radius:9999px}
.scene3d-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3;pointer-events:none;color:rgba(255,255,255,.45);font-size:.85rem;text-align:center;padding:1rem}
.scene3d-loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3;pointer-events:none}
.scene3d-loader::after{content:'';width:32px;height:32px;border:2px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.6);border-radius:50%;animation:scene3dSpin .8s linear infinite}
@keyframes scene3dSpin{to{transform:rotate(360deg)}}
@media(max-width:767px){
  .scene3d-sticky{height:60vw;min-height:220px;position:relative}
  .scene3d-card{min-height:auto;padding:1rem}
  .scene3d-card-inner{max-width:none}
}
`;

function injectComponentCSS() {
  if (document.getElementById('__component_css__')) return;
  const tag = document.createElement('style');
  tag.id = '__component_css__';
  tag.textContent = COMPONENT_CSS;
  document.head.appendChild(tag);
}

// ───────── Map2D Scrollytelling ─────────
function renderMap2D(d, block) {
  const layoutCls = d.layout === 'behind' ? 'layout-behind' : 'layout-side';
  const isDark = d.tileStyle === 'dark' || d.tileStyle === 'dark-nolabel';
  const sec = el('section', { class: `map2d-scrolly ${layoutCls}`, 'data-map-id': block.id });
  if (isDark) sec.dataset.tileDark = '';

  // Data-driven sizing
  if (d.height) sec.style.setProperty('--map-h', d.height);
  if (d.maxWidth) sec.style.setProperty('--map-max-w', d.maxWidth);
  if (d.mapRadius) sec.style.setProperty('--map-radius', d.mapRadius);
  if (d.cardWidth) sec.style.setProperty('--map-card-w', d.cardWidth);

  // Sticky map panel
  const graphic = el('div', { class: 'map2d-graphic' });
  if (d.title || d.subtitle) {
    const header = el('div', { class: 'map2d-header' });
    if (d.title) header.appendChild(el('div', { class: 'map2d-graphic-title' }, d.title));
    if (d.subtitle) header.appendChild(el('div', { class: 'map2d-graphic-sub' }, d.subtitle));
    graphic.appendChild(header);
  }
  const mapHost = el('div', { class: 'map2d-map-host', id: 'map2d-host-' + block.id });
  graphic.appendChild(mapHost);
  if (d.source) graphic.appendChild(el('div', { class: 'map2d-graphic-source' }, d.source));
  sec.appendChild(graphic);

  // Scrolling step cards
  const stepsCol = el('div', { class: 'map2d-steps' });
  (d.steps || []).forEach((step, i) => {
    const stepEl = el('div', {
      class: 'map2d-step' + (i === 0 ? ' is-active' : ''),
      'data-map-id': block.id,
      'data-map-idx': String(i),
    });
    const card = el('div', { class: 'map2d-step-card' });
    if (step.badgeLabel) {
      card.appendChild(el('div', {
        class: 'badge b-' + (step.badgeKind || 'data'),
      }, step.badgeLabel));
    }
    if (step.heading) card.appendChild(el('h3', { class: 'map2d-step-heading', style: 'font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.4rem' }, step.heading));
    const body = el('div', { class: 'map2d-step-body' });
    body.innerHTML = step.body || '';
    card.appendChild(body);
    stepEl.appendChild(card);
    stepsCol.appendChild(stepEl);
  });
  sec.appendChild(stepsCol);

  if (d.caption) {
    const cap = el('p', { class: 'map2d-cap' }, d.caption);
    sec.appendChild(cap);
  }
  if (d.credit) {
    const cred = el('p', { class: 'map2d-credit' }, d.credit);
    sec.appendChild(cred);
  }

  // Wire Leaflet after DOM mount (same pattern as DataScrolly)
  Promise.resolve().then(() => wireMap2D(block.id, d));
  return sec;
}

async function wireMap2D(blockId, d) {
  let L;
  try {
    L = await loadLeaflet();
  } catch (err) {
    console.error('Leaflet failed to load:', err);
    const host = document.getElementById('map2d-host-' + blockId);
    if (host) host.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:var(--fog,#e6e1da);color:var(--graphite,#6b6158);font-family:var(--font-body);font-size:.9rem;padding:2rem;text-align:center">Map could not load. Please refresh.</div>';
    return;
  }

  const host = document.getElementById('map2d-host-' + blockId);
  if (!host) return;
  const steps = Array.from(document.querySelectorAll('.map2d-step[data-map-id="' + blockId + '"]'));
  if (!steps.length) return;

  // Tile URLs — free providers (no API key required)
  const CARTO = 'https://{s}.basemaps.cartocdn.com/';
  const TILES = {
    default:        CARTO + 'light_nolabels/{z}/{x}/{y}{r}.png',
    clean:          CARTO + 'light_nolabels/{z}/{x}/{y}{r}.png',
    toner:          CARTO + 'light_nolabels/{z}/{x}/{y}{r}.png',
    'toner-lite':   CARTO + 'light_all/{z}/{x}/{y}{r}.png',
    watercolor:     CARTO + 'rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    dark:           CARTO + 'dark_nolabels/{z}/{x}/{y}{r}.png',
    'dark-nolabel': CARTO + 'dark_nolabels/{z}/{x}/{y}{r}.png',
    osm:            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  };
  const CARTO_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
  const ATTR = {
    default: CARTO_ATTR, clean: CARTO_ATTR, toner: CARTO_ATTR,
    'toner-lite': CARTO_ATTR, watercolor: CARTO_ATTR,
    dark: CARTO_ATTR, 'dark-nolabel': CARTO_ATTR,
    osm: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };

  function resolveColor(color) {
    if (!color || color.startsWith('var(')) {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c06830';
    }
    return color;
  }

  const initCenter = Array.isArray(d.initialCenter) && d.initialCenter.length === 2
    ? d.initialCenter : [52.52, 13.405];
  const initZoom = d.initialZoom != null ? d.initialZoom : 6;
  const initTile = TILES[d.tileStyle] ? d.tileStyle : 'default';
  const flyDuration = d.flyDuration != null ? d.flyDuration : 2;

  const map = L.map(host, {
    center: initCenter,
    zoom: initZoom,
    scrollWheelZoom: false,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
    preferCanvas: false,
  });

  let currentTileLayer = L.tileLayer(TILES[initTile], {
    attribution: ATTR[initTile] || ATTR.default,
    maxZoom: 19,
  }).addTo(map);
  let currentTileKey = initTile;

  // Create all markers (initially hidden) — each gets a dot + name label below
  const markerMap = {};
  (d.markers || []).forEach((m) => {
    const color = resolveColor(m.color);
    const nameHtml = m.name ? '<div class="map2d-marker-name">' + escapeHtml(m.name) + '</div>' : '';
    const icon = L.divIcon({
      className: '',
      html: '<div class="map2d-marker-wrap is-hidden"><div class="map2d-marker" style="background:' + color + '">' + escapeHtml(m.label || '') + '</div>' + nameHtml + '</div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      popupAnchor: [0, -24],
    });
    const marker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
    if (m.popupHtml) marker.bindPopup(m.popupHtml, { maxWidth: 280, closeButton: true });
    markerMap[m.id || ('m' + m.lat + m.lng)] = { marker: marker, el: null };
    requestAnimationFrame(() => {
      const markerEl = marker.getElement();
      if (markerEl) {
        const inner = markerEl.querySelector('.map2d-marker-wrap');
        markerMap[m.id || ('m' + m.lat + m.lng)].el = inner;
      }
    });
  });

  // Create all routes (initially hidden)
  const routeMap = {};
  (d.routes || []).forEach((r) => {
    if (!r.points || r.points.length < 2) return;
    const color = resolveColor(r.color);

    const line = L.polyline(r.points, {
      color: color,
      weight: r.weight || 2,
      opacity: 0,
      dashArray: r.dashArray || null,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'map2d-route',
    }).addTo(map);
    const rId = r.id || ('r' + JSON.stringify(r.points[0]));
    routeMap[rId] = {
      line: line,
      points: r.points,
      animate: r.animate !== false,
      revealed: false,
    };

    if (r.label) {
      // Place label at ~30% along the route to avoid marker clusters at endpoints/midpoints
      const labelIdx = Math.max(0, Math.floor(r.points.length * 0.3));
      const labelPos = r.points[labelIdx];
      const labelIcon = L.divIcon({
        className: '',
        html: '<div class="map2d-route-label" style="opacity:0;transition:opacity .6s">' + escapeHtml(r.label) + '</div>',
        iconSize: [0, 0],
      });
      const labelMarker = L.marker(labelPos, { icon: labelIcon, interactive: false }).addTo(map);
      routeMap[r.id || ('r' + JSON.stringify(r.points[0]))].labelMarker = labelMarker;
    }
  });

  // Create all areas (initially hidden)
  const areaMap = {};
  (d.areas || []).forEach((a) => {
    if (!a.points || a.points.length < 3) return;
    const color = resolveColor(a.color);
    const polygon = L.polygon(a.points, {
      color: color,
      fillColor: color,
      fillOpacity: 0,
      weight: a.weight || 2,
      opacity: 0,
      className: 'map2d-area',
    }).addTo(map);
    areaMap[a.id || ('a' + JSON.stringify(a.points[0]))] = { polygon: polygon, label: a.label, targetFillOpacity: a.fillOpacity != null ? a.fillOpacity : 0.2 };
  });

  // Step transition logic
  let currentIdx = -1;

  function showStep(idx) {
    if (idx === currentIdx) return;
    currentIdx = idx;
    const step = (d.steps || [])[idx];
    if (!step) return;
    const ms = step.mapState || {};

    // Fly to new center/zoom
    if (ms.center && ms.zoom != null) {
      if (ms.fitBounds) {
        const pts = [];
        (ms.showMarkers || []).forEach(id => {
          const m = (d.markers || []).find(mk => mk.id === id);
          if (m) pts.push([m.lat, m.lng]);
        });
        (ms.showAreas || []).forEach(id => {
          const a = (d.areas || []).find(ar => ar.id === id);
          if (a && a.points) a.points.forEach(p => pts.push(p));
        });
        if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts), { padding: [50, 50], duration: flyDuration });
        else map.flyTo(ms.center, ms.zoom, { duration: flyDuration });
      } else {
        map.flyTo(ms.center, ms.zoom, { duration: flyDuration });
      }
    } else if (ms.center) {
      map.flyTo(ms.center, map.getZoom(), { duration: flyDuration });
    } else if (ms.zoom != null) {
      map.flyTo(map.getCenter(), ms.zoom, { duration: flyDuration });
    }

    // Show/hide markers
    if (Array.isArray(ms.showMarkers)) {
      Object.keys(markerMap).forEach(id => {
        const entry = markerMap[id];
        const visible = ms.showMarkers.includes(id);
        if (entry.el) {
          entry.el.classList.toggle('is-visible', visible);
          entry.el.classList.toggle('is-hidden', !visible);
        }
      });
    }

    // Show/hide areas
    if (Array.isArray(ms.showAreas)) {
      Object.keys(areaMap).forEach(id => {
        const entry = areaMap[id];
        const visible = ms.showAreas.includes(id);
        entry.polygon.setStyle({
          fillOpacity: visible ? entry.targetFillOpacity : 0,
          opacity: visible ? 0.8 : 0,
        });
      });
    }

    // Animate route drawing
    if (ms.animateRoute) {
      const entry = routeMap[ms.animateRoute];
      if (entry && !entry.revealed) {
        entry.line.setStyle({ opacity: 0.9 });
        requestAnimationFrame(() => {
          const pathEl = entry.line.getElement();
          if (pathEl && entry.animate) {
            const len = pathEl.getTotalLength();
            pathEl.style.strokeDasharray = len + '';
            pathEl.style.strokeDashoffset = len + '';
            pathEl.getBoundingClientRect();
            pathEl.style.strokeDashoffset = '0';
          }
        });
        if (entry.labelMarker) {
          const lEl = entry.labelMarker.getElement();
          if (lEl) {
            const inner = lEl.querySelector('.map2d-route-label');
            if (inner) setTimeout(() => { inner.style.opacity = '1'; }, 1000);
          }
        }
        entry.revealed = true;
      } else if (entry) {
        entry.line.setStyle({ opacity: 0.9 });
      }
    }

    // Switch tile style mid-story
    if (ms.tileStyle && ms.tileStyle !== currentTileKey && TILES[ms.tileStyle]) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = L.tileLayer(TILES[ms.tileStyle], {
        attribution: ATTR[ms.tileStyle] || ATTR.default,
        maxZoom: 19,
      }).addTo(map);
      currentTileKey = ms.tileStyle;
      // Update vignette for dark/light tile switch
      const scrolly = host.closest('.map2d-scrolly');
      if (scrolly) {
        if (ms.tileStyle === 'dark' || ms.tileStyle === 'dark-nolabel') scrolly.dataset.tileDark = '';
        else delete scrolly.dataset.tileDark;
      }
    }
  }

  // Initial state = step 0
  showStep(0);

  // IntersectionObserver for scroll-driven transitions
  const obs = new IntersectionObserver((entries) => {
    const intersecting = entries.filter(e => e.isIntersecting);
    if (!intersecting.length) return;
    intersecting.sort((a, b) => Number(b.target.dataset.mapIdx) - Number(a.target.dataset.mapIdx));
    const idx = Number(intersecting[0].target.dataset.mapIdx);
    if (!Number.isNaN(idx)) {
      showStep(idx);
      steps.forEach(s => s.classList.toggle('is-active', Number(s.dataset.mapIdx) === idx));
      // Animate map step card
      if (window.Motion) {
        const activeCard = document.querySelector('.map2d-step[data-map-id="' + blockId + '"].is-active .map2d-step-card');
        if (activeCard) {
          window.Motion.animate(activeCard,
            { opacity: [0.2, 1], transform: ['translateY(12px)', 'translateY(0)'] },
            { duration: 0.5, easing: [0.16, 1, 0.3, 1] }
          );
        }
      }
    }
  }, { rootMargin: '-35% 0px -55% 0px' });

  steps.forEach(s => obs.observe(s));

  // Handle layout-behind: hide map when block exits viewport
  if (d.layout === 'behind') {
    const sec = host.closest('.map2d-scrolly');
    if (sec) {
      const secObs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          const graphic = sec.querySelector('.map2d-graphic');
          if (graphic) graphic.style.visibility = e.isIntersecting ? 'visible' : 'hidden';
        });
      }, { threshold: 0 });
      secObs.observe(sec);
    }
  }

  // Force Leaflet recalc
  setTimeout(() => map.invalidateSize(), 300);
}

// ───────── FullscreenImage ─────────
function renderFullscreenImage(d) {
  const sec = el('section', { class: 'fsimg' });

  const imgCls = 'fsimg-image' + (d.kenBurns !== false ? ' ken-burns' : '');
  sec.appendChild(el('img', {
    class: imgCls,
    src: d.imageSrc || '',
    alt: d.imageAlt || d.title || '',
    loading: 'lazy',
  }));

  // Scrim gradient
  const opacity = d.scrimOpacity != null ? d.scrimOpacity : 0.45;
  const dir = d.scrimDirection || 'bottom';
  let gradient;
  if (dir === 'top') {
    gradient = `linear-gradient(0deg,rgba(0,0,0,${opacity * 0.2}) 0%,rgba(0,0,0,${opacity}) 70%,rgba(0,0,0,${opacity * 1.1}) 100%)`;
  } else if (dir === 'radial') {
    gradient = `radial-gradient(ellipse at center,rgba(0,0,0,${opacity * 0.2}) 0%,rgba(0,0,0,${opacity}) 80%)`;
  } else {
    gradient = `linear-gradient(180deg,rgba(0,0,0,${opacity * 0.2}) 0%,rgba(0,0,0,${opacity}) 70%,rgba(0,0,0,${opacity * 1.1}) 100%)`;
  }
  sec.appendChild(el('div', {
    class: 'fsimg-scrim',
    style: `background:${gradient}`,
    'aria-hidden': 'true',
  }));

  // Content overlay
  const pos = d.overlayPosition || 'bottom-left';
  const posCls = 'pos-' + pos.replace(/\s+/g, '-');
  const content = el('div', { class: `fsimg-content ${posCls}` });
  if (d.kicker) content.appendChild(el('div', { class: 'fsimg-kicker' }, d.kicker));
  if (d.title) {
    const h = el('h2', { class: 'fsimg-title' });
    h.innerHTML = d.title;
    content.appendChild(h);
  }
  if (d.subtitle) content.appendChild(el('p', { class: 'fsimg-subtitle' }, d.subtitle));
  if (d.body) {
    const p = el('p', { class: 'fsimg-body' });
    p.innerHTML = d.body;
    content.appendChild(p);
  }
  sec.appendChild(content);

  // Scroll cue
  if (d.scrollCue) {
    const cue = el('div', { class: 'fsimg-scroll-cue' });
    cue.appendChild(el('span', {}, 'scroll'));
    cue.appendChild(el('span', { class: 'fsimg-chevron' }));
    sec.appendChild(cue);
  }

  // Caption / credit below
  if (d.caption || d.credit) {
    const meta = el('div', { class: 'fsimg-meta' });
    if (d.caption) meta.appendChild(el('div', { class: 'fsimg-caption' }, d.caption));
    if (d.credit) meta.appendChild(el('div', { class: 'fsimg-credit' }, d.credit));
    // Meta goes outside the image container — append to a wrapper
    const wrap = el('div');
    wrap.appendChild(sec);
    wrap.appendChild(meta);
    return wrap;
  }

  return sec;
}

// ───────── AudioPlayer ─────────
function renderAudioPlayer(d, block) {
  const sec = el('section', { class: 'audioplayer' });
  const card = el('div', { class: 'audioplayer-card' });

  // Cover art
  if (d.coverSrc) {
    card.appendChild(el('img', {
      class: 'audioplayer-cover',
      src: d.coverSrc,
      alt: d.title || 'Cover',
      loading: 'lazy',
    }));
  }

  const body = el('div', { class: 'audioplayer-body' });

  // Info
  if (d.subtitle) body.appendChild(el('div', { class: 'audioplayer-subtitle' }, d.subtitle));
  if (d.title) body.appendChild(el('div', { class: 'audioplayer-title' }, d.title));
  if (d.description) body.appendChild(el('div', { class: 'audioplayer-desc' }, d.description));

  // Controls
  const controls = el('div', { class: 'audioplayer-controls' });

  const accent = d.accentColor || 'var(--accent, #c06830)';
  const waveColor = d.waveformColor || accent;

  // Play button
  const playBtn = el('button', {
    class: 'audioplayer-play',
    'aria-label': 'Play',
    style: `background:${accent}`,
  });
  playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  controls.appendChild(playBtn);

  const right = el('div', { class: 'audioplayer-right' });

  // Waveform bars — deterministic pseudo-random from block id
  const waveWrap = el('div', { class: 'audioplayer-waveform' });
  const seed = (block && block.id ? block.id : 'default').split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const barCount = 60;
  for (let i = 0; i < barCount; i++) {
    const h = 20 + Math.abs(Math.sin(seed * 0.017 + i * 0.4) * 70 + Math.cos(seed * 0.031 + i * 0.7) * 30);
    const bar = el('div', {
      class: 'audioplayer-bar',
      style: `height:${Math.min(100, h)}%;background:${waveColor};opacity:0.35`,
      'data-idx': String(i),
    });
    waveWrap.appendChild(bar);
  }
  right.appendChild(waveWrap);

  // Progress bar
  const progress = el('div', { class: 'audioplayer-progress' });
  const progressFill = el('div', {
    class: 'audioplayer-progress-fill',
    style: `background:${accent}`,
  });
  progress.appendChild(progressFill);
  right.appendChild(progress);

  // Time display
  const timeRow = el('div', { class: 'audioplayer-time' });
  const timeCurrent = el('span', {}, '0:00');
  const timeTotal = el('span', {}, d.duration || '0:00');
  timeRow.appendChild(timeCurrent);
  timeRow.appendChild(timeTotal);
  right.appendChild(timeRow);

  controls.appendChild(right);
  body.appendChild(controls);

  // Transcript
  if (d.transcript) {
    const txWrap = el('div', { class: 'audioplayer-transcript' });
    const toggle = el('button', { class: 'audioplayer-transcript-toggle' }, 'Transcript');
    const txText = el('div', { class: 'audioplayer-transcript-text' });
    txText.textContent = d.transcript;
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      txText.classList.toggle('open');
    });
    txWrap.appendChild(toggle);
    txWrap.appendChild(txText);
    body.appendChild(txWrap);
  }

  card.appendChild(body);
  sec.appendChild(card);

  // Caption / credit
  if (d.caption || d.credit) {
    const meta = el('div', { class: 'audioplayer-meta' });
    if (d.caption) meta.appendChild(el('div', { class: 'audioplayer-caption' }, d.caption));
    if (d.credit) meta.appendChild(el('div', { class: 'audioplayer-credit' }, d.credit));
    sec.appendChild(meta);
  }

  // Wire up audio functionality
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  if (d.audioSrc) audio.src = d.audioSrc;

  let playing = false;
  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function updateProgress() {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + '%';
    timeCurrent.textContent = formatTime(audio.currentTime);
    // Update waveform bar highlights
    const bars = waveWrap.children;
    const activeIdx = Math.floor((pct / 100) * bars.length);
    for (let i = 0; i < bars.length; i++) {
      bars[i].style.opacity = i <= activeIdx ? '1' : '0.35';
    }
  }

  audio.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('ended', () => {
    playing = false;
    playBtn.innerHTML = PLAY_SVG;
  });

  playBtn.addEventListener('click', () => {
    if (playing) {
      audio.pause();
      playBtn.innerHTML = PLAY_SVG;
      playing = false;
    } else {
      // Optimistic UI — flip immediately, revert on failure
      playBtn.innerHTML = PAUSE_SVG;
      playing = true;
      audio.play().catch((err) => {
        console.warn('[AudioPlayer] play() failed:', err.name, err.message);
        playBtn.innerHTML = PLAY_SVG;
        playing = false;
      });
    }
  });

  // Seekable progress bar
  progress.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progress.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
    updateProgress();
  });

  // Seekable waveform
  waveWrap.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = waveWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
    updateProgress();
  });

  sec.appendChild(audio);
  return sec;
}

function renderParallax(d) {
  var tintCls = d.tint && d.tint !== 'none' ? ' parallax--tint-' + d.tint : ' parallax--tint-dark';
  var hasAnyImage = d.backgroundSrc || d.midgroundSrc || d.foregroundSrc;
  var sec = el('section', { class: 'parallax' + tintCls + (hasAnyImage ? '' : ' parallax--empty') });

  if (!hasAnyImage) {
    // Placeholder state — visible mockup so the user can see & click to edit
    var ph = el('div', { class: 'parallax__placeholder' });
    var phIcon = el('div', { class: 'parallax__ph-icon' });
    phIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 20l6-10 4 5 4-8 6 13"/><path d="M2 17l7-6 5 4 4-7 4 9" opacity=".4"/></svg>';
    ph.appendChild(phIcon);
    ph.appendChild(el('div', { class: 'parallax__ph-title' }, 'Parallax Depth'));
    ph.appendChild(el('div', { class: 'parallax__ph-hint' }, 'Upload background, midground & foreground images'));
    // Render placeholder img elements so visual-edit can target them
    var bgPh = el('div', { class: 'parallax__layer parallax__bg', style: 'display:none' });
    bgPh.appendChild(el('img', { src: '', alt: '', 'data-placeholder': 'true' }));
    sec.appendChild(bgPh);
    sec.appendChild(ph);
  } else {
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
  }

  // Text overlay — show even on empty state so user can click to edit
  var pos = d.overlayPosition || 'center';
  var overlay = el('div', { class: 'parallax__overlay parallax__overlay--' + pos });
  if (d.headline) overlay.appendChild(el('h2', { class: 'parallax__headline' }, d.headline));
  else if (!hasAnyImage) overlay.appendChild(el('h2', { class: 'parallax__headline parallax__headline--ghost' }, 'Your headline here'));
  if (d.subtitle) overlay.appendChild(el('p', { class: 'parallax__subtitle' }, d.subtitle));
  else if (!hasAnyImage) overlay.appendChild(el('p', { class: 'parallax__subtitle parallax__subtitle--ghost' }, 'Subtitle text'));
  sec.appendChild(overlay);

  // ── JS-driven parallax scroll effect ──
  if (hasAnyImage) {
    var layers = [];
    var bgImg = sec.querySelector('.parallax__bg img');
    var midImg = sec.querySelector('.parallax__mid img');
    var fgImg = sec.querySelector('.parallax__fg img');
    if (bgImg)  layers.push({ el: bgImg,  speed: 0.3 });  // slow — classic parallax
    if (midImg) layers.push({ el: midImg, speed: 0.5 });  // medium
    if (fgImg)  layers.push({ el: fgImg,  speed: 0.7 });  // fast
    // Single-layer? Still shift it for that editorial depth
    if (layers.length === 1) layers[0].speed = 0.35;

    var active = false;
    var rafId;
    function updateParallax() {
      var rect = sec.getBoundingClientRect();
      var vh = window.innerHeight;
      // progress: 0.5 when entering bottom, 0 when centered, -0.5 when exiting top
      var progress = (rect.top + rect.height * 0.5 - vh * 0.5) / vh;
      for (var i = 0; i < layers.length; i++) {
        var shift = progress * layers[i].speed * -30; // percent shift
        layers[i].el.style.transform = 'translateY(' + shift + '%)';
      }
      if (active) rafId = requestAnimationFrame(updateParallax);
    }
    var pxObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting && !active) {
          active = true;
          rafId = requestAnimationFrame(updateParallax);
        } else if (!e.isIntersecting && active) {
          active = false;
          cancelAnimationFrame(rafId);
        }
      });
    }, { rootMargin: '100% 0px' });
    // Start observing once element is in DOM (deferred)
    requestAnimationFrame(function() { pxObs.observe(sec); });
  }

  return sec;
}

// ─────────────────────────── LottieScroll ────────────────────────────────────
// Scroll-driven Lottie JSON animation.
// Lazy-loads lottie-web from CDN the first time a LottieScroll block renders.
// scrubMode: 'scroll'  — animation frame tied to scroll progress (Webflow style)
// scrubMode: 'autoplay'— plays on loop when in view

var _lottieWebPromise = null;
function loadLottieWeb() {
  if (window.lottie) return Promise.resolve();
  if (_lottieWebPromise) return _lottieWebPromise;
  _lottieWebPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = function() {
      _lottieWebPromise = null; // allow retry
      reject(new Error('[LottieScroll] Failed to load lottie-web CDN'));
    };
    document.head.appendChild(s);
  });
  return _lottieWebPromise;
}

function renderLottieScroll(d) {
  var layout = d.layout || 'contained';
  var scrubMode = d.scrubMode || 'scroll';

  var sec = el('section', { class: 'lottie-scroll lottie-scroll--' + layout });
  var wrap = el('div', { class: 'lottie-wrap' });
  var canvas = el('div', { class: 'lottie-canvas' });
  wrap.appendChild(canvas);
  if (d.caption) wrap.appendChild(el('p', { class: 'lottie-cap' }, d.caption));
  sec.appendChild(wrap);

  if (!d.lottieUrl) {
    // ── Placeholder ──
    var ph = el('div', { class: 'lottie-placeholder' });
    var icon = el('div', { class: 'lottie-placeholder__icon' });
    icon.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="9"/><path d="M9.5 8.5l6 3.5-6 3.5V8.5z" fill="currentColor" stroke="none" opacity=".6"/><path d="M3 12h2M19 12h2M12 3v2M12 19v2" stroke-width="1.5" stroke-linecap="round"/></svg>';
    ph.appendChild(icon);
    ph.appendChild(el('div', { class: 'lottie-placeholder__title' }, 'Lottie Animation'));
    ph.appendChild(el('div', { class: 'lottie-placeholder__hint' }, 'Paste a Lottie JSON URL to add a scroll-driven animation'));
    canvas.appendChild(ph);
    return sec;
  }

  // ── Init animation after CDN loads ──
  loadLottieWeb().then(function() {
    var anim = window.lottie.loadAnimation({
      container: canvas,
      renderer: 'svg',
      loop: scrubMode === 'autoplay',
      autoplay: false,
      path: d.lottieUrl,
    });

    if (scrubMode === 'scroll') {
      // Webflow-style scroll scrub: frame = f(scroll progress)
      var active = false;
      var rafId;

      function scrubFrame() {
        var rect = sec.getBoundingClientRect();
        var vh = window.innerHeight;
        var elH = rect.height;
        // progress 0 → element bottom just enters from below
        // progress 1 → element top has scrolled fully past the top
        var total = vh + elH;
        var gone  = vh - rect.top;
        var progress = Math.max(0, Math.min(1, gone / total));
        var frame = Math.floor(progress * (anim.totalFrames - 1));
        anim.goToAndStop(frame, true);
        if (active) rafId = requestAnimationFrame(scrubFrame);
      }

      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (e.isIntersecting && !active) {
            active = true;
            rafId = requestAnimationFrame(scrubFrame);
          } else if (!e.isIntersecting && active) {
            active = false;
            cancelAnimationFrame(rafId);
          }
        });
      }, { rootMargin: '20% 0px' });  // start slightly before entering view

      anim.addEventListener('DOMLoaded', function() {
        requestAnimationFrame(function() { obs.observe(sec); });
      });

    } else {
      // Autoplay mode: play on loop while in view, pause when out
      var obsAuto = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (e.isIntersecting) anim.play(); else anim.pause();
        });
      }, { rootMargin: '20% 0px' });

      anim.addEventListener('DOMLoaded', function() {
        requestAnimationFrame(function() { obsAuto.observe(sec); });
      });
    }
  }).catch(function(err) {
    console.warn(err.message);
    canvas.innerHTML = '<p style="padding:1rem;color:#999;font-size:.875rem;">Animation could not load — check the Lottie JSON URL.</p>';
  });

  return sec;
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
  FullBleed:      renderFullBleed,
  ImageCompare:   renderImageCompare,
  ImageHotspot:   renderImageHotspot,
  AccordionBlock: renderAccordion,
  ProgressNav:    renderProgressNav,
  EmbedBlock:     renderEmbed,
  ImageGrid:      renderImageGrid,
  Map2D:          renderMap2D,
  FullscreenImage: renderFullscreenImage,
  AudioPlayer:     renderAudioPlayer,
  Scene3D:         renderScene3D,
  Parallax:        renderParallax,
  LottieScroll:    renderLottieScroll,
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

// ── Lenis smooth scroll (loaded dynamically when enabled) ──
function initLenis() {
  if (window.__lenis) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/lenis@1/dist/lenis.min.js';
  script.onload = () => {
    if (!window.Lenis) return;
    const lenis = new window.Lenis({
      lerp: 0.08,          // lower = smoother & slower (0.05-0.15 range)
      smoothWheel: true,
      syncTouch: false,     // native touch on mobile is already smooth
    });
    window.__lenis = lenis;
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  };
  document.head.appendChild(script);
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
  // Smooth scroll — Lenis for buttery-smooth wheel/touch scrolling
  if (doc.smoothScroll && !window.__lenis) {
    initLenis();
  } else if (!doc.smoothScroll && window.__lenis) {
    window.__lenis.destroy(); window.__lenis = null;
  }
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

  // ── Page background image ──
  const bg = doc.background;
  let pageBgEl = null;
  if (bg && bg.imageSrc) {
    pageBgEl = document.getElementById('page-bg');
    if (!pageBgEl) {
      pageBgEl = document.createElement('div');
      pageBgEl.id = 'page-bg';
      const img = document.createElement('img');
      img.id = 'page-bg-img';
      img.src = bg.imageSrc;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      pageBgEl.appendChild(img);
      document.body.insertBefore(pageBgEl, document.body.firstChild);
    } else {
      const img = pageBgEl.querySelector('img');
      if (img) img.src = bg.imageSrc;
    }
    pageBgEl.style.opacity = String(bg.defaultOpacity != null ? bg.defaultOpacity : 0.15);
  }

  for (const block of (doc.blocks || [])) {
    const fn = BLOCK_RENDERERS[block.type];
    if (!fn) {
      console.warn('Unknown block type:', block.type, block.id);
      continue;
    }
    const node = fn(block.data || {}, block);
    if (node) {
      // Tag each rendered section with block id + bg opacity for the observer
      if (node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
      }
      root.appendChild(node);
    }
  }

  // ── Background opacity observer — smooth per-block transitions ──
  if (pageBgEl) {
    const defaultOp = bg.defaultOpacity != null ? bg.defaultOpacity : 0.15;
    const sections = root.querySelectorAll('[data-block-id]');
    if (sections.length) {
      const bgObs = new IntersectionObserver((entries) => {
        // Find the most-visible section currently intersecting
        let best = null;
        let bestRatio = 0;
        entries.forEach(e => {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            best = e.target;
            bestRatio = e.intersectionRatio;
          }
        });
        if (best && best.dataset.bgOpacity != null) {
          pageBgEl.style.opacity = best.dataset.bgOpacity;
        } else if (best) {
          pageBgEl.style.opacity = String(defaultOp);
        }
      }, { threshold: [0, 0.25, 0.5, 0.75] });
      sections.forEach(s => bgObs.observe(s));
    }
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

  const brand = el('div', { class: 'cin-brand', id: 'cin-brand' }, d.brand || '');
  sec.appendChild(brand);

  // Text lines (shown one by one before the title in the full D3 cinematic,
  // skipped here in the simple self-contained path)
  const textLayer = el('div', { class: 'cin-text-layer', id: 'cin-text-layer' });
  (d.lines || []).forEach(line => {
    textLayer.appendChild(el('div', { class: `cin-line ${line.cls || ''}`.trim() }, line.text || ''));
  });
  sec.appendChild(textLayer);

  const titleLayer = el('div', { class: 'cin-title-layer', id: 'cin-title-layer' });
  titleLayer.style.pointerEvents = 'auto';
  const h1 = el('h1', { class: 'cin-main-title' });
  h1.innerHTML = d.titleHtml || '';
  titleLayer.appendChild(h1);
  if (d.subtitle) titleLayer.appendChild(el('p', { class: 'cin-sub-title' }, d.subtitle));
  sec.appendChild(titleLayer);

  const cue = el('div', { class: 'cin-scroll-cue', id: 'cin-cue' });
  cue.appendChild(el('span', {}, d.scrollCueText || 'Scroll'));
  cue.appendChild(el('div', { class: 'arr' }));
  sec.appendChild(cue);

  // Self-contained fade-in: brand settles to top-left → title fades in → scroll cue appears.
  // This runs when page-init.js (the D3 cinematic) is NOT present. If it IS present,
  // the D3 script takes ownership of the same elements and this becomes a no-op visual
  // (D3 overwrites opacity/transform via its own timeline).
  requestAnimationFrame(() => {
    if (document.getElementById('cin-svg')) return; // D3 cinematic already owns this

    // Brand: fade in, then settle to top after a beat
    setTimeout(() => {
      brand.style.opacity = '1';
    }, 200);
    setTimeout(() => {
      brand.classList.add('settled');
    }, 1000);

    // Title: fade in
    setTimeout(() => {
      titleLayer.style.transition = 'opacity 1.1s ease';
      titleLayer.style.opacity = '1';
    }, 900);

    // Scroll cue: fade in last
    setTimeout(() => {
      cue.style.transition = 'opacity 0.9s ease';
      cue.style.opacity = '1';
    }, 1900);
  });

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

  // ── Data-driven sizing via CSS custom properties ──
  const sizeMap = { small: '35%', medium: '50%', large: '65%', full: '1fr' };
  const imgW = d.imageSize ? (sizeMap[d.imageSize] || d.imageSize) : null;
  if (imgW) section.style.setProperty('--scrolly-img-w', imgW);
  if (d.imageHeight) section.style.setProperty('--scrolly-img-h', d.imageHeight);
  if (d.imageRadius) section.style.setProperty('--scrolly-img-radius', d.imageRadius);
  if (d.maxWidth) section.style.setProperty('--scrolly-max-w', d.maxWidth);
  if (d.cardWidth) section.style.setProperty('--scrolly-card-w', d.cardWidth);

  // ── Sticky image panel (left on desktop, top on mobile) ──
  const stickyWrap = el('div', { class: 'scrolly__sticky' });
  const imgContainer = el('div', { class: 'scrolly__images' });

  // Create an image (or placeholder) for EVERY step so visual-edit can always
  // bind a click handler and the IntersectionObserver can toggle .active reliably.
  const stepImages = (d.steps || []).map((step, i) => {
    let src = step.imageSrc || step.image || '';
    if (!src && step.body) {
      const m = step.body.match(/<img[^>]+src=["']([^"']+)["']/);
      if (m) src = m[1];
    }
    if (src) {
      const img = el('img', {
        class: 'scrolly__img' + (i === 0 ? ' active' : ''),
        src: src,
        alt: step.badgeLabel || `Step ${i + 1}`,
        loading: i === 0 ? 'eager' : 'lazy',
        'data-step-idx': String(i),
      });
      // Fallback for broken/blocked images: show styled placeholder
      img.onerror = function() {
        const ph = el('div', {
          class: 'scrolly__img scrolly__img-ph' + (i === 0 ? ' active' : ''),
          'data-step-idx': String(i),
        });
        ph.innerHTML = `<span class="scrolly__ph-label">${escapeHtml(step.badgeLabel || 'Step ' + (i + 1))}</span>`;
        this.replaceWith(ph);
        stepImages[i] = ph;
      };
      imgContainer.appendChild(img);
      return img;
    }
    // No image for this step — render a placeholder that visual-edit can target
    const ph = el('div', {
      class: 'scrolly__img scrolly__img-ph' + (i === 0 ? ' active' : ''),
      'data-step-idx': String(i),
    });
    ph.innerHTML = `<span class="scrolly__ph-label">${escapeHtml(step.badgeLabel || 'Step ' + (i + 1))}</span>`;
    imgContainer.appendChild(ph);
    return ph;
  });
  stickyWrap.appendChild(imgContainer);
  // Always show the image container (placeholders visible for steps without images)
  section.appendChild(stickyWrap);

  // ── Snap guide lines overlay (shown during drag) ──
  const SNAP_GUIDES = [
    [25,   '25%',  false],
    [33.3, '1/3',  true ],
    [40,   '40%',  false],
    [50,   '50%',  true ],
    [60,   '60%',  false],
    [66.7, '2/3',  true ],
    [75,   '75%',  false],
  ];
  const SNAP_THRESHOLD = 1.8; // % of section width to trigger snap
  const guidesEl = el('div', { class: 'scrolly__guides' });
  SNAP_GUIDES.forEach(([pct, label, major]) => {
    const line = el('div', {
      class: 'scrolly__guide' + (major ? ' scrolly__guide--major' : ''),
      'data-pct': String(pct),
      style: `left:${pct}%`,
    });
    line.appendChild(el('div', { class: 'scrolly__guide-label' }, label));
    guidesEl.appendChild(line);
  });
  section.appendChild(guidesEl);

  // ── Drag-to-resize handle (between image panel and steps) ──
  const handle = el('div', { class: 'scrolly__resize-handle', title: 'Drag to resize image panel' });
  handle.appendChild(el('div', { class: 'scrolly__resize-grip' }));
  section.appendChild(handle);
  {
    let active = false;
    const onStart = (e) => {
      active = true;
      handle.classList.add('dragging');
      guidesEl.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!active) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = section.getBoundingClientRect();
      let pct = Math.min(78, Math.max(20, ((clientX - rect.left) / rect.width) * 100));
      // Snap to nearest guide if within threshold
      let snapped = null;
      for (const [snapPct] of SNAP_GUIDES) {
        if (Math.abs(pct - snapPct) < SNAP_THRESHOLD) { pct = snapPct; snapped = snapPct; break; }
      }
      // Highlight snapped guide
      guidesEl.querySelectorAll('.scrolly__guide').forEach(g => {
        g.classList.toggle('snapped', snapped !== null && +g.dataset.pct === snapped);
      });
      section.style.setProperty('--scrolly-img-w', pct + '%');
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      handle.classList.remove('dragging');
      guidesEl.classList.remove('active');
      guidesEl.querySelectorAll('.scrolly__guide').forEach(g => g.classList.remove('snapped'));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ── Scrolling text cards (right on desktop) ──
  const steps = el('div', { class: 'scrolly__steps', id: d.stepsId || '' });
  (d.steps || []).forEach((step, i) => {
    const stepEl = el('div', {
      class: 'step' + (i === 0 ? ' is-active' : ''),
      'data-step': String(step.stepIndex ?? i),
      'data-step-idx': String(i),
    });
    const sc = el('div', { class: 'sc' });
    sc.appendChild(el('div', { class: `badge b-${step.badgeKind || 'pyramid'}` }, step.badgeLabel || ''));
    if (step.heading) sc.appendChild(el('h3', { class: 'step-heading' }, step.heading));
    // Strip <img> tags from body — images are in the sticky panel
    const bodyHtml = (step.body || '').replace(/<img[^>]*>/gi, '').trim();
    if (bodyHtml) {
      const bodyEl = el('div', { class: 'step-body' });
      bodyEl.innerHTML = bodyHtml;
      sc.appendChild(bodyEl);
    }
    stepEl.appendChild(sc);
    steps.appendChild(stepEl);
  });
  section.appendChild(steps);

  // ── IntersectionObserver: switch active image on scroll ──
  requestAnimationFrame(() => {
    const allSteps = section.querySelectorAll('.step');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = entry.target.dataset.stepIdx;
          // Activate step
          allSteps.forEach(s => s.classList.toggle('is-active', s.dataset.stepIdx === idx));
          // Animate step card entrance with motion.js
          if (window.Motion) {
            const activeCard = section.querySelector('.step.is-active .sc');
            if (activeCard) {
              window.Motion.animate(activeCard,
                { opacity: [0.35, 1], transform: ['translateY(8px)', 'translateY(0)'] },
                { duration: 0.4, easing: [0.16, 1, 0.3, 1] }
              );
            }
          }
          // Switch image
          stepImages.forEach((img, j) => {
            if (img) img.classList.toggle('active', String(j) === idx);
          });
        }
      });
    }, { rootMargin: '-30% 0px -30% 0px', threshold: 0.1 });
    allSteps.forEach(s => observer.observe(s));
  });

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
    const when = ev.when || ev.date || '';
    if (when)  item.appendChild(el('div', { class: 'timeline-when' },  when));
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
// Each block gets its own D3-powered chart that transitions fluidly between
// steps. Chart types morph (bars → line → area), highlights pulse, axes
// animate, and data filters apply with smooth interpolation.

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
// On step change, the D3 chart engine animates to the new vizState.
async function wireDataScrolly(blockId, d) {
  let DSChart;
  try {
    const mod = await loadDSChart();
    DSChart = mod.DSChart;
  } catch (err) {
    console.error('DSChart module failed to load:', err);
    const host = document.getElementById('ds-chart-' + blockId);
    if (host) host.innerHTML = '<div class="ds-chart-error">Chart engine failed to load. Refresh to try again.</div>';
    return;
  }

  const host = document.getElementById('ds-chart-' + blockId);
  if (!host) return;
  const steps = Array.from(document.querySelectorAll('.ds-step[data-ds-id="' + blockId + '"]'));
  if (!steps.length) return;

  // Normalize chartSpec: accept both "kind" (our convention) and "type" (AI output)
  const chartSpec = d.chartSpec || {};
  if (!chartSpec.kind && chartSpec.type) chartSpec.kind = chartSpec.type;

  // Create the persistent D3 chart instance
  const chart = new DSChart(host, chartSpec);
  let currentIdx = -1;

  function showStep(idx) {
    if (idx === currentIdx) return;
    currentIdx = idx;
    const step = (d.steps || [])[idx];
    const vizState = step ? (step.vizState || step.filter || {}) : {};
    chart.update(vizState);
  }

  // Initial render = first step's vizState
  showStep(0);

  const obs = new IntersectionObserver((entries) => {
    const intersecting = entries.filter(e => e.isIntersecting);
    if (!intersecting.length) return;
    intersecting.sort((a, b) => Number(b.target.dataset.dsIdx) - Number(a.target.dataset.dsIdx));
    const idx = Number(intersecting[0].target.dataset.dsIdx);
    if (!Number.isNaN(idx)) {
      showStep(idx);
      steps.forEach(s => s.classList.toggle('is-active', Number(s.dataset.dsIdx) === idx));
      // Animate active step card
      if (window.Motion) {
        const activeCard = sec.querySelector('.ds-step.is-active .ds-step-card');
        if (activeCard) {
          window.Motion.animate(activeCard,
            { opacity: [0.4, 1], transform: ['translateY(6px)', 'translateY(0)'] },
            { duration: 0.35, easing: [0.16, 1, 0.3, 1] }
          );
        }
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });

  steps.forEach(s => obs.observe(s));
}

function renderFullBleed(d) {
  const heightCls = d.height === '75vh' ? 'h-75' : d.height === '50vh' ? 'h-50' : 'h-100';
  const sec = el('section', { class: `fullbleed ${heightCls}` });

  if (d.mediaType === 'video' || d.mediaType === 'loop') {
    const video = el('video', {
      class: 'fullbleed-media',
      src: d.videoSrc || d.mediaSrc,
      poster: d.posterSrc || '',
      autoplay: 'true',
      muted: 'true',
      loop: 'true',
      playsinline: 'true',
      'aria-hidden': 'true',
    });
    sec.appendChild(video);
  } else {
    // Collect all non-empty image URLs (up to 4)
    const srcs = [d.mediaSrc, d.mediaSrc2, d.mediaSrc3, d.mediaSrc4].filter(Boolean);

    if (srcs.length > 1) {
      const intervalMs  = Math.max(1000, parseFloat(d.slideInterval  || 5)   * 1000);
      const fadeSec     = Math.max(0.1,  parseFloat(d.slideFadeSec   || 1.5));
      const doShuffle   = (d.slideShuffle || 'yes') !== 'no';

      if (doShuffle) {
        for (let i = srcs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [srcs[i], srcs[j]] = [srcs[j], srcs[i]];
        }
      }

      const wrap = el('div', { class: 'fullbleed-slides', 'aria-hidden': 'true' });
      srcs.forEach((src, i) => {
        const img = el('img', {
          class: 'fullbleed-slide' + (i === 0 ? ' is-active' : ''),
          src: src,
          alt: '',
          loading: i === 0 ? 'eager' : 'lazy',
          style: `transition:opacity ${fadeSec}s ease`,
        });
        wrap.appendChild(img);
      });
      sec.appendChild(wrap);

      // Crossfade timer — user-controlled interval
      let cur = 0;
      const slideEls = wrap.querySelectorAll('.fullbleed-slide');
      setInterval(() => {
        slideEls[cur].classList.remove('is-active');
        cur = (cur + 1) % srcs.length;
        slideEls[cur].classList.add('is-active');
      }, intervalMs);
    } else {
      // Single image — slow Ken Burns zoom
      sec.appendChild(el('img', {
        class: 'fullbleed-media slow-zoom',
        src: d.mediaSrc || '',
        alt: d.title || '',
        loading: 'lazy',
      }));
    }
  }

  const opacity = d.scrimOpacity != null ? d.scrimOpacity : 0.4;
  const scrim = el('div', {
    class: 'fullbleed-scrim',
    style: `background:linear-gradient(180deg,rgba(0,0,0,${opacity * 0.3}) 0%,rgba(0,0,0,${opacity}) 70%,rgba(0,0,0,${opacity * 1.1}) 100%)`,
    'aria-hidden': 'true',
  });
  sec.appendChild(scrim);

  const pos = d.overlayPosition || 'bottom-left';
  const posCls = pos === 'center' ? 'pos-center' : pos === 'bottom-right' ? 'pos-bottom-right' : 'pos-bottom-left';
  const content = el('div', { class: `fullbleed-content ${posCls}` });
  if (d.title) {
    const h = el('h2', { class: 'fullbleed-title' });
    h.innerHTML = d.title;
    content.appendChild(h);
  }
  if (d.subtitle) content.appendChild(el('p', { class: 'fullbleed-subtitle' }, d.subtitle));
  if (d.body) {
    const p = el('p', { class: 'fullbleed-body' });
    p.innerHTML = d.body;
    content.appendChild(p);
  }
  sec.appendChild(content);
  return sec;
}

// ───────── Scene3D scrollytelling ─────────
function renderScene3D(d, block) {
  const hasScenes = Array.isArray(d.scenes) && d.scenes.some(Boolean);
  const sec = el('section', {
    class: 'scene3d' + (d._comingSoon === true || d._comingSoon === 'true' ? ' scene3d--coming-soon' : ''),
    id: `scene3d-${block.id}`,
  });

  // Sticky viewport
  const sticky = el('div', { class: 'scene3d-sticky' });
  const canvas = el('canvas', { class: 'scene3d-canvas', 'aria-hidden': 'true' });
  sticky.appendChild(canvas);

  // Loading spinner whenever there's a model to load (with or without saved scenes).
  if (d.glbUrl) {
    sticky.appendChild(el('div', { class: 'scene3d-loader', 'aria-hidden': 'true' }));
  } else {
    const hint = el('div', { class: 'scene3d-hint' });
    hint.appendChild(el('div', {}, 'Upload a 3D model in the editor'));
    sticky.appendChild(hint);
  }

  // Scene dots
  const activeScs = (d.scenes || []).filter(Boolean);
  if (activeScs.length > 1) {
    const dots = el('div', { class: 'scene3d-dots', 'aria-hidden': 'true' });
    activeScs.forEach((_, i) => {
      dots.appendChild(el('div', { class: 'scene3d-dot' + (i === 0 ? ' active' : '') }));
    });
    sticky.appendChild(dots);
  }

  // Progress bar
  const prog = el('div', { class: 'scene3d-progress' });
  prog.appendChild(el('div', { class: 'scene3d-progress-fill' }));
  sticky.appendChild(prog);

  sec.appendChild(sticky);

  // Scroll cards (one per scene)
  if (hasScenes) {
    const cards = el('div', { class: 'scene3d-cards' });
    activeScs.forEach((sc, i) => {
      const card = el('div', { class: 'scene3d-card', 'data-scene': String(i) });
      const inner = el('div', { class: 'scene3d-card-inner' });
      inner.appendChild(el('div', { class: 'scene3d-card-num' }, `SCENE ${i + 1}`));
      if (sc.caption) inner.appendChild(el('div', { class: 'scene3d-card-caption' }, sc.caption));
      card.appendChild(inner);
      cards.appendChild(card);
    });
    sec.appendChild(cards);
  }

  // Coming Soon overlay
  const csOverlay = el('div', { class: 'scene3d-coming-soon', 'aria-hidden': 'true' });
  csOverlay.appendChild(el('span', {}, 'Coming Soon'));
  sec.appendChild(csOverlay);

  // Lazy-load the Three.js renderer after this section is in the DOM
  if (d.glbUrl) {
    Promise.resolve().then(() => _initScene3DPublic(block.id, d));
  }

  return sec;
}

let _scene3dModPromise = null;
async function _initScene3DPublic(blockId, data) {
  try {
    if (!_scene3dModPromise) {
      _scene3dModPromise = import('./scene3d.js');
    }
    const mod = await _scene3dModPromise;
    await mod.initScene3D(blockId, data);
  } catch (err) {
    console.error('[Scene3D] init failed:', err);
  }
}

function renderImageCompare(d) {
  const sec = el('section', { class: 'imgcompare' });
  const container = el('div', { class: 'imgcompare-container' });
  const initPos = d.initialPosition != null ? d.initialPosition : 50;

  const afterImg = el('img', {
    class: 'imgcompare-after',
    src: d.afterSrc || '',
    alt: d.afterLabel || 'After',
    loading: 'lazy',
    draggable: 'false',
  });
  container.appendChild(afterImg);

  const beforeImg = el('img', {
    class: 'imgcompare-before',
    src: d.beforeSrc || '',
    alt: d.beforeLabel || 'Before',
    loading: 'lazy',
    draggable: 'false',
    style: `clip-path:inset(0 ${100 - initPos}% 0 0)`,
  });
  container.appendChild(beforeImg);

  const divider = el('div', { class: 'imgcompare-divider', style: `left:${initPos}%` });
  const handle = el('div', { class: 'imgcompare-handle' });
  divider.appendChild(handle);
  container.appendChild(divider);

  if (d.beforeLabel) {
    container.appendChild(el('div', { class: 'imgcompare-label label-before' }, d.beforeLabel));
  }
  if (d.afterLabel) {
    container.appendChild(el('div', { class: 'imgcompare-label label-after' }, d.afterLabel));
  }

  function onMove(clientX) {
    const rect = container.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(2, Math.min(98, pct));
    beforeImg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    divider.style.left = pct + '%';
  }
  container.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onMove(e.clientX);
    const mm = (ev) => onMove(ev.clientX);
    const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });
  container.addEventListener('touchstart', (e) => { onMove(e.touches[0].clientX); }, { passive: true });
  container.addEventListener('touchmove', (e) => { onMove(e.touches[0].clientX); }, { passive: true });

  sec.appendChild(container);
  if (d.caption) sec.appendChild(el('p', { class: 'imgcompare-cap' }, d.caption));
  if (d.credit) sec.appendChild(el('p', { class: 'imgcompare-credit' }, d.credit));
  return sec;
}

function renderImageHotspot(d) {
  const sec = el('section', { class: 'imghotspot' });
  const wrap = el('div', { class: 'imghotspot-wrap' });
  wrap.appendChild(el('img', { src: d.src || '', alt: d.alt || '', loading: 'lazy' }));

  let activeTooltip = null;

  (d.hotspots || []).forEach((hs, i) => {
    const iconStyle = hs.icon === 'pulse' ? 'style-pulse' : '';
    const marker = el('div', {
      class: `imghotspot-marker ${iconStyle}`,
      style: `left:${hs.x}%;top:${hs.y}%`,
      'aria-label': hs.title || `Hotspot ${i + 1}`,
      role: 'button',
      tabindex: '0',
    }, hs.label || String(i + 1));

    const tip = el('div', { class: 'imghotspot-tooltip' });
    const closeBtn = el('button', { class: 'imghotspot-tooltip-close', 'aria-label': 'Close' }, '×');
    tip.appendChild(closeBtn);
    if (hs.title) tip.appendChild(el('div', { class: 'imghotspot-tooltip-title' }, hs.title));
    if (hs.body) {
      const body = el('div', { class: 'imghotspot-tooltip-body' });
      body.innerHTML = hs.body;
      tip.appendChild(body);
    }

    function positionTooltip() {
      const isMobile = window.innerWidth <= 600;
      if (isMobile) {
        tip.style.cssText = '';
      } else {
        const tipLeft = hs.x > 70 ? `${hs.x - 30}%` : hs.x < 30 ? `${hs.x}%` : `${hs.x - 15}%`;
        const tipTop = hs.y > 50 ? `${hs.y - 5}%` : `${hs.y + 5}%`;
        tip.style.left = tipLeft;
        tip.style.top = tipTop;
        tip.style.transform = hs.y > 50 ? 'translateY(-100%)' : '';
      }
    }

    function toggle() {
      if (activeTooltip && activeTooltip !== tip) {
        activeTooltip.classList.remove('is-visible');
        if (activeTooltip._marker) activeTooltip._marker.classList.remove('is-active');
      }
      const show = !tip.classList.contains('is-visible');
      tip.classList.toggle('is-visible', show);
      marker.classList.toggle('is-active', show);
      activeTooltip = show ? tip : null;
      if (show) positionTooltip();
    }

    marker.addEventListener('click', toggle);
    marker.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); tip.classList.remove('is-visible'); marker.classList.remove('is-active'); activeTooltip = null; });
    tip._marker = marker;

    wrap.appendChild(marker);
    wrap.appendChild(tip);
  });

  sec.appendChild(wrap);
  if (d.caption) sec.appendChild(el('p', { class: 'imghotspot-cap' }, d.caption));
  if (d.credit) sec.appendChild(el('p', { class: 'imghotspot-credit' }, d.credit));
  return sec;
}

function renderAccordion(d) {
  const sec = el('section', { class: 'accordion-block' });
  if (d.title) sec.appendChild(el('h3', {}, d.title));
  const list = el('div', { class: 'accordion-list', role: 'list' });
  const multiOpen = d.multiOpen !== false;

  (d.items || []).forEach((item, i) => {
    const row = el('div', { class: `accordion-item${item.defaultOpen ? ' is-open' : ''}`, role: 'listitem' });
    const trigger = el('button', {
      class: 'accordion-trigger',
      'aria-expanded': item.defaultOpen ? 'true' : 'false',
      id: `acc-trigger-${i}`,
    });
    trigger.appendChild(document.createTextNode(item.heading || ''));
    const chevron = el('span', { class: 'accordion-chevron', 'aria-hidden': 'true' });
    chevron.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    trigger.appendChild(chevron);

    const panel = el('div', {
      class: 'accordion-panel',
      role: 'region',
      'aria-labelledby': `acc-trigger-${i}`,
    });
    if (item.defaultOpen) panel.style.maxHeight = '2000px';
    const inner = el('div', { class: 'accordion-panel-inner' });
    const bodyHtml = (item.body || '').split(/\n\n+/).map(p => `<p>${p}</p>`).join('');
    inner.innerHTML = bodyHtml;
    panel.appendChild(inner);

    trigger.addEventListener('click', () => {
      const isOpen = row.classList.contains('is-open');
      if (!multiOpen) {
        list.querySelectorAll('.accordion-item.is-open').forEach(r => {
          r.classList.remove('is-open');
          r.querySelector('.accordion-trigger')?.setAttribute('aria-expanded', 'false');
          r.querySelector('.accordion-panel').style.maxHeight = '0';
        });
      }
      row.classList.toggle('is-open', !isOpen);
      trigger.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      panel.style.maxHeight = !isOpen ? '2000px' : '0';
    });

    row.appendChild(trigger);
    row.appendChild(panel);
    list.appendChild(row);
  });

  sec.appendChild(list);
  return sec;
}

function renderProgressNav(d) {
  const nav = el('nav', { class: 'progress-nav', 'aria-label': 'Reading progress' });
  const bar = el('div', { class: 'progress-nav-bar' });
  nav.appendChild(bar);

  function updateBar() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    bar.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateBar, { passive: true });
  updateBar();

  const chapters = d.chapters || [];
  const autoGen = d.autoGenerate !== false;

  if (chapters.length > 0 || autoGen) {
    Promise.resolve().then(() => {
      const dotContainer = el('div', { class: 'progress-nav-dots' });
      let targets = [];

      if (chapters.length > 0) {
        targets = chapters.map(ch => ({
          label: ch.label,
          el: ch.id ? document.getElementById(ch.id) : null,
        }));
      } else if (autoGen) {
        const dividers = document.querySelectorAll('.chapter-divider');
        targets = Array.from(dividers).map(div => ({
          label: div.querySelector('.chapter-title')?.textContent || '',
          el: div,
        }));
      }

      targets.forEach((t, i) => {
        const dot = el('button', {
          class: 'progress-nav-dot',
          'aria-label': t.label || `Section ${i + 1}`,
        });
        const label = el('span', { class: 'progress-nav-label' }, t.label || `Section ${i + 1}`);
        dot.appendChild(label);
        dot.addEventListener('click', () => {
          if (t.el) t.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        dotContainer.appendChild(dot);
      });

      if (targets.length > 0) {
        nav.appendChild(dotContainer);
        const dots = dotContainer.querySelectorAll('.progress-nav-dot');
        const obs = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const idx = targets.findIndex(t => t.el === entry.target);
              if (idx >= 0) {
                dots.forEach((d, j) => d.classList.toggle('is-active', j === idx));
              }
            }
          });
        }, { rootMargin: '-30% 0px -65% 0px' });
        targets.forEach(t => { if (t.el) obs.observe(t.el); });
      }
    });
  }

  return nav;
}

function renderEmbed(d) {
  const sec = el('section', { class: 'embed-block' });
  const arClass = d.aspectRatio === '16:9' ? 'ar-16-9' :
                  d.aspectRatio === '4:3'  ? 'ar-4-3'  :
                  d.aspectRatio === '1:1'  ? 'ar-1-1'  : 'ar-auto';
  const container = el('div', {
    class: `embed-container ${arClass}`,
    style: d.maxWidth ? `max-width:${d.maxWidth}` : '',
  });

  if (d.embedHtml) {
    container.innerHTML = d.embedHtml;
  } else if (d.url) {
    let embedUrl = d.url;
    if (/datawrapper\.dwcdn\.net/.test(embedUrl)) {
      container.classList.remove(arClass);
      container.classList.add('ar-auto');
    }
    const iframe = el('iframe', {
      src: embedUrl,
      title: d.caption || 'Embedded content',
      loading: d.lazyLoad !== false ? 'lazy' : 'eager',
      allow: 'autoplay; encrypted-media',
      allowfullscreen: 'true',
      referrerpolicy: 'strict-origin-when-cross-origin',
      frameborder: '0',
      style: 'width:100%;border:0;',
    });
    if (container.classList.contains('ar-auto')) {
      iframe.style.minHeight = '400px';
      window.addEventListener('message', (e) => {
        if (typeof e.data === 'object' && e.data['datawrapper-height']) {
          const heights = e.data['datawrapper-height'];
          for (const [id, height] of Object.entries(heights)) {
            if (iframe.src.includes(id)) {
              iframe.style.height = height + 'px';
              iframe.style.minHeight = 'auto';
            }
          }
        }
      });
    }
    container.appendChild(iframe);
  } else if (d.fallbackImage) {
    container.appendChild(el('img', {
      src: d.fallbackImage,
      alt: d.caption || '',
      style: 'width:100%;height:auto;display:block;',
    }));
  }

  sec.appendChild(container);
  if (d.caption) sec.appendChild(el('p', { class: 'embed-cap' }, d.caption));
  return sec;
}

// ───────── ImageGrid scroll-fade mode ─────────
function renderScrollFadeGrid(d) {
  const images = d.images || [];
  const stickyPanel = d.stickyPanel || 'media'; // 'media' → left col sticky, 'text' → left col sticky with text
  const imageSize = d.imageSize || 'medium';
  const sizeMap = { small: '35%', medium: '50%', large: '65%' };
  const mediaW = sizeMap[imageSize] || '50%';
  const textW = `${100 - parseFloat(mediaW)}%`;
  // col1 = sticky (left), col2 = scrolling panels (right)
  // stickyPanel:'media' → col1=media width, col2=text width
  // stickyPanel:'text'  → col1=text width,  col2=media width
  const col1W = stickyPanel === 'media' ? mediaW : textW;
  const col2W = stickyPanel === 'media' ? textW   : mediaW;

  const sec = el('section', { class: 'ig ig--scroll-fade' });
  sec.style.setProperty('--ig-sf-col1', col1W);
  sec.style.setProperty('--ig-sf-col2', col2W);

  if (d.title) sec.appendChild(el('h3', { class: 'ig-title' }, d.title));

  // Left column: sticky — all items absolutely layered, cross-fade on scroll
  const stickyCol   = el('div', { class: 'ig-sf-sticky' });
  const stickyInner = el('div', { class: 'ig-sf-sticky-inner' });
  stickyCol.appendChild(stickyInner);

  // Right column: scrolling panels — one panel per item is the scroll trigger
  const panelsCol = el('div', { class: 'ig-sf-panels' });

  images.forEach((img, i) => {
    const isFirst = i === 0;
    const src = img.src || img.url || '';

    if (stickyPanel === 'media') {
      // ── Sticky side: images ──
      // NOTE: img.caption is intentionally omitted here — use img.body for scroll-fade descriptions.
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
      if (img.cta && typeof img.cta === 'object')   card.appendChild(el('a',  { class: 'ig-sf-cta', href: sanitizeUrl(img.cta.url) }, img.cta.label || 'Read more'));
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
      if (img.cta && typeof img.cta === 'object')   textItem.appendChild(el('a',  { class: 'ig-sf-cta', href: sanitizeUrl(img.cta.url) }, img.cta.label || 'Read more'));
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
      stickyItems.forEach(item => item.classList.toggle('is-active', Number(item.dataset.sfIdx) === idx));
      panels.forEach(p => p.classList.toggle('is-active', Number(p.dataset.sfIdx) === idx));
    };

    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting);
      if (!visible.length) return;
      // When multiple panels are visible, activate the topmost one
      visible.sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
      activate(Number(visible[0].target.dataset.sfIdx));
    }, { rootMargin: '-25% 0px -25% 0px', threshold: 0 });

    panels.forEach(p => obs.observe(p));
  });

  return sec;
}

// ───────── ImageGrid (named layout presets) ─────────
function renderImageGrid(d) {
  // Scroll-fade mode: two-column sticky+cross-fade layout — delegate entirely
  if ((d.mode || 'grid') === 'scroll-fade') return renderScrollFadeGrid(d);

  const PRESETS = ['side-by-side','feature-left','feature-right','triptych','quad','hero-grid','mosaic','filmstrip'];

  const sec = el('section', { class: 'ig' });
  if (d.title) sec.appendChild(el('h3', { class: 'ig-title' }, d.title));

  const images = d.images || [];
  const n = images.length;

  // Resolve layout: explicit preset, legacy hint, or auto-detect from count
  let layout = (d.layout || '').toLowerCase().trim();
  if (!PRESETS.includes(layout)) {
    // Legacy natural-language hint support
    if (/masonry|pinterest/.test(layout))            layout = 'mosaic';
    else if (/film|strip|horizontal/.test(layout))   layout = 'filmstrip';
    else if (/side.*side|nebeneinander/.test(layout)) layout = 'side-by-side';
    else if (/triptych|3.*equal|three/.test(layout)) layout = 'triptych';
    else if (/quad|2.*2|four/.test(layout))          layout = 'quad';
    else if (/hero/.test(layout))                    layout = 'hero-grid';
    else if (/feature.*left|big.*left/.test(layout)) layout = 'feature-left';
    else if (/feature.*right|big.*right/.test(layout)) layout = 'feature-right';
    else layout = ''; // trigger auto-detect
  }

  // Auto-detect from image count when no preset
  if (!layout) {
    if (n === 1)      layout = '_auto-1';
    else if (n === 2) layout = 'side-by-side';
    else if (n === 3) layout = 'feature-left';
    else if (n === 4) layout = 'quad';
    else              layout = '_auto-many';
  }

  // Validate minimum image counts for complex layouts
  if (layout === 'feature-left' && n < 3)  layout = 'side-by-side';
  if (layout === 'feature-right' && n < 3) layout = 'side-by-side';
  if (layout === 'triptych' && n < 3)      layout = 'side-by-side';
  if (layout === 'quad' && n < 4)          layout = n >= 3 ? 'triptych' : 'side-by-side';

  // Map layout to grid class
  const gridClsMap = {
    '_auto-1': 'ig-auto-1', '_auto-many': 'ig-auto-many',
    'side-by-side': 'ig-side-by-side', 'feature-left': 'ig-feature-left',
    'feature-right': 'ig-feature-right', 'triptych': 'ig-triptych',
    'quad': 'ig-quad', 'hero-grid': 'ig-hero-grid',
    'mosaic': 'ig-mosaic', 'filmstrip': 'ig-filmstrip',
  };
  const gridCls = gridClsMap[layout] || 'ig-auto-many';

  // hero-grid: first image is full-width, remaining in a sub-row
  const isHeroGrid = layout === 'hero-grid';
  const grid = el('div', { class: `ig-grid ${gridCls}` });

  if (layout === 'filmstrip') {
    grid.style.setProperty('--ig-film-count', n);
  }

  const blockTextSide = d.textSide || 'right';

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
      if (img.cta && typeof img.cta === 'object')   panel.appendChild(el('a',  { class: 'ig-text-cta', href: sanitizeUrl(img.cta.url) }, img.cta.label || 'Read more'));
      cell.appendChild(panel);
    }

    return cell;
  }

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

  sec.appendChild(grid);
  if (d.caption) sec.appendChild(el('p', { class: 'ig-caption' }, d.caption));
  if (d.credit) sec.appendChild(el('p', { class: 'ig-credit' }, d.credit));
  return sec;
}

function renderChapterDivider(d) {
  const isHero = d.fullscreen || d.fullwidth;
  const cls = isHero ? 'chapter-divider chapter-hero' : 'chapter-divider';
  const sec = el('section', { class: cls, 'aria-label': isHero ? 'Page hero' : 'Chapter break' });
  if (d.number) sec.appendChild(el('div', { class: 'chapter-number' }, d.number));
  if (d.title) {
    const h = el(isHero ? 'h1' : 'h2', { class: 'chapter-title' });
    h.innerHTML = d.title;
    sec.appendChild(h);
  }
  if (d.subtitle) sec.appendChild(el('div', { class: 'chapter-subtitle' }, d.subtitle));
  // Decorative gradient strip below the heading
  sec.appendChild(el('div', { class: 'chapter-strip', 'aria-hidden': 'true' }));
  // Scroll cue for hero mode
  if (isHero) {
    const cue = el('div', { class: 'chapter-scroll-cue' });
    cue.appendChild(el('span', {}, 'Scroll'));
    cue.appendChild(el('div', { class: 'cue-arrow' }));
    sec.appendChild(cue);
  }
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
// ── Hot-swap: re-render a single block in-place without page reload ──────────
// The admin panel sends a postMessage with the block's updated data.
// We re-render just that block and swap the DOM node. Scroll position is
// untouched because there is no iframe navigation.
window.addEventListener('message', function (evt) {
  if (!evt.data) return;

  // Tier 1 — single-block hot-swap (field edits)
  if (evt.data.type === 'hot-swap-block') {
    var msg = evt.data;
    var fn = BLOCK_RENDERERS[msg.blockType];
    if (!fn) return;
    var oldNode = document.querySelector('[data-block-id="' + msg.blockId + '"]');
    if (!oldNode) return;
    var newNode = fn(msg.blockData, { id: msg.blockId, type: msg.blockType, data: msg.blockData });
    if (newNode && newNode.nodeType === 1) {
      newNode.dataset.blockId = msg.blockId;
      if (msg.blockData.bgOpacity != null) {
        newNode.dataset.bgOpacity = String(msg.blockData.bgOpacity);
      }
    }
    oldNode.replaceWith(newNode);
    // MutationObserver in visual-edit.js will re-bind editables automatically
    return;
  }

  // Tier 2 — soft refresh: re-render ALL blocks without iframe navigation
  // Used for structural changes (add / delete / reorder).
  if (evt.data.type === 'soft-refresh') {
    var doc = evt.data.doc;
    if (!doc) return;
    window.__PAGE_DATA__ = doc;
    // Apply page-level settings — Lenis smooth scroll
    if (doc.smoothScroll && !window.__lenis) {
      initLenis();
    } else if (!doc.smoothScroll && window.__lenis) {
      window.__lenis.destroy(); window.__lenis = null;
    }
    var root = document.querySelector('#page-root');
    if (!root) return;
    // Preserve the reader's scroll position across the in-place rebuild so editing
    // never jumps the preview to the top.
    var prevScroll = window.scrollY || window.pageYOffset || 0;
    root.innerHTML = '';
    var blocks = doc.blocks || [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var renderFn = BLOCK_RENDERERS[block.type];
      if (!renderFn) continue;
      var node = renderFn(block.data || {}, block);
      if (node && node.nodeType === 1) {
        node.dataset.blockId = block.id;
        if (block.data && block.data.bgOpacity != null) {
          node.dataset.bgOpacity = String(block.data.bgOpacity);
        }
      }
      if (node) root.appendChild(node);
    }
    // Restore scroll synchronously (same document, no navigation → no flash).
    window.scrollTo(0, prevScroll);
    if (window.__lenis && typeof window.__lenis.scrollTo === 'function') {
      window.__lenis.scrollTo(prevScroll, { immediate: true });
    }
    document.dispatchEvent(new CustomEvent('content:ready', { detail: { doc: doc } }));
    return;
  }
});

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
function sanitizeUrl(url) {
  if (!url) return '#';
  const s = String(url).trim().toLowerCase();
  if (s.startsWith('javascript:') || s.startsWith('data:')) return '#';
  return url;
}
