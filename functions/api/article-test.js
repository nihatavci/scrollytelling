// DEV-ONLY end-to-end pipeline runner for the recursive test loop. Gated by env.TEST_KEY.
// DELETE THIS FILE before final ship.
import { runAnalyze, runGenerateBlock } from './article-builder.js';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Test-Key' }; }
function json(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...cors() } }); }

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.TEST_KEY || request.headers.get('X-Test-Key') !== env.TEST_KEY) return json({ error: 'forbidden' }, 403);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const lang = body.lang || 'en';
  const tone = body.tone || 'feature';
  const analysis = await runAnalyze(env, { sources: body.sources, lang, tone });
  const plan = analysis.plan || [];
  const blocks = [];
  let prevLead = '';
  for (let i = 0; i < plan.length; i++) {
    const planItem = plan[i];
    const res = await runGenerateBlock(env, {
      type: planItem.type, planItem, chunks: analysis.chunks, facts: analysis.facts,
      articleContext: {
        title: plan[0]?.headline || 'Article', tone, lang,
        throughLine: analysis.throughLine, narrativeBeat: planItem.narrativeBeat,
        blockIndex: i, totalBlocks: plan.length, prevLead,
      },
      lang,
    });
    prevLead = res.lead || '';
    blocks.push({ id: 'b_' + i, type: planItem.type, data: res.data, _quality: res.quality, _beat: planItem.narrativeBeat });
  }
  return json({ meta: { title: plan[0]?.headline || 'Article', throughLine: analysis.throughLine }, plan, blocks, warnings: analysis.warnings }, 200);
}
