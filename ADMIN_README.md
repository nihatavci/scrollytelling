# Admin Dashboard — Quick Start

## Run

```bash
npm install                                 # one-time
ADMIN_PASSWORD=yourpass npm start           # start the server
```

Then open:

- **Admin panel**: http://localhost:4000/admin
- **Public site**: http://localhost:4000/index.rendered.html
- **Original site**: http://localhost:4000/index.html

If you don't set `ADMIN_PASSWORD`, the default password is **`admin`** (server warns you on startup).

## What you can do in the admin

1. **Login** with your password.
2. **Pick a page** from the dropdown (currently `index`).
3. **Browse blocks** on the left — every section of the page is a block (Hero, Editorial, Scrolly, Outro, etc.).
4. **Click a block** to edit it. The form on the right adapts to the block type.
5. **For Editorial blocks**: edit each content item (paragraph, image, pull quote, etc.) inside it. Add / reorder / delete items.
6. **Upload images**: click "Upload…" on any image field to upload a new file. It's saved under `images/uploads/`.
7. **Browse images**: click "Browse…" to pick from existing images.
8. **Save & Publish**: writes to `content/index.json` atomically and snapshots the previous version.
9. **History**: see and restore previous versions.
10. **Live preview**: the right pane shows the rendered page, auto-refreshing on edit.

## File layout

```
content/
  index.json              ← the editable page document
  _history/               ← versioned snapshots (last 50)
images/
  uploads/                ← user-uploaded images
js/
  render.js               ← turns JSON into DOM
  page-init.js            ← cinematic intro + D3 viz (unchanged from original)
admin/
  server.js               ← Express server (auth, API, static serving)
  ui/
    index.html, app.js, styles.css
index.html                ← original page (untouched)
index.rendered.html       ← page rendered from JSON (what admin edits)
```

## Security notes

- Server binds to **127.0.0.1 only** — not exposed to the network.
- Password gates every `/admin/api/*` route.
- Session cookie is `HttpOnly`, `SameSite=Lax`, signed with `SESSION_SECRET`.
- Uploads: max 8 MB, only `png/jpeg/webp/gif/svg`. Filenames are content-hash so duplicates dedupe.
- Atomic writes (tmp + rename) — kill the server mid-save and the file is either fully old or fully new.

## Customizing

- Change port: `ADMIN_PORT=4001 npm start`
- Change password: `ADMIN_PASSWORD=newpass npm start`
- For persistent sessions across server restarts, set a stable `SESSION_SECRET`:
  ```bash
  SESSION_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD=yourpass npm start
  ```
