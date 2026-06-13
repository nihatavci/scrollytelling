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
        'User-Agent': 'Scrolli Labs/1.0 (Article Builder)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
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

function extractContent(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  let content = '';
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);

  if (articleMatch) {
    content = articleMatch[1];
  } else if (mainMatch) {
    content = mainMatch[1];
  } else {
    const bodyMatch = cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : cleaned;
  }

  const text = content
    .replace(/<[^>]+>/g, ' ')
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
