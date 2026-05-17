# AI Full Article Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Full Article" feature that ingests mixed source material (text, PDFs, DOCX, URLs), AI-analyzes it into facts + a block-by-block plan, lets the user approve/edit the plan, then generates all blocks with source-grounded error prevention and confidence tags.

**Architecture:** New Cloudflare Pages Function `article-builder.js` handles two AI actions (analyze, generate-block) with chunking for long content. New client-side `article-builder.js` file renders a 4-phase modal (Ingest → Plan → Generate → Review). A lightweight `scrape.js` endpoint extracts text from URLs. Communication with the existing `app.js` IIFE is via `window._insertBlocks()` (exposed by app.js) and `SB.generate()` (existing global from supabase-client.js).

**Tech Stack:** Cloudflare Workers AI (Llama 3.3 70B), pdf.js (CDN), mammoth.js (CDN), vanilla JS

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `functions/api/article-builder.js` | Create | Two-action endpoint: `analyze` (chunk → summarize → extract facts → propose plan) and `generate-block` (per-block AI generation with source grounding + confidence). Own rate limits. |
| `functions/api/scrape.js` | Create | Lightweight URL text extraction — fetch HTML, extract main content via heuristics, return title + text + wordCount. |
| `admin/ui/article-builder.js` | Create | Full article builder UI — 4-phase modal. Exposes `window.openArticleBuilder`. Uses `SB` global for auth tokens and `window._insertBlocks()` for final insertion. Client-side PDF/DOCX parsing. |
| `admin/ui/app.js` | Modify | Expose `window._insertBlocks(blocks)`. Add click handler for topbar button. Add confidence badge rendering in `renderBlockList()`. |
| `admin/ui/index.html` | Modify | Add pdf.js + mammoth.js CDN scripts, article-builder.js script tag, topbar button. |
| `admin/ui/styles.css` | Modify | Append `.ab-*` styles for all article builder UI (modal phases, progress bar, fact list, plan editor, confidence badges). |

---

## Task 1: `functions/api/scrape.js` — URL text extraction endpoint

**Files:**
- Create: `functions/api/scrape.js`

This is the simplest endpoint and has no dependencies. Build it first so we can test URL ingestion independently.

- [ ] **Step 1: Create the scrape endpoint**

```js
// functions/api/scrape.js
// Lightweight URL text extraction — fetches HTML, extracts main content text.
// No external dependencies — pure string parsing.

export async function onRequest(context) {
  const { request } = context;

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

  // Require auth (same pattern as generate.js)
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

  const { url } = body;
  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing or invalid url' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Basic URL validation
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL — must be http or https' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ScrollyCMS/1.0 (Article Builder)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Fetch failed: ${res.status} ${res.statusText}` }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return new Response(JSON.stringify({ error: 'URL did not return HTML content' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = await res.text();
    const { title, text } = extractContent(html);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return new Response(JSON.stringify({ title, text, wordCount }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Request timed out (10s)' : (err.message || 'Fetch failed');
    return new Response(JSON.stringify({ error: msg }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

/**
 * Extract main content from HTML string.
 * Strategy: find <article>, <main>, or largest text-dense <div>.
 * Strip nav, header, footer, sidebar, script, style.
 */
function extractContent(html) {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Remove unwanted elements entirely
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to find main content container
  let content = '';
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);

  if (articleMatch) {
    content = articleMatch[1];
  } else if (mainMatch) {
    content = mainMatch[1];
  } else {
    // Fall back to <body> content
    const bodyMatch = cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : cleaned;
  }

  // Strip all remaining HTML tags, normalize whitespace
  const text = content
    .replace(/<[^>]+>/g, ' ')        // strip tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return { title, text };
}
```

- [ ] **Step 2: Test the endpoint manually**

Run: Deploy or use wrangler dev, then:
```bash
curl -X POST http://localhost:8788/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"url":"https://example.com"}'
```
Expected: JSON with `title`, `text`, and `wordCount` fields.

- [ ] **Step 3: Commit**

```bash
git add functions/api/scrape.js
git commit -m "feat(article-builder): add scrape endpoint for URL text extraction"
```

---

## Task 2: `functions/api/article-builder.js` — AI analyze + generate-block endpoint

**Files:**
- Create: `functions/api/article-builder.js`

This is the AI backend. Two actions routed via `action` field in the POST body. Uses the same `env.AI` binding as `generate.js` but with its own rate limits and system prompts focused on source-grounded generation.

- [ ] **Step 1: Create the article-builder endpoint**

```js
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
// Split text into ~2000-token chunks (approx 1 token ≈ 4 chars → ~8000 chars per chunk)
const CHUNK_SIZE = 8000;
const CHUNK_OVERLAP = 200;

function chunkText(text) {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    // Try to break at a sentence boundary
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

  // Strip markdown fences
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // Extract JSON object
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

  // Combine all source text and chunk it
  const allText = sources.map((s, i) => `[Source: ${s.label || `Source ${i + 1}`}]\n${s.content}`).join('\n\n');
  const chunks = chunkText(allText);

  // Pass 1: Summarize each chunk — extract facts
  const allFacts = [];
  const summaries = [];

  for (let i = 0; i < chunks.length; i++) {
    const raw = await summarizeChunk(env, chunks[i], i, lang);
    const parsed = parseAIResponse(raw);
    if (parsed.facts) allFacts.push(...parsed.facts);
    if (parsed.summary) summaries.push(parsed.summary);
  }

  // Pass 2: Propose article structure
  const factSummaryText = summaries.map((s, i) => `Section ${i + 1}: ${s}`).join('\n') +
    '\n\nKey facts:\n' + allFacts.slice(0, 50).map(f => `- ${f.claim}${f.flag ? ` [${f.flag}]` : ''}`).join('\n');

  const planRaw = await proposePlan(env, factSummaryText, lang, tone);
  const planParsed = parseAIResponse(planRaw);

  // Build warnings
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

  // Extract data and confidence from response
  const data = parsed.data || parsed;
  const confidence = parsed.confidence || 'medium';

  // Stamp confidence into block data
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
```

- [ ] **Step 2: Test the endpoint stub**

Deploy and test the analyze action with minimal input:
```bash
curl -X POST http://localhost:8788/api/article-builder \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"action":"analyze","sources":[{"type":"text","content":"Climate change has caused a 2.1 degree rise since 1880. 83% of coral reefs are at risk. Dr. Smith published findings in Nature in 2024.","label":"notes"}],"lang":"en","tone":"explainer"}'
```
Expected: JSON with `facts` array (should flag "83%" as extreme_number, "1880" / "2024" as historical dates, and the Dr. Smith reference), `plan` array with block proposals, and `warnings` array.

- [ ] **Step 3: Test the generate-block action**

```bash
curl -X POST http://localhost:8788/api/article-builder \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"action":"generate-block","type":"StatRow","planItem":{"type":"StatRow","headline":"Key Climate Numbers","rationale":"Anchor with data","sourceRefs":["notes"]},"sourceChunks":["Climate change has caused a 2.1 degree rise since 1880. 83% of coral reefs are at risk."],"facts":[{"claim":"2.1 degree rise since 1880","flag":"statistic"},{"claim":"83% of coral reefs at risk","flag":"extreme_number"}],"articleContext":{"title":"Climate Crisis","tone":"explainer","blockIndex":2,"totalBlocks":8},"lang":"en"}'
```
Expected: JSON with `data` containing StatRow fields (title, stats array), `confidence` ("high" since all data is from source), `sourceRefs`.

- [ ] **Step 4: Commit**

```bash
git add functions/api/article-builder.js
git commit -m "feat(article-builder): add analyze + generate-block AI endpoint with chunking and source grounding"
```

---

## Task 3: `admin/ui/article-builder.js` — Client-side 4-phase modal UI

**Files:**
- Create: `admin/ui/article-builder.js`

This is the main UI file. It's a standalone script that exposes `window.openArticleBuilder`. It uses `SB` (global from supabase-client.js) for authenticated API calls, and `window._insertBlocks()` (exposed by app.js in Task 4) for the final insertion.

**Key dependencies available on `window`:**
- `SB.generate()` pattern — we'll use `fetch('/api/article-builder', ...)` directly with `SB` for the auth token
- `window._insertBlocks(blocks)` — will be added in Task 4
- `pdf.js` CDN — will be added in Task 5
- `mammoth.js` CDN — will be added in Task 5

- [ ] **Step 1: Create the article-builder.js file**

```js
// admin/ui/article-builder.js
// AI Full Article Builder — 4-phase modal UI
// Depends on: SB global (supabase-client.js), window._insertBlocks (app.js)
// CDN deps: pdfjs-dist (pdf.js), mammoth.js — loaded via index.html

(function() {
'use strict';

// ── Helpers ──

function escText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
  }
  return e;
}

async function getAuthToken() {
  // SB.client is the raw Supabase client exposed by supabase-client.js (line 109)
  if (window.SB && window.SB.client) {
    const { data } = await window.SB.client.auth.getSession();
    return data?.session?.access_token || null;
  }
  return null;
}

async function apiFetch(endpoint, body) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated — please log in again');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── File Parsing ──

async function parsePDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  const arrayBuf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function parseDOCX(file) {
  if (!window.mammoth) throw new Error('Mammoth.js not loaded');
  const arrayBuf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuf });
  return result.value;
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return parsePDF(file);
  if (name.endsWith('.docx')) return parseDOCX(file);
  // Plain text / markdown
  return file.text();
}

// ── State ──

let builderState = null; // { phase, sources, lang, tone, facts, plan, warnings, generated, modal }

function resetState() {
  builderState = {
    phase: 1,
    sources: [],      // { type: 'text', content: '...', label: '...' }
    lang: 'de',
    tone: 'investigative',
    facts: [],
    plan: [],
    warnings: [],
    generated: [],    // { type, data, confidence, sourceRefs, status }
    modal: null,
  };
}

// ── Modal Shell ──

function openModal() {
  closeModal();
  const backdrop = el('div', { className: 'ab-backdrop' });
  const modal = el('div', { className: 'ab-modal' });

  const header = el('div', { className: 'ab-header' }, [
    el('h2', { className: 'ab-title', textContent: '⚡ Full Article Builder' }),
    el('div', { className: 'ab-phases' }),
    el('button', { className: 'ab-close', textContent: '✕', onClick: closeModal }),
  ]);

  const body = el('div', { className: 'ab-body' });
  const footer = el('div', { className: 'ab-footer' });

  modal.append(header, body, footer);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  builderState.modal = { backdrop, modal, header, body, footer };
  updatePhaseIndicator();
  return { body, footer };
}

function closeModal() {
  const existing = document.querySelector('.ab-backdrop');
  if (existing) existing.remove();
  builderState = null;
}

function updatePhaseIndicator() {
  if (!builderState?.modal) return;
  const container = builderState.modal.header.querySelector('.ab-phases');
  container.innerHTML = '';
  const phases = ['Ingest', 'Plan', 'Generate', 'Review'];
  phases.forEach((name, i) => {
    const num = i + 1;
    const dot = el('div', {
      className: `ab-phase-dot ${num === builderState.phase ? 'active' : ''} ${num < builderState.phase ? 'done' : ''}`,
      textContent: num < builderState.phase ? '✓' : String(num),
    });
    const label = el('span', { className: 'ab-phase-label', textContent: name });
    const step = el('div', { className: 'ab-phase-step' }, [dot, label]);
    container.appendChild(step);
    if (i < phases.length - 1) container.appendChild(el('div', { className: 'ab-phase-line' }));
  });
}

// ── Phase 1: Ingest ──

function renderPhase1() {
  const { body, footer } = openModal();

  // Tabs
  const tabs = el('div', { className: 'ab-tabs' });
  const tabData = [
    { id: 'paste', label: '📝 Paste Text' },
    { id: 'upload', label: '📎 Upload Files' },
    { id: 'url', label: '🔗 Add URL' },
  ];
  let activeTab = 'paste';
  const tabContent = el('div', { className: 'ab-tab-content' });

  function renderTab(tabId) {
    activeTab = tabId;
    tabs.querySelectorAll('.ab-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    tabContent.innerHTML = '';

    if (tabId === 'paste') {
      const textarea = el('textarea', { className: 'ab-paste-area', placeholder: 'Paste article drafts, research notes, interview transcripts…', rows: '12' });
      const addBtn = el('button', { className: 'ab-add-source', textContent: '+ Add as source', onClick: () => {
        const text = textarea.value.trim();
        if (!text) return;
        builderState.sources.push({ type: 'text', content: text, label: 'Pasted text' });
        textarea.value = '';
        renderSourceList();
      }});
      tabContent.append(textarea, addBtn);

    } else if (tabId === 'upload') {
      const dropZone = el('div', { className: 'ab-drop-zone', innerHTML: '<div class="ab-drop-icon">📄</div><div>Drop PDF, DOCX, or text files here</div><div class="ab-drop-hint">or click to browse</div>' });
      const fileInput = el('input', { type: 'file', accept: '.pdf,.docx,.doc,.txt,.md', multiple: 'true', style: 'display:none' });
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
      fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles(fileInput.files); });
      tabContent.append(dropZone, fileInput);

    } else if (tabId === 'url') {
      const urlInput = el('input', { type: 'url', className: 'ab-url-input', placeholder: 'https://example.com/article' });
      const fetchBtn = el('button', { className: 'ab-add-source', textContent: '+ Fetch & Add', onClick: async () => {
        const url = urlInput.value.trim();
        if (!url) return;
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching…';
        try {
          const result = await apiFetch('/api/scrape', { url });
          builderState.sources.push({ type: 'text', content: result.text, label: url });
          urlInput.value = '';
          renderSourceList();
        } catch (err) {
          alert('Failed to fetch URL: ' + err.message);
        } finally {
          fetchBtn.disabled = false;
          fetchBtn.textContent = '+ Fetch & Add';
        }
      }});
      tabContent.append(urlInput, fetchBtn);
    }
  }

  tabData.forEach(td => {
    const tab = el('button', { className: 'ab-tab' + (td.id === activeTab ? ' active' : ''), textContent: td.label, 'data-tab': td.id, onClick: () => renderTab(td.id) });
    tabs.appendChild(tab);
  });

  // Settings row
  const settings = el('div', { className: 'ab-settings' });

  const langSelect = el('select', { className: 'ab-select', onChange: (e) => { builderState.lang = e.target.value; } });
  [{ v: 'de', l: 'Deutsch' }, { v: 'en', l: 'English' }, { v: 'tr', l: 'Türkçe' }, { v: 'fr', l: 'Français' }, { v: 'es', l: 'Español' }].forEach(opt => {
    const o = el('option', { value: opt.v, textContent: opt.l });
    if (opt.v === builderState.lang) o.selected = true;
    langSelect.appendChild(o);
  });

  const toneGroup = el('div', { className: 'ab-tone-group' });
  ['investigative', 'explainer', 'feature', 'opinion'].forEach(tone => {
    const btn = el('button', {
      className: 'ab-tone-btn' + (tone === builderState.tone ? ' active' : ''),
      textContent: tone.charAt(0).toUpperCase() + tone.slice(1),
      onClick: (e) => {
        builderState.tone = tone;
        toneGroup.querySelectorAll('.ab-tone-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      }
    });
    toneGroup.appendChild(btn);
  });

  settings.append(
    el('div', { className: 'ab-setting' }, [el('label', { textContent: 'Language' }), langSelect]),
    el('div', { className: 'ab-setting' }, [el('label', { textContent: 'Tone' }), toneGroup])
  );

  // Source list
  const sourceList = el('div', { className: 'ab-source-list', id: 'ab-source-list' });

  function renderSourceList() {
    sourceList.innerHTML = '';
    if (builderState.sources.length === 0) {
      sourceList.innerHTML = '<div class="ab-empty">No sources added yet</div>';
      return;
    }
    builderState.sources.forEach((src, i) => {
      const words = src.content.split(/\s+/).length;
      const row = el('div', { className: 'ab-source-row' }, [
        el('span', { className: 'ab-source-icon', textContent: '📄' }),
        el('span', { className: 'ab-source-label', textContent: src.label }),
        el('span', { className: 'ab-source-words', textContent: `${words.toLocaleString()} words` }),
        el('button', { className: 'ab-source-remove', textContent: '✕', onClick: () => {
          builderState.sources.splice(i, 1);
          renderSourceList();
        }}),
      ]);
      sourceList.appendChild(row);
    });
  }

  body.append(tabs, tabContent, settings, el('h3', { className: 'ab-section-head', textContent: 'Sources' }), sourceList);
  renderTab('paste');
  renderSourceList();

  // Footer
  footer.innerHTML = '';
  const analyzeBtn = el('button', { className: 'ab-primary-btn', textContent: 'Analyze Sources →', onClick: async () => {
    if (builderState.sources.length === 0) { alert('Add at least one source first.'); return; }
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing…';
    try {
      const result = await apiFetch('/api/article-builder', {
        action: 'analyze',
        sources: builderState.sources,
        lang: builderState.lang,
        tone: builderState.tone,
      });
      builderState.facts = result.facts || [];
      builderState.plan = result.plan || [];
      builderState.warnings = result.warnings || [];
      builderState.phase = 2;
      renderPhase2();
    } catch (err) {
      alert('Analysis failed: ' + err.message);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze Sources →';
    }
  }});
  footer.appendChild(analyzeBtn);

  async function handleFiles(fileList) {
    for (const file of fileList) {
      try {
        const text = await parseFile(file);
        builderState.sources.push({ type: 'text', content: text, label: file.name });
      } catch (err) {
        alert(`Failed to parse ${file.name}: ${err.message}`);
      }
    }
    renderSourceList();
  }
}

// ── Phase 2: Analyze & Plan ──

function renderPhase2() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  // Warnings
  if (builderState.warnings.length > 0) {
    const warns = el('div', { className: 'ab-warnings' });
    builderState.warnings.forEach(w => {
      warns.appendChild(el('div', { className: 'ab-warning', innerHTML: `⚠️ ${escText(w)}` }));
    });
    body.appendChild(warns);
  }

  // Facts section (collapsible)
  const factsSection = el('div', { className: 'ab-facts-section' });
  const factsHead = el('div', { className: 'ab-facts-head', innerHTML: `<span>📋 Extracted Facts (${builderState.facts.length})</span><button class="ab-toggle">Show</button>` });
  const factsList = el('div', { className: 'ab-facts-list collapsed' });

  factsHead.querySelector('.ab-toggle').addEventListener('click', (e) => {
    const collapsed = factsList.classList.toggle('collapsed');
    e.target.textContent = collapsed ? 'Show' : 'Hide';
  });

  builderState.facts.forEach(fact => {
    const row = el('div', { className: 'ab-fact-row' + (fact.flag ? ' flagged' : '') }, [
      fact.flag ? el('span', { className: 'ab-fact-flag', textContent: '⚠️', title: fact.flag.replace(/_/g, ' ') }) : null,
      el('span', { className: 'ab-fact-claim', textContent: fact.claim }),
      fact.section ? el('span', { className: 'ab-fact-source', textContent: fact.section }) : null,
    ]);
    factsList.appendChild(row);
  });
  factsSection.append(factsHead, factsList);
  body.appendChild(factsSection);

  // Plan editor
  body.appendChild(el('h3', { className: 'ab-section-head', textContent: 'Article Structure' }));
  const planList = el('div', { className: 'ab-plan-list', id: 'ab-plan-list' });

  function renderPlan() {
    planList.innerHTML = '';
    builderState.plan.forEach((item, i) => {
      const row = el('div', { className: 'ab-plan-row', draggable: 'true', 'data-idx': String(i) });
      row.innerHTML = `
        <span class="ab-plan-handle">⠿</span>
        <span class="ab-plan-badge">${escText(item.type)}</span>
        <span class="ab-plan-headline">${escText(item.headline || '')}</span>
        <span class="ab-plan-rationale">${escText(item.rationale || '')}</span>
        <button class="ab-plan-remove" title="Remove">✕</button>
      `;
      row.querySelector('.ab-plan-remove').addEventListener('click', () => {
        builderState.plan.splice(i, 1);
        renderPlan();
      });

      // Drag handlers for reordering
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromIdx === i || isNaN(fromIdx)) return;
        const [moved] = builderState.plan.splice(fromIdx, 1);
        builderState.plan.splice(i, 0, moved);
        renderPlan();
      });

      planList.appendChild(row);
    });
  }

  body.appendChild(planList);
  renderPlan();

  // Footer
  const backBtn = el('button', { className: 'ab-secondary-btn', textContent: '← Back', onClick: () => {
    builderState.phase = 1;
    renderPhase1();
  }});
  const generateBtn = el('button', { className: 'ab-primary-btn', textContent: `Generate ${builderState.plan.length} Blocks →`, onClick: () => {
    if (builderState.plan.length === 0) { alert('Plan is empty.'); return; }
    builderState.phase = 3;
    renderPhase3();
  }});
  footer.append(backBtn, generateBtn);
}

// ── Phase 3: Generate ──

function renderPhase3() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  const total = builderState.plan.length;
  let current = 0;
  let failed = 0;

  // Progress
  const progress = el('div', { className: 'ab-progress' });
  const progressBar = el('div', { className: 'ab-progress-bar' });
  const progressText = el('div', { className: 'ab-progress-text', textContent: `Generating block 1 of ${total}…` });
  progress.appendChild(progressBar);
  body.append(progress, progressText);

  // Block status list
  const statusList = el('div', { className: 'ab-gen-list' });
  builderState.plan.forEach((item, i) => {
    const row = el('div', { className: 'ab-gen-row queued', 'data-idx': String(i) }, [
      el('span', { className: 'ab-gen-status', textContent: '⏳' }),
      el('span', { className: 'ab-gen-badge', textContent: item.type }),
      el('span', { className: 'ab-gen-headline', textContent: item.headline || '' }),
    ]);
    statusList.appendChild(row);
  });
  body.appendChild(statusList);

  footer.innerHTML = '<div class="ab-gen-note">Please wait while blocks are generated one at a time…</div>';

  // Generate blocks sequentially
  async function generateAll() {
    const previousSummaries = [];

    for (let i = 0; i < total; i++) {
      current = i;
      progressText.textContent = `Generating block ${i + 1} of ${total}…`;
      progressBar.style.width = `${((i) / total) * 100}%`;

      const row = statusList.querySelector(`[data-idx="${i}"]`);
      row.className = 'ab-gen-row generating';
      row.querySelector('.ab-gen-status').textContent = '🔄';

      try {
        const planItem = builderState.plan[i];
        const result = await apiFetch('/api/article-builder', {
          action: 'generate-block',
          type: planItem.type,
          planItem,
          sourceChunks: builderState.sources.map(s => s.content),
          facts: builderState.facts,
          articleContext: {
            title: builderState.plan[0]?.headline || 'Article',
            tone: builderState.tone,
            lang: builderState.lang,
            blockIndex: i,
            totalBlocks: total,
            previousSummaries: previousSummaries.join('; '),
          },
          lang: builderState.lang,
        });

        builderState.generated.push({
          type: planItem.type,
          data: result.data,
          confidence: result.confidence || 'medium',
          sourceRefs: result.sourceRefs || [],
          status: 'done',
        });

        previousSummaries.push(`Block ${i + 1} (${planItem.type}): ${planItem.headline || 'content'}`);

        row.className = `ab-gen-row done conf-${result.confidence || 'medium'}`;
        row.querySelector('.ab-gen-status').textContent = result.confidence === 'high' ? '✅' : result.confidence === 'low' ? '🔴' : '🟡';
      } catch (err) {
        failed++;
        builderState.generated.push({
          type: builderState.plan[i].type,
          data: null,
          confidence: null,
          status: 'failed',
          error: err.message,
        });
        row.className = 'ab-gen-row failed';
        row.querySelector('.ab-gen-status').textContent = '❌';
      }
    }

    progressBar.style.width = '100%';
    progressText.textContent = failed > 0
      ? `Done — ${total - failed} blocks generated, ${failed} failed`
      : `All ${total} blocks generated successfully!`;

    builderState.phase = 4;
    footer.innerHTML = '';
    footer.appendChild(el('button', { className: 'ab-primary-btn', textContent: 'Review Results →', onClick: renderPhase4 }));
  }

  generateAll();
}

// ── Phase 4: Review ──

function renderPhase4() {
  const { body, footer } = builderState.modal;
  body.innerHTML = '';
  footer.innerHTML = '';
  updatePhaseIndicator();

  const generated = builderState.generated.filter(g => g.status === 'done');
  const failedCount = builderState.generated.filter(g => g.status === 'failed').length;
  const highCount = generated.filter(g => g.confidence === 'high').length;
  const mediumCount = generated.filter(g => g.confidence === 'medium').length;
  const lowCount = generated.filter(g => g.confidence === 'low').length;

  // Summary
  const summary = el('div', { className: 'ab-review-summary' });
  summary.innerHTML = `
    <div class="ab-review-stat"><span class="ab-review-num">${generated.length}</span><span class="ab-review-label">Blocks generated</span></div>
    <div class="ab-review-stat high"><span class="ab-review-num">${highCount}</span><span class="ab-review-label">High confidence</span></div>
    <div class="ab-review-stat medium"><span class="ab-review-num">${mediumCount}</span><span class="ab-review-label">Medium confidence</span></div>
    ${lowCount > 0 ? `<div class="ab-review-stat low"><span class="ab-review-num">${lowCount}</span><span class="ab-review-label">Low confidence</span></div>` : ''}
    ${failedCount > 0 ? `<div class="ab-review-stat failed"><span class="ab-review-num">${failedCount}</span><span class="ab-review-label">Failed</span></div>` : ''}
  `;
  body.appendChild(summary);

  // Block list with confidence indicators
  const blockList = el('div', { className: 'ab-review-blocks' });
  builderState.generated.forEach((g, i) => {
    if (g.status !== 'done') return;
    const confClass = g.confidence || 'medium';
    const row = el('div', { className: `ab-review-row conf-${confClass}` });
    row.innerHTML = `
      <span class="ab-review-conf-dot"></span>
      <span class="ab-review-type">${escText(g.type)}</span>
      <span class="ab-review-preview">${escText(getBlockPreview(g))}</span>
    `;
    blockList.appendChild(row);
  });
  body.appendChild(blockList);

  if (lowCount > 0 || failedCount > 0) {
    body.appendChild(el('div', { className: 'ab-review-note', textContent: 'Blocks with medium/low confidence will show badges in the sidebar. Use the Enhance button to refine them.' }));
  }

  // Footer
  const backBtn = el('button', { className: 'ab-secondary-btn', textContent: '← Back to Plan', onClick: () => {
    builderState.generated = [];
    builderState.phase = 2;
    renderPhase2();
  }});
  const insertBtn = el('button', { className: 'ab-primary-btn', textContent: `Insert ${generated.length} Blocks into Page`, onClick: () => {
    const blocks = generated.map(g => ({
      id: 'b_' + Math.random().toString(36).slice(2, 10),
      type: g.type,
      data: g.data,
    }));
    if (window._insertBlocks) {
      window._insertBlocks(blocks);
    } else {
      alert('Cannot insert blocks — page editor not ready. Please try refreshing.');
      return;
    }
    closeModal();
  }});
  footer.append(backBtn, insertBtn);
}

function getBlockPreview(g) {
  if (!g.data) return '(empty)';
  if (g.data.titleHtml) return g.data.titleHtml.replace(/<[^>]+>/g, '').slice(0, 60);
  if (g.data.h2) return g.data.h2.slice(0, 60);
  if (g.data.title) return g.data.title.slice(0, 60);
  if (g.data.text) return g.data.text.slice(0, 60);
  if (g.data.headline) return g.data.headline.slice(0, 60);
  if (g.data.content && g.data.content[0]) {
    const first = g.data.content[0];
    return (first.text || first.html || '').replace(/<[^>]+>/g, '').slice(0, 60);
  }
  return g.type;
}

// ── Entry Point ──

window.openArticleBuilder = function() {
  resetState();
  renderPhase1();
};

})();
```

- [ ] **Step 2: Verify file is syntactically valid**

```bash
node -c admin/ui/article-builder.js
```
Expected: No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add admin/ui/article-builder.js
git commit -m "feat(article-builder): add 4-phase modal UI — ingest, plan, generate, review"
```

---

## Task 4: Modify `admin/ui/app.js` — Expose `_insertBlocks`, add confidence badges

**Files:**
- Modify: `admin/ui/app.js`

Three changes:
1. Expose `window._insertBlocks(blocks)` that appends blocks, saves draft, re-renders
2. Add click handler for the topbar "Full Article" button
3. Add confidence badge rendering in `renderBlockList()`

- [ ] **Step 1: Add `window._insertBlocks` function**

Find the line `// Kickoff` near the end of app.js (line ~4846). Insert the `_insertBlocks` function just before it:

```js
// ─────────────────────────── Article Builder bridge ──────────────
// Exposed on window so article-builder.js (separate file) can insert generated blocks
window._insertBlocks = function(blocks) {
  if (!state.doc) return;
  if (!Array.isArray(blocks) || blocks.length === 0) return;
  blocks.forEach(b => {
    state.doc.blocks.push(b);
  });
  setDirty(true);
  renderBlockList();
  renderEditor();
  // Auto-save draft
  saveDraft();
};
```

- [ ] **Step 2: Add topbar button click handler**

Find the line `$('#btn-add-block').addEventListener('click'` (line ~2725). Add the article builder click handler right before it:

```js
// Full Article builder button
const btnArticleBuilder = document.getElementById('btn-article-builder');
if (btnArticleBuilder) {
  btnArticleBuilder.addEventListener('click', () => {
    if (window.openArticleBuilder) window.openArticleBuilder();
  });
}
```

- [ ] **Step 3: Add confidence badge in `renderBlockList()`**

Inside the `renderBlockList()` function (line ~2396), find the line that builds the `li.innerHTML` template string. After the `block-type-badge` span and before the `block-label-edit` button, add the confidence badge:

The existing innerHTML template is:
```js
li.innerHTML = `
  <div class="block-header">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <span class="block-icon">${icon}</span>
    <span class="block-name">${escapeText(label || schemaName)}</span>
    ${label ? `<span class="block-type-badge">${escapeText(schemaName)}</span>` : ''}
    <button class="block-label-edit" title="Rename this block">✎</button>
    <span class="block-chevron">›</span>
  </div>
  <div class="block-body"></div>`;
```

Replace it with:
```js
const conf = block.data?._confidence;
const confBadge = conf === 'low' ? '<span class="conf-badge conf-low" title="Low confidence — AI filled gaps">🔴</span>'
  : conf === 'medium' ? '<span class="conf-badge conf-medium" title="Medium confidence — AI performed synthesis">🟡</span>'
  : '';
li.innerHTML = `
  <div class="block-header">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <span class="block-icon">${icon}</span>
    <span class="block-name">${escapeText(label || schemaName)}</span>
    ${label ? `<span class="block-type-badge">${escapeText(schemaName)}</span>` : ''}
    ${confBadge}
    <button class="block-label-edit" title="Rename this block">✎</button>
    <span class="block-chevron">›</span>
  </div>
  <div class="block-body"></div>`;
```

- [ ] **Step 4: Verify no syntax errors**

```bash
node -c admin/ui/app.js
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(article-builder): expose _insertBlocks bridge, add confidence badges in block list"
```

---

## Task 5: Modify `admin/ui/index.html` — Add CDN scripts, topbar button, script tag

**Files:**
- Modify: `admin/ui/index.html`

Four changes:
1. Add pdf.js CDN script
2. Add mammoth.js CDN script
3. Add topbar "Full Article" button
4. Add article-builder.js script tag (after app.js)
5. Bump cache version

- [ ] **Step 1: Add CDN scripts and article-builder.js**

In `index.html`, find the scripts section at the bottom (lines 128-132). Add the CDN libraries before supabase-client.js, and article-builder.js after app.js:

Current:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/motion@11.18.2/dist/motion.js"></script>
<script src="/admin/ui/motion.js?v=20260517b"></script>
<script src="/admin/ui/supabase-client.js?v=20260517b"></script>
<script src="/admin/ui/app.js?v=20260517b"></script>
```

Replace with:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/motion@11.18.2/dist/motion.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs" type="module"></script>
<script>
  // pdf.js worker setup (loaded as module, expose on window for article-builder.js)
  import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs').then(mod => {
    window.pdfjsLib = mod;
    mod.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs';
  }).catch(() => {});
</script>
<script src="https://cdn.jsdelivr.net/npm/mammoth@1/mammoth.browser.min.js"></script>
<script src="/admin/ui/motion.js?v=20260517c"></script>
<script src="/admin/ui/supabase-client.js?v=20260517c"></script>
<script src="/admin/ui/app.js?v=20260517c"></script>
<script src="/admin/ui/article-builder.js?v=20260517c"></script>
```

- [ ] **Step 2: Add topbar button**

Find the topbar actions div (line ~66):
```html
<div class="topbar-actions">
  <button id="btn-preview" title="Open rendered page in a new tab">Preview</button>
  <button id="btn-history" title="Snapshots history">History</button>
  <button id="btn-publish" class="primary">Publish</button>
```

Add the Full Article button before Preview:
```html
<div class="topbar-actions">
  <button id="btn-article-builder" title="Build a full article from source material">⚡ Full Article</button>
  <button id="btn-preview" title="Open rendered page in a new tab">Preview</button>
  <button id="btn-history" title="Snapshots history">History</button>
  <button id="btn-publish" class="primary">Publish</button>
```

- [ ] **Step 3: Bump CSS cache version**

Update the stylesheet link:
```html
<link rel="stylesheet" href="/admin/ui/styles.css?v=20260517c">
```

- [ ] **Step 4: Commit**

```bash
git add admin/ui/index.html
git commit -m "feat(article-builder): add CDN scripts, topbar button, article-builder.js script tag"
```

---

## Task 6: Modify `admin/ui/styles.css` — Article builder styles + confidence badge styles

**Files:**
- Modify: `admin/ui/styles.css`

Append all `.ab-*` article builder styles and `.conf-*` confidence badge styles at the end of the file.

- [ ] **Step 1: Append article builder CSS**

Add the following at the end of `styles.css`:

```css
/* ─────────────────────────── Article Builder (.ab-*) ─────────────────── */

/* Backdrop + Modal */
.ab-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: ab-fadeIn 0.2s ease;
}
@keyframes ab-fadeIn { from { opacity: 0; } to { opacity: 1; } }
.ab-modal {
  background: #fff; border-radius: 16px;
  width: min(92vw, 720px); max-height: 88vh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 48px rgba(0,0,0,0.15);
  animation: ab-slideUp 0.25s ease;
}
@keyframes ab-slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Header */
.ab-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0; position: relative;
}
.ab-title { font-size: 16px; font-weight: 700; margin: 0; white-space: nowrap; }
.ab-phases { display: flex; align-items: center; gap: 4px; margin-left: auto; margin-right: 32px; }
.ab-phase-step { display: flex; align-items: center; gap: 4px; }
.ab-phase-dot {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: #9ca3af; background: #f3f4f6;
  transition: all 0.2s;
}
.ab-phase-dot.active { background: #8080FF; color: #fff; }
.ab-phase-dot.done { background: #22c55e; color: #fff; }
.ab-phase-label { font-size: 11px; color: #6b7280; }
.ab-phase-line { width: 16px; height: 1px; background: #d1d5db; }
.ab-close {
  position: absolute; right: 12px; top: 12px;
  background: none; border: none; font-size: 18px; cursor: pointer;
  color: #9ca3af; padding: 4px;
}
.ab-close:hover { color: #374151; }

/* Body + Footer */
.ab-body { padding: 20px; overflow-y: auto; flex: 1; }
.ab-footer {
  padding: 12px 20px; border-top: 1px solid #e5e7eb;
  display: flex; gap: 8px; justify-content: flex-end;
  flex-shrink: 0;
}
.ab-primary-btn {
  padding: 10px 20px; border-radius: 10px; border: none;
  background: #8080FF; color: #fff; font-weight: 600; font-size: 14px;
  cursor: pointer; transition: background 0.15s;
}
.ab-primary-btn:hover { background: #6b6be0; }
.ab-primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ab-secondary-btn {
  padding: 10px 20px; border-radius: 10px; border: 1px solid #d1d5db;
  background: #fff; color: #374151; font-weight: 500; font-size: 14px;
  cursor: pointer;
}
.ab-secondary-btn:hover { background: #f9fafb; }

/* Phase 1: Tabs */
.ab-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.ab-tab {
  padding: 8px 14px; border-radius: 8px; border: 1px solid #e5e7eb;
  background: #fff; font-size: 13px; cursor: pointer; font-weight: 500;
  transition: all 0.15s;
}
.ab-tab.active { background: #8080FF; color: #fff; border-color: #8080FF; }
.ab-tab:not(.active):hover { background: #f3f4f6; }

/* Phase 1: Paste */
.ab-paste-area {
  width: 100%; min-height: 160px; padding: 12px; border: 1px solid #d1d5db;
  border-radius: 10px; font-size: 14px; font-family: inherit; resize: vertical;
}
.ab-paste-area:focus { outline: none; border-color: #8080FF; box-shadow: 0 0 0 2px rgba(128,128,255,0.15); }
.ab-add-source {
  margin-top: 8px; padding: 8px 16px; border-radius: 8px; border: 1px dashed #8080FF;
  background: rgba(128,128,255,0.05); color: #8080FF; font-weight: 500;
  cursor: pointer; font-size: 13px;
}
.ab-add-source:hover { background: rgba(128,128,255,0.1); }

/* Phase 1: Upload */
.ab-drop-zone {
  border: 2px dashed #d1d5db; border-radius: 12px;
  padding: 32px; text-align: center; cursor: pointer;
  transition: all 0.15s; color: #6b7280;
}
.ab-drop-zone:hover, .ab-drop-zone.drag-over { border-color: #8080FF; background: rgba(128,128,255,0.04); }
.ab-drop-icon { font-size: 32px; margin-bottom: 8px; }
.ab-drop-hint { font-size: 12px; color: #9ca3af; margin-top: 4px; }

/* Phase 1: URL */
.ab-url-input {
  width: 100%; padding: 10px 14px; border: 1px solid #d1d5db;
  border-radius: 10px; font-size: 14px; font-family: inherit;
}
.ab-url-input:focus { outline: none; border-color: #8080FF; box-shadow: 0 0 0 2px rgba(128,128,255,0.15); }

/* Phase 1: Settings */
.ab-settings { display: flex; gap: 16px; margin: 16px 0; }
.ab-setting { display: flex; flex-direction: column; gap: 4px; }
.ab-setting label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
.ab-select {
  padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 13px; font-family: inherit;
}
.ab-tone-group { display: flex; gap: 4px; }
.ab-tone-btn {
  padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db;
  background: #fff; font-size: 12px; cursor: pointer; font-weight: 500;
}
.ab-tone-btn.active { background: #8080FF; color: #fff; border-color: #8080FF; }
.ab-tone-btn:not(.active):hover { background: #f3f4f6; }

/* Phase 1: Source list */
.ab-section-head { font-size: 13px; font-weight: 700; color: #374151; margin: 16px 0 8px; }
.ab-source-list { display: flex; flex-direction: column; gap: 4px; }
.ab-source-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: #f9fafb; border-radius: 8px;
}
.ab-source-icon { font-size: 16px; }
.ab-source-label { font-size: 13px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-source-words { font-size: 12px; color: #9ca3af; }
.ab-source-remove {
  background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 2px;
}
.ab-source-remove:hover { color: #ef4444; }
.ab-empty { text-align: center; padding: 24px; color: #9ca3af; font-size: 13px; }

/* Phase 2: Warnings */
.ab-warnings { margin-bottom: 12px; }
.ab-warning { padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 13px; color: #92400e; }

/* Phase 2: Facts */
.ab-facts-section { margin-bottom: 16px; }
.ab-facts-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: #f3f4f6; border-radius: 8px;
  font-size: 13px; font-weight: 600;
}
.ab-toggle {
  background: none; border: none; color: #8080FF; font-size: 12px;
  cursor: pointer; font-weight: 500;
}
.ab-facts-list { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.ab-facts-list.collapsed { display: none; }
.ab-fact-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  font-size: 13px; border-radius: 6px;
}
.ab-fact-row.flagged { background: #fffbeb; }
.ab-fact-flag { font-size: 14px; flex-shrink: 0; }
.ab-fact-claim { flex: 1; }
.ab-fact-source { font-size: 11px; color: #9ca3af; flex-shrink: 0; }

/* Phase 2: Plan editor */
.ab-plan-list { display: flex; flex-direction: column; gap: 4px; }
.ab-plan-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; background: #f9fafb; border-radius: 10px;
  cursor: grab; transition: all 0.15s; border: 1px solid transparent;
}
.ab-plan-row:hover { background: #f3f4f6; }
.ab-plan-row.dragging { opacity: 0.5; }
.ab-plan-row.drag-over { border-color: #8080FF; background: rgba(128,128,255,0.05); }
.ab-plan-handle { color: #9ca3af; cursor: grab; font-size: 14px; }
.ab-plan-badge {
  padding: 2px 8px; background: #e3e5ff; color: #4a4ab3; border-radius: 4px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.ab-plan-headline { font-size: 13px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-plan-rationale { font-size: 11px; color: #9ca3af; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-plan-remove {
  background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 2px;
}
.ab-plan-remove:hover { color: #ef4444; }

/* Phase 3: Progress */
.ab-progress {
  width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px;
  overflow: hidden; margin-bottom: 12px;
}
.ab-progress-bar { height: 100%; background: #8080FF; border-radius: 3px; transition: width 0.3s ease; width: 0%; }
.ab-progress-text { text-align: center; font-size: 13px; color: #6b7280; margin-bottom: 16px; }

/* Phase 3: Generation list */
.ab-gen-list { display: flex; flex-direction: column; gap: 4px; }
.ab-gen-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px; font-size: 13px;
}
.ab-gen-row.queued { background: #f9fafb; color: #9ca3af; }
.ab-gen-row.generating { background: #eff6ff; color: #2563eb; }
.ab-gen-row.done { background: #f0fdf4; }
.ab-gen-row.done.conf-high { background: #f0fdf4; }
.ab-gen-row.done.conf-medium { background: #fffbeb; }
.ab-gen-row.done.conf-low { background: #fef2f2; }
.ab-gen-row.failed { background: #fef2f2; color: #dc2626; }
.ab-gen-status { font-size: 16px; flex-shrink: 0; }
.ab-gen-badge { font-size: 11px; font-weight: 600; color: #6b7280; }
.ab-gen-headline { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-gen-note { text-align: center; font-size: 12px; color: #9ca3af; }

/* Phase 4: Review */
.ab-review-summary {
  display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
}
.ab-review-stat {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 12px 16px; background: #f3f4f6; border-radius: 10px;
  flex: 1; min-width: 80px;
}
.ab-review-stat.high { background: #f0fdf4; }
.ab-review-stat.medium { background: #fffbeb; }
.ab-review-stat.low { background: #fef2f2; }
.ab-review-stat.failed { background: #fef2f2; }
.ab-review-num { font-size: 24px; font-weight: 700; color: #111; }
.ab-review-label { font-size: 11px; color: #6b7280; text-align: center; }
.ab-review-blocks { display: flex; flex-direction: column; gap: 4px; }
.ab-review-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px; background: #f9fafb;
}
.ab-review-conf-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ab-review-row.conf-high .ab-review-conf-dot { background: #22c55e; }
.ab-review-row.conf-medium .ab-review-conf-dot { background: #f59e0b; }
.ab-review-row.conf-low .ab-review-conf-dot { background: #ef4444; }
.ab-review-type { font-size: 11px; font-weight: 600; color: #6b7280; min-width: 80px; }
.ab-review-preview { font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-review-note { margin-top: 12px; padding: 10px 14px; background: #fffbeb; border-radius: 8px; font-size: 12px; color: #92400e; }

/* Confidence badges in sidebar block list */
.conf-badge { font-size: 10px; margin-left: 4px; cursor: help; }

/* Mobile responsive */
@media (max-width: 600px) {
  .ab-modal { width: 100vw; max-height: 100vh; border-radius: 0; }
  .ab-phases { display: none; }
  .ab-settings { flex-direction: column; }
  .ab-review-summary { flex-direction: column; }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/ui/styles.css
git commit -m "feat(article-builder): add .ab-* and .conf-* styles for article builder UI and confidence badges"
```

---

## Self-Review

**Spec coverage check:**

| Spec Requirement | Task |
|---|---|
| Phase 1: Ingest — paste, upload, URL, language, tone | Task 3 (renderPhase1) |
| Phase 1: PDF parsing (pdf.js) | Task 3 (parsePDF) + Task 5 (CDN script) |
| Phase 1: DOCX parsing (mammoth.js) | Task 3 (parseDOCX) + Task 5 (CDN script) |
| Phase 2: Fact extraction with source refs + flags | Task 2 (summarizeChunk) + Task 3 (renderPhase2 facts section) |
| Phase 2: Structure proposal with rationale | Task 2 (proposePlan) + Task 3 (renderPhase2 plan editor) |
| Phase 2: Drag to reorder, remove blocks | Task 3 (renderPhase2 drag handlers, remove button) |
| Phase 3: Sequential block generation with progress | Task 3 (renderPhase3 + generateAll) |
| Phase 3: Source grounding in prompt | Task 2 (generateBlock system prompt) |
| Phase 3: Confidence tags | Task 2 (confidence in generateBlock) + Task 3 (Phase 3/4 display) |
| Phase 4: Review with confidence breakdown | Task 3 (renderPhase4) |
| Phase 4: Insert into page | Task 3 (insertBtn) + Task 4 (window._insertBlocks) |
| Layer 1: Fact extraction before planning | Task 2 (handleAnalyze — Pass 1 then Pass 2) |
| Layer 2: Source grounding during generation | Task 2 (generateBlock system prompt) |
| Layer 3: Confidence tags after generation | Task 2 (confidence stamped in data._confidence) |
| `[NEEDS SOURCE]` placeholders | Task 2 (system prompt instructs this) |
| Confidence badges in sidebar | Task 4 (renderBlockList modification) |
| API: article-builder.js with analyze + generate-block | Task 2 |
| API: scrape.js for URL extraction | Task 1 |
| UI: article-builder.js separate file | Task 3 |
| index.html: CDN scripts, button, script tag | Task 5 |
| styles.css: .ab-* styles | Task 6 |
| Context window chunking for long content | Task 2 (chunkText + sequential summarization) |
| Separate rate limits | Task 2 (RATE_LIMITS object) |
| YAGNI: No persistent source storage | ✅ (sources live in builderState only) |
| YAGNI: No regenerate single block | ✅ (not implemented) |
| YAGNI: No save/resume partial builds | ✅ (not implemented) |

**Placeholder scan:** No TBDs, TODOs, or vague instructions. All code blocks are complete.

**Type consistency check:**
- `apiFetch` in Task 3 uses `/api/article-builder` and `/api/scrape` — matches Task 1 and 2 endpoint paths ✅
- `window._insertBlocks(blocks)` in Task 3 matches Task 4 definition ✅
- `window.openArticleBuilder` in Task 3 matches Task 4/5 click handler reference ✅
- `SB._client` in Task 3 — need to verify this exists. Let me check supabase-client.js...

Actually, the auth token access pattern in Task 3's `getAuthToken()` references `window.SB._client` which may not be exposed. Let me verify and fix:

The `SB` object in supabase-client.js wraps the Supabase client. The `generate()` method accesses `client.auth.getSession()` internally. The article-builder.js needs the same auth token but uses `fetch()` directly (not `SB.generate()`). We need the raw token.

Looking at `supabase-client.js`, the `client` variable is private inside its own IIFE. So `SB._client` won't work unless it's exposed. Rather than modifying supabase-client.js, we can add a helper method.

**Fix:** Change article-builder.js's `getAuthToken` to use the existing Supabase CDN global. The Supabase client is created with `supabase.createClient(...)` in supabase-client.js and stored privately. But the `@supabase/supabase-js` CDN is loaded globally. We need a different approach — add a `SB.getToken()` method in app.js or expose the client.

Simpler fix: article-builder.js can just call an `SB.getAuthToken()` method. Let me check what SB exposes...
