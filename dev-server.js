// dev-server.js — Local development server.
// Serves static files only. The admin SPA talks directly to Supabase.
// NOT deployed to production — use `wrangler pages dev` for prod-like local dev.
//
// Usage: node dev-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4000);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.ico':  'image/x-icon',
};

const https = require('https');

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  // Proxy /p/* to deployed CF Pages function (public page renderer)
  if (urlPath.startsWith('/p/')) {
    const cfUrl = 'https://scrollycms.pages.dev' + urlPath;
    const parsed = new URL(cfUrl);
    const options = { hostname: parsed.hostname, path: parsed.pathname, method: 'GET' };
    const proxy = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', (e) => {
      res.writeHead(502);
      res.end('Proxy error: ' + e.message);
    });
    proxy.end();
    return;
  }

  // Proxy /api/* POST requests to deployed CF Pages functions
  if (urlPath.startsWith('/api/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const cfUrl = 'https://scrollycms.pages.dev' + urlPath;
      const parsed = new URL(cfUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'] || '',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const proxy = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      });
      proxy.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error: ' + e.message }));
      });
      proxy.write(body);
      proxy.end();
    });
    return;
  }

  // CORS preflight for /api/*
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Route /admin/ → admin/ui/index.html
  if (urlPath === '/admin' || urlPath === '/admin/') {
    urlPath = '/admin/ui/index.html';
  }
  // Route /admin/static/* → admin/ui/*
  if (urlPath.startsWith('/admin/static/')) {
    urlPath = '/admin/ui/' + urlPath.slice('/admin/static/'.length);
  }

  // Default to index.html
  if (urlPath === '/') urlPath = '/index.rendered.html';

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try .html extension
      const withHtml = filePath + '.html';
      if (fs.existsSync(withHtml)) {
        return serveFile(withHtml, res);
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

server.listen(PORT, () => {
  console.log(`\n  ScrollyCMS dev server\n  http://localhost:${PORT}/admin/\n`);
});
