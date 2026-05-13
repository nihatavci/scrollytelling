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

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

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
