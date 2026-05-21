// DataScrolly quality assessment — extracted for testability
// Returns { score, warnings[] } or null for non-DataScrolly

function assessDataScrollyQuality(type, data) {
  if (type !== 'DataScrolly' || !data) return null;
  const warnings = [];
  let score = 100; // start at 100, deduct for issues

  const spec = data.chartSpec || {};
  const chartData = Array.isArray(spec.data) ? spec.data : [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const xF = spec.xField || 'x';
  const yF = spec.yField || 'y';

  // 1. Data quantity check
  if (chartData.length < 3) {
    warnings.push('Very few data points (' + chartData.length + '). Add more data for a meaningful chart.');
    score -= 40;
  } else if (chartData.length < 6) {
    warnings.push('Only ' + chartData.length + ' data points. Consider adding more for richer visualization.');
    score -= 15;
  }

  // 2. Placeholder data detection — look for suspiciously round/fake values
  const yValues = chartData.map(d => +d[yF]).filter(v => !isNaN(v));
  const allRound = yValues.length > 2 && yValues.every(v => v % 5 === 0 || v % 10 === 0);
  const allSimple = yValues.length > 0 && yValues.every(v => v <= 100 && v === Math.round(v));
  const isSequential = yValues.length >= 3 && yValues.every((v, i) => i === 0 || v > yValues[i - 1]);
  if (allRound && allSimple && isSequential && yValues[0] <= 10) {
    warnings.push('Data values look like placeholders (10, 20, 30...). Replace with real data for the topic.');
    score -= 30;
  }

  // 3. Generic label detection
  const xLabel = (spec.xLabel || '').toLowerCase();
  const yLabel = (spec.yLabel || '').toLowerCase();
  if (['x', 'value', 'label', 'category', ''].includes(xLabel)) {
    warnings.push('X-axis label is generic ("' + spec.xLabel + '"). Use a descriptive label with units.');
    score -= 10;
  }
  if (['y', 'value', 'count', ''].includes(yLabel)) {
    warnings.push('Y-axis label is generic ("' + spec.yLabel + '"). Use a descriptive label with units.');
    score -= 10;
  }

  // 4. Source check
  if (!data.source || data.source.length < 5) {
    warnings.push('No data source cited. Add a source for credibility.');
    score -= 10;
  }

  // 5. Step-data consistency — check that highlightX values exist in the data
  const xValues = new Set(chartData.map(d => String(d[xF])));
  steps.forEach((s, i) => {
    const hx = s.vizState?.highlightX;
    if (hx != null && !xValues.has(String(hx))) {
      warnings.push('Step ' + (i + 1) + ' highlights "' + hx + '" which doesn\'t exist in the chart data.');
      score -= 10;
    }
  });

  // 6. Check for chart type morphing
  const hasMorph = steps.some(s => s.vizState?.chartType);
  if (!hasMorph && steps.length >= 3) {
    warnings.push('No chart type transitions between steps. Add chartType morphing for visual impact.');
    score -= 5;
  }

  return { score: Math.max(0, score), warnings };
}

module.exports = { assessDataScrollyQuality };
