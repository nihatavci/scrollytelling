// DEV-ONLY end-to-end pipeline runner for the recursive test loop. Gated by env.TEST_KEY.
// DELETE THIS FILE before final ship.
import { runAnalyze, runGenerateBlock } from './article-builder.js';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Test-Key' }; }
function json(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...cors() } }); }

const RICH = new Set(['Map2D', 'DataScrolly', 'Scene3D', 'AudioPlayer', 'Scrolly', 'ImageGrid']);

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.TEST_KEY || request.headers.get('X-Test-Key') !== env.TEST_KEY) return json({ error: 'forbidden' }, 403);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const lang = body.lang || 'en';
  const tone = body.tone || 'feature';
  const maxBlocks = Math.max(2, Math.min(body.maxBlocks || 6, 10)); // cap to fit the request-duration budget

  let analysis;
  try { analysis = await runAnalyze(env, { sources: body.sources, lang, tone }); }
  catch (e) { return json({ error: 'analyze failed: ' + (e.message || e) }, 500); }
  const fullPlan = analysis.plan || [];

  // Keep the article short enough to generate within one request, but never drop a rich
  // component (the whole point of the test) — keep all rich blocks + fill to maxBlocks.
  const rich = fullPlan.filter(p => RICH.has(p.type));
  const rest = fullPlan.filter(p => !RICH.has(p.type));
  const kept = [];
  for (const p of fullPlan) { // preserve order
    if (RICH.has(p.type) || kept.length < maxBlocks) kept.push(p);
    if (kept.length >= maxBlocks && rich.every(r => kept.includes(r))) break;
  }
  const plan = kept.slice(0, Math.max(maxBlocks, rich.length + 1));

  // Generate in PARALLEL (no prevLead continuity in the test — we're checking per-component
  // render quality, not narrative flow). allSettled so one bad block can't kill the run.
  const results = await Promise.allSettled(plan.map((planItem, i) => runGenerateBlock(env, {
    type: planItem.type, planItem, chunks: analysis.chunks, facts: analysis.facts,
    articleContext: { title: fullPlan[0]?.headline || 'Article', tone, lang, throughLine: analysis.throughLine, narrativeBeat: planItem.narrativeBeat, blockIndex: i, totalBlocks: plan.length, prevLead: '' },
    lang,
  })));

  const blocks = [];
  results.forEach((r, i) => {
    const planItem = plan[i];
    if (r.status === 'fulfilled') {
      blocks.push({ id: 'b_' + i, type: planItem.type, data: r.value.data, _quality: r.value.quality, _beat: planItem.narrativeBeat });
    } else {
      blocks.push({ id: 'b_' + i, type: planItem.type, data: null, _error: String(r.reason && r.reason.message || r.reason) });
    }
  });

  return json({
    id: 'storytest', version: 1, lang,
    meta: { title: fullPlan[0]?.headline || 'Article' },
    throughLine: analysis.throughLine,
    planTypes: fullPlan.map(p => p.type),
    blocks,
    warnings: analysis.warnings,
  }, 200);
}
