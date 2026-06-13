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
      { role: 'system', content: `You are the content engine for Scrolli Labs — generating one block of a scrollytelling article.

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

// ── JSON Parsing (robust repair for LLM output) ──

function parseAIResponse(raw) {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;

  let text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let jsonStr = text.trim();

  // Strip markdown fences
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  }

  // Strip any text before the first { or after the last }
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  // Attempt 1: parse as-is
  try { return JSON.parse(jsonStr); } catch {}

  // Attempt 2: basic fixes
  let fixed = jsonStr
    .replace(/\t/g, '  ')                        // tabs → spaces
    .replace(/,\s*([}\]])/g, '$1')               // trailing commas
    .replace(/([}\]])\s*([{\[])/g, '$1,$2')      // missing commas between structures
    .replace(/['']/g, "'")              // smart single quotes
    .replace(/[""]/g, '"');             // smart double quotes
  try { return JSON.parse(fixed); } catch {}

  // Attempt 3: fix unescaped newlines/tabs inside string values
  // Walk char-by-char to properly handle strings
  fixed = repairJsonStrings(fixed);
  try { return JSON.parse(fixed); } catch {}

  // Attempt 4: try to fix truncated JSON (close open brackets/braces)
  let repaired = fixed;
  let openBraces = 0, openBrackets = 0;
  let inString = false, escaped = false;
  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }
  // Remove trailing comma before closing
  repaired = repaired.replace(/,\s*$/, '');
  while (openBrackets > 0) { repaired += ']'; openBrackets--; }
  while (openBraces > 0) { repaired += '}'; openBraces--; }
  try { return JSON.parse(repaired); } catch {}

  // Attempt 5: nuclear — strip control chars, re-escape strings
  const nuclear = repaired
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')   // strip control chars
    .replace(/\n/g, '\\n')                              // escape all newlines
    .replace(/\r/g, '\\r')
    .replace(/\\n\\n/g, '\\n');                          // collapse double
  try { return JSON.parse(nuclear); } catch (e) {
    throw new Error(e.message);
  }
}

// Walk JSON string and properly escape unescaped chars inside "..." values
function repairJsonStrings(json) {
  const result = [];
  let i = 0;
  while (i < json.length) {
    if (json[i] === '"') {
      // Start of a string — find the real end
      result.push('"');
      i++;
      while (i < json.length) {
        const ch = json[i];
        if (ch === '\\' && i + 1 < json.length) {
          result.push(ch, json[i + 1]);
          i += 2;
          continue;
        }
        if (ch === '"') {
          result.push('"');
          i++;
          break;
        }
        // Escape control characters inside strings
        if (ch === '\n') { result.push('\\n'); i++; continue; }
        if (ch === '\r') { result.push('\\r'); i++; continue; }
        if (ch === '\t') { result.push('\\t'); i++; continue; }
        result.push(ch);
        i++;
      }
    } else {
      result.push(json[i]);
      i++;
    }
  }
  return result.join('');
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

  if (allFacts.length === 0 && summaries.every(s => s.includes('parse error'))) {
    return new Response(JSON.stringify({ error: 'AI failed to parse all source chunks. Try shorter or simpler text.' }), {
      status: 422, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const factSummaryText = summaries.map((s, i) => `Section ${i + 1}: ${s}`).join('\n') +
    '\n\nKey facts:\n' + allFacts.slice(0, 50).map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n');

  let planParsed;
  try {
    const planRaw = await proposePlan(env, factSummaryText, lang, tone);
    planParsed = parseAIResponse(planRaw);
  } catch (planErr) {
    console.error('Plan parse failed:', planErr.message);
    // Fallback: generate a basic plan from the facts we have
    planParsed = {
      plan: [
        { type: 'Hero', headline: 'Article', rationale: 'Auto-generated opening' },
        { type: 'Editorial', headline: 'Main Content', rationale: 'Auto-generated from sources' },
        { type: 'Outro', headline: 'Conclusion', rationale: 'Auto-generated closing' },
      ],
      warnings: ['AI plan generation failed — using basic structure. You can edit the plan before generating.'],
    };
  }

  const warnings = planParsed.warnings || [];
  if (chunksTruncated) {
    warnings.push(`Sources are very long — only the first ${MAX_CHUNKS} sections were analyzed. Trim sources for full coverage.`);
  }
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
