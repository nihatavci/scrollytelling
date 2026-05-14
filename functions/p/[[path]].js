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
    const theme = content.theme || 'dia';
    const themeLink = theme !== 'dia' ? `<link rel="stylesheet" href="/themes/${theme}.css">` : '';

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet">
${themeLink}
<script src="/vendor/d3.min.js"></script>
<script>window.d3||document.write('<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"><\\/script>')</script>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
:root{
  --canvas:#f8f8f8;--snow:#fff;--fog:#efefef;--pebble:#d9d9d9;
  --ash:#7c7c7c;--slate:#959595;--steel:#aeaeae;--graphite:#636363;--ink-black:#000;
  --rose-quartz:#c679c4;--marigold:#ffb005;--signal-blue:#0358f7;--hot-pink:#fd02f5;--spectrum-red:#fa3d1d;
  --spectrum-gradient:linear-gradient(90deg,#c679c4 0%,#fa3d1d 25%,#ffb005 50%,#e1e1fe 75%,#0358f7 100%);
  --bg:var(--canvas);--text:var(--ink-black);--muted:var(--graphite);--accent:var(--ink-black);
  --card:rgba(255,255,255,.9);
  --font-display:'DM Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --font-body:'DM Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --radius-card:30px;--radius-image:10px;--radius-button:30px;--radius-pill:9999px;
  --shadow-card:rgba(0,0,0,0.08) 0 0 8px 0;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden}
.progress{position:fixed;top:0;left:0;height:2px;background:var(--spectrum-gradient);z-index:999;transition:width .2s;border-radius:0 2px 2px 0;width:0}

/* ── Cinematic Intro (Hero) ── */
.cin-intro{position:relative;width:100%;height:100vh;overflow:hidden;background:var(--bg);z-index:10}
.cin-brand{position:absolute;left:0;right:0;text-align:center;font-family:'DM Sans',sans-serif;font-weight:600;letter-spacing:.18em;text-transform:uppercase;opacity:0;z-index:5;top:50%;transform:translateY(-50%);font-size:clamp(.85rem,2vw,1.25rem);color:var(--text);transition:top .9s cubic-bezier(.4,0,.2,1),transform .9s cubic-bezier(.4,0,.2,1),font-size .9s ease,color .9s ease,opacity .7s ease}
.cin-brand.settled{top:1.8rem;transform:translateY(0);font-size:.72rem;color:var(--muted)}
.cin-svg-wrap{position:absolute;top:0;left:0;width:100%;height:58%;z-index:1}
.cin-svg-wrap svg{width:100%;height:100%;display:block}
.cin-text-layer{position:absolute;left:0;right:0;top:58%;height:32%;z-index:2;display:flex;align-items:center;justify-content:center;pointer-events:none}
.cin-line{font-family:var(--font-display);color:var(--ink-black);opacity:0;position:absolute;text-align:center;max-width:72vw;line-height:1.4;letter-spacing:-.02em}
.cin-l1,.cin-l2{font-size:clamp(1.3rem,2.6vw,1.75rem);font-weight:300;color:var(--graphite)}
.cin-l3{font-size:clamp(1.35rem,2.8vw,1.9rem);font-weight:400;color:var(--ink-black)}
.cin-l4{font-size:clamp(1.2rem,2.4vw,1.6rem);font-weight:300;color:var(--graphite)}
.cin-l5{font-size:clamp(1.3rem,2.7vw,1.85rem);font-weight:400;color:var(--ink-black)}
.cin-l6{font-size:clamp(1.45rem,3.2vw,2.2rem);font-weight:500;color:var(--ink-black);letter-spacing:-.03em}
.cin-title-layer{position:absolute;top:0;left:0;right:0;bottom:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 2rem;opacity:0;pointer-events:none}
.cin-main-title{font-family:var(--font-display);font-size:clamp(2.6rem,7vw,4.5rem);font-weight:300;color:var(--text);line-height:1.11;letter-spacing:-.04em;margin-bottom:.8rem}
.cin-main-title span{color:var(--accent)}
.cin-sub-title{font-family:var(--font-body);font-size:clamp(.9rem,1.8vw,1.15rem);color:var(--graphite);font-weight:400;letter-spacing:-.01em}
.cin-scroll-cue{position:absolute;bottom:2rem;left:0;right:0;text-align:center;z-index:6;color:var(--graphite);font-family:var(--font-body);font-size:.78rem;font-weight:400;display:flex;flex-direction:column;align-items:center;gap:.5rem;opacity:0;letter-spacing:.02em}
.cin-scroll-cue .arr{width:14px;height:14px;border-right:2px solid var(--ink-black);border-bottom:2px solid var(--ink-black);transform:rotate(45deg);animation:bob 2s ease-in-out infinite}
@keyframes bob{0%,100%{transform:rotate(45deg) translateY(0)}50%{transform:rotate(45deg) translateY(6px)}}

/* ── Editorial ── */
.editorial{max-width:720px;margin:0 auto;padding:2.5rem 2rem 3rem;position:relative;z-index:3;background:var(--canvas)}
.editorial h2{font-family:var(--font-display);font-size:clamp(2rem,4vw,3.125rem);font-weight:300;margin-bottom:1.2rem;letter-spacing:-.04em;line-height:1.18;color:var(--ink-black)}
.editorial p{font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);margin-bottom:1.25rem;font-weight:400}
.editorial .lead{font-size:1.25rem;font-weight:300;line-height:1.4;letter-spacing:-.01em;color:var(--ink-black)}
.editorial .kicker{font-family:var(--font-body);font-size:.75rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--graphite);margin-bottom:.8rem}
.pullquote{border-left:none;padding:1.25rem 0 1.25rem 1.5rem;margin:2.5rem 0;font-family:var(--font-display);font-size:clamp(1.25rem,2.5vw,1.625rem);font-weight:300;font-style:normal;color:var(--ink-black);line-height:1.3;letter-spacing:-.02em;position:relative}
.pullquote::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--spectrum-gradient);border-radius:2px}
.pullquote cite{display:block;font-size:.85rem;font-weight:500;font-style:normal;color:var(--graphite);margin-top:.75rem;font-family:var(--font-body);letter-spacing:.02em}
.editorial figure{margin:2.5rem 0;width:100%}
.editorial figure img{width:100%;height:auto;border-radius:var(--radius-image);display:block}
.editorial figcaption{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.6rem;font-style:normal;font-weight:400}
.editorial .separator{width:60px;height:2px;background:var(--spectrum-gradient);margin:3rem auto;border-radius:2px}

/* ── Scrollytelling ── */
.scrolly{position:relative;margin:0 auto}
.scrolly__graphic{position:sticky;top:0;width:100%;height:100vh;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:1.5rem 2rem 1rem 3vw;z-index:1}
#chart-content{width:100%;max-width:1400px;margin:0 auto}
.viz-header{width:100%;margin-bottom:.5rem;padding-left:.5rem}
.viz-title{font-family:var(--font-display);font-size:1.5rem;font-weight:300;line-height:1.18;letter-spacing:-.02em;color:var(--ink-black)}
.viz-sub{font-size:.85rem;color:var(--graphite);margin-top:.3rem;font-family:var(--font-body);font-weight:400}
.viz-source{width:100%;font-size:.62rem;color:var(--muted);opacity:.4;margin-top:.4rem;padding-left:.5rem}
.viz-wrap{width:100%}
.viz-wrap svg{display:block;width:100%;height:auto;max-height:70vh}
.viz-panel{position:fixed;top:0;left:0;width:100%;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem 2rem 1rem 2rem;z-index:1;pointer-events:none;background:var(--bg);transform:translateY(100vh);will-change:transform}
.scrolly__steps{position:relative;z-index:10;width:440px;margin-left:auto;margin-right:5vw}
.step{min-height:95vh;display:flex;align-items:center;padding:1.5rem 0}
.step:first-child{padding-top:22vh}.step:last-child{margin-bottom:12vh}
.sc{background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.4rem 1.6rem 1.5rem;border:none;max-width:440px;box-shadow:var(--shadow-card);text-align:center;opacity:.4;transition:opacity .3s,box-shadow .3s}
.step.is-active .sc{opacity:1;box-shadow:rgba(0,0,0,.12) 0 0 16px 0}
.badge{display:inline-block;font-family:var(--font-body);font-size:.55rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;padding:.2rem .7rem;border-radius:var(--radius-pill);margin-bottom:.6rem;color:#fff}
.b-pyramid{background:#c06830}.b-data{background:#3d7a94}.b-explain{background:#7a5a90}.b-future{background:#3d7a4a}.b-voice{background:#7a3d7a}
.sc h3{font-family:var(--font-body);font-size:1rem;font-weight:400;line-height:1.5;color:var(--ink-black);margin:0;letter-spacing:-.005em}

/* ── Outro ── */
.outro{max-width:720px;margin:0 auto;padding:3rem 2rem 6rem;font-family:var(--font-body);position:relative;z-index:3;background:var(--canvas)}
.outro h2{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:1rem;letter-spacing:-.03em;line-height:1.2}
.outro p{font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);margin-bottom:1.2rem;font-weight:400}
.outro .final-line{font-family:var(--font-display);font-size:clamp(1.25rem,2.5vw,1.5rem);font-weight:300;color:var(--ink-black);font-style:normal;margin-top:2.5rem;line-height:1.3;letter-spacing:-.02em}
.outro .source-block{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--fog);font-family:var(--font-body);font-size:.78rem;color:var(--graphite);line-height:1.65}

/* ── Mobile ── */
@media(max-width:900px){
  .cin-main-title{font-size:clamp(1.8rem,8vw,2.8rem)}
  .cin-svg-wrap{height:50%}
  .cin-text-layer{top:50%;height:38%}
  .cin-line{max-width:90vw}
  .editorial{padding:2.5rem 1.25rem}
  .editorial p{font-size:1.02rem;line-height:1.75}
  .editorial h2{font-size:1.4rem}
  .pullquote{font-size:1.05rem}
  .scrolly__graphic{height:100vh;padding:.5rem .75rem .4rem;justify-content:flex-start;align-items:flex-start}
  #chart-content{width:100%;max-width:100%}
  .viz-header{margin-bottom:.1rem;width:100%}
  .viz-title{font-size:.88rem;line-height:1.2}
  .viz-sub{font-size:.65rem}
  .viz-wrap svg{height:100vw;max-height:68vh}
  .scrolly__steps{width:100%;margin-left:0;margin-right:0;padding:0}
  .step{min-height:90vh;padding:0;align-items:flex-end;padding-bottom:1.5rem}
  .step:first-child{min-height:90vh;padding-top:18vh}
  .step:last-child{margin-bottom:20vh}
  .sc{max-width:calc(100% - 2rem);width:calc(100% - 2rem);margin:0 1rem;padding:.85rem 1.2rem 1rem;border-radius:14px;pointer-events:auto}
  .sc h3{font-size:.88rem}
  .badge{font-size:.48rem}
  .outro{padding:3rem 1.25rem 5rem}
}
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
