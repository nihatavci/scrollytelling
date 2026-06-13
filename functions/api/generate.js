// functions/api/generate.js
// AI content generation — Cloudflare Workers AI (default) or DeepSeek API.
// Llama 3.3 70B uses the CF AI binding (no key needed).
// DeepSeek V4 Pro uses api.deepseek.com — requires DEEPSEEK_API_KEY worker secret.

import { BLOCK_SCHEMAS, VOICE_GUIDE, IMPROVE_RULES, buildSystemPrompt, validateBlockData, parseAIResponse, callModel, DEFAULT_MODEL, DEEPSEEK_API_MODELS } from './_shared/blocks.js';

// Models the user can select in ⚙ Settings → AI Model.
// Only these are accepted — prevents prompt-injection via the model field.
const ALLOWED_MODELS = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'deepseek-v4-pro',
]);

// ── Rate Limiting (per-isolate in-memory) ──
const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
const ipCounts = new Map(); // ip → { count, resetAt }
let requestCounter = 0;

function checkRateLimit(ip) {
  const now = Date.now();

  // Periodic cleanup: every 100 requests, purge stale entries
  requestCounter++;
  if (requestCounter % 100 === 0) {
    for (const [key, entry] of ipCounts) {
      if (now > entry.resetAt) ipCounts.delete(key);
    }
  }

  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return null; // allowed
  }
  entry.count++;
  if (entry.count > RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return retryAfter; // blocked
  }
  return null; // allowed
}

// DataScrolly quality assessment — extracted to functions/lib/datascrolly-quality.js for testability
// In Cloudflare Workers ESM context we can't require(), so we inline-import at module level.
// The canonical source is functions/lib/datascrolly-quality.js (CJS for Node tests).
// To keep a single source of truth without a build step, we duplicate the function here
// via a thin wrapper that delegates to the same logic.
// NOTE: If you change the scoring logic, update functions/lib/datascrolly-quality.js too.

function assessDataScrollyQuality(type, data) {
  if (type !== 'DataScrolly' || !data) return null;
  const warnings = [];
  let score = 100;

  const spec = data.chartSpec || {};
  const chartData = Array.isArray(spec.data) ? spec.data : [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const xF = spec.xField || 'x';
  const yF = spec.yField || 'y';

  if (chartData.length < 3) {
    warnings.push('Very few data points (' + chartData.length + '). Add more data for a meaningful chart.');
    score -= 40;
  } else if (chartData.length < 6) {
    warnings.push('Only ' + chartData.length + ' data points. Consider adding more for richer visualization.');
    score -= 15;
  }

  const yValues = chartData.map(d => +d[yF]).filter(v => !isNaN(v));
  const allRound = yValues.length > 2 && yValues.every(v => v % 5 === 0 || v % 10 === 0);
  const allSimple = yValues.length > 0 && yValues.every(v => v <= 100 && v === Math.round(v));
  const isSequential = yValues.length >= 3 && yValues.every((v, i) => i === 0 || v > yValues[i - 1]);
  if (allRound && allSimple && isSequential && yValues[0] <= 10) {
    warnings.push('Data values look like placeholders (10, 20, 30...). Replace with real data for the topic.');
    score -= 30;
  }

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

  if (!data.source || data.source.length < 5) {
    warnings.push('No data source cited. Add a source for credibility.');
    score -= 10;
  }

  const xValues = new Set(chartData.map(d => String(d[xF])));
  steps.forEach((s, i) => {
    const hx = s.vizState?.highlightX;
    if (hx != null && !xValues.has(String(hx))) {
      warnings.push('Step ' + (i + 1) + ' highlights "' + hx + '" which doesn\'t exist in the chart data.');
      score -= 10;
    }
  });

  const hasMorph = steps.some(s => s.vizState?.chartType);
  if (!hasMorph && steps.length >= 3) {
    warnings.push('No chart type transitions between steps. Add chartType morphing for visual impact.');
    score -= 5;
  }

  return { score: Math.max(0, score), warnings };
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── Rate limit check (before auth to save resources on spam) ──
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const retryAfter = checkRateLimit(ip);
  if (retryAfter) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type, prompt, images, currentData, mode, lang, direct, model: requestedModel } = body;
  const model = (requestedModel && ALLOWED_MODELS.has(requestedModel)) ? requestedModel : DEFAULT_MODEL;

  if (!type || !prompt) {
    return new Response(JSON.stringify({ error: 'Missing type or prompt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(type, mode || 'create', lang, direct);
  if (!systemPrompt) {
    return new Response(JSON.stringify({ error: `Unknown block type: ${type}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let userMessage = prompt;
  if (direct) {
    // Direct mode: tell the AI this is raw content to structure, not a prompt
    if (mode === 'improve' && currentData) {
      userMessage = `Current block data:\n${JSON.stringify(currentData)}\n\nDIRECT PASTE — replace the text content with exactly this (preserve verbatim, do NOT rewrite):\n${prompt}`;
    } else {
      userMessage = `DIRECT PASTE — structure this text into the block fields. Preserve EVERY word exactly as-is:\n${prompt}`;
    }
  } else if (mode === 'improve' && currentData) {
    userMessage = `Current block data:\n${JSON.stringify(currentData)}\n\nRequested change: ${prompt}`;
  }
  if (images && images.length > 0) {
    const isAudio = type === 'AudioPlayer';
    const fileLabel = isAudio ? 'audio file' : 'image';
    const fieldHint = isAudio ? ' Use the first audio URL as the audioSrc field value.' : '';
    userMessage += `\n\nThe user uploaded ${images.length} ${fileLabel}(s). Reference them using these exact URLs:\n${images.map((u, i) => `${isAudio ? 'Audio' : 'Image'} ${i + 1}: ${u}`).join('\n')}${fieldHint}`;
  }

  try {
    // DataScrolly and Map2D need more tokens for complex structured data
    const maxTokens = (type === 'DataScrolly' || type === 'Map2D') ? 6144 : 4096;
    // ── Two-path AI dispatch ──
    let raw;
    if (DEEPSEEK_API_MODELS.has(model)) {
      // DeepSeek external API (OpenAI-compatible)
      if (!env.DEEPSEEK_API_KEY) {
        return new Response(JSON.stringify({ error: 'DeepSeek API key not configured. Add DEEPSEEK_API_KEY as a Worker secret in the Cloudflare dashboard.' }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }
      const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      if (!dsRes.ok) {
        const errText = await dsRes.text();
        throw new Error(`DeepSeek API error ${dsRes.status}: ${errText.slice(0, 200)}`);
      }
      const dsJson = await dsRes.json();
      raw = dsJson.choices?.[0]?.message?.content ?? '';
    } else {
      // Cloudflare Workers AI
      if (!env.AI) {
        return new Response(JSON.stringify({ error: 'Workers AI not configured. Redeploy with AI binding in wrangler.toml.' }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }
      const aiResponse = await env.AI.run(model, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      raw = aiResponse?.response ?? aiResponse;
    }

    // Parse raw response → data object
    let data;

    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      data = raw;
    } else {
      let text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      let jsonStr = text.trim();
      // Strip markdown code fences
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      // Extract the JSON object if there's surrounding text
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];

      try {
        data = JSON.parse(jsonStr);
      } catch {
        // Fix common AI JSON issues: unescaped newlines inside string values
        const fixed = jsonStr
          .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')   // newlines inside "value" strings
          .replace(/,\s*([}\]])/g, '$1')            // trailing commas
          .replace(/['']/g, "'").replace(/[""]/g, '"'); // smart quotes → plain
        try {
          data = JSON.parse(fixed);
        } catch (e2) {
          throw new Error('AI did not return valid JSON. Raw: ' + text.slice(0, 300));
        }
      }
    }

    const validationError = validateBlockData(type, data);
    if (validationError) {
      return new Response(JSON.stringify({ error: `AI returned invalid data: ${validationError}` }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // DataScrolly quality assessment — include warnings in response
    const quality = assessDataScrollyQuality(type, data);
    const responseBody = quality
      ? { data, quality: { score: quality.score, warnings: quality.warnings } }
      : { data };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('AI generation error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Generation failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
