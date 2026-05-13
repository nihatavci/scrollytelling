// functions/p/[[path]].js
// Serves published scrollytelling pages.
// URL pattern: /p/:site_slug/:page_slug
// Falls back to "index" if no page_slug provided.

export async function onRequest(context) {
  const { env } = context;
  const pathParts = context.params.path;

  if (!pathParts || pathParts.length < 1 || pathParts.length > 2) {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const siteSlug = pathParts[0];
  const pageSlug = pathParts[1] || 'index';

  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  try {
    // 1. Resolve site_slug → user_id
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?site_slug=eq.${encodeURIComponent(siteSlug)}&select=id,display_name`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept': 'application/json',
        },
      }
    );
    if (!profileRes.ok) return new Response('Upstream error', { status: 502 });
    const profiles = await profileRes.json();
    if (!profiles.length) return notFoundPage(siteSlug);

    const userId = profiles[0].id;
    const authorName = profiles[0].display_name || siteSlug;

    // 2. Fetch the published page
    const pageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pages?user_id=eq.${userId}&slug=eq.${encodeURIComponent(pageSlug)}&published=eq.true&select=content,title,lang,meta`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept': 'application/json',
        },
      }
    );
    if (!pageRes.ok) return new Response('Upstream error', { status: 502 });
    const pages = await pageRes.json();
    if (!pages.length) return notFoundPage(pageSlug);

    const page = pages[0];
    const content = page.content || {};
    const title = escapeHtml(content.meta?.title || page.title || 'Untitled');
    const description = escapeHtml(content.meta?.description || '');
    const lang = content.lang || page.lang || 'de';

    // 3. Build full HTML — same structure as index.rendered.html
    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet">
<script src="/vendor/d3.min.js"></script>
<script>window.d3||document.write('<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\\/script>')</script>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
:root{
  --canvas:#f8f8f8;--snow:#fff;--fog:#efefef;--pebble:#d9d9d9;
  --ash:#7c7c7c;--slate:#959595;--steel:#aeaeae;--graphite:#636363;--ink-black:#000;
  --rose-quartz:#c679c4;--marigold:#ffb005;--signal-blue:#0358f7;--spectrum-red:#fa3d1d;
  --spectrum-gradient:linear-gradient(90deg,#c679c4 0%,#fa3d1d 25%,#ffb005 50%,#e1e1fe 75%,#0358f7 100%);
  --bg:var(--canvas);--text:var(--ink-black);--muted:var(--graphite);--accent:var(--ink-black);
  --card:rgba(255,255,255,.9);
  --font-display:'DM Sans',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --font-body:'DM Sans',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --radius-card:30px;--radius-image:10px;--radius-button:30px;--radius-pill:9999px;
  --shadow-card:rgba(0,0,0,0.08) 0 0 8px 0;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden}
.progress{position:fixed;top:0;left:0;height:2px;background:var(--spectrum-gradient);z-index:999;transition:width .2s;border-radius:0 2px 2px 0;width:0}
.editorial{max-width:720px;margin:0 auto;padding:2.5rem 2rem 3rem;position:relative;z-index:3;background:var(--canvas)}
.editorial h2{font-family:var(--font-display);font-size:clamp(2rem,4vw,3.125rem);font-weight:300;margin-bottom:1.2rem;letter-spacing:-.04em;line-height:1.18;color:var(--ink-black)}
.editorial p{font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);margin-bottom:1.25rem;font-weight:400}
.editorial .lead{font-size:1.25rem;font-weight:300;line-height:1.4;letter-spacing:-.01em;color:var(--ink-black)}
.editorial .kicker{font-family:var(--font-body);font-size:.75rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--graphite);margin-bottom:.8rem}
.pullquote{border-left:none;padding:1.25rem 0 1.25rem 1.5rem;margin:2.5rem 0;font-family:var(--font-display);font-size:clamp(1.25rem,2.5vw,1.625rem);font-weight:300;font-style:normal;color:var(--ink-black);line-height:1.3;letter-spacing:-.02em;position:relative}
.pullquote::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--spectrum-gradient);border-radius:2px}
.pullquote cite{display:block;font-size:.85rem;font-weight:500;font-style:normal;color:var(--graphite);margin-top:.75rem;font-family:var(--font-body)}
</style>
<script>window.__PAGE_DATA__ = ${JSON.stringify(content).replace(/<\//g, '<\\/')};</script>
</head>
<body>
<div class="progress" id="progress"></div>
<main id="page-root"></main>
<script type="module">
import { render } from '/js/render.js';
render().then(() => {
  // Progress bar
  window.addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) document.getElementById('progress').style.width = (window.scrollY / h * 100) + '%';
  });
}).catch(e => console.error('Render error:', e));
</script>
<footer style="max-width:720px;margin:3rem auto;padding:2rem;text-align:center;font-size:12px;color:var(--graphite);">
  Published by ${escapeHtml(authorName)} &middot; Powered by <a href="/admin/" style="color:var(--signal-blue);text-decoration:none;">ScrollyCMS</a>
</footer>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
    });
  } catch (err) {
    console.error('Page render error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notFoundPage(slug) {
  return new Response(
    `<!DOCTYPE html><html><head><title>Not Found</title>
    <style>body{font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8f8f8;color:#000;}
    .box{text-align:center;} h1{font-weight:300;font-size:3rem;margin-bottom:1rem;} p{color:#636363;}</style></head>
    <body><div class="box"><h1>404</h1><p>"${escapeHtml(slug)}" was not found.</p>
    <a href="/admin/" style="color:#0358f7;font-size:14px;margin-top:1rem;display:inline-block;">Go to ScrollyCMS &rarr;</a></div></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
