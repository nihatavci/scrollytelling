/**
 * Admin server.
 *
 * Serves:
 *   /                          → the public site (index.html, index.rendered.html, etc.)
 *   /admin                     → admin dashboard UI
 *   /admin/api/*               → admin REST API
 *
 * Auth: single shared password from env ADMIN_PASSWORD. Session = signed cookie.
 * Persistence: file-system. content/{id}.json + content/_history/{id}-{ISO}.json.
 *
 * Run:   ADMIN_PASSWORD=changeme node admin/server.js
 */

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const fsp      = require('fs/promises');
const crypto   = require('crypto');
const multer   = require('multer');
const { spawn } = require('child_process');

const ROOT          = path.resolve(__dirname, '..');
const CONTENT_DIR   = path.join(ROOT, 'content');
const HISTORY_DIR   = path.join(CONTENT_DIR, '_history');
const IMAGES_DIR    = path.join(ROOT, 'images');
const UPLOAD_DIR    = path.join(IMAGES_DIR, 'uploads');
const UI_DIR        = path.join(__dirname, 'ui');

const PORT             = Number(process.env.ADMIN_PORT || 4000);
const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD || 'admin';
const SESSION_SECRET   = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24h
const COOKIE_NAME      = 'admin_sid';
const MAX_HISTORY      = 50;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES    = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

if (process.env.ADMIN_PASSWORD === undefined) {
  console.warn('⚠  ADMIN_PASSWORD not set — using default "admin". Set ADMIN_PASSWORD env var for production.');
}
if (process.env.SESSION_SECRET === undefined) {
  console.warn('⚠  SESSION_SECRET not set — using random per-run. Sessions invalidate on restart.');
}

// ────────── Filesystem bootstrap ──────────
for (const d of [CONTENT_DIR, HISTORY_DIR, IMAGES_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ────────── Session signing ──────────
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  // timingSafeEqual requires same-length buffers
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// ────────── App ──────────
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

// Attach session if cookie present
app.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  req.session = verifySession(cookies[COOKIE_NAME]);
  next();
});

// ────────── Public static site ──────────
// Dynamic page route: /<slug>  →  serves the rendered shell for that page.
// E.g. /pressefreiheit serves index.rendered.html, render.js then loads
// content/pressefreiheit.json based on the URL path.
app.get(/^\/([A-Za-z0-9_-]+)\/?$/, (req, res, next) => {
  const slug = req.params[0];
  // If a real file matches, let express.static handle it (HTML files, etc.)
  if (slug === 'admin') return next();
  const fileWithExt = path.join(ROOT, slug);
  if (fs.existsSync(fileWithExt) && fs.statSync(fileWithExt).isFile()) return next();
  if (fs.existsSync(fileWithExt + '.html')) return next();
  // If content/<slug>.json exists, serve the rendered shell — render.js takes over.
  if (fs.existsSync(path.join(CONTENT_DIR, slug + '.json'))) {
    return res.sendFile(path.join(ROOT, 'index.rendered.html'));
  }
  next();
});

// Serve the static site from project root EXCEPT the admin paths
app.use((req, res, next) => {
  if (req.path === '/admin' || req.path.startsWith('/admin/')) return next();
  return express.static(ROOT, { extensions: ['html'], index: 'index.rendered.html' })(req, res, next);
});

// ────────── Admin UI ──────────
app.get('/admin', (_req, res) => res.sendFile(path.join(UI_DIR, 'index.html')));
app.use('/admin/static', express.static(UI_DIR));

// ────────── Auth API ──────────
app.post('/admin/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string') return res.status(400).json({ error: 'password required' });
  const a = Buffer.from(password), b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'invalid password' });
  const token = signSession({ exp: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
  res.json({ ok: true });
});

app.post('/admin/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/admin/api/session', (req, res) => {
  res.json({ loggedIn: !!req.session });
});

// Gate everything below
function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ────────── Pages API ──────────
app.get('/admin/api/pages', requireAuth, async (_req, res) => {
  try {
    const entries = await fsp.readdir(CONTENT_DIR);
    const ids = entries.filter(e => e.endsWith('.json')).map(e => e.replace(/\.json$/, ''));
    res.json({ pages: ids });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Create a brand-new page with starter content.
app.post('/admin/api/pages', requireAuth, async (req, res) => {
  try {
    const { id, title } = req.body || {};
    const safeId = sanitizeId(id);
    const target = pagePath(safeId);
    if (fs.existsSync(target)) return res.status(409).json({ error: `page "${safeId}" already exists` });
    const safeTitle = (typeof title === 'string' && title.trim()) ? title.trim() : safeId;
    const doc = {
      id: safeId,
      version: 1,
      lang: 'de',
      meta: { title: safeTitle, ogTitle: safeTitle, ogDescription: '', description: '' },
      blocks: [
        // Minimal starter: one Hero so the page is not blank, an Outro so structure is complete.
        { id: 'b_' + Math.random().toString(36).slice(2, 9), type: 'Hero',
          data: { brand: safeTitle, lines: [], titleHtml: safeTitle, subtitle: '', scrollCueText: 'Scroll' } },
        { id: 'b_' + Math.random().toString(36).slice(2, 9), type: 'Outro',
          data: { h2: '', paragraphs: [], finalLine: '', sourcesHtml: '' } },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await atomicWriteJson(target, doc);
    res.json({ ok: true, id: safeId, url: `/${safeId}` });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Delete a page entirely (snapshots a copy first).
app.delete('/admin/api/pages/:id', requireAuth, async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    if (id === 'index') return res.status(400).json({ error: 'cannot delete the index page' });
    const target = pagePath(id);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'not found' });
    await snapshot(id);
    await fsp.unlink(target);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

function pagePath(id)    { return path.join(CONTENT_DIR, `${sanitizeId(id)}.json`); }
function sanitizeId(id)  {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid page id');
  return id;
}

app.get('/admin/api/pages/:id', requireAuth, async (req, res) => {
  try {
    const json = await fsp.readFile(pagePath(req.params.id), 'utf8');
    res.type('application/json').send(json);
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
    res.status(500).json({ error: String(e) });
  }
});

// Atomic write helper: write to .tmp then rename.
async function atomicWriteJson(targetPath, data) {
  const tmp = targetPath + '.tmp.' + crypto.randomBytes(6).toString('hex');
  const json = JSON.stringify(data, null, 2);
  // Validate it parses
  JSON.parse(json);
  await fsp.writeFile(tmp, json, 'utf8');
  await fsp.rename(tmp, targetPath);
}

async function snapshot(id) {
  const src = pagePath(id);
  if (!fs.existsSync(src)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(HISTORY_DIR, `${id}-${ts}.json`);
  await fsp.copyFile(src, dest);
  // Prune to MAX_HISTORY most recent
  const entries = (await fsp.readdir(HISTORY_DIR))
    .filter(f => f.startsWith(`${id}-`) && f.endsWith('.json'))
    .sort();
  if (entries.length > MAX_HISTORY) {
    const drop = entries.slice(0, entries.length - MAX_HISTORY);
    await Promise.all(drop.map(f => fsp.unlink(path.join(HISTORY_DIR, f))));
  }
}

// Minimal structural validation: must be an object with id + blocks[]
function validatePageDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('document must be an object');
  if (typeof doc.id !== 'string') throw new Error('doc.id must be a string');
  if (!Array.isArray(doc.blocks)) throw new Error('doc.blocks must be an array');
  for (const [i, b] of doc.blocks.entries()) {
    if (!b || typeof b !== 'object') throw new Error(`blocks[${i}] must be an object`);
    if (typeof b.type !== 'string') throw new Error(`blocks[${i}].type must be a string`);
    if (typeof b.id !== 'string')   throw new Error(`blocks[${i}].id must be a string`);
  }
}

app.put('/admin/api/pages/:id', requireAuth, async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const doc = req.body;
    validatePageDoc(doc);
    if (doc.id !== id) return res.status(400).json({ error: 'doc.id mismatch' });

    // Conflict guard via version
    const target = pagePath(id);
    if (fs.existsSync(target)) {
      const current = JSON.parse(await fsp.readFile(target, 'utf8'));
      if (typeof current.version === 'number' &&
          typeof doc.version === 'number' &&
          doc.version < current.version) {
        return res.status(409).json({ error: 'version conflict', currentVersion: current.version });
      }
    }
    doc.version = (Number(doc.version) || 0) + 1;
    doc.updatedAt = new Date().toISOString();

    await snapshot(id);
    await atomicWriteJson(target, doc);
    res.json({ ok: true, version: doc.version, updatedAt: doc.updatedAt });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ────────── History ──────────
app.get('/admin/api/pages/:id/history', requireAuth, async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const entries = (await fsp.readdir(HISTORY_DIR))
      .filter(f => f.startsWith(`${id}-`) && f.endsWith('.json'))
      .sort()
      .reverse();
    const snapshots = await Promise.all(entries.map(async f => {
      const st = await fsp.stat(path.join(HISTORY_DIR, f));
      return { file: f, ts: f.replace(`${id}-`, '').replace(/\.json$/, ''), size: st.size };
    }));
    res.json({ snapshots });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/admin/api/pages/:id/restore/:file', requireAuth, async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const file = req.params.file;
    if (!/^[A-Za-z0-9_.\-:]+\.json$/.test(file)) throw new Error('invalid file');
    const src = path.join(HISTORY_DIR, file);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'snapshot not found' });
    await snapshot(id); // snapshot current before overwrite
    const doc = JSON.parse(await fsp.readFile(src, 'utf8'));
    doc.version = (Number(doc.version) || 0) + 1;
    doc.updatedAt = new Date().toISOString();
    await atomicWriteJson(pagePath(id), doc);
    res.json({ ok: true, version: doc.version });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// ────────── Image upload ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

app.post('/admin/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    if (!ALLOWED_MIMES.has(req.file.mimetype)) {
      return res.status(400).json({ error: `mime not allowed: ${req.file.mimetype}` });
    }
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 16);
    const ext = (req.file.originalname.match(/\.[A-Za-z0-9]+$/) || [''])[0].toLowerCase() || extFromMime(req.file.mimetype);
    const filename = `${hash}${ext}`;
    const dest = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(dest)) await fsp.writeFile(dest, req.file.buffer);
    const url = `images/uploads/${filename}`;
    res.json({ ok: true, url, size: req.file.size, mime: req.file.mimetype });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

function extFromMime(m) {
  return ({
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/svg+xml': '.svg',
  })[m] || '';
}

// List existing images under images/
app.get('/admin/api/images', requireAuth, async (_req, res) => {
  try {
    const out = [];
    async function walk(dir, rel = '') {
      const items = await fsp.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        const full = path.join(dir, it.name);
        const r = path.posix.join(rel, it.name);
        if (it.isDirectory()) await walk(full, r);
        else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(it.name)) {
          const st = await fsp.stat(full);
          out.push({ url: `images/${r}`, size: st.size });
        }
      }
    }
    await walk(IMAGES_DIR);
    out.sort((a, b) => a.url.localeCompare(b.url));
    res.json({ images: out });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ────────── Claude generation ──────────
// Shells out to the `claude` CLI in non-interactive mode (`claude -p`).
// Uses the user's Claude Code subscription, not the Anthropic API.
//
// POST /admin/api/generate
//   { type, prompt, images?: [path], currentData?: object, mode?: 'create'|'improve' }
// → { ok, data }  (data is the block.data object — already validated as JSON)

// Block-type schemas as plain English + concrete examples — fed to Claude
// so it knows what shape to produce.
const BLOCK_GUIDES = {
  Hero: `A "Hero" intro block at the very top of a page. data shape:
{
  "brand": string,                  // small uppercase label at the very top (e.g. publisher / series name)
  "titleHtml": string,              // main title; wrap a word in <span>…</span> to color-accent it; <br> allowed
  "subtitle": string,               // one-line subtitle under the title
  "scrollCueText": string,          // text next to the down-arrow cue (e.g. "Scroll", "Read on")
  "lines": [                        // OPTIONAL narrative lines that fade in one-by-one BEFORE the title
    { "cls": "cin-l1", "text": string }   // 0..6 items; if you set this, keep each line under 90 characters
  ]
}
"lines" is optional and most pages leave it empty (omit or use []). Only fill it when the user explicitly asks for
animated intro lines. Never invent year-prefixed lines or thematic motifs that the user did not ask for.`,

  VizPanel: `A "VizPanel" block sets the initial label of a shared interactive chart that lives in the page background.
{ "initialTitle": string, "initialSub": string }`,

  Editorial: `An "Editorial" long-form section. data shape:
{ "content": [ <inline items in order> ] }

Each item has a "kind" field. Available kinds:
- { "kind": "kicker",        "text": string }                   // small caps lead-in label
- { "kind": "h2",            "text": string }                   // section heading
- { "kind": "lead",          "text": string }                   // larger opening paragraph
- { "kind": "dropcap",       "html": string }                   // a paragraph rendered with a large drop-capital
- { "kind": "p",             "html": string }                   // paragraph; <em>…</em> allowed
- { "kind": "list",          "ordered": boolean, "items": [string, ...] }   // ordered=true for 1.2.3., false for bullets
- { "kind": "bigNumber",     "value": string, "label": string, "context": string? }   // inline big stat
- { "kind": "callout",       "tone": "info"|"note"|"warning", "title": string?, "body": string }
- { "kind": "pullquote",     "text": "\\"…\\"", "cite": "— Author, Year" }
- { "kind": "separator" }
- { "kind": "figureSingle",  "src": "images/…", "alt": string, "caption": string?, "italic": boolean? }
- { "kind": "figurePair",    "images": [{ "src":"images/…", "alt":string, "flex":1, "minWidth":140 }, {...}] }
- { "kind": "captionInline", "text": string }
- { "kind": "captionCenter", "text": string }

Typical opening pattern: kicker + h2 + lead, then any mix of paragraphs / figures / quotes / lists / stats.
Dropcap is usually used at most once per section, on the first body paragraph.`,

  Scrolly: `A "Scrolly" sticky-chart section with stepped narrative on the side. data shape:
{
  "scrollyId": "scrolly-X",          // auto-managed; the admin sets this
  "stepsId":   "steps-X",            // auto-managed; the admin sets this
  "steps": [
    { "stepIndex": number,           // auto-managed
      "badgeKind": "pyramid"|"data"|"explain"|"future"|"voice",
      // NOTE: badgeKind values are color keys only:
      //   pyramid = orange, data = blue, explain = purple, future = green, voice = pink
      // They are NOT topic keywords. Do not treat "pyramid" as a content theme.
      "badgeLabel": string,          // 1–3 words shown inside the colored chip
      "body": string }               // 1–2 sentences for the step
  ]
}
Generate 3–5 steps unless the user specifies a number.`,

  Outro: `An "Outro" closing section. data shape:
{ "h2": string, "paragraphs": [string, ...], "finalLine": string, "sourcesHtml": string }
sourcesHtml is plain text with " · " separators for citations; <br> allowed.`,

  Timeline: `A "Timeline" vertical-events block. data shape:
{
  "title": string,                    // optional heading above the timeline
  "events": [
    { "when": string,                 // a short date or period label, e.g. "1969" or "March 2020"
      "title": string,                // short event title
      "body": string }                // 1–2 sentences of context
  ]
}
Generate 4–8 events unless the user specifies a number.`,

  StatRow: `A "StatRow" block — a horizontal row of 2–4 large statistics. data shape:
{
  "title": string,                    // optional heading above the row
  "stats": [
    { "value": string,                // big visible value, e.g. "67%" or "8,527" or "3×"
      "label": string,                // 1-line label under the value
      "context": string }             // 1-line tiny grey context line (optional)
  ]
}
Generate 2–4 stats per row.`,

  Aside: `An "Aside" full-width highlighted callout block (heavier than an inline callout). data shape:
{ "tone": "info"|"note"|"warning",
  "title": string?,
  "body": string }                    // 1–3 short paragraphs separated by \\n\\n`,
};

function buildClaudePrompt({ type, userPrompt, images, currentData, mode, doc }) {
  const guide = BLOCK_GUIDES[type] || `A "${type}" block. Output JSON for its data field.`;

  // Domain-neutral style guidance. We deliberately give NO topical context from the
  // existing page so Claude does not borrow motifs (pyramid, year-prefixed lines, etc.).
  const lang = (doc && doc.lang) || 'en';
  const style = `
Output language: ${lang}.
Tone: clean, factual longform editorial prose. Match a serious newspaper voice (NYT / Reuters / The Atlantic).
Avoid filler, avoid clichés, avoid em-dashes used as ornament.
Sentence length varies but stays readable.`;

  const imgs = (images && images.length)
    ? `\nThe user uploaded these images. Use the EXACT paths as the "src" field of any image item. Do not invent new image paths:\n` +
      images.map(p => `  - ${p}`).join('\n')
    : `\n(No images uploaded. Do not invent image paths. If you would normally include an image, omit it.)`;

  const ctx = (currentData)
    ? `\nThe current data of THIS block (you are rewriting it):\n` + JSON.stringify(currentData, null, 2)
    : '';

  const action = mode === 'improve'
    ? `Rewrite the current block according to the user's request. Preserve images unless the user asks otherwise.`
    : `Generate a brand-new block from scratch matching the user's request.`;

  return `You are a content-generation assistant for a CMS that powers longform scrolling stories.

${action}

Block type: ${type}
${guide}
${style}
${imgs}
${ctx}

User request (THIS IS THE ONLY SUBJECT-MATTER SOURCE):
"""
${userPrompt}
"""

CRITICAL RULES:
1. The user's request is the SOLE source of subject matter. Write about exactly what they asked for and nothing else.
2. Do NOT invent or borrow themes, names, dates, numbers, locations, or imagery that the user did not mention or that are not necessary common knowledge for the subject they asked about.
3. Do NOT add year-prefixed historical lines, pyramid imagery, journalism-history motifs, or any "house style" topical framing — those belong only to other pages of this site, not this block.
4. If a field is optional (e.g. Hero "lines"), omit it unless the user clearly wants it.
5. Numbers and dates must be factually accurate for the user's topic, or omitted.

Respond with ONLY a single valid JSON object — no markdown fences, no commentary, no preamble. The JSON must match the "data" shape for a ${type} block exactly. Do not include outer "type" or "id" fields; only the data shape.`;
}

function runClaude(prompt, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--output-format', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const to = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('claude CLI timeout')); }, timeoutMs);
    proc.stdout.on('data', c => out += c.toString());
    proc.stderr.on('data', c => err += c.toString());
    proc.on('error', e => { clearTimeout(to); reject(e); });
    proc.on('close', code => {
      clearTimeout(to);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0,500)}`));
      resolve(out);
    });
  });
}

// Extract JSON object from Claude's response — tolerant of stray text or
// markdown fences in case Claude ignored the "only JSON" instruction.
function extractJson(text) {
  const trimmed = text.trim();
  // Try direct parse
  try { return JSON.parse(trimmed); } catch {}
  // Try to strip ```json fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch {}
  }
  // Find first { ... matching last }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  // Save raw output for debugging
  try { require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'claude-raw.txt'), trimmed); } catch {}
  throw new Error('claude did not return parseable JSON (length ' + trimmed.length + '). First 200 chars: ' + trimmed.slice(0, 200) + ' | Last 200: ' + trimmed.slice(-200));
}

app.post('/admin/api/generate', requireAuth, async (req, res) => {
  try {
    const { type, prompt, images, currentData, mode, pageId } = req.body || {};
    if (!type || !BLOCK_GUIDES[type]) return res.status(400).json({ error: `unknown block type: ${type}` });
    if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'prompt required' });
    if (prompt.length > 4000) return res.status(400).json({ error: 'prompt too long (max 4000 chars)' });

    // Load the page doc (if pageId provided) just to pass language. We deliberately
    // do NOT pass any blocks/content from the page to Claude — see anti-leak rules.
    let pageDoc = null;
    if (pageId && /^[A-Za-z0-9_-]+$/.test(pageId)) {
      try {
        const raw = await fsp.readFile(pagePath(pageId), 'utf8');
        const full = JSON.parse(raw);
        pageDoc = { lang: full.lang || 'en' };
      } catch {}
    }

    const fullPrompt = buildClaudePrompt({
      type, userPrompt: prompt.trim(), images, currentData, mode, doc: pageDoc,
    });
    const raw = await runClaude(fullPrompt);
    const data = extractJson(raw);
    res.json({ ok: true, data });
  } catch (e) {
    console.error('generate failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ────────── Error handler ──────────
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large (max 8 MB)' });
  console.error(err);
  res.status(500).json({ error: String(err.message || err) });
});

// ────────── Start ──────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Admin running at:`);
  console.log(`    Site:  http://localhost:${PORT}/index.rendered.html`);
  console.log(`    Admin: http://localhost:${PORT}/admin`);
  console.log(`\n  Password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD env)' : '"admin" (default — set ADMIN_PASSWORD env to change)'}\n`);
});
