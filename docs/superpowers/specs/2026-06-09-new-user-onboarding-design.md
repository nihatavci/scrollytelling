# New-User Onboarding for ScrollyCMS Admin

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

A user who confirms their email and logs in for the first time lands in an empty admin editor with no guidance and nothing to look at. They don't know what ScrollyCMS does, how to make a page, what the buttons mean, or how their work goes live. The advanced WebGL block options also overwhelm newcomers, and the "Create a new page" form leads with a technical "Page ID (URL slug)" field instead of the human-friendly title.

## Goal

Make the first session welcoming and self-explanatory:

1. Seed a real, editable **demo page** so new users immediately see what's possible.
2. Show a **welcome modal + short guided tour** that explains the key actions on the real UI.
3. Make **"Create a new page"** lead with the title and auto-derive the URL slug.
4. **De-emphasize advanced WebGL blocks** so the block picker isn't intimidating.

All four ship together as one improvement to the new-user experience.

## Context (existing code)

- SPA: vanilla JS, talks directly to Supabase. Files: `admin/ui/app.js`, `admin/ui/supabase-client.js`, `admin/ui/index.html`.
- Pages live in the Supabase `pages` table; content is a JSON blob `{ id, version, lang, theme, meta, blocks: [] }` where each block is `{ id, type, data }` (types include `Hero`, `Scrolly`, `ImageGrid`, `Scene3D`, etc.). Model: existing `content/about.json`.
- `SB.createPage(slug, title, theme)` inserts a page (now wrapped in `withRetry`). `loadPages(preferId)` loads the user's pages into the selector.
- Block picker categories are defined in `app.js` (~line 449); the "Immersive (WebGL)" category is `{ label: 'Immersive (WebGL)', types: ['Scene3D','WebGLGradient','WebGLFlowmap','WebGLParticles'] }`.
- The create-page modal (`app.js` ~2199–2310) currently renders the slug input first, then title; a "live slugify" listener at ~2286 already fills the slug from the title.
- Onboarding "seen" state is tracked client-side via `localStorage` key `scrollycms_onboarded_<userId>`.

## Section 1 — Demo page seeding (Approach A: real editable page)

- New `admin/ui/demo-page.js` exporting `DEMO_PAGE_CONTENT` (a `window.DEMO_PAGE_CONTENT` global, matching the no-bundler pattern): a `blocks` array with a small, representative set — a `Hero`, two `Scrolly` text blocks, and one `ImageGrid` (using placeholder/remote image URLs) — theme `claude`. Slug `welcome`, title "Welcome to ScrollyCMS".
- New `SB.seedDemoPage()` in `supabase-client.js`: inserts the demo content via the same `pages` insert path as `createPage` (wrapped in `withRetry`), using `DEMO_PAGE_CONTENT`. Returns `{ ok: true, id }`. On unique-slug collision (`23505`) it resolves gracefully (treat as already seeded).
- Trigger in `app.js` `loadPages()`: after loading, if the user has **zero** pages **and** `localStorage.getItem('scrollycms_onboarded_' + userId)` is falsy → call `SB.seedDemoPage()`, set the flag, reload pages selecting the demo page.
- **Dual guard** (zero pages AND flag unset) prevents re-seeding for a user who later deletes all pages in the same browser. Trade-off: a brand-new browser for an existing user with zero pages could re-seed once — acceptable for v1 (no DB migration needed).

## Section 2 — Welcome modal + guided tour

- New `admin/ui/onboarding.js` (`window.Onboarding` with `maybeRun(userId)` / `startTour()`), kept separate so `app.js` doesn't grow.
- `maybeRun(userId)` runs after seeding in the first-login path. If the onboarding flag was just set (first login), show the **welcome modal**: title "Welcome to ScrollyCMS", 2–3 sentences ("Build scrollytelling stories that come alive as readers scroll. We've created a demo page so you can see how it works."), buttons **Take the tour** and **Skip**.
- **Skip** closes and does nothing further. **Take the tour** runs `startTour()`.
- `startTour()` is a minimal popover walker (no third-party library): a positioned tooltip + dimmed backdrop, **Next / Skip**, anchored in order to existing elements:
  1. `#page-select` — "This is a demo page we made for you. Open it, edit it — it's yours to experiment with."
  2. `#btn-new-page` — "Create your own page. Just type a title; the URL is generated for you."
  3. `#btn-preview` — "See your page live before you publish."
  4. `#btn-publish` — "Publish pushes your page to its public URL so anyone can read it."
- Each step highlights its anchor (outline) and positions the tooltip near it; the final step's button reads **Done**. Resilient: if an anchor element is missing, that step is skipped.
- Shown once; the same `scrollycms_onboarded_<userId>` flag gates both seeding and the tour, so they fire together on first login only.

## Section 3 — Create-page modal: title-first + auto-slug

- Reorder the modal fields so **Page title** is first and **Page ID (URL slug)** is second.
- As the user types the title, auto-fill the slug using the existing slugify (`toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)`).
- Add a `slugTouched` flag: if the user manually edits the slug field, stop auto-syncing from the title (so a custom URL isn't overwritten). Typing in the title only overwrites the slug while `slugTouched` is false.
- Update the field labels/hint text to match the new order (the URL example hint stays under the slug field).
- Submit logic unchanged (`SB.createPage(slug, title, theme)`); still validates slug format and required fields.

## Section 4 — Block picker: de-emphasize advanced WebGL (4a)

- Change the "Immersive (WebGL)" category to `types: ['Scene3D']` only.
- Add a new category at the **end** of the picker list: `{ label: 'Advanced effects (experimental)', types: ['WebGLGradient','WebGLFlowmap','WebGLParticles'] }`.
- No block types are removed — they remain fully functional, just relocated to the bottom so newcomers aren't confused. Plain group (no collapse toggle).

## Files touched

| File | Change |
|---|---|
| `admin/ui/demo-page.js` (new) | `DEMO_PAGE_CONTENT` block JSON |
| `admin/ui/onboarding.js` (new) | Welcome modal + tour walker |
| `admin/ui/supabase-client.js` | `seedDemoPage()` |
| `admin/ui/app.js` | first-login trigger in `loadPages`; modal field reorder + `slugTouched`; block-picker categories |
| `admin/ui/index.html` | load `demo-page.js` and `onboarding.js` script tags |

## Out of scope

- Persistent "getting started" checklist.
- Server/DB tracking of onboarding state (localStorage only for v1).
- Re-runnable tour / "replay tour" button.
- Editing or removing the advanced WebGL block implementations.

## Testing (browser, via dev server)

- Fresh user (zero pages, no flag): demo page is seeded, selected, and visible; welcome modal appears; tour steps anchor to the right buttons; Skip and Done both end cleanly; flag is set.
- Reload after onboarding: no re-seed, no modal.
- Create-page modal: title is the first field; typing a title fills a slugified URL; manually editing the slug stops auto-sync; creation still works.
- Block picker: "Immersive (WebGL)" shows only 3D Model; the three advanced effects appear in a last "Advanced effects (experimental)" group and still insert working blocks.
