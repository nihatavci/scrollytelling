// DEV-ONLY pipeline runner for the recursive test loop. Gated by env.TEST_KEY.
// Phased so each request fits under Cloudflare's ~60s edge limit (deepseek-v4-pro is slow):
//   { phase:'analyze', sources, lang, tone } -> { plan, planTypes, chunks, facts, throughLine, warnings }
//   { phase:'block', planItem, chunks, facts, articleContext, lang } -> { type, data, quality, lead }
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
  const t0 = Date.now();
  try {
    if (body.phase === 'analyze') {
      const a = await runAnalyze(env, { sources: body.sources, lang, tone: body.tone || 'feature' });
      return json({ plan: a.plan, planTypes: (a.plan || []).map(p => p.type), chunks: a.chunks, facts: a.facts, throughLine: a.throughLine, warnings: a.warnings, ms: Date.now() - t0 }, 200);
    }
    if (body.phase === 'block') {
      const r = await runGenerateBlock(env, {
        type: body.planItem?.type, planItem: body.planItem, chunks: body.chunks || [], facts: body.facts || [],
        articleContext: body.articleContext || {}, lang,
      });
      return json({ type: body.planItem?.type, data: r.data, quality: r.quality, lead: r.lead, confidence: r.confidence, ms: Date.now() - t0 }, 200);
    }
    return json({ error: "phase must be 'analyze' or 'block'" }, 400);
  } catch (e) {
    return json({ error: String(e && e.message || e), ms: Date.now() - t0 }, 500);
  }
}
