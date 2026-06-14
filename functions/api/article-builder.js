// functions/api/article-builder.js
// AI Full Article Builder — analyze sources + generate blocks
// Two actions: 'analyze' (fact extraction + structure proposal) and 'generate-block' (per-block generation)

import { callModel, parseAIResponse, buildSystemPrompt, validateBlockData } from './_shared/blocks.js';
import { chunkText, selectRelevantChunks } from './_shared/retrieval.js';
import { buildPlanPrompt, repairPlanStructure } from './_shared/plan.js';
import { injectMedia } from './_shared/media.js';
import { assessBlockQuality } from './_shared/quality.js';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── Rate Limiting (separate from /api/generate) ──
const RATE_LIMITS = {
  analyze:        { maxRequests: 5,  windowMs: 60_000 },
  'generate-block': { maxRequests: 30, windowMs: 60_000 },
};
const ipCounts = new Map();
let requestCounter = 0;

function checkRateLimit(ip, action) {
  const limit = RATE_LIMITS[action] || RATE_LIMITS.analyze;
  const now = Date.now();
  const key = `${ip}:${action}`;

  requestCounter++;
  if (requestCounter % 50 === 0) {
    for (const [k, entry] of ipCounts) {
      if (now > entry.resetAt) ipCounts.delete(k);
    }
  }

  const entry = ipCounts.get(key);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(key, { count: 1, resetAt: now + limit.windowMs });
    return null;
  }
  entry.count++;
  if (entry.count > limit.maxRequests) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }
  return null;
}

// ── Block types available for article plans ──
const AVAILABLE_BLOCK_TYPES = [
  { type: 'Hero', use: 'Opening scene with headline, subtitle, and dramatic intro lines' },
  { type: 'Editorial', use: 'Long-form text section with kicker, heading, lead, paragraphs, pullquotes, big numbers' },
  { type: 'StatRow', use: 'Row of 2-4 large statistics with values and labels' },
  { type: 'Quote', use: 'Featured quote — large display with attribution' },
  { type: 'Aside', use: 'Highlighted callout box for context, definitions, background' },
  { type: 'Timeline', use: 'Vertical timeline of dated events' },
  { type: 'ChapterDivider', use: 'Chapter break with number and title — use between major sections' },
  { type: 'AccordionBlock', use: 'Collapsible sections for methodology, FAQ, supplementary content' },
  { type: 'Scrolly', use: 'Scrollytelling section — sticky image with text cards that scroll past' },
  { type: 'DataScrolly', use: 'Data-driven scrolly with animated D3 chart — needs numerical data' },
  { type: 'Map2D', use: 'Map scrollytelling — sticky interactive map; camera flies between real places as the reader scrolls. ONLY for stories with a strong geographic/route/location dimension. Needs real place names.' },
  { type: 'Scene3D', use: 'Interactive 3D object the reader scrolls through. ONLY for stories centered on a physical object, artifact, building, or product.' },
  { type: 'AudioPlayer', use: 'Audio player with cover art. ONLY when the story has voice/audio material (an interview, podcast, recording, oral history).' },
  { type: 'ImageGrid', use: 'Grid of images — good for photo essays or visual evidence' },
  { type: 'Outro', use: 'Closing section with final thesis and source citations' },
  { type: 'Separator', use: 'Visual break between sections' },
];

// ── AI Calls ──

async function summarizeChunk(env, chunk, chunkIndex, lang) {
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: `You are a research analyst. Extract key facts, claims, quotes, statistics, and data points from the provided text. For each fact, note if it's an extreme number (>80%, large dollar amounts), a historical date, a direct quote, a statistic from a table/chart, or a location/place.

Return JSON only:
{
  "facts": [
    { "claim": "exact claim text", "section": "brief location description", "flag": null | "extreme_number" | "historical_date" | "direct_quote" | "statistic" | "location" }
  ],
  "summary": "2-3 sentence summary of this section's key points"
}

Language: respond in ${lang || 'the same language as the source text'}.
Return ONLY valid JSON — no markdown fences, no explanation.` },
      { role: 'user', content: `Source text (section ${chunkIndex + 1}):\n\n${chunk}` },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  });
  return response?.response ?? response;
}

async function proposePlan(env, factSummaries, lang, tone, factShape) {
  const blockList = AVAILABLE_BLOCK_TYPES.map(b => `- ${b.type}: ${b.use}`).join('\n');
  const raw = await callModel(env, {
    model: 'deepseek-v4-pro',
    system: buildPlanPrompt(blockList, tone, lang, factShape),
    user: `Extracted facts and summaries:\n\n${factSummaries}`,
    maxTokens: 3000, temperature: 0.5,
  });
  let parsed; try { parsed = parseAIResponse(raw); } catch { parsed = {}; }
  parsed.plan = repairPlanStructure(parsed.plan, factShape);
  return parsed; // { throughLine, plan, warnings }
}

async function generateBlock(env, planItem, relevantChunks, facts, ctx, lang) {
  const schemaPrompt = buildSystemPrompt(planItem.type, 'create', lang, false); // injects schema + example + VOICE_GUIDE
  const system = `${schemaPrompt || `You are generating a "${planItem.type}" block. Return ONLY valid JSON {"data":{...},"lead":"...","confidence":"..."}.`}

ARTICLE CONTEXT (write this block as part of a larger narrative):
- Through-line (the article's spine): ${ctx.throughLine || '(none)'}
- This block's narrative beat: ${planItem.narrativeBeat || 'rising'} (exposition=set up, rising=build, climax=the turn, falling=implications, resolution=land it)
- Tone: ${ctx.tone}; block ${ctx.blockIndex + 1} of ${ctx.totalBlocks}.
- Previous section ended with: "${ctx.prevLead || '(this is the opening)'}" — continue from it; do NOT repeat earlier points.

SOURCE GROUNDING: use only facts present in the provided source excerpts; do not invent names/dates/numbers/quotes. If a needed fact is absent, omit it rather than writing [NEEDS SOURCE]. For any image field, leave it empty and instead write a vivid alt/caption describing the ideal photo.

Return ONLY valid JSON: { "data": { ...matches the schema above... }, "lead": "the first ~12 words of this block's main text", "confidence": "high|medium|low" }.`;
  const user = `Headline to realize: ${planItem.headline || '(none)'}
Rationale: ${planItem.rationale || ''}

Relevant source excerpts:
${relevantChunks.join('\n\n---\n\n')}

Relevant facts:
${facts.slice(0, 40).map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n')}`;
  const raw = await callModel(env, { model: 'deepseek-v4-pro', system, user, maxTokens: 4096, temperature: 0.6 });
  return parseAIResponse(raw);
}

// ── Main Handler ──

export async function onRequest(context) {
  const { request, env } = context;

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

  if (!env.AI) {
    return new Response(JSON.stringify({ error: 'Workers AI not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
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

  const { action } = body;
  if (!action || !['analyze', 'generate-block'].includes(action)) {
    return new Response(JSON.stringify({ error: 'Invalid action — must be "analyze" or "generate-block"' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const retryAfter = checkRateLimit(ip, action);
  if (retryAfter) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
  }

  try {
    if (action === 'analyze') {
      return await handleAnalyze(env, body);
    } else {
      return await handleGenerateBlock(env, body);
    }
  } catch (err) {
    console.error(`Article builder [${action}] error:`, err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

async function handleAnalyze(env, body) {
  const { sources } = body;

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return new Response(JSON.stringify({ error: 'No sources provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await runAnalyze(env, body);

  if (result.facts.length === 0 && result._allParseError) {
    return new Response(JSON.stringify({ error: 'AI failed to parse all source chunks. Try shorter or simpler text.' }), {
      status: 422, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { _allParseError: _a, ...publicResult } = result;
  return new Response(JSON.stringify(publicResult), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function runAnalyze(env, body) {
  const { sources, lang, tone } = body;

  const allText = sources.map((s, i) => `[Source: ${s.label || `Source ${i + 1}`}]\n${s.content}`).join('\n\n');
  let chunks = chunkText(allText);

  // Bound the work so the request always finishes within Cloudflare's request-duration
  // limit. Long sources produced many sequential 70B calls that blew past it, so the edge
  // closed the connection (ERR_CONNECTION_CLOSED / "Failed to fetch").
  const MAX_CHUNKS = 10;
  const chunksTruncated = chunks.length > MAX_CHUNKS;
  if (chunksTruncated) chunks = chunks.slice(0, MAX_CHUNKS);

  const allFacts = [];
  const summaries = [];

  // Summarize all chunks in PARALLEL — total wall-clock ≈ one call instead of N sequential
  // calls. Per-chunk failures are tolerated (allSettled) so one bad chunk can't kill analysis.
  const chunkResults = await Promise.allSettled(
    chunks.map((c, i) => summarizeChunk(env, c, i, lang))
  );
  chunkResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      try {
        const parsed = parseAIResponse(r.value);
        if (parsed.facts) allFacts.push(...parsed.facts);
        if (parsed.summary) summaries.push(parsed.summary);
      } catch (parseErr) {
        console.error(`Chunk ${i} parse failed:`, parseErr.message);
        summaries.push(`Section ${i + 1} (parse error — facts may be incomplete)`);
      }
    } else {
      console.error(`Chunk ${i} AI call failed:`, r.reason && r.reason.message);
      summaries.push(`Section ${i + 1} (AI error — skipped)`);
    }
  });

  // Signal all-parse-error condition to handleAnalyze without throwing
  const _allParseError = allFacts.length === 0 && summaries.every(s => s.includes('parse error'));

  const factSummaryText = summaries.map((s, i) => `Section ${i + 1}: ${s}`).join('\n') +
    '\n\nKey facts:\n' + allFacts.slice(0, 50).map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n');

  const factShape = {
    hasNumbers: allFacts.some(f => f.flag === 'statistic' || f.flag === 'extreme_number'),
    hasQuotes:  allFacts.some(f => f.flag === 'direct_quote'),
    hasDates:   allFacts.some(f => f.flag === 'historical_date'),
    hasPlaces:  allFacts.some(f => f.flag === 'location'),
  };

  const planParsed = await proposePlan(env, factSummaryText, lang, tone, factShape);

  const warnings = planParsed.warnings || [];
  if (chunksTruncated) {
    warnings.push(`Sources are very long — only the first ${MAX_CHUNKS} sections were analyzed. Trim sources for full coverage.`);
  }
  const totalWords = allText.split(/\s+/).length;
  if (totalWords > 10000) {
    warnings.push(`Source material is ${totalWords.toLocaleString()} words — article may need to be selective`);
  }

  return {
    facts: allFacts,
    plan: planParsed.plan || [],
    throughLine: planParsed.throughLine || '',
    chunks,
    warnings,
    _allParseError,
  };
}

async function handleGenerateBlock(env, body) {
  const { type, planItem } = body;
  if (!type || !planItem) return new Response(JSON.stringify({ error: 'Missing type or planItem' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const result = await runGenerateBlock(env, body);

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}

export async function runGenerateBlock(env, body) {
  const { type, planItem, chunks, facts, articleContext, lang } = body;

  const query = [planItem.headline, planItem.rationale, ...(planItem.sourceRefs || [])].filter(Boolean).join(' ');
  const relevant = selectRelevantChunks(chunks || [], query, 9000); // bounded context → no overflow

  let parsed = await generateBlock(env, { ...planItem, type }, relevant, facts || [], articleContext || {}, lang || 'de');
  let data = parsed.data || parsed;

  // schema validation → one repair retry if invalid (validateBlockData returns an error string, or null when valid)
  let err = validateBlockData(type, data);
  if (err && type === 'AudioPlayer' && /audioSrc/i.test(err)) err = null; // cover-only mock state is acceptable for AI-generated audio blocks
  if (err) {
    const retry = await generateBlock(env, { ...planItem, type, rationale: (planItem.rationale || '') + ` (previous output was invalid: ${err}. Match the schema exactly.)` }, relevant, facts || [], articleContext || {}, lang || 'de');
    const retryData = retry.data || retry;
    if (!validateBlockData(type, retryData)) { data = retryData; parsed = retry; }
  }

  data = injectMedia(type, data, articleContext?.blockIndex || 0); // never blank media
  const quality = assessBlockQuality(type, data);
  data._confidence = parsed.confidence || 'medium';

  return {
    data,
    confidence: parsed.confidence || 'medium',
    lead: parsed.lead || '',
    quality,
    sourceRefs: planItem.sourceRefs || [],
  };
}
