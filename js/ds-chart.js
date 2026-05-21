// js/ds-chart.js — D3-powered chart engine for DataScrolly blocks.
// Replaces static Vega-Lite re-embeds with fluid, animated transitions.
//
// Supports: bar, line, area, scatter, grouped-bar
// Each step's vizState can morph the chart type, highlight elements,
// filter data, change domains, and add annotations — all with smooth D3 transitions.
//
// Usage:
//   const chart = new DSChart(hostElement, chartSpec);
//   chart.update(vizState);  // animate to new state

const DURATION = 800;
const EASE = d3.easeCubicInOut;

// ──────────────── Theme Colors ────────────────
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    ink:      s.getPropertyValue('--ink-black').trim()    || '#000',
    graphite: s.getPropertyValue('--graphite').trim()     || '#636363',
    fog:      s.getPropertyValue('--fog').trim()          || '#efefef',
    accent:   s.getPropertyValue('--spectrum-red').trim() || '#fa3d1d',
    blue:     s.getPropertyValue('--signal-blue').trim()  || '#0358f7',
    canvas:   s.getPropertyValue('--canvas').trim()       || '#f8f8f8',
    font:     s.getPropertyValue('--font-body').trim()    || "'DM Sans', sans-serif",
  };
}

// Color palette for multi-series / grouped data
const PALETTE = [
  '#fa3d1d', '#0358f7', '#ffb005', '#c679c4', '#3d7a4a',
  '#5d8fa8', '#7a5a90', '#c06830', '#3d7a94', '#a855b8',
];

// ──────────────── DSChart Class ────────────────
export class DSChart {
  constructor(host, chartSpec) {
    this.host = host;
    this.spec = chartSpec || {};
    this.xField = this.spec.xField || 'x';
    this.yField = this.spec.yField || 'y';
    this.colorField = this.spec.colorField || null;
    this.rawData = Array.isArray(this.spec.data) ? this.spec.data : [];
    this._currentType = null;
    this._currentViz = {};
    this._resizeObs = null;

    // Margin convention — generous space for labels and breathing room
    this.margin = { top: 28, right: 28, bottom: 52, left: 60 };

    this._setup();
  }

  _setup() {
    const c = themeColors();
    this.host.innerHTML = '';
    this.host.style.position = 'relative';

    this.svg = d3.select(this.host)
      .append('svg')
      .attr('class', 'ds-svg')
      .style('width', '100%')
      .style('display', 'block')
      .style('overflow', 'visible');

    // Defs for gradients and clip paths
    const defs = this.svg.append('defs');

    // Area gradient
    const areaGrad = defs.append('linearGradient')
      .attr('id', 'ds-area-grad-' + this._uid())
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    areaGrad.append('stop').attr('offset', '0%').attr('stop-color', c.ink).attr('stop-opacity', 0.15);
    areaGrad.append('stop').attr('offset', '100%').attr('stop-color', c.ink).attr('stop-opacity', 0.02);
    this._areaGradId = areaGrad.attr('id');

    // Accent gradient for highlight
    const accentGrad = defs.append('linearGradient')
      .attr('id', 'ds-accent-grad-' + this._uid())
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    accentGrad.append('stop').attr('offset', '0%').attr('stop-color', c.accent).attr('stop-opacity', 0.25);
    accentGrad.append('stop').attr('offset', '100%').attr('stop-color', c.accent).attr('stop-opacity', 0.03);
    this._accentGradId = accentGrad.attr('id');

    // Clip path
    const clipId = 'ds-clip-' + this._uid();
    defs.append('clipPath').attr('id', clipId).append('rect');
    this._clipId = clipId;

    // Groups
    this.gGrid = this.svg.append('g').attr('class', 'ds-grid');
    this.gAxis = this.svg.append('g').attr('class', 'ds-axes');
    this.gPlot = this.svg.append('g').attr('class', 'ds-plot').attr('clip-path', `url(#${clipId})`);
    this.gHighlight = this.svg.append('g').attr('class', 'ds-highlight');
    this.gAnnotation = this.svg.append('g').attr('class', 'ds-annotation');

    // Tooltip
    this.tooltip = d3.select(this.host)
      .append('div')
      .attr('class', 'ds-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('background', 'rgba(255,255,255,0.95)')
      .style('backdrop-filter', 'blur(12px)')
      .style('-webkit-backdrop-filter', 'blur(12px)')
      .style('border', '1px solid rgba(0,0,0,0.08)')
      .style('border-radius', '8px')
      .style('padding', '6px 10px')
      .style('font-size', '12px')
      .style('font-family', c.font)
      .style('color', c.ink)
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)')
      .style('z-index', '20')
      .style('white-space', 'nowrap');

    // Responsive resize
    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(this.host);

    this._measure();
  }

  _uid() {
    return Math.random().toString(36).slice(2, 8);
  }

  _measure() {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(rect.width, 300);
    this.height = Math.max(Math.min(this.width * 0.6, 440), 280);
    this.innerW = this.width - this.margin.left - this.margin.right;
    this.innerH = this.height - this.margin.top - this.margin.bottom;

    this.svg
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('height', this.height);

    // Update clip rect
    this.svg.select(`#${this._clipId} rect`)
      .attr('x', this.margin.left)
      .attr('y', this.margin.top)
      .attr('width', this.innerW)
      .attr('height', this.innerH);
  }

  _onResize() {
    this._measure();
    if (this._currentType) {
      this.update(this._currentViz, true);
    }
  }

  // ──────────── Public API ────────────

  update(vizState, instant) {
    vizState = vizState || {};
    const dur = instant ? 0 : (vizState.duration || DURATION);
    const c = themeColors();

    // Determine chart type — vizState can override the base spec
    const chartType = vizState.chartType || this.spec.kind || 'line';
    const prevType = this._currentType;

    // Resolve data — vizState can filter; guard against empty/missing data
    if (!this.rawData || !this.rawData.length) {
      console.warn('DSChart.update: no data available');
      return;
    }
    let data = this.rawData.slice();
    if (vizState.filter && vizState.filter.field && vizState.filter.values) {
      const fld = vizState.filter.field;
      const vals = new Set(vizState.filter.values);
      data = data.filter(d => vals.has(d[fld]));
    }
    if (vizState.sort === 'ascending') {
      data = data.slice().sort((a, b) => d3.ascending(+a[this.yField], +b[this.yField]));
    } else if (vizState.sort === 'descending') {
      data = data.slice().sort((a, b) => d3.descending(+a[this.yField], +b[this.yField]));
    }

    // Determine if X is categorical (strings) or quantitative (numbers)
    const xIsCat = data.length > 0 && isNaN(+data[0][this.xField]);

    // Band scales (bar, grouped-bar) need ALL unique x values, not just [min,max].
    // d3.extent() returns [min, max] which would leave intermediate values
    // without a band position — causing bars to render at 0 width.
    const needsBand = xIsCat || chartType === 'bar' || chartType === 'grouped-bar';

    let xDomain;
    if (vizState.xDomain) {
      xDomain = vizState.xDomain;
    } else if (needsBand) {
      // Extract every unique x value so every bar gets a band
      const seen = new Set();
      xDomain = [];
      for (const d of data) {
        const v = xIsCat ? d[this.xField] : +d[this.xField];
        if (!seen.has(v)) { seen.add(v); xDomain.push(v); }
      }
      // Sort numeric values so bars render in natural order
      if (!xIsCat) xDomain.sort((a, b) => a - b);
    } else {
      xDomain = d3.extent(data, d => +d[this.xField]);
    }

    const yMax = vizState.yDomain
      ? vizState.yDomain[1]
      : d3.max(data, d => +d[this.yField]) * 1.1;
    const yDomain = vizState.yDomain || [0, yMax || 10];

    let xScale, isBand = false;
    if (needsBand) {
      xScale = d3.scaleBand()
        .domain(xDomain)
        .range([this.margin.left, this.margin.left + this.innerW])
        .padding(0.25);
      isBand = true;
    } else {
      xScale = d3.scaleLinear()
        .domain(xDomain)
        .range([this.margin.left, this.margin.left + this.innerW])
        .nice();
    }

    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range([this.margin.top + this.innerH, this.margin.top])
      .nice();

    // Color scale for multi-series
    let colorScale = null;
    if (this.colorField) {
      const groups = [...new Set(data.map(d => d[this.colorField]))];
      colorScale = d3.scaleOrdinal().domain(groups).range(PALETTE);
    }

    // Store current state
    this._currentType = chartType;
    this._currentViz = vizState;
    this._xScale = xScale;
    this._yScale = yScale;
    this._isBand = isBand;
    this._data = data;
    this._colors = c;
    this._colorScale = colorScale;

    // Render
    this._renderAxes(xScale, yScale, isBand, c, dur);
    this._renderGrid(yScale, c, dur);
    this._renderPlot(chartType, prevType, data, xScale, yScale, isBand, colorScale, c, dur, vizState);
    this._renderHighlight(vizState, data, xScale, yScale, isBand, c, dur);
    this._renderAnnotation(vizState, data, xScale, yScale, isBand, c, dur);
  }

  // ──────────── Axes ────────────

  _renderAxes(xScale, yScale, isBand, c, dur) {
    const t = d3.transition().duration(dur).ease(EASE);

    // X axis
    let xAxisG = this.gAxis.select('.ds-x-axis');
    if (xAxisG.empty()) {
      xAxisG = this.gAxis.append('g').attr('class', 'ds-x-axis');
    }
    const xAxisGen = isBand
      ? d3.axisBottom(xScale).tickSize(0).tickPadding(10).tickFormat(v => String(v))
      : d3.axisBottom(xScale).ticks(Math.min(this.innerW / 80, 10)).tickSize(0).tickPadding(10).tickFormat(d3.format('d'));

    xAxisG
      .attr('transform', `translate(0,${this.margin.top + this.innerH})`)
      .transition(t)
      .call(xAxisGen);

    xAxisG.select('.domain').remove();
    xAxisG.selectAll('text')
      .style('font-family', c.font)
      .style('font-size', '11px')
      .style('fill', c.graphite);

    // X label
    let xLabel = this.gAxis.select('.ds-x-label');
    if (xLabel.empty()) {
      xLabel = this.gAxis.append('text').attr('class', 'ds-x-label').attr('text-anchor', 'middle');
    }
    xLabel
      .attr('x', this.margin.left + this.innerW / 2)
      .attr('y', this.height - 6)
      .text(this.spec.xLabel || '')
      .style('font-family', c.font)
      .style('font-size', '12px')
      .style('fill', c.graphite)
      .style('font-weight', '500');

    // Y axis
    let yAxisG = this.gAxis.select('.ds-y-axis');
    if (yAxisG.empty()) {
      yAxisG = this.gAxis.append('g').attr('class', 'ds-y-axis');
    }
    const yAxisGen = d3.axisLeft(yScale)
      .ticks(6)
      .tickSize(0)
      .tickPadding(8);

    yAxisG
      .attr('transform', `translate(${this.margin.left},0)`)
      .transition(t)
      .call(yAxisGen);

    yAxisG.select('.domain').remove();
    yAxisG.selectAll('text')
      .style('font-family', c.font)
      .style('font-size', '11px')
      .style('fill', c.graphite);

    // Y label
    let yLabel = this.gAxis.select('.ds-y-label');
    if (yLabel.empty()) {
      yLabel = this.gAxis.append('text').attr('class', 'ds-y-label').attr('text-anchor', 'middle');
    }
    yLabel
      .attr('transform', `translate(14,${this.margin.top + this.innerH / 2}) rotate(-90)`)
      .text(this.spec.yLabel || '')
      .style('font-family', c.font)
      .style('font-size', '12px')
      .style('fill', c.graphite)
      .style('font-weight', '500');
  }

  // ──────────── Grid Lines ────────────

  _renderGrid(yScale, c, dur) {
    const t = d3.transition().duration(dur).ease(EASE);
    const ticks = yScale.ticks(6);

    const lines = this.gGrid.selectAll('.ds-gridline')
      .data(ticks, d => d);

    lines.exit()
      .transition(t)
      .style('opacity', 0)
      .remove();

    const enter = lines.enter()
      .append('line')
      .attr('class', 'ds-gridline')
      .attr('x1', this.margin.left)
      .attr('x2', this.margin.left + this.innerW)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .style('stroke', c.fog)
      .style('stroke-width', 1)
      .style('opacity', 0);

    enter.merge(lines)
      .transition(t)
      .attr('x1', this.margin.left)
      .attr('x2', this.margin.left + this.innerW)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .style('stroke', c.fog)
      .style('opacity', 1);
  }

  // ──────────── Plot (the main chart elements) ────────────

  _renderPlot(type, prevType, data, xScale, yScale, isBand, colorScale, c, dur, vizState) {
    const t = d3.transition().duration(dur).ease(EASE);
    const morphing = prevType && prevType !== type;

    // Clear elements of previous type that don't match
    if (morphing) {
      // Morph out old elements
      this._morphOut(prevType, t);
    }

    switch (type) {
      case 'bar':
        this._renderBars(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
        break;
      case 'line':
        this._renderLine(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
        break;
      case 'area':
        this._renderArea(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
        break;
      case 'scatter':
        this._renderScatter(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
        break;
      case 'grouped-bar':
        this._renderGroupedBars(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
        break;
      default:
        this._renderLine(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType);
    }
  }

  _morphOut(prevType, t) {
    // Smooth exit for elements of the old type
    if (prevType === 'bar' || prevType === 'grouped-bar') {
      this.gPlot.selectAll('.ds-bar')
        .transition(t)
        .attr('height', 0)
        .attr('y', this.margin.top + this.innerH)
        .style('opacity', 0)
        .remove();
    }
    if (prevType === 'line') {
      this.gPlot.selectAll('.ds-line-path, .ds-line-dot')
        .transition(t)
        .style('opacity', 0)
        .remove();
    }
    if (prevType === 'area') {
      this.gPlot.selectAll('.ds-area-path, .ds-area-line, .ds-area-dot')
        .transition(t)
        .style('opacity', 0)
        .remove();
    }
    if (prevType === 'scatter') {
      this.gPlot.selectAll('.ds-scatter-dot')
        .transition(t)
        .attr('r', 0)
        .style('opacity', 0)
        .remove();
    }
  }

  // ──────────── BAR CHART ────────────

  _renderBars(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField, cF = this.colorField;
    const highlightX = vizState.highlightX;
    const bottomY = this.margin.top + this.innerH;
    const self = this;

    // For band scales with numeric data, the domain contains numbers.
    // The data accessor must produce the same type used in the domain.
    const xIsCat = data.length > 0 && isNaN(+data[0][xF]);
    const xVal = d => xIsCat ? d[xF] : +d[xF];

    // If morphing from line/scatter, start bars from dots' positions
    const prevDots = morphing && (prevType === 'line' || prevType === 'scatter')
      ? this._collectDotPositions()
      : null;

    // Compute bar width — always use bandwidth for band scales
    const bw = isBand ? xScale.bandwidth() : Math.max(this.innerW / data.length * 0.6, 8);

    const bars = this.gPlot.selectAll('.ds-bar')
      .data(data, d => String(xVal(d)));

    // EXIT
    bars.exit()
      .transition(t)
      .attr('height', 0)
      .attr('y', bottomY)
      .style('opacity', 0)
      .remove();

    // ENTER
    const enter = bars.enter()
      .append('rect')
      .attr('class', 'ds-bar')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('x', d => isBand ? xScale(xVal(d)) : xScale(+d[xF]) - bw / 2)
      .attr('width', bw)
      .attr('y', d => {
        if (prevDots) {
          const prev = prevDots.get(String(xVal(d)));
          return prev ? prev.y : bottomY;
        }
        return bottomY;
      })
      .attr('height', d => {
        if (prevDots) {
          const prev = prevDots.get(String(xVal(d)));
          return prev ? Math.max(0, bottomY - prev.y) : 0;
        }
        return 0;
      })
      .style('fill', d => {
        if (highlightX != null && String(xVal(d)) === String(highlightX)) return c.accent;
        return colorScale ? colorScale(d[cF]) : c.ink;
      })
      .style('opacity', d => {
        if (highlightX != null && String(xVal(d)) !== String(highlightX)) return 0.35;
        return 0.85;
      })
      .style('cursor', 'pointer');

    // Add tooltip interactions on enter
    enter
      .on('mouseenter', function(event, d) {
        d3.select(this).transition().duration(150).style('opacity', 1);
        self._showTooltip(event, d);
      })
      .on('mousemove', function(event) { self._moveTooltip(event); })
      .on('mouseleave', function(event, d) {
        const isHL = highlightX != null && String(xVal(d)) !== String(highlightX);
        d3.select(this).transition().duration(150).style('opacity', isHL ? 0.35 : 0.85);
        self._hideTooltip();
      });

    // UPDATE + ENTER
    enter.merge(bars)
      .transition(t)
      .attr('x', d => isBand ? xScale(xVal(d)) : xScale(+d[xF]) - bw / 2)
      .attr('width', bw)
      .attr('y', d => yScale(+d[yF]))
      .attr('height', d => Math.max(0, bottomY - yScale(+d[yF])))
      .style('fill', d => {
        if (highlightX != null && String(xVal(d)) === String(highlightX)) return c.accent;
        return colorScale ? colorScale(d[cF]) : c.ink;
      })
      .style('opacity', d => {
        if (highlightX != null && String(xVal(d)) !== String(highlightX)) return 0.35;
        return 0.85;
      })
      .attr('rx', 3)
      .attr('ry', 3);
  }

  // ──────────── LINE CHART ────────────

  _renderLine(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing, prevType) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField;
    const highlightX = vizState.highlightX;
    const bottomY = this.margin.top + this.innerH;
    const self = this;

    const xPos = d => isBand ? xScale(d[xF]) + xScale.bandwidth() / 2 : xScale(+d[xF]);
    const yPos = d => yScale(+d[yF]);

    // Line generator
    const lineGen = d3.line()
      .x(xPos)
      .y(yPos)
      .curve(d3.curveMonotoneX);

    // Flat line for morph-in
    const flatLineGen = d3.line()
      .x(xPos)
      .y(() => bottomY)
      .curve(d3.curveMonotoneX);

    // PATH
    let path = this.gPlot.select('.ds-line-path');
    if (path.empty()) {
      path = this.gPlot.append('path')
        .attr('class', 'ds-line-path')
        .attr('fill', 'none')
        .attr('stroke', c.ink)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', morphing ? flatLineGen(data) : lineGen(data))
        .style('opacity', morphing ? 0 : 1);
    }

    path
      .transition(t)
      .attr('d', lineGen(data))
      .attr('stroke', c.ink)
      .attr('stroke-width', 2.5)
      .style('opacity', 1);

    // Draw-on animation for first render
    if (!morphing && !this._lineDrawn) {
      const totalLen = path.node().getTotalLength();
      path
        .attr('stroke-dasharray', totalLen)
        .attr('stroke-dashoffset', totalLen)
        .transition()
        .duration(dur * 1.5)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function() {
          d3.select(this).attr('stroke-dasharray', null);
        });
      this._lineDrawn = true;
    }

    // DOTS
    const dots = this.gPlot.selectAll('.ds-line-dot')
      .data(data, d => d[xF]);

    dots.exit()
      .transition(t)
      .attr('r', 0)
      .remove();

    const dotsEnter = dots.enter()
      .append('circle')
      .attr('class', 'ds-line-dot')
      .attr('cx', xPos)
      .attr('cy', morphing ? bottomY : yPos)
      .attr('r', 0)
      .style('fill', d => {
        if (highlightX != null && String(d[xF]) === String(highlightX)) return c.accent;
        return c.ink;
      })
      .style('cursor', 'pointer');

    dotsEnter
      .on('mouseenter', function(event, d) {
        d3.select(this).transition().duration(150).attr('r', 7);
        self._showTooltip(event, d);
      })
      .on('mousemove', function(event) { self._moveTooltip(event); })
      .on('mouseleave', function() {
        const isHL = highlightX != null && String(d3.select(this).datum()[xF]) === String(highlightX);
        d3.select(this).transition().duration(150).attr('r', isHL ? 6 : 3.5);
        self._hideTooltip();
      });

    dotsEnter.merge(dots)
      .transition(t)
      .attr('cx', xPos)
      .attr('cy', yPos)
      .attr('r', d => highlightX != null && String(d[xF]) === String(highlightX) ? 6 : 3.5)
      .style('fill', d => {
        if (highlightX != null && String(d[xF]) === String(highlightX)) return c.accent;
        return c.ink;
      })
      .style('opacity', d => {
        if (highlightX != null && String(d[xF]) !== String(highlightX)) return 0.4;
        return 1;
      });
  }

  // ──────────── AREA CHART ────────────

  _renderArea(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField;
    const bottomY = this.margin.top + this.innerH;
    const self = this;
    const highlightX = vizState.highlightX;

    const xPos = d => isBand ? xScale(d[xF]) + xScale.bandwidth() / 2 : xScale(+d[xF]);

    const areaGen = d3.area()
      .x(xPos)
      .y0(bottomY)
      .y1(d => yScale(+d[yF]))
      .curve(d3.curveMonotoneX);

    const flatAreaGen = d3.area()
      .x(xPos)
      .y0(bottomY)
      .y1(bottomY)
      .curve(d3.curveMonotoneX);

    const lineGen = d3.line()
      .x(xPos)
      .y(d => yScale(+d[yF]))
      .curve(d3.curveMonotoneX);

    // Area fill
    let areaPath = this.gPlot.select('.ds-area-path');
    if (areaPath.empty()) {
      areaPath = this.gPlot.append('path')
        .attr('class', 'ds-area-path')
        .attr('d', flatAreaGen(data))
        .style('fill', `url(#${this._areaGradId})`);
    }
    areaPath.transition(t).attr('d', areaGen(data));

    // Area stroke
    let areaLine = this.gPlot.select('.ds-area-line');
    if (areaLine.empty()) {
      areaLine = this.gPlot.append('path')
        .attr('class', 'ds-area-line')
        .attr('fill', 'none')
        .attr('stroke', c.ink)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round');
    }
    areaLine.transition(t).attr('d', lineGen(data)).attr('stroke', c.ink);

    // Dots
    const dots = this.gPlot.selectAll('.ds-area-dot')
      .data(data, d => d[xF]);
    dots.exit().transition(t).attr('r', 0).remove();
    const dotsE = dots.enter()
      .append('circle')
      .attr('class', 'ds-area-dot')
      .attr('cx', xPos)
      .attr('cy', bottomY)
      .attr('r', 0)
      .style('fill', c.ink)
      .style('cursor', 'pointer');
    dotsE
      .on('mouseenter', function(event, d) { d3.select(this).transition().duration(150).attr('r', 6); self._showTooltip(event, d); })
      .on('mousemove', function(event) { self._moveTooltip(event); })
      .on('mouseleave', function() { d3.select(this).transition().duration(150).attr('r', 3); self._hideTooltip(); });

    dotsE.merge(dots)
      .transition(t)
      .attr('cx', xPos)
      .attr('cy', d => yScale(+d[yF]))
      .attr('r', d => highlightX != null && String(d[xF]) === String(highlightX) ? 6 : 3)
      .style('fill', d => highlightX != null && String(d[xF]) === String(highlightX) ? c.accent : c.ink);
  }

  // ──────────── SCATTER ────────────

  _renderScatter(data, xScale, yScale, isBand, colorScale, c, dur, vizState, morphing) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField, cF = this.colorField;
    const highlightX = vizState.highlightX;
    const bottomY = this.margin.top + this.innerH;
    const self = this;

    const xPos = d => isBand ? xScale(d[xF]) + xScale.bandwidth() / 2 : xScale(+d[xF]);

    const dots = this.gPlot.selectAll('.ds-scatter-dot')
      .data(data, d => d[xF] + '-' + d[yF]);

    dots.exit()
      .transition(t)
      .attr('r', 0)
      .style('opacity', 0)
      .remove();

    const enter = dots.enter()
      .append('circle')
      .attr('class', 'ds-scatter-dot')
      .attr('cx', xPos)
      .attr('cy', morphing ? bottomY : d => yScale(+d[yF]))
      .attr('r', 0)
      .style('fill', d => colorScale ? colorScale(d[cF]) : c.ink)
      .style('opacity', 0.7)
      .style('cursor', 'pointer');

    enter
      .on('mouseenter', function(event, d) { d3.select(this).transition().duration(150).attr('r', 8).style('opacity', 1); self._showTooltip(event, d); })
      .on('mousemove', function(event) { self._moveTooltip(event); })
      .on('mouseleave', function() { d3.select(this).transition().duration(150).attr('r', 5).style('opacity', 0.7); self._hideTooltip(); });

    enter.merge(dots)
      .transition(t)
      .attr('cx', xPos)
      .attr('cy', d => yScale(+d[yF]))
      .attr('r', d => highlightX != null && String(d[xF]) === String(highlightX) ? 8 : 5)
      .style('fill', d => {
        if (highlightX != null && String(d[xF]) === String(highlightX)) return c.accent;
        return colorScale ? colorScale(d[cF]) : c.ink;
      })
      .style('opacity', d => {
        if (highlightX != null && String(d[xF]) !== String(highlightX)) return 0.25;
        return 0.7;
      });
  }

  // ──────────── GROUPED BAR ────────────

  _renderGroupedBars(data, xScale, yScale, isBand, colorScale, c, dur, vizState) {
    if (!this.colorField || !isBand) {
      return this._renderBars(data, xScale, yScale, isBand, colorScale, c, dur, vizState, false, null);
    }

    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField, cF = this.colorField;
    const highlightX = vizState.highlightX;
    const bottomY = this.margin.top + this.innerH;
    const self = this;
    const xIsCat = data.length > 0 && isNaN(+data[0][xF]);
    const xVal = d => xIsCat ? d[xF] : +d[xF];

    const groups = [...new Set(data.map(d => d[cF]))];
    const x1 = d3.scaleBand().domain(groups).range([0, xScale.bandwidth()]).padding(0.08);

    const bars = this.gPlot.selectAll('.ds-bar')
      .data(data, d => String(xVal(d)) + '-' + d[cF]);

    bars.exit()
      .transition(t)
      .attr('height', 0)
      .attr('y', bottomY)
      .remove();

    const enter = bars.enter()
      .append('rect')
      .attr('class', 'ds-bar')
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('x', d => xScale(xVal(d)) + x1(d[cF]))
      .attr('width', x1.bandwidth())
      .attr('y', bottomY)
      .attr('height', 0)
      .style('fill', d => colorScale(d[cF]))
      .style('opacity', 0.85)
      .style('cursor', 'pointer');

    enter
      .on('mouseenter', function(event, d) { d3.select(this).transition().duration(150).style('opacity', 1); self._showTooltip(event, d); })
      .on('mousemove', function(event) { self._moveTooltip(event); })
      .on('mouseleave', function() { d3.select(this).transition().duration(150).style('opacity', 0.85); self._hideTooltip(); });

    enter.merge(bars)
      .transition(t)
      .attr('x', d => xScale(xVal(d)) + x1(d[cF]))
      .attr('width', x1.bandwidth())
      .attr('y', d => yScale(+d[yF]))
      .attr('height', d => Math.max(0, bottomY - yScale(+d[yF])))
      .style('fill', d => {
        if (highlightX != null && String(xVal(d)) === String(highlightX)) return c.accent;
        return colorScale(d[cF]);
      })
      .style('opacity', d => {
        if (highlightX != null && String(xVal(d)) !== String(highlightX)) return 0.3;
        return 0.85;
      });
  }

  // ──────────── Highlight (vertical rule + pulse) ────────────

  _renderHighlight(vizState, data, xScale, yScale, isBand, c, dur) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField;
    const hx = vizState.highlightX;
    const xIsCat = data.length > 0 && isNaN(+data[0][xF]);

    // Vertical highlight rule
    if (hx != null) {
      // For band scales with numeric data, the domain contains numbers.
      // The highlight value must be coerced to match the domain type.
      const hxKey = isBand && !xIsCat ? +hx : hx;
      const xPos = isBand
        ? (xScale(hxKey) != null ? xScale(hxKey) + xScale.bandwidth() / 2 : NaN)
        : xScale(+hx);

      if (isNaN(xPos) || xPos == null) {
        this.gHighlight.selectAll('*').transition(t).style('opacity', 0).remove();
        return;
      }

      // Rule line
      let rule = this.gHighlight.select('.ds-hl-rule');
      if (rule.empty()) {
        rule = this.gHighlight.append('line')
          .attr('class', 'ds-hl-rule')
          .style('stroke', c.accent)
          .style('stroke-width', 1.5)
          .style('stroke-dasharray', '6,4')
          .style('opacity', 0);
      }
      rule.transition(t)
        .attr('x1', xPos).attr('x2', xPos)
        .attr('y1', this.margin.top)
        .attr('y2', this.margin.top + this.innerH)
        .style('stroke', c.accent)
        .style('opacity', 0.6);

      // Highlight dot on the data point — filled circle + outer ring
      const match = data.find(d => String(d[xF]) === String(hx));
      if (match) {
        const mxKey = xIsCat ? match[xF] : +match[xF];
        const px = isBand ? xScale(mxKey) + xScale.bandwidth() / 2 : xScale(+match[xF]);
        const py = yScale(+match[yF]);

        // Solid inner dot
        let dot = this.gHighlight.select('.ds-hl-dot');
        if (dot.empty()) {
          dot = this.gHighlight.append('circle')
            .attr('class', 'ds-hl-dot')
            .attr('cx', px).attr('cy', py)
            .attr('r', 0)
            .style('fill', c.accent);
        }
        dot
          .transition(t)
          .attr('cx', px).attr('cy', py)
          .attr('r', 5)
          .style('fill', c.accent);

        // Outer ring pulse
        let pulse = this.gHighlight.select('.ds-hl-pulse');
        if (pulse.empty()) {
          pulse = this.gHighlight.append('circle')
            .attr('class', 'ds-hl-pulse')
            .attr('cx', px).attr('cy', py)
            .attr('r', 0)
            .style('fill', 'none')
            .style('stroke', c.accent)
            .style('stroke-width', 1.5);
        }
        pulse
          .attr('cx', px).attr('cy', py)
          .attr('r', 5)
          .style('stroke', c.accent)
          .style('opacity', 1)
          .transition()
          .duration(dur)
          .ease(d3.easeCubicOut)
          .attr('r', 12)
          .style('opacity', 0.3);
      } else {
        this.gHighlight.select('.ds-hl-dot').transition(t).attr('r', 0).style('opacity', 0).remove();
        this.gHighlight.select('.ds-hl-pulse').transition(t).attr('r', 0).style('opacity', 0).remove();
      }
    } else {
      // Remove all highlight elements
      this.gHighlight.selectAll('*').transition(t).style('opacity', 0).remove();
    }
  }

  // ──────────── Annotation ────────────

  _renderAnnotation(vizState, data, xScale, yScale, isBand, c, dur) {
    const t = d3.transition().duration(dur).ease(EASE);
    const xF = this.xField, yF = this.yField;
    const ann = vizState.annotation;
    const hx = vizState.highlightX;
    const xIsCat = data.length > 0 && isNaN(+data[0][xF]);

    if (ann && hx != null) {
      const match = data.find(d => String(d[xF]) === String(hx));
      if (match) {
        const mxKey = xIsCat ? match[xF] : +match[xF];
        const px = isBand ? xScale(mxKey) + xScale.bandwidth() / 2 : xScale(+match[xF]);
        const py = yScale(+match[yF]);

        // Position above the point — clamp to stay inside chart
        const offsetY = -28;
        const labelY = Math.max(this.margin.top + 12, py + offsetY);
        // If point is near top, place label below instead
        const finalY = (py - this.margin.top) < 40 ? py + 28 : labelY;

        // Background pill + text label
        let bg = this.gAnnotation.select('.ds-ann-bg');
        let label = this.gAnnotation.select('.ds-ann-text');

        if (label.empty()) {
          bg = this.gAnnotation.append('rect')
            .attr('class', 'ds-ann-bg')
            .attr('rx', 10)
            .attr('ry', 10)
            .attr('x', px)
            .attr('y', finalY - 12)
            .attr('width', 0)
            .attr('height', 0)
            .style('fill', 'rgba(255,255,255,0.92)')
            .style('stroke', 'rgba(0,0,0,0.1)')
            .style('stroke-width', 1)
            .style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))')
            .style('opacity', 0);
          label = this.gAnnotation.append('text')
            .attr('class', 'ds-ann-text')
            .attr('x', px)
            .attr('y', finalY)
            .style('font-family', c.font)
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('fill', c.ink)
            .style('text-anchor', 'middle')
            .style('opacity', 0);
        }

        // Set text content first so we can measure, then animate position
        label.text(ann);

        // Measure text width at current position for bg sizing
        const bbox = label.node()?.getBBox();
        const textW = bbox ? bbox.width : ann.length * 7; // fallback estimate
        const textH = bbox ? bbox.height : 14;
        const pad = 10;

        // Animate both label and bg to the target position together
        label
          .transition(t)
          .attr('x', px)
          .attr('y', finalY)
          .style('fill', c.ink)
          .style('opacity', 1);

        bg
          .transition(t)
          .attr('x', px - textW / 2 - pad)
          .attr('y', finalY - textH + 1 - pad / 2)
          .attr('width', textW + pad * 2)
          .attr('height', textH + pad)
          .style('opacity', 1);
      }
    } else {
      this.gAnnotation.selectAll('*').transition(t).style('opacity', 0).remove();
    }
  }

  // ──────────── Tooltip ────────────

  _showTooltip(event, d) {
    const xF = this.xField, yF = this.yField, cF = this.colorField;
    const val = d[yF];
    const label = d[xF];
    const series = cF && d[cF] ? ` · ${d[cF]}` : '';
    const formatted = typeof val === 'number'
      ? (val >= 1000 ? d3.format(',.0f')(val) : d3.format('.1f')(val))
      : val;

    this.tooltip
      .html(`<strong>${label}${series}</strong><br/>${this.spec.yLabel || yF}: ${formatted}`)
      .transition()
      .duration(150)
      .style('opacity', 1);

    this._moveTooltip(event);
  }

  _moveTooltip(event) {
    const rect = this.host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.tooltip
      .style('left', (x + 14) + 'px')
      .style('top', (y - 10) + 'px');
  }

  _hideTooltip() {
    this.tooltip.transition().duration(200).style('opacity', 0);
  }

  // ──────────── Helpers ────────────

  _collectDotPositions() {
    const positions = new Map();
    this.gPlot.selectAll('circle').each(function() {
      const el = d3.select(this);
      const cx = +el.attr('cx');
      const cy = +el.attr('cy');
      // Get the data key from bound datum
      const d = el.datum();
      if (d) positions.set(String(Object.values(d)[0]), { x: cx, y: cy });
    });
    return positions;
  }

  destroy() {
    if (this._resizeObs) this._resizeObs.disconnect();
    this.host.innerHTML = '';
  }
}
