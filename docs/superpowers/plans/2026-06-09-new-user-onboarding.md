# New-User Onboarding & Toolbar Declutter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Welcome new users with a seeded demo page + guided tour, make page creation title-first with auto-slug, de-emphasize advanced WebGL blocks, and declutter the top toolbar with a click-to-edit page title.

**Architecture:** Vanilla-JS SPA (`admin/ui/`) talking directly to Supabase. New-user state is tracked in `localStorage` (`scrollycms_onboarded_<userId>`). The demo page is built from the app's own `defaultDataFor(type)` factory so blocks are always schema-valid, then inserted via a new `SB.seedDemoPage(content)`. The tour is a small dependency-free popover walker in its own file. The toolbar reuses the existing `#overflow-menu` (currently mobile-only) on desktop and replaces the rename pencil with an inline-editable title.

**Tech Stack:** Vanilla JS, `@supabase/supabase-js` v2 (global `window.SB`), CSS in `admin/ui/styles.css`, dev server `node dev-server.js` → `http://localhost:4000/admin/` (currently your port 4000 is busy; use `PORT=4400 npm run dev` or stop the other server).

**Spec deviation (noted):** The spec proposed a standalone `admin/ui/demo-page.js`. Instead the demo content is built in `app.js` via `buildDemoContent()` using the existing `defaultDataFor(type)` + `uid('b')` helpers, guaranteeing valid blocks. `SB.seedDemoPage(content)` just inserts the passed content. No `demo-page.js` file.

**Verification note:** This is browser DOM code with no DOM test harness (`npm test` covers only block-rule logic). Each task is verified in the browser via the dev server + a JS syntax check (`node --check`). Run the dev server once and reload between tasks.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `admin/ui/app.js` | SPA controller | block-picker categories; create-page modal reorder + `slugTouched`; `buildDemoContent()` + first-login seeding in `loadPages`; click-to-edit title + page switcher; desktop overflow wiring; load tour |
| `admin/ui/supabase-client.js` | Supabase API | `seedDemoPage(content)` |
| `admin/ui/onboarding.js` (new) | Welcome modal + tour walker | `window.Onboarding` |
| `admin/ui/index.html` | markup | load `onboarding.js`; top-bar markup (editable title + switcher); remove `#btn-rename-page` |
| `admin/ui/styles.css` | styles | show overflow on desktop; hide secondary buttons on desktop; title/switcher styles |

Tasks are ordered low-risk → high-risk. Each commits independently.

---

## Task 1: Block picker — de-emphasize advanced WebGL (Spec §4)

**Files:** Modify `admin/ui/app.js:447-483` (`PALETTE_CATEGORIES`)

- [ ] **Step 1: Edit the category list**

In `admin/ui/app.js`, change the "Immersive (WebGL)" category to keep only `Scene3D`, and append a new "Advanced effects" category at the END of the array (after the `Embeds` category, before the closing `];`).

Change the Immersive entry (currently `types: ['Scene3D', 'WebGLGradient', 'WebGLFlowmap', 'WebGLParticles']`) to:

```javascript
  {
    label: 'Immersive (WebGL)',
    hint: 'GPU-powered showpieces — 3D models and shader scenes',
    types: ['Scene3D'],
  },
```

Then add this object as the LAST entry in `PALETTE_CATEGORIES` (immediately before the line `];` that closes the array, after the `Embeds` block):

```javascript
  {
    label: 'Advanced effects (experimental)',
    hint: 'Shader and particle effects — powerful but fiddly. Skip these while you get started.',
    types: ['WebGLGradient', 'WebGLFlowmap', 'WebGLParticles'],
  },
```

- [ ] **Step 2: Syntax check**

Run: `node --check admin/ui/app.js`
Expected: clean exit (no output).

- [ ] **Step 3: Browser check**

Start the dev server (`PORT=4400 npm run dev`), open `http://localhost:4400/admin/`, log in, click **+ Add**.
Expected: "Immersive (WebGL)" shows only **3D Model**; a new "Advanced effects (experimental)" group appears at the bottom with Shader Gradient, Flowmap Image, Particle Dissolve; clicking any still opens its creation card.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(blocks): move advanced WebGL effects to a separate end category"
```

---

## Task 2: Create-page modal — title-first + auto-slug (Spec §3)

**Files:** Modify `admin/ui/app.js:2242-2288` (the `Create a new page` modal body)

- [ ] **Step 1: Reorder fields (title before slug) and rewrite the slugify wiring**

Replace the block from the `hint` paragraph through the `// Live slugify hint` listener (currently `admin/ui/app.js:2243-2288`) with the following. This puts the **title** field first, the **slug** field second, adds a `slugTouched` flag, and updates the hint:

```javascript
    const hint = document.createElement('p');
    hint.style.cssText = 'color:#57606a;font-size:12.5px;margin-bottom:12px;line-height:1.5;';
    hint.innerHTML = `Give your page a title — we'll turn it into a web address (URL) for you.<br>You can edit the URL below. Lowercase letters, numbers and dashes only.`;
    body.appendChild(hint);

    // 1) Page title (first field)
    const titleLabel = document.createElement('label');
    titleLabel.className = 'field-label';
    titleLabel.textContent = 'Page title';
    body.appendChild(titleLabel);
    const titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.placeholder = 'My new page';
    titleInp.style.marginBottom = '12px';
    body.appendChild(titleInp);

    // 2) Page ID / slug (second field, auto-derived from title)
    const slugLabel = document.createElement('label');
    slugLabel.className = 'field-label';
    slugLabel.textContent = 'Page URL (auto-generated)';
    body.appendChild(slugLabel);
    const slugInp = document.createElement('input');
    slugInp.type = 'text';
    slugInp.placeholder = 'my-new-page';
    slugInp.style.marginBottom = '12px';
    body.appendChild(slugInp);

    // Theme picker
    const themeLabel = document.createElement('label');
    themeLabel.className = 'field-label';
    themeLabel.textContent = 'Theme';
    themeLabel.style.marginTop = '12px';
    body.appendChild(themeLabel);
    const themeSel = document.createElement('select');
    themeSel.innerHTML = `
      <option value="dia">Dia — Warm editorial (default)</option>
      <option value="scrolli">Scrolli — Modern indigo</option>
      <option value="claude">Claude — Clean modern</option>
      <option value="miranda">Miranda — Vintage newsprint (dark)</option>
    `;
    themeSel.style.marginBottom = '12px';
    body.appendChild(themeSel);

    // Auto-slug from title until the user manually edits the slug.
    let slugTouched = false;
    const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    titleInp.addEventListener('input', () => {
      if (!slugTouched) slugInp.value = slugify(titleInp.value);
    });
    slugInp.addEventListener('input', () => { slugTouched = true; });

    // Focus the title field so typing starts there.
    setTimeout(() => titleInp.focus(), 0);
```

(The existing `err`, `actions`, `cancel`, and `create` button code that follows at ~line 2290 stays unchanged — it already reads `slugInp.value` and `titleInp.value`.)

- [ ] **Step 2: Syntax check**

Run: `node --check admin/ui/app.js`
Expected: clean exit.

- [ ] **Step 3: Browser check**

Reload, click **+ New page**.
Expected: **Page title** is the first/focused field. Typing "My Cool Story" fills the URL field with `my-cool-story` live. Editing the URL by hand (e.g. to `cool`) then typing more in the title does NOT overwrite the URL. Creating the page still works.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(pages): create-page modal leads with title, auto-derives slug"
```

---

## Task 3: `SB.seedDemoPage(content)` (Spec §1, data layer)

**Files:** Modify `admin/ui/supabase-client.js` (add method next to `createPage`)

- [ ] **Step 1: Add the method**

In `admin/ui/supabase-client.js`, add this method immediately AFTER the `createPage` method's closing `},` (the `createPage` method ends with `return { ok: true, id: data.slug, version: 1 }; });` followed by `},`):

```javascript
    async seedDemoPage(content) {
      return withRetry(async () => {
        const user = await getUser();
        const slug = content.id || 'welcome';
        const title = content.meta?.title || 'Welcome to ScrollyCMS';
        const { data, error } = await client
          .from('pages')
          .insert({
            user_id: user.id,
            slug,
            title,
            content: { ...content, id: slug },
            lang: content.lang || 'de',
            meta: content.meta || { title },
          })
          .select()
          .single();
        if (error) {
          // Already seeded (slug collision) — treat as success, not an error.
          if (error.code === '23505') return { ok: true, id: slug, already: true };
          throw new Error(error.message);
        }
        return { ok: true, id: data.slug };
      });
    },
```

- [ ] **Step 2: Syntax check**

Run: `node --check admin/ui/supabase-client.js`
Expected: clean exit.

- [ ] **Step 3: Verify method is exported**

Run: `grep -n "async seedDemoPage" admin/ui/supabase-client.js`
Expected: one match, inside the `window.SB` object literal (between `createPage` and the next method).

- [ ] **Step 4: Commit**

```bash
git add admin/ui/supabase-client.js
git commit -m "feat(pages): SB.seedDemoPage inserts prebuilt demo content"
```

---

## Task 4: Build demo content + first-login seeding trigger (Spec §1, app layer)

**Files:** Modify `admin/ui/app.js` — add `buildDemoContent()` and seeding logic in `loadPages` (currently `admin/ui/app.js:2225-2236`)

- [ ] **Step 1: Add `buildDemoContent()` just above `loadPages`**

Insert this function immediately BEFORE `async function loadPages(preferId) {` (currently line 2225). It uses the existing `uid()` and `defaultDataFor()` helpers so every block is schema-valid, overriding only the well-known Hero fields:

```javascript
// Build a small, valid demo page from default block data (+ Hero overrides).
function buildDemoContent() {
  const mk = (type, over) => ({ id: uid('b'), type, data: { ...defaultDataFor(type), ...(over || {}) } });
  return {
    id: 'welcome',
    version: 1,
    lang: 'de',
    theme: 'claude',
    meta: { title: 'Welcome to ScrollyCMS' },
    blocks: [
      mk('Hero', {
        brand: 'GETTING STARTED',
        titleHtml: 'Welcome to <span>ScrollyCMS</span>',
        subtitle: 'This is a demo page we made for you. Open the blocks on the left, edit them, add new ones with “+ Add”, then hit Publish. Delete this page whenever you like.',
        scrollCueText: 'Scroll to explore',
      }),
      mk('Editorial'),
      mk('Quote'),
      mk('ImageGrid'),
    ],
  };
}
```

- [ ] **Step 2: Add the first-login seeding path inside `loadPages`**

Replace `loadPages` (currently `admin/ui/app.js:2225-2236`) with:

```javascript
async function loadPages(preferId) {
  let { pages, pageRows } = await SB.listPages();

  // First-login onboarding: zero pages + not yet onboarded → seed a demo page.
  try {
    const uid_ = (await SB.client.auth.getUser()).data.user?.id;
    const flagKey = uid_ ? `scrollycms_onboarded_${uid_}` : null;
    if (uid_ && pages.length === 0 && !localStorage.getItem(flagKey)) {
      const seeded = await SB.seedDemoPage(buildDemoContent());
      localStorage.setItem(flagKey, '1');
      preferId = seeded.id || 'welcome';
      ({ pages, pageRows } = await SB.listPages());
      if (window.Onboarding) window.Onboarding.maybeRun(uid_);
    }
  } catch (e) {
    console.warn('[onboarding] seeding skipped:', e?.message || e);
  }

  state.pages = pages;
  state.pageRows = pageRows;
  const sel = $('#page-select');
  sel.innerHTML = pageRows.map(r => `<option value="${r.slug}">${r.title || r.slug}</option>`).join('');
  const toLoad = preferId && pages.includes(preferId) ? preferId : (state.currentPageId && pages.includes(state.currentPageId) ? state.currentPageId : pages[0]);
  if (toLoad) {
    sel.value = toLoad;
    loadPage(toLoad);
  }
  if (typeof updatePageTitleUI === 'function') updatePageTitleUI();
}
```

(Note: `updatePageTitleUI` is defined in Task 7; the `typeof` guard keeps this task working before Task 7 lands. `SB.client` is the raw Supabase client already exposed by `window.SB`.)

- [ ] **Step 3: Syntax check**

Run: `node --check admin/ui/app.js`
Expected: clean exit.

- [ ] **Step 4: Browser check (fresh user)**

In the browser, run in DevTools console to simulate a fresh user, then reload:
```js
Object.keys(localStorage).filter(k=>k.startsWith('scrollycms_onboarded_')).forEach(k=>localStorage.removeItem(k));
```
Then delete all your pages (or use a brand-new account). Reload `/admin/`.
Expected: a "Welcome to ScrollyCMS" page is created automatically, selected, and shows Hero + text + quote + image-grid blocks. Reload again → it does NOT create a second demo page (flag set + page now exists).

- [ ] **Step 5: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat(onboarding): seed a demo page on first login"
```

---

## Task 5: Welcome modal + guided tour (Spec §2)

**Files:** Create `admin/ui/onboarding.js`; Modify `admin/ui/index.html` (load it)

- [ ] **Step 1: Create `admin/ui/onboarding.js`**

```javascript
// admin/ui/onboarding.js
// Dependency-free welcome modal + guided tour for first-time users.
// Exposed as window.Onboarding; triggered from app.js loadPages() on first login.
(function () {
  'use strict';

  const STEPS = [
    { sel: '#page-select',        text: "This is a demo page we made for you. Open it, edit it, break it — it's yours to experiment with." },
    { sel: '#btn-new-page',       text: "Create your own page here. Just type a title; the URL is generated for you." },
    { sel: '#btn-preview',        text: "Preview shows your page live in a new tab before you publish." },
    { sel: '#btn-publish',        text: "Publish pushes your page to its public URL so anyone can read it." },
  ];

  function el(tag, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function showWelcome() {
    const back = el('div', 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:4000;display:flex;align-items:center;justify-content:center;');
    const card = el('div', 'background:#fff;border-radius:16px;max-width:440px;width:90%;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:inherit;');
    card.appendChild(el('div', 'font:600 20px/1.2 inherit;color:#1a1a2e;margin-bottom:10px;', 'Welcome to ScrollyCMS 👋'));
    card.appendChild(el('p', 'color:#57606a;font-size:14px;line-height:1.6;margin:0 0 20px;',
      "Build scrollytelling stories that come alive as readers scroll. We've created a demo page so you can see how it works — take a quick tour and you'll be publishing in minutes."));
    const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
    const skip = el('button', 'padding:9px 16px;border-radius:8px;border:1px solid #e1e4e8;background:#fff;cursor:pointer;font:inherit;font-size:13px;', 'Skip');
    const go = el('button', 'padding:9px 18px;border-radius:8px;border:none;background:#1a1a2e;color:#fff;cursor:pointer;font:inherit;font-size:13px;font-weight:600;', 'Take the tour');
    row.appendChild(skip); row.appendChild(go); card.appendChild(row); back.appendChild(card);
    document.body.appendChild(back);
    const close = () => back.remove();
    skip.addEventListener('click', close);
    go.addEventListener('click', () => { close(); startTour(); });
  }

  function startTour() {
    const steps = STEPS.filter(s => document.querySelector(s.sel));
    if (!steps.length) return;
    let i = 0;
    const back = el('div', 'position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:4000;');
    const tip = el('div', 'position:fixed;z-index:4001;background:#fff;border-radius:12px;max-width:300px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:inherit;');
    document.body.appendChild(back); document.body.appendChild(tip);
    const cleanup = () => { back.remove(); tip.remove(); document.querySelectorAll('.onboarding-hl').forEach(n => n.classList.remove('onboarding-hl')); };

    function render() {
      document.querySelectorAll('.onboarding-hl').forEach(n => n.classList.remove('onboarding-hl'));
      const step = steps[i];
      const anchor = document.querySelector(step.sel);
      if (!anchor) { next(); return; }
      anchor.classList.add('onboarding-hl');
      anchor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = anchor.getBoundingClientRect();
      tip.innerHTML = '';
      tip.appendChild(el('p', 'margin:0 0 14px;font-size:13.5px;line-height:1.55;color:#1a1a2e;', step.text));
      const row = el('div', 'display:flex;justify-content:space-between;align-items:center;');
      row.appendChild(el('span', 'font-size:12px;color:#8a94a6;', `${i + 1} / ${steps.length}`));
      const btns = el('div', 'display:flex;gap:6px;');
      const skip = el('button', 'padding:6px 12px;border-radius:7px;border:1px solid #e1e4e8;background:#fff;cursor:pointer;font:inherit;font-size:12px;', 'Skip');
      const nextBtn = el('button', 'padding:6px 14px;border-radius:7px;border:none;background:#1a1a2e;color:#fff;cursor:pointer;font:inherit;font-size:12px;font-weight:600;', i === steps.length - 1 ? 'Done' : 'Next');
      skip.addEventListener('click', cleanup);
      nextBtn.addEventListener('click', next);
      btns.appendChild(skip); btns.appendChild(nextBtn); row.appendChild(btns); tip.appendChild(row);
      // Position below the anchor, clamped to viewport.
      const top = Math.min(r.bottom + 10, window.innerHeight - tip.offsetHeight - 12);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - tip.offsetWidth - 12));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    }
    function next() { i++; if (i >= steps.length) { cleanup(); return; } render(); }
    render();
  }

  window.Onboarding = {
    maybeRun() { showWelcome(); },
    startTour,
  };
})();
```

- [ ] **Step 2: Add the highlight style to `admin/ui/styles.css`**

Append at the end of `admin/ui/styles.css`:

```css
/* Onboarding tour highlight */
.onboarding-hl {
  position: relative;
  z-index: 4001 !important;
  outline: 3px solid #4f6bed;
  outline-offset: 2px;
  border-radius: 8px;
}
```

- [ ] **Step 3: Load the script in `admin/ui/index.html`**

Find the line that loads `app.js` (`<script src="app.js"></script>` or `<script src="/admin/ui/app.js"></script>`). Add this line IMMEDIATELY BEFORE it:

```html
<script src="onboarding.js"></script>
```

Run to confirm the app.js script tag's exact form first: `grep -n "app.js" admin/ui/index.html`

- [ ] **Step 4: Syntax check**

Run: `node --check admin/ui/onboarding.js`
Expected: clean exit.

- [ ] **Step 5: Browser check**

Reset the flag (DevTools console: `Object.keys(localStorage).filter(k=>k.startsWith('scrollycms_onboarded_')).forEach(k=>localStorage.removeItem(k));`), delete your pages, reload.
Expected: demo page seeds, then the **Welcome modal** appears. "Take the tour" highlights `#page-select` → `#btn-new-page` → `#btn-preview` → `#btn-publish` in order with Next; "Done"/"Skip" closes cleanly. Reloading again shows neither modal nor tour.

- [ ] **Step 6: Commit**

```bash
git add admin/ui/onboarding.js admin/ui/styles.css admin/ui/index.html
git commit -m "feat(onboarding): welcome modal + dependency-free guided tour"
```

---

## Task 6: Toolbar — desktop overflow + hide secondary buttons (Spec §5, part A)

**Files:** Modify `admin/ui/styles.css`; Modify `admin/ui/app.js` (overflow toggle is already wired at ~5284 — verify it works on desktop)

The `#overflow-menu` and its `data-overflow` handlers already exist (`app.js:5284+`); the menu maps each action to clicking the real button by ID, so hidden-but-present buttons still work. We make the `⋮` button visible on desktop and hide the secondary buttons there.

- [ ] **Step 1: Show the overflow button on desktop and hide secondary actions**

Append to the end of `admin/ui/styles.css`:

```css
/* Desktop toolbar declutter: surface the ⋮ menu, hide secondary actions
   (the buttons stay in the DOM so the overflow menu can click them by id). */
.topbar-overflow-btn { display: inline-flex; align-items: center; justify-content: center; }
#btn-history,
#btn-settings,
#btn-logout,
#btn-delete-page,
#btn-rename-page { display: none; }
```

(Note: the existing `@media (max-width:600px)` rules that style `.overflow-menu`/`.topbar-overflow-btn` still apply on mobile; this just makes the button visible at all widths. The menu open/close JS at `app.js:5284` is width-independent.)

- [ ] **Step 2: Confirm the overflow menu shows the moved actions**

The menu markup (`index.html:100-112`) already contains: New page, Rename page, Delete page, View live page, Preview, Version history, Page settings, Log out. No change needed — it already maps to the right handlers.

- [ ] **Step 3: Syntax check**

Run: `node --check admin/ui/app.js`
Expected: clean exit (no JS changed, but confirm nothing broke).

- [ ] **Step 4: Browser check**

Reload at desktop width.
Expected: top bar shows `+ New page`, `⚡ Full Article`, `Preview`, `Publish`, `View ↗`, and the `⋮` button — but NOT History, ⚙ Settings, Logout, 🗑, or ✏️. Clicking `⋮` opens the menu; **Version history**, **Page settings**, **Delete page**, **Log out** each work (they trigger the hidden buttons).

- [ ] **Step 5: Commit**

```bash
git add admin/ui/styles.css
git commit -m "feat(toolbar): declutter desktop top bar, move secondary actions to ⋮ menu"
```

---

## Task 7: Toolbar — click-to-edit page title + switcher (Spec §5, part B)

**Files:** Modify `admin/ui/index.html` (top-bar markup); Modify `admin/ui/app.js` (title UI logic); Modify `admin/ui/styles.css` (styles)

Keep the native `#page-select` as the data source + switching driver, but visually hide it and drive it from a new editable title + `▾` switcher.

- [ ] **Step 1: Add the title/switcher markup; remove the rename button**

In `admin/ui/index.html`, replace the `.topbar-page` inner markup (currently lines 76-81: the `<label>`, `<select id="page-select">`, `#btn-new-page`, `#btn-rename-page`, `#btn-delete-page`, `#link-view-page`) with:

```html
      <select id="page-select" class="page-select-hidden"></select>
      <div id="page-title-wrap" class="page-title-wrap">
        <span id="page-title-text" class="page-title-text" title="Click to rename"></span>
        <button id="page-switcher-btn" class="page-switcher-btn" title="Switch page" aria-label="Switch page">▾</button>
        <div id="page-switcher-menu" class="page-switcher-menu" hidden></div>
      </div>
      <button id="btn-new-page" class="small" title="Create a new page">+ New page</button>
      <button id="btn-delete-page" class="small danger" title="Delete page">🗑</button>
      <a id="link-view-page" href="#" target="_blank" class="small view-link">View ↗</a>
```

(`#btn-rename-page` is removed — rename now happens by clicking the title. `#btn-delete-page` stays in the DOM, hidden on desktop by Task 6's CSS, used by the overflow menu.)

- [ ] **Step 2: Add title/switcher styles**

Append to `admin/ui/styles.css`:

```css
.page-select-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.page-title-wrap { display: inline-flex; align-items: center; gap: 2px; position: relative; }
.page-title-text {
  font-size: 14px; font-weight: 600; color: var(--ink, #1a1a2e);
  padding: 4px 8px; border-radius: 7px; cursor: text; max-width: 320px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.page-title-text:hover { background: var(--fog, #f1f2f4); }
.page-title-input {
  font-size: 14px; font-weight: 600; padding: 4px 8px; border-radius: 7px;
  border: 1px solid #4f6bed; outline: none; font-family: inherit; min-width: 200px;
}
.page-switcher-btn {
  border: none; background: none; cursor: pointer; font-size: 13px; color: #57606a;
  padding: 4px 6px; border-radius: 6px;
}
.page-switcher-btn:hover { background: var(--fog, #f1f2f4); }
.page-switcher-menu {
  position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 3000;
  background: #fff; border: 1px solid #e1e4e8; border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,.16); padding: 6px; min-width: 220px; max-height: 60vh; overflow: auto;
}
.page-switcher-menu button {
  display: block; width: 100%; text-align: left; border: none; background: none;
  padding: 8px 10px; border-radius: 7px; cursor: pointer; font: inherit; font-size: 13px; color: #1a1a2e;
}
.page-switcher-menu button:hover { background: var(--fog, #f1f2f4); }
.page-switcher-menu button.active { background: #eef1fd; font-weight: 600; }
```

- [ ] **Step 3: Add the title UI logic in `admin/ui/app.js`**

Replace the line `$('#page-select').addEventListener('change', (e) => loadPage(e.target.value));` (currently `admin/ui/app.js:2237`) with:

```javascript
$('#page-select').addEventListener('change', (e) => loadPage(e.target.value));

// ── Click-to-edit page title + custom page switcher ─────────────────
function updatePageTitleUI() {
  const txt = document.getElementById('page-title-text');
  if (!txt) return;
  const sel = document.getElementById('page-select');
  const current = (state.pageRows || []).find(r => r.slug === (sel && sel.value));
  txt.textContent = current ? (current.title || current.slug) : 'No page selected';
  txt.classList.toggle('page-title-text--empty', !current);
}

function beginRenameTitle() {
  const txt = document.getElementById('page-title-text');
  const sel = document.getElementById('page-select');
  if (!txt || !sel || !sel.value) return;
  const slug = sel.value;
  const currentTitle = txt.textContent;
  const input = document.createElement('input');
  input.className = 'page-title-input';
  input.value = currentTitle;
  txt.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return; done = true;
    const newTitle = input.value.trim();
    const restore = document.createElement('span');
    restore.id = 'page-title-text';
    restore.className = 'page-title-text';
    restore.title = 'Click to rename';
    restore.addEventListener('click', beginRenameTitle);
    input.replaceWith(restore);
    if (commit && newTitle && newTitle !== currentTitle) {
      try {
        await SB.renamePage(slug, newTitle);
        const row = (state.pageRows || []).find(r => r.slug === slug);
        if (row) row.title = newTitle;
        const opt = [...sel.options].find(o => o.value === slug);
        if (opt) opt.textContent = newTitle;
        toast('Page renamed', 'success');
      } catch (e) { toast(e.message || 'Rename failed', 'error'); }
    }
    updatePageTitleUI();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function togglePageSwitcher(forceClose) {
  const menu = document.getElementById('page-switcher-menu');
  const sel = document.getElementById('page-select');
  if (!menu || !sel) return;
  if (forceClose || !menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = '';
  (state.pageRows || []).forEach(r => {
    const b = document.createElement('button');
    b.textContent = r.title || r.slug;
    if (r.slug === sel.value) b.classList.add('active');
    b.addEventListener('click', () => {
      menu.hidden = true;
      sel.value = r.slug;
      loadPage(r.slug);
      updatePageTitleUI();
    });
    menu.appendChild(b);
  });
  menu.hidden = false;
}

document.getElementById('page-title-text').addEventListener('click', beginRenameTitle);
document.getElementById('page-switcher-btn').addEventListener('click', (e) => { e.stopPropagation(); togglePageSwitcher(); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('#page-title-wrap')) togglePageSwitcher(true);
});
```

- [ ] **Step 4: Ensure the title updates when a page loads**

`loadPages` already calls `updatePageTitleUI()` at its end (added in Task 4, Step 2). Also update it after `loadPage` selects. Confirm `loadPage(id)` (currently `admin/ui/app.js:2433`) sets `state.currentPageId`; add a call at the end of `loadPage` — find the end of `async function loadPage(id) { ... }` and add `if (typeof updatePageTitleUI === 'function') updatePageTitleUI();` as its last statement before the closing brace.

Run `grep -n "async function loadPage(id)" admin/ui/app.js` and read the function to place the call correctly.

- [ ] **Step 5: Syntax check**

Run: `node --check admin/ui/app.js`
Expected: clean exit.

- [ ] **Step 6: Browser check**

Reload.
Expected: the page name shows as text with a `▾` beside it (no native dropdown, no ✏️). Clicking the name turns it into an input; Enter renames (persists after reload); Esc cancels. Clicking `▾` opens a list of your pages; selecting one switches pages and updates the title. Clicking elsewhere closes the switcher.

- [ ] **Step 7: Commit**

```bash
git add admin/ui/index.html admin/ui/app.js admin/ui/styles.css
git commit -m "feat(toolbar): click-to-edit page title + custom page switcher, drop rename button"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Fresh-user flow**

Reset onboarding flag + delete pages (or new account). Reload `/admin/`.
Expected: demo page seeded → Welcome modal → tour highlights the right elements → demo page visible and editable.

- [ ] **Step 2: Create-page flow**

Click `+ New page`: title is first/focused, slug auto-fills, manual slug edit sticks, creation works.

- [ ] **Step 3: Toolbar flow**

Desktop bar is decluttered (primary actions + `⋮` only). Click the page title to rename (persists). `▾` switches pages. `⋮` menu runs History / Settings / Delete / Logout.

- [ ] **Step 4: Block picker**

`+ Add` → Immersive shows only 3D Model; advanced effects are in the last group and still work.

- [ ] **Step 5: Regression**

Reload as an existing user with pages → no re-seed, no modal; existing pages load; Preview/Publish unaffected.

- [ ] **Step 6: Capture proof**

Screenshot the decluttered bar and the demo page for the record. No commit (verification only).

---

## Self-Review Notes

- **Spec coverage:** §1 demo page → Tasks 3+4; §2 welcome+tour → Task 5; §3 create-page → Task 2; §4 block picker → Task 1; §5 toolbar declutter → Task 6, click-to-edit title → Task 7. All sections mapped.
- **Type/name consistency:** `buildDemoContent()` (Task 4) → consumed by `SB.seedDemoPage(content)` (Task 3). `updatePageTitleUI`/`beginRenameTitle`/`togglePageSwitcher` defined in Task 7, called (guarded) in Task 4's `loadPages`. Element IDs `page-title-text`, `page-switcher-btn`, `page-switcher-menu`, `page-select` defined in Task 7 markup and referenced by the same names in Task 7 JS and CSS. `window.Onboarding.maybeRun` defined in Task 5, called in Task 4. `scrollycms_onboarded_<userId>` flag key identical across seeding and tour.
- **No placeholders:** every code step shows complete code; verification steps state expected browser outcomes. Two steps ask the implementer to `grep`/read before editing (app.js script-tag form; `loadPage` end) because those exact anchors weren't quoted — the edit content is fully specified, only the insertion point is confirmed at apply time.
