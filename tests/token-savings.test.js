const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Replicate IMPROVE_RULES from generate.js (ESM, not importable) ──
// Source: functions/api/generate.js — IMPROVE_RULES object
// If the rules in generate.js change, this copy must be updated.

const IMPROVE_RULES = {
  _universal: [
    'Keep all existing fields unless the user explicitly asks to change them',
    'Every block supports "bgOpacity" (number 0-1) to control page background image visibility. "show background" → bgOpacity 0.3. "hide background" → bgOpacity 0. "strong background" → bgOpacity 0.5-0.8.',
    'ALWAYS return the complete data object with ALL fields, not just the changed ones',
  ],
  ImageGrid: [
    '"make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)',
    '"bigger" or "wider" or "full width" → layout "bleed" or "full"',
    '"2 grid" or "3 columns" etc → set layout field accordingly',
    '"remove image 2" or "swap images" → modify images array',
    '"add caption" or "change credit" → update those fields',
    '"make the image half size" → layout "editorial" for narrow',
  ],
  Scrolly: [
    '"remove images" → clear imageSrc fields. "add image to step 3" → set imageSrc on that step',
    '"make images smaller" → imageSize "small" (35%). "bigger" → "large" (65%). "medium" → "medium" (50%). "full width" → "full". Or exact values like "40%".',
    '"make images shorter" or "less tall" → imageHeight "60vh" or "70vh". "taller" → "100vh".',
    '"round corners" → imageRadius "12px" or "24px". "sharp" or "no radius" → "0".',
    '"narrower layout" → reduce maxWidth (e.g. "1100px"). "wider" → increase (e.g. "1600px").',
  ],
  Map2D: [
    '"zoom in" → increase initialZoom or step mapState.zoom by 2. "zoom out" → decrease by 2.',
    '"focus on [city]" → change initialCenter to that city\'s real coordinates and set initialZoom to 13.',
    '"add marker at [place]" → add to markers array with real lat/lng, unique id, and add id to relevant step\'s showMarkers.',
    '"draw route from A to B" → add route. CRITICAL: first point = origin marker [lat,lng], last point = destination marker [lat,lng]. Add 5-8 intermediate waypoints following the real path. Route weight should be 2.',
    '"dark map" → tileStyle "dark". "watercolor" → "watercolor". "b&w" → "toner". "clean" → "toner-lite".',
    '"behind layout" or "fullscreen" → layout "behind". "side layout" → "side".',
    'When editing routes, ALWAYS verify route start/end points match the connected markers\' exact lat/lng coordinates.',
    '"thinner lines" → reduce route weight (min 1). "thicker" → increase (max 4). "dashed" → dashArray "8,5".',
  ],
  DataScrolly: [
    '"more data" or "add data points" → add more entries to chartSpec.data (minimum 6 total, aim for 8-12).',
    '"better data" or "use real data" → replace generic values with realistic, specific numbers. Update source field.',
    '"add step" → add a new step with unique vizState (highlight a different data point, morph chart type, or add filter).',
    '"bar chart" → chartSpec.kind "bar" and reset chartType overrides. "line chart" → "line". "area" → "area". "scatter" → "scatter".',
    '"fix labels" or "better labels" → update xLabel and yLabel to be descriptive with units in parentheses.',
    '"add source" → set a plausible academic/institutional source citation.',
    'ALWAYS ensure every highlightX in steps matches an xField value in the data, and every number mentioned in step body text exists in the data.',
  ],
  FullscreenImage: [
    '"darker overlay" or "darker" → increase scrimOpacity. "lighter" → decrease.',
    '"center text" → overlayPosition "center". "top-left" → overlayPosition "top-left".',
    '"add kicker" → set kicker field. "no animation" → kenBurns false.',
    '"scroll indicator" or "scroll cue" → scrollCue true. "no scrim" → scrimOpacity 0.',
  ],
  AudioPlayer: [
    '"change color" → update accentColor and waveformColor.',
    '"add transcript" → set transcript text. "shorter description" → trim description.',
    '"remove cover" → clear coverSrc. "add cover" → set coverSrc.',
  ],
};

function getImproveRules(type) {
  const typeRules = IMPROVE_RULES[type] || [];
  return [...IMPROVE_RULES._universal, ...typeRules];
}

// ═══════════════════════════════════════════════════════════════
// Targeted improve rules — only relevant rules per type
// ═══════════════════════════════════════════════════════════════

describe('getImproveRules — targeted per block type', () => {
  it('Hero gets only universal rules (no type-specific rules)', () => {
    const rules = getImproveRules('Hero');
    assert.equal(rules.length, 3);
    assert.ok(rules[0].includes('Keep all existing fields'));
    assert.ok(rules[2].includes('ALWAYS return the complete data object'));
    const joined = rules.join('\n');
    assert.ok(!joined.includes('zoom in'));
    assert.ok(!joined.includes('imageSrc'));
    assert.ok(!joined.includes('chartSpec'));
  });

  it('Map2D gets universal + Map2D-specific rules', () => {
    const rules = getImproveRules('Map2D');
    assert.equal(rules.length, 3 + 8);
    const joined = rules.join('\n');
    assert.ok(joined.includes('zoom in'));
    assert.ok(joined.includes('focus on'));
    assert.ok(joined.includes('add marker'));
    assert.ok(!joined.includes('chartSpec'));
    assert.ok(!joined.includes('imageSize'));
  });

  it('DataScrolly gets universal + DataScrolly-specific rules', () => {
    const rules = getImproveRules('DataScrolly');
    assert.equal(rules.length, 3 + 7);
    const joined = rules.join('\n');
    assert.ok(joined.includes('chartSpec'));
    assert.ok(joined.includes('highlightX'));
    assert.ok(!joined.includes('zoom in'));
    assert.ok(!joined.includes('tileStyle'));
  });

  it('Scrolly gets universal + Scrolly-specific rules', () => {
    const rules = getImproveRules('Scrolly');
    assert.equal(rules.length, 3 + 5);
    const joined = rules.join('\n');
    assert.ok(joined.includes('imageSize'));
    assert.ok(joined.includes('imageHeight'));
    assert.ok(joined.includes('imageRadius'));
  });

  it('FullscreenImage gets universal + FullscreenImage-specific rules', () => {
    const rules = getImproveRules('FullscreenImage');
    assert.equal(rules.length, 3 + 4);
    const joined = rules.join('\n');
    assert.ok(joined.includes('scrimOpacity'));
    assert.ok(joined.includes('kenBurns'));
  });

  it('AudioPlayer gets universal + AudioPlayer-specific rules', () => {
    const rules = getImproveRules('AudioPlayer');
    assert.equal(rules.length, 3 + 3);
    const joined = rules.join('\n');
    assert.ok(joined.includes('accentColor'));
    assert.ok(joined.includes('transcript'));
  });

  it('ImageGrid gets universal + ImageGrid-specific rules', () => {
    const rules = getImproveRules('ImageGrid');
    assert.equal(rules.length, 3 + 6);
    const joined = rules.join('\n');
    assert.ok(joined.includes('editorial'));
    assert.ok(joined.includes('bleed'));
  });

  it('unknown type gets only universal rules', () => {
    const rules = getImproveRules('NonExistentBlock');
    assert.equal(rules.length, 3);
  });

  it('every universal rule is present for all types', () => {
    const types = ['Hero', 'Map2D', 'DataScrolly', 'Scrolly', 'Editorial'];
    for (const t of types) {
      const rules = getImproveRules(t);
      assert.ok(rules[0].includes('Keep all existing fields'), `${t} missing universal rule 1`);
      assert.ok(rules[1].includes('bgOpacity'), `${t} missing universal rule 2`);
      assert.ok(rules[2].includes('ALWAYS return'), `${t} missing universal rule 3`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Rule coverage — every original rule is preserved
// ═══════════════════════════════════════════════════════════════

describe('IMPROVE_RULES — no rules dropped', () => {
  it('all type-specific rules contain actionable instructions', () => {
    const allTypeKeys = Object.keys(IMPROVE_RULES).filter(k => k !== '_universal');
    for (const key of allTypeKeys) {
      for (const rule of IMPROVE_RULES[key]) {
        // Each rule should contain → (action) or ALWAYS/CRITICAL (validation)
        const hasAction = rule.includes('→') || rule.includes('ALWAYS') || rule.includes('CRITICAL');
        assert.ok(hasAction, `Rule in ${key} missing action: "${rule.slice(0, 50)}..."`);
      }
    }
  });

  it('total rule count matches expected', () => {
    let total = IMPROVE_RULES._universal.length;
    for (const [key, rules] of Object.entries(IMPROVE_RULES)) {
      if (key !== '_universal') total += rules.length;
    }
    // 3 universal + 6 ImageGrid + 5 Scrolly + 8 Map2D + 7 DataScrolly + 4 FullscreenImage + 3 AudioPlayer = 36
    assert.equal(total, 36);
  });
});

// ═══════════════════════════════════════════════════════════════
// Compact JSON — token savings from dropping pretty-printing
// ═══════════════════════════════════════════════════════════════

describe('compact JSON serialization — token savings', () => {
  it('compact JSON is significantly shorter than pretty-printed', () => {
    const map2dExample = {
      title: 'Die Reise der Nachricht',
      subtitle: 'Von Berlin nach Frankfurt — 1900',
      source: 'Bundesarchiv',
      height: '100vh',
      maxWidth: '1400px',
      layout: 'side',
      tileStyle: 'toner-lite',
      initialCenter: [51.5, 10.5],
      initialZoom: 6,
      markers: [
        { id: 'berlin', lat: 52.52, lng: 13.405, label: '1', name: 'Berlin' },
        { id: 'frankfurt', lat: 50.11, lng: 8.68, label: '2', name: 'Frankfurt' },
      ],
      routes: [
        { id: 'route-main', points: [[52.52, 13.405], [51.34, 11.4], [50.11, 8.68]], color: '#c06830' },
      ],
      steps: [
        { badgeKind: 'pyramid', badgeLabel: 'Start', body: 'Im Berliner Presseviertel.' },
        { badgeKind: 'data', badgeLabel: 'Unterwegs', body: 'Per Telegraf reist die Nachricht.' },
      ],
    };

    const pretty = JSON.stringify(map2dExample, null, 2);
    const compact = JSON.stringify(map2dExample);

    assert.ok(compact.length < pretty.length * 0.7,
      `Compact (${compact.length}) should be <70% of pretty (${pretty.length})`);
    assert.deepEqual(JSON.parse(compact), JSON.parse(pretty));
  });

  it('compact currentData for improve mode is shorter', () => {
    const currentData = {
      content: [
        { kind: 'kicker', text: 'Erster Akt' },
        { kind: 'h2', text: 'Das Wichtigste steht am Anfang' },
        { kind: 'lead', text: 'Es gibt zwei Arten, die Dinge zu erzählen.' },
        { kind: 'p', html: 'Sie stellt die wichtigste Information ganz nach vorne.' },
        { kind: 'pullquote', text: 'The summary lead was a literary invention.', cite: '— Schudson, 1991' },
        { kind: 'separator' },
      ],
    };

    const pretty = JSON.stringify(currentData, null, 2);
    const compact = JSON.stringify(currentData);

    assert.ok(compact.length < pretty.length * 0.7);
    assert.deepEqual(JSON.parse(compact), JSON.parse(pretty));
  });
});
