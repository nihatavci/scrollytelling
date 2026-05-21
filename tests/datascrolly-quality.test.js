const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assessDataScrollyQuality } = require('../functions/lib/datascrolly-quality');

// ── Helper: build valid DataScrolly data with sensible defaults ──
function makeData(overrides = {}) {
  return {
    source: 'World Bank, 2024',
    chartSpec: {
      kind: 'bar',
      data: [
        { year: '2015', value: 547 },
        { year: '2016', value: 753 },
        { year: '2017', value: 1223 },
        { year: '2018', value: 2018 },
        { year: '2019', value: 2264 },
        { year: '2020', value: 3240 },
        { year: '2021', value: 6750 },
        { year: '2022', value: 10200 },
      ],
      xField: 'year',
      yField: 'value',
      xLabel: 'Year',
      yLabel: 'EV Sales (thousands)',
    },
    steps: [
      { badgeKind: 'data', badgeLabel: 'Step 1', body: 'Early growth', vizState: { highlightX: '2015' } },
      { badgeKind: 'data', badgeLabel: 'Step 2', body: 'Acceleration', vizState: { highlightX: '2020' } },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. Null / non-DataScrolly returns
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — null returns', () => {
  it('returns null for non-DataScrolly type', () => {
    assert.equal(assessDataScrollyQuality('TextBlock', {}), null);
  });

  it('returns null when type is DataScrolly but data is null', () => {
    assert.equal(assessDataScrollyQuality('DataScrolly', null), null);
  });

  it('returns null when type is DataScrolly but data is undefined', () => {
    assert.equal(assessDataScrollyQuality('DataScrolly', undefined), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Perfect score — good data passes cleanly
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — perfect data', () => {
  it('scores 100 for well-formed data with descriptive labels', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.equal(result.score, 100);
    assert.equal(result.warnings.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Data quantity checks
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — data quantity', () => {
  it('deducts 40 for fewer than 3 data points', () => {
    const data = makeData({
      chartSpec: {
        ...makeData().chartSpec,
        data: [{ year: '2020', value: 100 }, { year: '2021', value: 200 }],
      },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.score <= 60);
    assert.ok(result.warnings.some(w => w.includes('Very few data points')));
  });

  it('deducts 15 for 3-5 data points', () => {
    const data = makeData({
      chartSpec: {
        ...makeData().chartSpec,
        data: [
          { year: '2020', value: 3240 },
          { year: '2021', value: 6750 },
          { year: '2022', value: 10200 },
          { year: '2023', value: 14200 },
        ],
      },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.score <= 85);
    assert.ok(result.warnings.some(w => w.includes('Only 4 data points')));
  });

  it('no quantity deduction for 6+ data points', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('data points')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Placeholder detection
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — placeholder detection', () => {
  it('detects sequential round small values as placeholders', () => {
    const data = makeData({
      chartSpec: {
        ...makeData().chartSpec,
        data: [
          { year: 'A', value: 10 },
          { year: 'B', value: 20 },
          { year: 'C', value: 30 },
          { year: 'D', value: 40 },
          { year: 'E', value: 50 },
          { year: 'F', value: 60 },
        ],
      },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('placeholders')));
  });

  it('does NOT flag real-world large values as placeholders', () => {
    // Real data: values are large, not all <=100, so allSimple=false
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('placeholders')));
  });

  it('does NOT flag non-sequential values as placeholders', () => {
    const data = makeData({
      chartSpec: {
        ...makeData().chartSpec,
        data: [
          { year: 'A', value: 10 },
          { year: 'B', value: 5 },   // not sequential
          { year: 'C', value: 30 },
          { year: 'D', value: 20 },
          { year: 'E', value: 50 },
          { year: 'F', value: 40 },
        ],
      },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(!result.warnings.some(w => w.includes('placeholders')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Generic label detection
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — generic labels', () => {
  it('deducts 10 for empty xLabel', () => {
    const data = makeData({
      chartSpec: { ...makeData().chartSpec, xLabel: '' },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('X-axis label is generic')));
  });

  it('deducts 10 for xLabel = "category"', () => {
    const data = makeData({
      chartSpec: { ...makeData().chartSpec, xLabel: 'category' },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('X-axis label is generic')));
  });

  it('deducts 10 for empty yLabel', () => {
    const data = makeData({
      chartSpec: { ...makeData().chartSpec, yLabel: '' },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('Y-axis label is generic')));
  });

  it('deducts 10 for yLabel = "value"', () => {
    const data = makeData({
      chartSpec: { ...makeData().chartSpec, yLabel: 'value' },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('Y-axis label is generic')));
  });

  it('both generic labels = -20 total', () => {
    const data = makeData({
      chartSpec: { ...makeData().chartSpec, xLabel: 'label', yLabel: 'count' },
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.score <= 80);
  });

  it('descriptive labels pass cleanly', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('axis label is generic')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Source check
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — source check', () => {
  it('deducts 10 for missing source', () => {
    const data = makeData({ source: '' });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('No data source')));
  });

  it('deducts 10 for very short source', () => {
    const data = makeData({ source: 'src' });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('No data source')));
  });

  it('no deduction for proper source', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('source')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. HighlightX-data mismatch
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — highlightX mismatch', () => {
  it('deducts 10 per step with non-existent highlightX', () => {
    const data = makeData({
      steps: [
        { badgeKind: 'data', badgeLabel: 'Step 1', body: 'Test', vizState: { highlightX: '1999' } },
        { badgeKind: 'data', badgeLabel: 'Step 2', body: 'Test', vizState: { highlightX: '2050' } },
      ],
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    const mismatchWarnings = result.warnings.filter(w => w.includes('doesn\'t exist in the chart data'));
    assert.equal(mismatchWarnings.length, 2);
  });

  it('no deduction when highlightX values exist in data', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('doesn\'t exist in the chart data')));
  });

  it('no deduction when steps have no highlightX', () => {
    const data = makeData({
      steps: [
        { badgeKind: 'data', badgeLabel: 'Step 1', body: 'Test', vizState: {} },
      ],
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(!result.warnings.some(w => w.includes('doesn\'t exist')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Chart type morphing
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — chart morphing', () => {
  it('deducts 5 when 3+ steps but no chartType transitions', () => {
    const data = makeData({
      steps: [
        { badgeKind: 'data', badgeLabel: 'Step 1', body: 'A', vizState: { highlightX: '2015' } },
        { badgeKind: 'data', badgeLabel: 'Step 2', body: 'B', vizState: { highlightX: '2016' } },
        { badgeKind: 'data', badgeLabel: 'Step 3', body: 'C', vizState: { highlightX: '2017' } },
      ],
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.warnings.some(w => w.includes('chart type transitions')));
  });

  it('no deduction when chartType morphing exists', () => {
    const data = makeData({
      steps: [
        { badgeKind: 'data', badgeLabel: 'Step 1', body: 'A', vizState: { highlightX: '2015' } },
        { badgeKind: 'data', badgeLabel: 'Step 2', body: 'B', vizState: { chartType: 'line', highlightX: '2016' } },
        { badgeKind: 'data', badgeLabel: 'Step 3', body: 'C', vizState: { highlightX: '2017' } },
      ],
    });
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(!result.warnings.some(w => w.includes('chart type transitions')));
  });

  it('no deduction when fewer than 3 steps', () => {
    const result = assessDataScrollyQuality('DataScrolly', makeData());
    assert.ok(!result.warnings.some(w => w.includes('chart type transitions')));
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Score floor at 0
// ═══════════════════════════════════════════════════════════════

describe('assessDataScrollyQuality — score floor', () => {
  it('never returns negative score even with many deductions', () => {
    const data = {
      source: '',
      chartSpec: {
        kind: 'bar',
        data: [{ x: 5 }, { x: 10 }],
        xField: 'x',
        yField: 'y',
        xLabel: '',
        yLabel: '',
      },
      steps: [
        { vizState: { highlightX: 'nonexistent' } },
        { vizState: { highlightX: 'also-nonexistent' } },
        { vizState: { highlightX: 'nope' } },
      ],
    };
    const result = assessDataScrollyQuality('DataScrolly', data);
    assert.ok(result.score >= 0);
  });
});
