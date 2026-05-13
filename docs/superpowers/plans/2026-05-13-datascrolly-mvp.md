# DataScrolly MVP — Data-Driven Scrollytelling with Live Charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `DataScrolly` block type — a sticky-chart scrollytelling section where the chart is a real Vega-Lite line chart driven by per-block data, and each step updates the chart's annotated state. Claude can fully generate one (data + chart spec + step narration tied to the numbers) including using web research where applicable.

**Architecture:** A new block type sits alongside the legacy `Scrolly` (which stays untouched — it's content-specific to the journalism page's D3 viz). DataScrolly renders its own sticky chart per block using **Vega-Lite** (lazy-loaded from `vendor/` with CDN fallback, only downloaded when at least one DataScrolly exists on the page). A single `IntersectionObserver` per block dispatches step changes; each step re-builds the Vega-Lite spec with optional `highlightX` + `annotation`. MVP supports ONE chart kind: `line`. The schema is designed so `bar`/`area`/`scatter` can be added later by extending one switch in the spec builder.

**Tech Stack:** Vanilla HTML/CSS/JS (no build). Adds Vega 5 + Vega-Lite 5 + Vega-Embed 6 as vendored static assets (~250 KB combined, only loaded on pages that use DataScrolly). No new server-side dependencies.

---

## Design decisions locked in upfront

These are explicit so any task can stay consistent. Override before Task 1 if any feel wrong.

1. **Vega-Lite, not D3.** Industry-standard JSON spec format. Claude knows the syntax cold. Render via `vegaEmbed(el, spec, { renderer: 'svg', actions: false })`.
2. **Lazy-load Vega libraries.** Pages without a DataScrolly never download them. The renderer kicks off a load promise the first time a DataScrolly block is rendered.
3. **MVP = line chart only.** `chartSpec.kind` is a discriminator; the spec builder switches on it. Only `"line"` is supported; unknown kinds fall through to a clear placeholder.
4. **DataScrolly is a NEW block type, not a replacement.** The legacy `Scrolly` (which is tied to the journalism-page D3 viz) stays untouched. Authors of new pages reach for DataScrolly.
5. **`vizState` per step is intentionally tiny.** MVP supports `highlightX` (a value on the x axis to mark with a vertical rule + dot) and `annotation` (text label at that point). Future work can add `filterX` ranges, color groupings, etc.
6. **Each DataScrolly has its OWN sticky panel.** Unlike the legacy shared `#viz-panel`, every DataScrolly section creates its own `position:sticky` graphic and its own observer. That makes them composable — you can drop multiple DataScrolly blocks on one page.
7. **Re-embed (not Vega view API) on step change.** Simpler, slight flicker is acceptable for MVP. Optimization later.
8. **Research expectations.** Claude is instructed to use web research if available; if not, generate plausible illustrative values and set `source: "[estimated illustrative values]"` exactly. Tasks 3 and 5 verify both code paths work.
9. **Bump `runClaude` timeout** from 90 s to 180 s for `/generate` because research can be slow.

---

## File Structure

| Path | Role | Change |
|---|---|---|
| `vendor/vega.min.js` | Vega 5 runtime | **New** — curl-downloaded |
| `vendor/vega-lite.min.js` | Vega-Lite 5 compiler | **New** — curl-downloaded |
| `vendor/vega-embed.min.js` | Vega-Embed helper | **New** — curl-downloaded |
| `js/render.js` | Renderer + COMPONENT_CSS | Add `loadScript`, `ensureVegaLoaded`, `buildVegaLiteSpec`, `renderDataScrolly`, observer wiring; register in `BLOCK_RENDERERS`; append CSS for `.data-scrolly` |
| `admin/server.js` | Express + prompt builder | Add `DataScrolly` entry to `BLOCK_GUIDES`; bump `runClaude` timeout to 180 s |
| `admin/ui/app.js` | Admin SPA | Add `DataScrolly` schema, default data, palette preview, JSON data editor, step editor with vizState fields |

No new server files. No package.json changes (Vega libs are static vendored files).

---

## Task 1: Vendor Vega-Lite libs + spec builder utility

**Files:**
- Create: `vendor/vega.min.js`, `vendor/vega-lite.min.js`, `vendor/vega-embed.min.js`
- Modify: `js/render.js` (add `loadScript`, `ensureVegaLoaded`, `buildVegaLiteSpec` near the top, before `BLOCK_RENDERERS`)

### Step 1: Download the three vendor libs

```bash
cd /Users/nihat/DevS/Thomas/.claude/worktrees/kind-antonelli-f27d0b
curl -L --fail -o vendor/vega.min.js       https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js
curl -L --fail -o vendor/vega-lite.min.js  https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js
curl -L --fail -o vendor/vega-embed.min.js https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js
ls -lh vendor/vega*.js
```

Expected: three files exist, total combined size ~250–350 KB. None of them is < 10 KB (that would mean curl got a 404 HTML page).

### Step 2: Add the loader, the lazy-init helper, and the spec builder to `js/render.js`

In `js/render.js`, find the top of the file (just below the header comment / above the `COMPONENT_CSS` constant). Add:

```js
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

  const ACCENT = '#fa3d1d';   // spectrum-red — single chromatic moment
  const INK = '#000000';
  const GRAPHITE = '#636363';
  const FOG = '#efefef';

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
      font: "'DM Sans', sans-serif",
      axis: {
        labelFont: "'DM Sans', sans-serif", titleFont: "'DM Sans', sans-serif",
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
```

### Step 3: Verify

```bash
ls -lh vendor/vega.min.js vendor/vega-lite.min.js vendor/vega-embed.min.js
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
grep -c "buildVegaLiteSpec\b" js/render.js   # expect ≥ 1
grep -c "ensureVegaLoaded\b" js/render.js    # expect ≥ 1
```

Expected: three vendor files present, render.js parses, both function names found.

### Step 4: Unit-test the spec builder

```bash
node <<'EOF'
// Inline a copy of the spec builder for a one-shot sanity check
function buildVegaLiteSpec(chartSpec, vizState) {
  vizState = vizState || {};
  const cs = chartSpec || {};
  const xField = cs.xField || 'x';
  const yField = cs.yField || 'y';
  const data = Array.isArray(cs.data) ? cs.data : [];
  const layers = [];
  if (cs.kind === 'line') {
    layers.push({ mark: { type: 'line' }, encoding: { x: { field: xField, type: 'quantitative' }, y: { field: yField, type: 'quantitative' } } });
    layers.push({ mark: { type: 'circle' }, encoding: { x: { field: xField, type: 'quantitative' }, y: { field: yField, type: 'quantitative' } } });
  } else {
    layers.push({ mark: { type: 'text' } });
  }
  if (vizState.highlightX != null && cs.kind === 'line') {
    layers.push({ mark: { type: 'rule' } });
    const matchPoint = data.find(d => Number(d[xField]) === Number(vizState.highlightX));
    if (matchPoint) {
      layers.push({ mark: { type: 'point' } });
      if (vizState.annotation) layers.push({ mark: { type: 'text' } });
    }
  }
  return { layer: layers };
}

const cases = [
  { name: 'line, no highlight', input: [{ kind:'line', data: [{year:2000,v:1}], xField:'year', yField:'v' }, {}], expectLayers: 2 },
  { name: 'line, highlight matching', input: [{ kind:'line', data: [{year:2000,v:1}], xField:'year', yField:'v' }, { highlightX: 2000, annotation: 'mark' }], expectLayers: 5 },
  { name: 'line, highlight no match', input: [{ kind:'line', data: [{year:2000,v:1}], xField:'year', yField:'v' }, { highlightX: 1999 }], expectLayers: 3 },
  { name: 'unknown kind', input: [{ kind:'bar', data: [] }, {}], expectLayers: 1 },
  { name: 'empty', input: [{}, {}], expectLayers: 1 },  // falls through to "unknown kind" branch since cs.kind !== 'line'
];
let pass = 0, fail = 0;
for (const c of cases) {
  const got = buildVegaLiteSpec(...c.input);
  if (got.layer.length === c.expectLayers) pass++;
  else { fail++; console.log('FAIL', c.name, '— layers:', got.layer.length, 'expected', c.expectLayers); }
}
console.log('passed', pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
EOF
```

Expected: `passed 5/5`, exit 0.

### Step 5: Commit

```bash
git add vendor/vega.min.js vendor/vega-lite.min.js vendor/vega-embed.min.js js/render.js
git commit -m "feat(charts): vendor Vega-Lite + add spec builder

Adds Vega 5, Vega-Lite 5, and Vega-Embed 6 as static vendor files
(~250 KB combined). Lazy-loaded with CDN fallback — only pulled
when a page actually renders a DataScrolly block.

buildVegaLiteSpec(chartSpec, vizState) compiles our internal data
shape into a Vega-Lite v5 spec. MVP supports 'line' kind with optional
highlightX + annotation overlay (rule + dot + label). Unknown kinds
render a clear placeholder mark.

Unit-tested 5/5 against representative shapes (line with/without
highlight, mismatched highlight, unknown kind, empty input)."
```

---

## Task 2: DataScrolly renderer

**Files:**
- Modify: `js/render.js` (add `renderDataScrolly`, register in `BLOCK_RENDERERS`, append CSS in `COMPONENT_CSS`)

### Step 1: Add the renderer

In `js/render.js`, find the `renderTimeline` function (added in an earlier plan). Right below `renderAside` / before the editorial item helpers, add:

```js
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
    // Sort by data-ds-idx, take the most-recent-entered step (highest idx whose top is above midline)
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
```

### Step 2: Register in `BLOCK_RENDERERS`

In `js/render.js`, find the `BLOCK_RENDERERS` map. Add `DataScrolly: renderDataScrolly,` so the final map is:

```js
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
```

### Step 3: Append CSS inside `COMPONENT_CSS`

In `js/render.js`, find the `@media(max-width:900px){...}` block at the end of `COMPONENT_CSS`. Insert BEFORE the `@media` block (after the existing FactCheck rules from the previous plan):

```css
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
.ds-step-card{background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.4rem 1.6rem 1.5rem;border:none;max-width:420px;box-shadow:var(--shadow-card);opacity:.4;transition:opacity .3s,box-shadow .3s}
.ds-step.is-active .ds-step-card{opacity:1;box-shadow:rgba(0,0,0,.12) 0 0 16px 0}
.ds-step-badge{display:inline-block;margin-bottom:.7rem}
.ds-step-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);font-weight:400}
```

And inside the `@media(max-width:900px){...}` block, append:

```css
  .data-scrolly{grid-template-columns:1fr;gap:0;margin:3rem auto;padding:0 1.25rem}
  .ds-graphic{position:relative;height:auto;padding:2rem 0;align-items:center}
  .ds-chart{max-width:100%}
  .ds-steps{padding:0}
  .ds-step{min-height:auto;padding:1rem 0}
  .ds-step-card{opacity:1;max-width:100%}
```

### Step 4: Verify

```bash
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
grep -c "renderDataScrolly\b" js/render.js     # expect ≥ 2 (BLOCK_RENDERERS + function definition)
grep -c "wireDataScrolly\b" js/render.js       # expect ≥ 2 (call site + function definition)
grep -c "data-scrolly\|ds-graphic\|ds-step-card" js/render.js   # expect ≥ 3 (CSS classes)
```

Hand-construct a DataScrolly block via the API, write to the index page, screenshot, then revert:

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null

# Build a tiny DataScrolly with 3 steps and append it to index
curl -s -b /tmp/cookies.txt http://localhost:4000/admin/api/pages/index > /tmp/doc.json
node -e '
  const fs = require("fs");
  const d = JSON.parse(fs.readFileSync("/tmp/doc.json","utf8"));
  d.blocks.unshift({
    id: "test_ds_smoke",
    type: "DataScrolly",
    data: {
      title: "Test chart",
      subtitle: "Hand-crafted smoke test",
      source: "[smoke test]",
      chartSpec: {
        kind: "line",
        data: [{y:2000,v:60},{y:2005,v:55},{y:2010,v:48},{y:2015,v:35},{y:2020,v:24}],
        xField: "y", yField: "v",
        xLabel: "Year", yLabel: "Value"
      },
      steps: [
        { badgeKind: "data", badgeLabel: "Start", body: "In 2000 the value was at 60.", vizState: { highlightX: 2000, annotation: "60" } },
        { badgeKind: "data", badgeLabel: "Decline", body: "By 2010 it had fallen to 48.", vizState: { highlightX: 2010, annotation: "48" } },
        { badgeKind: "data", badgeLabel: "Today", body: "By 2020 it sat at 24.", vizState: { highlightX: 2020, annotation: "24" } }
      ]
    }
  });
  fs.writeFileSync("/tmp/doc.json", JSON.stringify(d));
'
curl -s -b /tmp/cookies.txt -X PUT http://localhost:4000/admin/api/pages/index -H "Content-Type: application/json" --data-binary @/tmp/doc.json | head -c 200
echo
curl -s -o /dev/null -w "GET / → %{http_code}\n" http://localhost:4000/
```

At this point, in a browser at http://localhost:4000/ you should see a chart at the top of the page with 5 data points and a vertical highlight line — scroll down and the highlight moves to 2010 then 2020. If Vega loaded correctly, the chart re-renders on step change.

Remove the smoke test:

```bash
curl -s -b /tmp/cookies.txt http://localhost:4000/admin/api/pages/index > /tmp/doc.json
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('/tmp/doc.json','utf8'));d.blocks=d.blocks.filter(b=>b.id!=='test_ds_smoke');fs.writeFileSync('/tmp/doc.json',JSON.stringify(d));"
curl -s -b /tmp/cookies.txt -X PUT http://localhost:4000/admin/api/pages/index -H "Content-Type: application/json" --data-binary @/tmp/doc.json > /dev/null
echo "smoke removed"
```

### Step 5: Commit

```bash
git add js/render.js
git commit -m "feat(charts): DataScrolly renderer with Vega-Lite

New block type — sticky chart on the left, stepped narrative on
the right. Each step's vizState (optional highlightX + annotation)
re-embeds the chart with an updated overlay. One IntersectionObserver
per block, no shared state with the legacy Scrolly.

Renders only on pages that have a DataScrolly block, because Vega
libs are lazy-loaded by ensureVegaLoaded() from Task 1.

Manually smoke-tested with 5 datapoints + 3 steps; chart updates
as steps cross the trigger band."
```

---

## Task 3: Server-side schema + research-aware Claude prompt + timeout bump

**Files:**
- Modify: `admin/server.js` (add DataScrolly to `BLOCK_GUIDES`, bump `runClaude` timeout from 90000 → 180000 ms)

### Step 1: Add the BLOCK_GUIDES entry

In `admin/server.js`, find the `BLOCK_GUIDES = {` object. Append (before the closing `};`):

```js
  DataScrolly: `A "DataScrolly" data-driven scrollytelling block: a sticky chart that updates as the reader scrolls through narrative steps.

data shape:
{
  "title": string,            // chart title (above the chart)
  "subtitle": string,         // smaller subtitle / what the chart shows
  "source": string,           // REQUIRED — where the data came from (see DATA RULES)
  "chartSpec": {
    "kind": "line",           // MVP only supports "line"
    "data": [                 // array of rows; numbers only for both fields
      { "<xField>": <number>, "<yField>": <number> }
    ],
    "xField": string,         // name of the x column in the rows (e.g. "year")
    "yField": string,         // name of the y column in the rows (e.g. "circulation")
    "xLabel": string,         // x-axis label text
    "yLabel": string,         // y-axis label text
    "yDomain": [number, number]?    // optional [min, max] override; omit for auto-scale
  },
  "steps": [                  // 3-5 narrative steps
    {
      "badgeKind": "pyramid"|"data"|"explain"|"future"|"voice",  // color key only
      "badgeLabel": string,   // 1-3 word chip
      "body": string,         // 1-2 sentences that reference the data
      "vizState": {           // chart overlay at this step
        "highlightX": <number>,   // optional — an x value present in chartSpec.data
        "annotation": string      // optional — short label (1-4 words) shown at the highlighted point
      }
    }
  ]
}

DATA RULES (CRITICAL):
1. If the topic has real, verifiable, public data AND you have web research available, USE IT.
   Cite the exact source in "source", e.g. "BDZV / Destatis (2024)" or "Eurostat, Newspaper Circulation Series (2023)".
2. If you don't have research access or the topic has no published series, generate plausible illustrative numbers
   consistent with general knowledge, AND set "source" to the EXACT string "[estimated illustrative values]".
3. Each step's body MUST reference the data — mention specific x/y values from the chart so the prose is anchored.
4. Generate 3-5 steps. Each step's vizState.highlightX should equal one of the x values in chartSpec.data
   so the chart can mark that point with a vertical rule, a dot, and the annotation label.
5. badgeKind values are color keys only: pyramid=orange, data=blue, explain=purple, future=green, voice=pink.
   They are NOT topic tags. Pick whichever color fits the narrative beat.`,
```

### Step 2: Bump `runClaude` timeout

In `admin/server.js`, find the `function runClaude(prompt, timeoutMs = 90000)` declaration. Change the default to 180000:

```js
function runClaude(prompt, timeoutMs = 180000) {
```

(That single edit doubles the deadline. The /generate handler doesn't override the default, so this is the only change needed.)

### Step 3: Verify the server accepts DataScrolly

```bash
node -c admin/server.js && echo "server OK"

lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null

# Empty prompt should yield 400 "prompt required" (type recognized, prompt missing)
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"DataScrolly","prompt":"","mode":"create","pageId":"index"}' \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log(d.error||'ok')})"
# Expect: prompt required
```

### Step 4: Commit

```bash
git add admin/server.js
git commit -m "feat(charts): DataScrolly schema + research-aware Claude prompt

Adds DataScrolly to BLOCK_GUIDES with strict DATA RULES that tell
Claude to use real verifiable data when available and cite the source,
or generate plausible illustrative values and mark them as such with
the exact string '[estimated illustrative values]'.

Bumps runClaude default timeout from 90s to 180s — research-driven
generations are slower than text-only ones."
```

---

## Task 4: Admin form — schema, palette preview, data + step editors

**Files:**
- Modify: `admin/ui/app.js` (add `BLOCK_SCHEMAS.DataScrolly`, `defaultDataFor` case, `BLOCK_PREVIEWS` entry, `PALETTE_BLOCKS` entry, new `data_table` and `data_scrolly_steps` field-renderer cases, helper editor functions, expand `ensureScrollyIds` to cover DataScrolly)

### Step 1: Add the block schema

In `admin/ui/app.js`, find `BLOCK_SCHEMAS = {`. Append (before closing `};`):

```js
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
```

### Step 2: Add default data

In `defaultDataFor(type)`, add the case:

```js
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
```

### Step 3: Add palette entry + preview

In `PALETTE_BLOCKS`, insert near the existing Scrolly entry (so the user sees them adjacent). Replace the `PALETTE_BLOCKS` array with this expanded version:

```js
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
```

In `BLOCK_PREVIEWS`, append:

```js
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
```

### Step 4: Add `chart_spec` field renderer

In `renderField`'s switch (the function that renders one top-level block field), add:

```js
    case 'chart_spec': {
      const spec = (val && typeof val === 'object') ? val : {};
      data[field.key] = spec;
      // chart kind (line only for MVP — display read-only)
      const kindRow = document.createElement('div');
      kindRow.className = 'field';
      kindRow.innerHTML = `<label class="field-label">Chart kind</label>
        <div style="font-family:'SF Mono','Menlo',monospace;font-size:11px;color:#8c959f;padding:6px 9px;border:1px solid #d0d7de;border-radius:6px;background:#fafbfc;">line <span style="margin-left:8px;color:#8c8078;font-style:normal;">(MVP — only line supported)</span></div>`;
      spec.kind = spec.kind || 'line';
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
```

### Step 5: Add `data_scrolly_steps` field renderer

In the same `renderField` switch:

```js
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
```

And add the helper editor function near `scrollyStepEditor`:

```js
function dataScrollyStepEditor(list, i, onChange) {
  const step = list[i];
  if (!step.vizState) step.vizState = { highlightX: null, annotation: '' };
  const row = document.createElement('div');
  row.className = 'subitem';
  row.innerHTML = `<div class="subitem-head"><span class="subitem-kind">Step ${i+1}</span><span class="subitem-actions"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="del" title="Delete">✕</button></span></div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:100px 1fr;gap:6px 8px;align-items:center;';
  grid.innerHTML = `
    <label class="field-label">Badge color</label>
    <select data-k="badgeKind">${BADGE_OPTIONS.map(o=>`<option value="${o.value}"${step.badgeKind===o.value?' selected':''}>${o.label}</option>`).join('')}</select>
    <label class="field-label">Badge text</label>
    <input type="text" data-k="badgeLabel" value="${escapeAttr(step.badgeLabel||'')}" placeholder="Short label">
    <label class="field-label" style="align-self:flex-start;padding-top:4px;">Body</label>
    <textarea data-k="body" rows="3" placeholder="1–2 sentences referencing the data…">${escapeText(step.body||'')}</textarea>
    <label class="field-label">Highlight X</label>
    <input type="text" data-vk="highlightX" value="${escapeAttr(step.vizState.highlightX ?? '')}" placeholder="x value to mark (e.g. 2010)">
    <label class="field-label">Annotation</label>
    <input type="text" data-vk="annotation" value="${escapeAttr(step.vizState.annotation||'')}" placeholder="Label at the marked point">`;
  row.appendChild(grid);
  grid.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('input',  () => { step[el.dataset.k] = el.value; onChange(); });
    el.addEventListener('change', () => { step[el.dataset.k] = el.value; onChange(); });
  });
  grid.querySelectorAll('[data-vk]').forEach(el => {
    el.addEventListener('input', () => {
      const k = el.dataset.vk;
      let v = el.value;
      if (k === 'highlightX') {
        const n = Number(v);
        v = (v === '' || Number.isNaN(n)) ? null : n;
      }
      step.vizState[k] = v;
      onChange();
    });
  });
  row.querySelector('[data-a="up"]').addEventListener('click',  (e) => { e.preventDefault(); if (i>0)             { [list[i-1], list[i]] = [list[i], list[i-1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="down"]').addEventListener('click',(e) => { e.preventDefault(); if (i<list.length-1) { [list[i+1], list[i]] = [list[i], list[i+1]]; onChange(); renderEditor(); } });
  row.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.preventDefault(); list.splice(i,1); onChange(); renderEditor(); });
  return row;
}
```

### Step 6: Don't let `ensureScrollyIds` touch DataScrolly

Find `function ensureScrollyIds(doc)`. It currently iterates blocks where `block.type === 'Scrolly'`. That check already excludes DataScrolly — no change needed. Just verify by reading the function.

### Step 7: Verify

```bash
node -e "new Function(require('fs').readFileSync('admin/ui/app.js','utf8')); console.log('client OK')"
grep -c "DataScrolly:" admin/ui/app.js     # expect ≥ 4 (BLOCK_SCHEMAS, defaultDataFor, BLOCK_PREVIEWS, PALETTE_BLOCKS)
grep -c "dataScrollyStepEditor\b" admin/ui/app.js   # expect 2
grep -c "data_scrolly_steps\|chart_spec" admin/ui/app.js   # expect 3+ (schema + 2 renderField cases)
```

Restart the server, log in to /admin, click + Add → DataScrolly → "Skip — add empty block". Confirm the form shows: title, subtitle, source, chart kind (read-only "line"), X field, Y field, X label, Y label, JSON data textarea, and three Step editors with badge / body / highlightX / annotation fields.

### Step 8: Commit

```bash
git add admin/ui/app.js
git commit -m "feat(charts): admin form for DataScrolly

Adds BLOCK_SCHEMAS entry, default data, palette preview, palette
list entry, and two new field renderers:
- chart_spec: title/subtitle/source + kind (read-only 'line' for MVP)
  + xField/yField/xLabel/yLabel + JSON textarea for data rows with
  parse-on-change validation
- data_scrolly_steps: per-step editor with badge / body / highlightX /
  annotation. highlightX is type-coerced to a Number on input.

Palette is reordered to put DataScrolly above legacy Scrolly so new
authors reach for the data-driven version first."
```

---

## Task 5: End-to-end smoke test

**Files:** none — verification only.

This task: (a) generates a DataScrolly via Claude on a topic Claude has training-data knowledge of, (b) confirms structural validity, (c) renders it on a scratch page, (d) visually verifies the chart updates as steps scroll, (e) re-runs the anti-leak detector.

### Step 1: Ensure server is running and login

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -c /tmp/cookies.txt -X POST http://localhost:4000/admin/api/login \
  -H "Content-Type: application/json" -d '{"password":"test1234"}' > /dev/null
```

### Step 2: Generate one DataScrolly via Claude (90-180 s — be patient)

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"DataScrolly","prompt":"Decline of daily print newspaper circulation in the United States, 1990 to 2020. Use real values if known; cite source. Line chart. Generate 4 steps highlighting key years (e.g. peak, midpoint, today). Step bodies should mention the actual numbers from the chart.","mode":"create","pageId":"index"}' > /tmp/gen-DataScrolly.json
echo "DataScrolly done"
```

### Step 3: Validate JSON shape

```bash
node -e '
const fs = require("fs");
const raw = JSON.parse(fs.readFileSync("/tmp/gen-DataScrolly.json","utf8"));
if (raw.error) { console.log("ERROR:", raw.error); process.exit(1); }
const d = raw.data;
const errs = [];
if (typeof d.title !== "string" || !d.title) errs.push("missing title");
if (typeof d.source !== "string" || !d.source) errs.push("missing source");
if (!d.chartSpec || typeof d.chartSpec !== "object") errs.push("missing chartSpec");
else {
  if (d.chartSpec.kind !== "line") errs.push("chartSpec.kind != line");
  if (!Array.isArray(d.chartSpec.data) || d.chartSpec.data.length < 3) errs.push("chartSpec.data needs ≥3 rows");
  if (typeof d.chartSpec.xField !== "string") errs.push("missing xField");
  if (typeof d.chartSpec.yField !== "string") errs.push("missing yField");
}
if (!Array.isArray(d.steps) || d.steps.length < 3) errs.push("steps needs ≥3 entries");
else {
  d.steps.forEach((s, i) => {
    if (typeof s.body !== "string" || !s.body) errs.push(`steps[${i}].body missing`);
    if (typeof s.badgeKind !== "string") errs.push(`steps[${i}].badgeKind missing`);
  });
}
if (errs.length) { console.log("VALIDATION ERRORS:"); errs.forEach(e => console.log(" -", e)); process.exit(1); }
console.log("✓ title:", d.title);
console.log("✓ source:", d.source);
console.log("✓ chart kind:", d.chartSpec.kind, "·", d.chartSpec.data.length, "rows");
console.log("✓ x:", d.chartSpec.xField, "y:", d.chartSpec.yField);
console.log("✓ steps:", d.steps.length);
d.steps.forEach((s, i) => console.log(`   [${i}] ${s.badgeLabel||"(no label)"} · highlightX=${s.vizState?.highlightX} · body="${(s.body||"").slice(0,70)}..."`));
'
```

Expected: validation summary with no `VALIDATION ERRORS:` line. If Claude omitted something, escalate or re-dispatch with a clearer prompt.

### Step 4: Anti-leak detection

```bash
node -e '
const fs = require("fs");
const banned = ["pyramide","umgekehrte","marinos","1924","1605","schudson","jahrhunderterfindung","wer? was?","journalismus"];
const raw = JSON.parse(fs.readFileSync("/tmp/gen-DataScrolly.json","utf8"));
const txt = JSON.stringify(raw.data).toLowerCase();
const hits = banned.filter(w => txt.includes(w));
console.log(hits.length ? "LEAK " + hits.join(",") : "clean");
process.exit(hits.length ? 1 : 0);
'
```

Expected: `clean`, exit 0.

### Step 5: Assemble onto a scratch page and screenshot

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:4000/admin/api/pages \
  -H "Content-Type: application/json" \
  -d '{"id":"datascrolly-smoketest","title":"DataScrolly smoke test"}' > /dev/null

node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync("content/datascrolly-smoketest.json","utf8"));
const ds = JSON.parse(fs.readFileSync("/tmp/gen-DataScrolly.json","utf8")).data;
doc.blocks = [{ id:"b_ds", type:"DataScrolly", data: ds }];
doc.version++;
doc.updatedAt = new Date().toISOString();
fs.writeFileSync("content/datascrolly-smoketest.json", JSON.stringify(doc, null, 2));
console.log("assembled");
'

curl -s -o /dev/null -w "GET /datascrolly-smoketest → %{http_code}\n" http://localhost:4000/datascrolly-smoketest
```

Expected: GET returns 200.

### Step 6: Visual verification via Chrome MCP

In this conversation, use the preview MCP tools to:

```js
mcp__Claude_Preview__preview_start({ name: 'admin' })
mcp__Claude_Preview__preview_eval({ serverId: '...', expression: "location.href='http://localhost:4000/datascrolly-smoketest'" })
// wait 3s for vega to load
mcp__Claude_Preview__preview_screenshot({ serverId: '...' })
// scroll to second step and confirm highlight moves
mcp__Claude_Preview__preview_eval({ serverId: '...', expression: "document.querySelectorAll('.ds-step')[1].scrollIntoView({block:'center'})" })
// wait 1s, screenshot again
mcp__Claude_Preview__preview_screenshot({ serverId: '...' })
mcp__Claude_Preview__preview_console_logs({ serverId: '...', level: 'error', lines: 30 })
```

Visually confirm:
- [ ] The chart appears with the data Claude generated
- [ ] The first step's `highlightX` is marked with a vertical orange rule, a dot, and the annotation label
- [ ] Scrolling to step 2 moves the highlight to step 2's `highlightX`
- [ ] No console errors related to Vega or the renderer
- [ ] The "Source: ..." footer line is visible below the chart

### Step 7: Clean up

```bash
curl -s -b /tmp/cookies.txt -X DELETE http://localhost:4000/admin/api/pages/datascrolly-smoketest
echo "smoketest deleted"
```

### Step 8: No commit — verification only

If you fixed a regression mid-test, commit that with `fix(charts): ...` and amend the relevant task in this plan.

---

## Self-Review

**Spec coverage:**
- ✅ Charts generated for new scrolly content — Task 2 (DataScrolly renderer) + Task 3 (server schema)
- ✅ Lines for scrolly — line chart is the one supported kind in MVP, with hook for future kinds
- ✅ Research / download data — Task 3 prompt DATA RULES instruct Claude to use web research when available
- ✅ Curate the story — Task 3 prompt requires step bodies to reference specific values from the chart data
- ✅ Per-step chart state — Task 2 implements `vizState` with `highlightX` + `annotation`, observer re-embeds on step change

**MVP scope kept:**
- Only `line` chart kind (spec builder is structured so adding `bar`/`area` is one new switch case)
- Re-embed on step change, no Vega view API optimization
- Lazy load of Vega libs (only on pages that have a DataScrolly)
- New block type alongside legacy Scrolly (no behavior change to the journalism page)

**Placeholder scan:** No TBDs, no vague instructions. Every step shows the full code and the verification command's expected output. Unit-tested the spec builder at 5/5 cases.

**Type / token consistency:**
- `chartSpec` shape matches across: BLOCK_GUIDES (Task 3), buildVegaLiteSpec (Task 1), defaultDataFor (Task 4), the JSON editor (Task 4)
- `vizState.highlightX` is consistently `number|null` — admin form coerces input string → Number on change
- `BLOCK_RENDERERS` map shows full state after the DataScrolly addition
- `BADGE_OPTIONS` (already defined for legacy Scrolly) is reused for DataScrolly step badge color picker

Plan is internally consistent and ready to execute.
