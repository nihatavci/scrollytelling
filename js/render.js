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

// CSS for components introduced after the original site. Injected once on first render
// so every page that uses render.js automatically picks up the new component styles.
const COMPONENT_CSS = `
/* ── Spacing Scale ──
 * Block gap (between top-level blocks): 4.5rem (72px) desktop, 3rem mobile
 * Inner padding: 2rem desktop, 1.25rem tablet, 1rem phone
 * Section max-width: 720px editorial, 1100px wide (StatRow), 1400px full (DataScrolly)
 * All blocks: position:relative; z-index:3; background:var(--canvas)
 */

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
.scrolly{display:grid;grid-template-columns:1fr 420px;gap:0;max-width:1400px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
.scrolly__sticky{position:sticky;top:0;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.scrolly__images{position:relative;width:100%;height:100%}
.scrolly__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease}
.scrolly__img.active{opacity:1}
.scrolly__steps{padding:30vh 0;display:flex;flex-direction:column}
.step{min-height:100vh;display:flex;align-items:center;padding:1.5rem 0 1.5rem 3rem}
.step:first-child{padding-top:15vh}.step:last-child{margin-bottom:30vh}
.sc{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.6rem 1.8rem;border:none;max-width:420px;box-shadow:var(--shadow-card);opacity:.35;transition:opacity .4s,box-shadow .4s,transform .4s;transform:translateY(8px)}
.step.is-active .sc{opacity:1;box-shadow:rgba(0,0,0,.15) 0 4px 24px;transform:translateY(0)}
.step-body{font-family:var(--font-body);font-size:1rem;line-height:1.6;font-weight:400}
.step-body img{display:none}
.step-heading{font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.4rem}
/* Scrolly without images: full-width text cards, no sticky */
.scrolly--no-images{display:block;max-width:720px}
.scrolly--no-images .scrolly__sticky{display:none}
.scrolly--no-images .step{padding-left:0;min-height:auto;padding:2rem 0}
.scrolly--no-images .sc{max-width:100%;opacity:1;transform:none}
@media(max-width:900px){
  .scrolly{grid-template-columns:1fr;gap:0}
  .scrolly__sticky{position:relative;height:60vh;margin-bottom:0}
  .step{padding:1rem 1.25rem;min-height:90vh}
  .sc{max-width:100%}
}
@media(max-width:600px){
  .scrolly{padding:0 1rem;margin:2rem auto}
  .scrolly__sticky{height:50vh}
  .step{padding:0.8rem 0;min-height:85vh}
  .sc{padding:1.2rem 1.4rem}
  .step-body{font-size:.92rem}
}

/* ── DataScrolly ── */
.data-scrolly{display:grid;grid-template-columns:1fr 420px;gap:4vw;max-width:1400px;margin:4.5rem auto;padding:0 2rem;position:relative;z-index:3}
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
  .data-scrolly{grid-template-columns:1fr;gap:0;margin:3rem auto;padding:0 1.25rem}
  .ds-graphic{position:relative;height:auto;padding:2rem 0;align-items:center}
  .ds-chart{max-width:100%;min-height:300px}
  .ds-steps{padding:1rem 0}
  .ds-step{min-height:auto;padding:1rem 0}
  .ds-step-card{opacity:1;max-width:100%;padding:1.2rem 1.4rem}
  .ds-step-badge{margin-bottom:.5rem}
}
@media(max-width:600px){
  .data-scrolly{padding:0 1rem;margin:2rem auto}
  .ds-chart{min-height:240px}
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

/* ── ImageGrid (smart auto-layout) ── */
.ig{position:relative;z-index:3;margin:4.5rem auto;padding:0}
.ig.ig-editorial{max-width:720px;padding:0 2rem}
.ig.ig-wide{max-width:1100px;padding:0 2rem}
.ig.ig-full{max-width:100%;padding:0}
.ig.ig-bleed{max-width:100vw;width:100vw;margin-left:calc(-50vw + 50%);padding:0}
.ig-title{font-family:var(--font-display);font-size:clamp(1.3rem,2.5vw,1.8rem);font-weight:300;color:var(--ink-black);letter-spacing:-.03em;margin-bottom:1.2rem;text-align:center}
.ig-grid{display:grid;gap:6px}
/* Auto layouts by image count */
.ig-grid.ig-1{grid-template-columns:1fr}
.ig-grid.ig-2{grid-template-columns:1fr 1fr}
.ig-grid.ig-3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-3 .ig-cell:first-child{grid-row:1/3}
.ig-grid.ig-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-5{grid-template-columns:3fr 2fr 2fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-5 .ig-cell:first-child{grid-row:1/3}
.ig-grid.ig-5 .ig-cell:nth-child(4){grid-column:2/3}
.ig-grid.ig-5 .ig-cell:nth-child(5){grid-column:3/4}
.ig-grid.ig-6{grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr}
.ig-grid.ig-many{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
/* Explicit layout overrides */
.ig-grid.ig-row{grid-template-columns:repeat(var(--ig-cols),1fr);grid-template-rows:auto}
.ig-grid.ig-row .ig-cell:first-child{grid-row:auto}
.ig-grid.ig-masonry{columns:3;column-gap:6px;display:block}
.ig-grid.ig-masonry .ig-cell{break-inside:avoid;margin-bottom:6px}
/* Cell */
.ig-cell{position:relative;overflow:hidden;border-radius:2px;background:var(--fog);min-height:0}
.ig-cell img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.ig-cell:hover img{transform:scale(1.02)}
.ig-cell.ig-span-2{grid-column:span 2}
.ig-cell.ig-span-row{grid-row:span 2}
/* Aspect ratios for auto layout */
.ig-grid:not(.ig-row):not(.ig-masonry):not(.ig-1) .ig-cell{aspect-ratio:4/3}
.ig-grid.ig-1 .ig-cell{aspect-ratio:16/9}
.ig-grid.ig-3 .ig-cell:first-child{aspect-ratio:auto}
/* Caption */
.ig-caption{font-family:var(--font-body);font-size:.85rem;color:var(--graphite);margin-top:.7rem;line-height:1.5;font-weight:400;text-align:center;padding:0 2rem}
.ig-cell-cap{position:absolute;bottom:0;left:0;right:0;padding:.5rem .7rem;background:linear-gradient(transparent,rgba(0,0,0,.55));color:#fff;font-family:var(--font-body);font-size:.75rem;line-height:1.35;opacity:0;transition:opacity .3s}
.ig-cell:hover .ig-cell-cap{opacity:1}
.ig-credit{font-family:var(--font-body);font-size:.72rem;color:var(--ash);margin-top:.35rem;text-align:center;letter-spacing:.02em}
@media(max-width:900px){
  .ig{margin:3rem auto}
  .ig.ig-editorial,.ig.ig-wide{padding:0 1.25rem}
  .ig-grid.ig-3{grid-template-columns:1fr 1fr;grid-template-rows:auto}
  .ig-grid.ig-3 .ig-cell:first-child{grid-row:auto;grid-column:1/-1}
  .ig-grid.ig-5{grid-template-columns:1fr 1fr;grid-template-rows:auto}
  .ig-grid.ig-5 .ig-cell:first-child{grid-column:1/-1;grid-row:auto}
  .ig-grid.ig-5 .ig-cell:nth-child(4),.ig-grid.ig-5 .ig-cell:nth-child(5){grid-column:auto}
  .ig-grid.ig-masonry{columns:2}
}
@media(max-width:600px){
  .ig{margin:2rem auto;padding:0 1rem}
  .ig.ig-editorial,.ig.ig-wide{padding:0 1rem}
  .ig-grid.ig-2,.ig-grid.ig-4,.ig-grid.ig-6{grid-template-columns:1fr}
  .ig-grid.ig-5{grid-template-columns:1fr}
  .ig-grid.ig-5 .ig-cell:first-child{grid-column:auto}
  .ig-grid.ig-masonry{columns:1}
  .ig-grid{gap:4px}
}

/* ── FullBleed (viewport media + text overlay) ── */
.fullbleed{position:relative;z-index:2;width:100%;overflow:hidden;background:#000}
.fullbleed-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fullbleed video.fullbleed-media{object-fit:cover}
.fullbleed-scrim{position:absolute;inset:0;pointer-events:none}
.fullbleed-content{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:flex-end;padding:2rem;min-height:100vh;max-width:720px}
.fullbleed-content.pos-center{justify-content:center;align-items:center;text-align:center;margin:0 auto}
.fullbleed-content.pos-bottom-left{justify-content:flex-end;align-items:flex-start;padding-bottom:4rem}
.fullbleed-content.pos-bottom-right{justify-content:flex-end;align-items:flex-end;text-align:right;margin-left:auto;padding-bottom:4rem}
.fullbleed-title{font-family:var(--font-display);font-size:clamp(2.2rem,5vw,4rem);font-weight:300;color:#fff;line-height:1.1;letter-spacing:-.04em;margin-bottom:.6rem;text-shadow:0 2px 20px rgba(0,0,0,.4)}
.fullbleed-subtitle{font-family:var(--font-body);font-size:clamp(1rem,2vw,1.25rem);color:rgba(255,255,255,.88);line-height:1.5;font-weight:400;max-width:560px;text-shadow:0 1px 10px rgba(0,0,0,.3)}
.fullbleed-body{font-family:var(--font-body);font-size:1.0625rem;color:rgba(255,255,255,.82);line-height:1.6;margin-top:.8rem;max-width:560px;text-shadow:0 1px 8px rgba(0,0,0,.3)}
.fullbleed.h-100{min-height:100vh}
.fullbleed.h-75{min-height:75vh}
.fullbleed.h-50{min-height:50vh}
@media(max-width:900px){
  .fullbleed-content{padding:1.5rem 1.25rem}
  .fullbleed-content.pos-bottom-left,.fullbleed-content.pos-bottom-right{padding-bottom:3rem}
}
@media(max-width:600px){
  .fullbleed-content{padding:1.25rem 1rem}
  .fullbleed-title{font-size:clamp(1.8rem,7vw,2.5rem)}
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
  FullBleed:      renderFullBleed,
  ImageCompare:   renderImageCompare,
  ImageHotspot:   renderImageHotspot,
  AccordionBlock: renderAccordion,
  ProgressNav:    renderProgressNav,
  EmbedBlock:     renderEmbed,
  ImageGrid:      renderImageGrid,
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

  // ── Sticky image panel (left on desktop, top on mobile) ──
  const stickyWrap = el('div', { class: 'scrolly__sticky' });
  const imgContainer = el('div', { class: 'scrolly__images' });

  // Extract images from steps: use imageSrc field or parse <img> from body
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
      imgContainer.appendChild(img);
      return img;
    }
    return null;
  });
  stickyWrap.appendChild(imgContainer);
  const hasAnyImages = stepImages.some(img => img !== null);
  if (hasAnyImages) {
    section.appendChild(stickyWrap);
  } else {
    section.classList.add('scrolly--no-images');
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
    sec.appendChild(el('img', {
      class: 'fullbleed-media',
      src: d.mediaSrc || '',
      alt: d.title || '',
      loading: 'lazy',
    }));
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

// ───────── ImageGrid (smart auto-layout) ─────────
function renderImageGrid(d) {
  // Parse layout hint — supports natural language
  const hint = (d.layout || '').toLowerCase().trim();
  // Determine width class from hint
  let widthCls = 'ig-wide';   // default
  if (/editorial|narrow|small|article/.test(hint))      widthCls = 'ig-editorial';
  else if (/full|viewport|edge/.test(hint))              widthCls = 'ig-full';
  else if (/bleed|screen|bigger.*editorial/.test(hint))  widthCls = 'ig-bleed';
  else if (/wide|large|big|reuters|cinematic/.test(hint)) widthCls = 'ig-wide';

  const sec = el('section', { class: `ig ${widthCls}` });
  if (d.title) sec.appendChild(el('h3', { class: 'ig-title' }, d.title));

  const images = d.images || [];
  const n = images.length;

  // Determine grid layout class
  let gridCls = '';
  let explicitCols = 0;
  if (/masonry|pinterest/.test(hint)) {
    gridCls = 'ig-masonry';
  } else if (/(\d)\s*(col|grid|column|row|across|wide)/i.test(hint)) {
    explicitCols = parseInt(RegExp.$1);
    gridCls = 'ig-row';
  } else if (/row|strip|film|horizontal|side.*side|nebeneinander/.test(hint)) {
    explicitCols = n;
    gridCls = 'ig-row';
  } else if (/stack|vertical|übereinander/.test(hint)) {
    explicitCols = 1;
    gridCls = 'ig-row';
  } else {
    // Auto-detect best layout from image count
    if (n <= 6) gridCls = `ig-${n}`;
    else gridCls = 'ig-many';
  }

  const grid = el('div', { class: `ig-grid ${gridCls}` });
  if (explicitCols) grid.style.setProperty('--ig-cols', explicitCols);

  images.forEach((img, i) => {
    const cell = el('div', { class: 'ig-cell' });
    // Support span hints per image
    if (img.span === 2 || img.wide) cell.classList.add('ig-span-2');
    if (img.tall) cell.classList.add('ig-span-row');

    const imgEl = el('img', {
      src: img.src || img.url || '',
      alt: img.alt || img.caption || '',
      loading: i < 2 ? 'eager' : 'lazy',
    });
    cell.appendChild(imgEl);
    // Per-image caption overlay on hover
    if (img.caption) {
      cell.appendChild(el('div', { class: 'ig-cell-cap' }, img.caption));
    }
    grid.appendChild(cell);
  });

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
