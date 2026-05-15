// functions/p/[[path]].js
// Serves published scrollytelling pages.
// URL pattern: /p/:site_slug/:page_slug
// Falls back to "index" if no page_slug provided.

/**
 * Extract the first image URL from page content blocks for og:image.
 * Walks through blocks in order, checking known image-bearing types.
 */
function extractOgImage(content) {
  const blocks = content?.blocks;
  if (!Array.isArray(blocks)) return null;

  for (const block of blocks) {
    const t = block.type;
    const d = block.data;
    if (!d) continue;

    if (t === 'FullscreenImage' && d.imageSrc) return d.imageSrc;
    if (t === 'Figure' && Array.isArray(d.images) && d.images[0]?.src) return d.images[0].src;
    if (t === 'Editorial' && Array.isArray(d.content)) {
      for (const item of d.content) {
        if (item.type === 'figure' && item.src) return item.src;
      }
    }
    if (t === 'Hero' && d.svgSrc) return d.svgSrc;
  }

  return null;
}

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
      `${SUPABASE_URL}/rest/v1/pages?user_id=eq.${userId}&slug=eq.${encodeURIComponent(pageSlug)}&published=eq.true&select=content,title,lang,meta,published_at,updated_at`,
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
    const theme = content.theme || 'dia';
    const themeLink = theme !== 'dia' ? `<link rel="stylesheet" href="/themes/${theme}.css">` : '';

    // SEO: og:image — first image from content blocks, or fallback
    const ogImageRaw = extractOgImage(content) || '/images/og-default.png';
    const ogImage = escapeHtml(ogImageRaw);

    // SEO: canonical URL (strip query params)
    const canonicalUrl = new URL(context.request.url);
    canonicalUrl.search = '';

    // SEO: JSON-LD Article structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: content.meta?.title || page.title || 'Untitled',
      description: content.meta?.description || '',
      author: { '@type': 'Person', name: authorName },
      image: ogImageRaw,
      datePublished: page.published_at || '',
      dateModified: page.updated_at || '',
      publisher: { '@type': 'Organization', name: 'ScrollyCMS' },
    };

    // 3. Build full HTML — same structure as index.rendered.html
    const html = `<!DOCTYPE html>
<html lang="${lang}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${escapeHtml(canonicalUrl.href)}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g, '<\\/')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/css/site.css">
${themeLink}
<script src="/vendor/d3.min.js"></script>
<script>window.d3||document.write('<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\\/script>')</script>
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
