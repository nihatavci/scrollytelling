// functions/api/article-builder.js
// AI Full Article Builder — analyze sources + generate blocks
// Two actions: 'analyze' (fact extraction + structure proposal) and 'generate-block' (per-block generation)

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

// ── Chunking ──
const CHUNK_SIZE = 8000;
const CHUNK_OVERLAP = 200;

function chunkText(text) {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + CHUNK_SIZE * 0.7) end = lastPeriod + 2;
    }
    chunks.push(text.slice(start, end));
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
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
  { type: 'ImageGrid', use: 'Grid of images — good for photo essays or visual evidence' },
  { type: 'Outro', use: 'Closing section with final thesis and source citations' },
  { type: 'Separator', use: 'Visual break between sections' },
];

// ── AI Calls ──

async function summarizeChunk(env, chunk, chunkIndex, lang) {
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: `You are a research analyst. Extract key facts, claims, quotes, statistics, and data points from the provided text. For each fact, note if it's an extreme number (>80%, large dollar amounts), a historical date, a direct quote, or a statistic from a table/chart.

Return JSON only:
{
  "facts": [
    { "claim": "exact claim text", "section": "brief location description", "flag": null | "extreme_number" | "historical_date" | "direct_quote" | "statistic" }
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

async function proposePlan(env, factSummaries, lang, tone) {
  const blockList = AVAILABLE_BLOCK_TYPES.map(b => `- ${b.type}: ${b.use}`).join('\n');

  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: `You are a senior editorial architect for a scrollytelling platform. Given extracted facts and summaries from source material, propose an article structure as an ordered list of blocks.

Available block types:
${blockList}

Rules:
- Start with a Hero block
- End with an Outro block
- Use ChapterDividers to break the article into 2-4 major acts
- Prefer Editorial blocks for narrative sections
- Use StatRow when you have 2-4 concrete numbers
- Use Quote for impactful direct quotes from the sources
- Use Aside for background context that would disrupt the narrative flow
- Use Timeline when there are 3+ chronological events
- Article tone: ${tone || 'investigative'}
- Total blocks: 8-20 depending on source material length
- Every block must reference which source material feeds it

Return JSON only:
{
  "plan": [
    { "type": "Hero", "headline": "proposed headline", "rationale": "why this block here", "sourceRefs": ["which source section"] }
  ],
  "warnings": ["any concerns about the source material"]
}

Language: respond in ${lang || 'the same language as the source text'}.
Return ONLY valid JSON — no markdown fences, no explanation.` },
      { role: 'user', content: `Extracted facts and summaries:\n\n${factSummaries}` },
    ],
    max_tokens: 3000,
    temperature: 0.5,
  });
  return response?.response ?? response;
}

async function generateBlock(env, planItem, sourceChunks, facts, articleContext, lang) {
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: `You are the content engine for ScrollyCMS — generating one block of a scrollytelling article.

SOURCE GROUNDING RULES (CRITICAL):
- ONLY use information present in the provided source chunks
- Do NOT invent names, dates, numbers, or quotes not found in the sources
- If information is needed but not available in the sources, insert [NEEDS SOURCE] placeholder
- Every claim must be traceable to the provided source material

ARTICLE CONTEXT:
- Title: ${articleContext.title || 'Untitled'}
- Tone: ${articleContext.tone || 'investigative'}
- Language: ${lang || 'de'}
- This is block ${articleContext.blockIndex + 1} of ${articleContext.totalBlocks}
- Previous blocks: ${articleContext.previousSummaries || 'none (this is the first block)'}

BLOCK TYPE: ${planItem.type}
Purpose: ${planItem.rationale || 'part of the article structure'}

Return JSON with two top-level keys:
{
  "data": { ... block data matching the ${planItem.type} schema ... },
  "confidence": "high" | "medium" | "low"
}

Confidence rules:
- "high": all content directly traceable to source material
- "medium": mostly sourced but you performed synthesis or inference
- "low": you filled gaps, rephrased significantly, or couldn't find source support

Return ONLY valid JSON — no markdown fences, no explanation.` },
      { role: 'user', content: `Plan item: ${JSON.stringify(planItem)}

Relevant source chunks:
${sourceChunks.join('\n\n---\n\n')}

Extracted facts:
${facts.map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n')}` },
    ],
    max_tokens: 4096,
    temperature: 0.6,
  });
  return response?.response ?? response;
}

// ── JSON Parsing (same repair logic as generate.js) ──

function parseAIResponse(raw) {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;

  let text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let jsonStr = text.trim();

  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];

  try {
    return JSON.parse(jsonStr);
  } catch {
    const fixed = jsonStr
      .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/‘|’/g, "'")
      .replace(/“|”/g, '"');
    return JSON.parse(fixed);
  }
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
  const { sources, lang, tone } = body;

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return new Response(JSON.stringify({ error: 'No sources provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const allText = sources.map((s, i) => `[Source: ${s.label || `Source ${i + 1}`}]\n${s.content}`).join('\n\n');
  const chunks = chunkText(allText);

  const allFacts = [];
  const summaries = [];

  for (let i = 0; i < chunks.length; i++) {
    const raw = await summarizeChunk(env, chunks[i], i, lang);
    const parsed = parseAIResponse(raw);
    if (parsed.facts) allFacts.push(...parsed.facts);
    if (parsed.summary) summaries.push(parsed.summary);
  }

  const factSummaryText = summaries.map((s, i) => `Section ${i + 1}: ${s}`).join('\n') +
    '\n\nKey facts:\n' + allFacts.slice(0, 50).map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n');

  const planRaw = await proposePlan(env, factSummaryText, lang, tone);
  const planParsed = parseAIResponse(planRaw);

  const warnings = planParsed.warnings || [];
  const totalWords = allText.split(/\s+/).length;
  if (totalWords > 10000) {
    warnings.push(`Source material is ${totalWords.toLocaleString()} words — article may need to be selective`);
  }

  return new Response(JSON.stringify({
    facts: allFacts,
    plan: planParsed.plan || [],
    warnings,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleGenerateBlock(env, body) {
  const { type, planItem, sourceChunks, facts, articleContext, lang } = body;

  if (!type || !planItem) {
    return new Response(JSON.stringify({ error: 'Missing type or planItem' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = await generateBlock(
    env,
    { ...planItem, type },
    sourceChunks || [],
    facts || [],
    articleContext || {},
    lang || 'de'
  );

  const parsed = parseAIResponse(raw);

  const data = parsed.data || parsed;
  const confidence = parsed.confidence || 'medium';

  data._confidence = confidence;

  return new Response(JSON.stringify({
    data,
    confidence,
    sourceRefs: planItem.sourceRefs || [],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
