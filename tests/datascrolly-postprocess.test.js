const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Replicate postProcess from admin/ui/app.js (IIFE, not importable) ──
// This is a direct copy of the DataScrolly creation card's postProcess function.
// If the function in app.js changes, this copy must be updated.
// Source: admin/ui/app.js lines 933-973

function postProcess(data) {
  const steps = (data.steps || []).map((s, i) => ({
    badgeKind: s.badgeKind || 'data',
    badgeLabel: s.badgeLabel || `Step ${i + 1}`,
    body: s.body || '',
    vizState: s.vizState || {},
  }));
  // If AI already populated a valid chartSpec (with real data), use it directly
  if (data.chartSpec && Array.isArray(data.chartSpec.data) && data.chartSpec.data.length >= 2) {
    return {
      title: data.title || 'Chart',
      subtitle: data.subtitle || '',
      source: data.source || '',
      chartSpec: data.chartSpec,
      steps,
    };
  }
  // Otherwise build chartSpec from the flat CSV form fields (manual entry)
  const lines = (data._csvData || '').trim().split('\n').filter(l => l.trim());
  const chartData = lines.map(line => {
    const parts = line.split(',').map(s => s.trim());
    const label = parts[0] || '';
    const val = parseFloat(parts[1]) || 0;
    return { label, value: val };
  });
  if (chartData.length === 0) chartData.push({ label: 'A', value: 10 }, { label: 'B', value: 20 });
  return {
    title: data.title || 'Chart',
    subtitle: data.subtitle || '',
    source: data.source || '',
    chartSpec: {
      kind: data._chartKind || 'bar',
      data: chartData,
      xField: 'label',
      yField: 'value',
      xLabel: '',
      yLabel: '',
    },
    steps,
  };
}

// ── Replicate AI response-to-form mapping from app.js lines 1795-1803 ──
// Maps nested chartSpec to flat creation card fields for DataScrolly

function mapChartSpecToFormFields(responseData) {
  const formData = { ...responseData };
  if (responseData.chartSpec && Array.isArray(responseData.chartSpec.data)) {
    const cs = responseData.chartSpec;
    formData._chartKind = cs.kind || 'bar';
    const xf = cs.xField || 'label';
    const yf = cs.yField || 'value';
    formData._csvData = cs.data.map(d => `${d[xf]}, ${d[yf]}`).join('\n');
  }
  return formData;
}


// ═══════════════════════════════════════════════════════════════
// postProcess — AI chartSpec passthrough
// ═══════════════════════════════════════════════════════════════

describe('postProcess — AI chartSpec passthrough', () => {
  it('passes through valid AI-generated chartSpec with 2+ data points', () => {
    const aiData = {
      title: 'EV Sales Worldwide',
      subtitle: '2015-2024',
      source: 'IEA Global EV Outlook 2024',
      chartSpec: {
        kind: 'bar',
        data: [
          { year: '2015', sales: 547 },
          { year: '2016', sales: 753 },
          { year: '2017', sales: 1223 },
          { year: '2018', sales: 2018 },
          { year: '2019', sales: 2264 },
        ],
        xField: 'year',
        yField: 'sales',
        xLabel: 'Year',
        yLabel: 'EV Sales (thousands)',
      },
      steps: [
        { badgeKind: 'data', badgeLabel: 'Early Days', body: 'Starting slow', vizState: { highlightX: '2015' } },
      ],
    };

    const result = postProcess(aiData);

    // chartSpec should be the EXACT same object (passed through, not rebuilt)
    assert.equal(result.chartSpec, aiData.chartSpec);
    assert.equal(result.chartSpec.data.length, 5);
    assert.equal(result.chartSpec.xField, 'year');
    assert.equal(result.chartSpec.yField, 'sales');
    assert.equal(result.chartSpec.xLabel, 'Year');
  });

  it('preserves all chartSpec fields including xLabel, yLabel, kind', () => {
    const aiData = {
      chartSpec: {
        kind: 'line',
        data: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }],
        xField: 'x',
        yField: 'y',
        xLabel: 'Months',
        yLabel: 'Revenue ($M)',
      },
      steps: [],
    };

    const result = postProcess(aiData);
    assert.equal(result.chartSpec.kind, 'line');
    assert.equal(result.chartSpec.xLabel, 'Months');
    assert.equal(result.chartSpec.yLabel, 'Revenue ($M)');
  });

  it('does NOT rebuild from _csvData when chartSpec is valid', () => {
    const aiData = {
      _csvData: 'Garbage, 999',
      _chartKind: 'pie',
      chartSpec: {
        kind: 'bar',
        data: [{ year: '2020', value: 100 }, { year: '2021', value: 200 }],
        xField: 'year',
        yField: 'value',
      },
      steps: [],
    };

    const result = postProcess(aiData);
    // Should use chartSpec, not _csvData
    assert.equal(result.chartSpec.data[0].year, '2020');
    assert.equal(result.chartSpec.kind, 'bar'); // not 'pie' from _chartKind
  });
});

// ═══════════════════════════════════════════════════════════════
// postProcess — CSV fallback (manual entry)
// ═══════════════════════════════════════════════════════════════

describe('postProcess — CSV fallback', () => {
  it('builds chartSpec from _csvData when no chartSpec', () => {
    const manualData = {
      title: 'My Chart',
      _csvData: 'Germany, 83\nFrance, 67\nSpain, 47',
      _chartKind: 'bar',
      steps: [],
    };

    const result = postProcess(manualData);
    assert.equal(result.chartSpec.data.length, 3);
    assert.equal(result.chartSpec.data[0].label, 'Germany');
    assert.equal(result.chartSpec.data[0].value, 83);
    assert.equal(result.chartSpec.kind, 'bar');
    assert.equal(result.chartSpec.xField, 'label');
    assert.equal(result.chartSpec.yField, 'value');
  });

  it('uses _chartKind for CSV-built chartSpec', () => {
    const data = {
      _csvData: 'A, 10\nB, 20',
      _chartKind: 'line',
      steps: [],
    };
    const result = postProcess(data);
    assert.equal(result.chartSpec.kind, 'line');
  });

  it('defaults to bar kind when _chartKind missing', () => {
    const data = {
      _csvData: 'A, 10\nB, 20',
      steps: [],
    };
    const result = postProcess(data);
    assert.equal(result.chartSpec.kind, 'bar');
  });

  it('provides A/B defaults when _csvData is empty', () => {
    const data = { _csvData: '', steps: [] };
    const result = postProcess(data);
    assert.equal(result.chartSpec.data.length, 2);
    assert.equal(result.chartSpec.data[0].label, 'A');
    assert.equal(result.chartSpec.data[1].label, 'B');
  });

  it('provides A/B defaults when _csvData is missing', () => {
    const data = { steps: [] };
    const result = postProcess(data);
    assert.equal(result.chartSpec.data.length, 2);
    assert.equal(result.chartSpec.data[0].label, 'A');
  });
});

// ═══════════════════════════════════════════════════════════════
// postProcess — edge cases
// ═══════════════════════════════════════════════════════════════

describe('postProcess — edge cases', () => {
  it('falls back to CSV when chartSpec exists but has empty data array', () => {
    const data = {
      chartSpec: { kind: 'bar', data: [], xField: 'x', yField: 'y' },
      _csvData: 'X, 10\nY, 20',
      steps: [],
    };
    const result = postProcess(data);
    // Empty data array → length < 2 → falls back to CSV
    assert.equal(result.chartSpec.data[0].label, 'X');
  });

  it('falls back to CSV when chartSpec.data has only 1 item', () => {
    const data = {
      chartSpec: { kind: 'bar', data: [{ x: 1, y: 2 }], xField: 'x', yField: 'y' },
      _csvData: 'A, 100\nB, 200',
      steps: [],
    };
    const result = postProcess(data);
    assert.equal(result.chartSpec.data[0].label, 'A');
    assert.equal(result.chartSpec.data[0].value, 100);
  });

  it('falls back to CSV when chartSpec.data is not an array', () => {
    const data = {
      chartSpec: { kind: 'bar', data: 'not-an-array' },
      _csvData: 'P, 5\nQ, 10',
      steps: [],
    };
    const result = postProcess(data);
    assert.equal(result.chartSpec.data[0].label, 'P');
  });

  it('normalizes steps with defaults', () => {
    const data = {
      chartSpec: { data: [{ x: 1 }, { x: 2 }] },
      steps: [
        { body: 'Hello' },
        { badgeKind: 'explain', badgeLabel: 'Custom', body: 'World', vizState: { highlight: true } },
      ],
    };
    const result = postProcess(data);
    assert.equal(result.steps[0].badgeKind, 'data');
    assert.equal(result.steps[0].badgeLabel, 'Step 1');
    assert.equal(result.steps[0].body, 'Hello');
    assert.deepEqual(result.steps[0].vizState, {});

    assert.equal(result.steps[1].badgeKind, 'explain');
    assert.equal(result.steps[1].badgeLabel, 'Custom');
    assert.deepEqual(result.steps[1].vizState, { highlight: true });
  });

  it('uses "Chart" as default title', () => {
    const result = postProcess({ steps: [] });
    assert.equal(result.title, 'Chart');
  });

  it('handles missing steps gracefully', () => {
    const result = postProcess({ chartSpec: { data: [{ a: 1 }, { a: 2 }] } });
    assert.deepEqual(result.steps, []);
  });
});

// ═══════════════════════════════════════════════════════════════
// AI response-to-form mapping
// ═══════════════════════════════════════════════════════════════

describe('mapChartSpecToFormFields — AI response to form', () => {
  it('converts chartSpec.data to flat _csvData format', () => {
    const aiResponse = {
      title: 'EV Growth',
      chartSpec: {
        kind: 'bar',
        data: [
          { year: '2020', sales: 3240 },
          { year: '2021', sales: 6750 },
          { year: '2022', sales: 10200 },
        ],
        xField: 'year',
        yField: 'sales',
      },
    };

    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._chartKind, 'bar');
    assert.equal(formData._csvData, '2020, 3240\n2021, 6750\n2022, 10200');
  });

  it('maps kind to _chartKind', () => {
    const aiResponse = {
      chartSpec: {
        kind: 'line',
        data: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        xField: 'x',
        yField: 'y',
      },
    };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._chartKind, 'line');
  });

  it('defaults _chartKind to bar when kind is missing', () => {
    const aiResponse = {
      chartSpec: {
        data: [{ label: 'A', value: 10 }],
        xField: 'label',
        yField: 'value',
      },
    };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._chartKind, 'bar');
  });

  it('uses default xField/yField when not specified', () => {
    const aiResponse = {
      chartSpec: {
        data: [{ label: 'Germany', value: 83 }, { label: 'France', value: 67 }],
      },
    };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._csvData, 'Germany, 83\nFrance, 67');
  });

  it('does not add _csvData when chartSpec is absent', () => {
    const aiResponse = { title: 'Just a title' };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._csvData, undefined);
    assert.equal(formData._chartKind, undefined);
  });

  it('does not add _csvData when chartSpec.data is not an array', () => {
    const aiResponse = { chartSpec: { data: 'not-array' } };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData._csvData, undefined);
  });

  it('preserves other fields from response', () => {
    const aiResponse = {
      title: 'Test',
      subtitle: 'Sub',
      source: 'IEA',
      chartSpec: {
        data: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        xField: 'x',
        yField: 'y',
      },
    };
    const formData = mapChartSpecToFormFields(aiResponse);
    assert.equal(formData.title, 'Test');
    assert.equal(formData.subtitle, 'Sub');
    assert.equal(formData.source, 'IEA');
    // chartSpec itself is also preserved
    assert.ok(formData.chartSpec);
  });

  it('round-trips: mapChartSpecToFormFields → postProcess preserves data', () => {
    const aiResponse = {
      title: 'EV Growth',
      subtitle: 'Global',
      source: 'IEA Global EV Outlook 2024',
      chartSpec: {
        kind: 'bar',
        data: [
          { year: '2020', sales: 3240 },
          { year: '2021', sales: 6750 },
          { year: '2022', sales: 10200 },
        ],
        xField: 'year',
        yField: 'sales',
        xLabel: 'Year',
        yLabel: 'Sales (k)',
      },
      steps: [
        { body: 'Start', vizState: { highlightX: '2020' } },
      ],
    };

    // Step 1: Map to form fields (as the creation card does)
    const formData = mapChartSpecToFormFields(aiResponse);

    // Step 2: postProcess (as happens on "Create" click)
    const result = postProcess(formData);

    // The chartSpec should be passed through (not rebuilt from _csvData)
    // because mapChartSpecToFormFields preserves the original chartSpec
    assert.equal(result.chartSpec.data.length, 3);
    assert.equal(result.chartSpec.xField, 'year');
    assert.equal(result.chartSpec.yField, 'sales');
    assert.equal(result.title, 'EV Growth');
    assert.equal(result.source, 'IEA Global EV Outlook 2024');
  });
});
