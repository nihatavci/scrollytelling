# Dia Browser Design-System Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the public scrollytelling site and the admin panel from the current warm-editorial palette (orange #c06830 / Source Serif 4) to the Dia Browser design system: airy monochrome canvas (#f8f8f8 + #000000), single-font typography (DM Sans at weights 300/400/500 as the closest free substitute for ABC Oracle), 30px rounded "frosted-glass" cards with `backdrop-filter: blur(24px)`, and the signature horizontal spectrum gradient (pink → red → amber → lavender → blue) as the only chromatic moment.

**Architecture:** Three coordinated CSS migrations on the same token names. (1) Public site shell (`index.rendered.html` inline `<style>`) gets new tokens + new typography + new surfaces. (2) Component CSS (`COMPONENT_CSS` constant in `js/render.js`, injected at first render) rewrites all new-component styles in the Dia idiom. (3) Admin panel (`admin/ui/styles.css`) gets the same treatment. The CSS variable names stay (`--bg`, `--text`, `--accent`, `--muted`, `--card`) so all dependent rules pick up the new palette automatically. Content-meaningful colors (D3 chart palette, scrolly badge colors that categorize narrative kind) stay as-is — they encode story, not chrome.

**Tech Stack:** Vanilla CSS (no build, no framework). Google Fonts for DM Sans 300/400/500. No new dependencies.

**Reference:** [Dia Browser style guide](https://styles.refero.design/style/b458ca1a-70f0-4f85-b745-f879a4d08457). Authoritative source: `/Users/nihat/Downloads/DESIGN.md`.

---

## Design decisions locked in

These are the calls I'm making upfront. They're documented here so any task that touches them can stay consistent. If any feel wrong, override before starting Task 1.

1. **Font.** ABC Oracle is proprietary and not freely available. Substitute **DM Sans** (already loaded by the site) at weights 300/400/500. Drop **Source Serif 4** entirely — the Dia ethos is "never introduce a second typeface."
2. **Color tokens.** Keep existing CSS variable names (`--bg`, `--text`, `--accent`, `--muted`, `--card`) but remap them to Dia values. This avoids a sweeping find-and-replace and lets all consuming rules auto-update.
3. **Accent.** The old `--accent: #c06830` (orange) becomes `--accent: #000000` (ink-black). Where chromatic emphasis is genuinely needed (e.g. the BigNumber stat or a single accent strip), use `--spectrum-gradient` instead — never solid color.
4. **Cinematic intro animation (`js/page-init.js`).** Structure stays unchanged. Its particle colors are sourced from a `C = { ... }` object near line 750; we'll update those hex codes to Dia tokens so the intro adopts the new palette without rewriting the animation logic.
5. **D3 visualization chart colors and scrolly badge colors stay as-is.** They encode meaning (which step belongs to which narrative chapter, which layer of the pyramid is which). Theme change should not muddle data semantics.
6. **Border radius.** Adopt Dia's 30px for cards and pill (9999px) for ghost buttons. Images stay at 10px (Dia spec). Editorial figures keep 8-10px corners.
7. **Card surface.** Replace flat `var(--bg)` Editorial sections with frosted: `rgba(255,255,255,0.9)` + `backdrop-filter: blur(24px)` + the single 8px-blur shadow.
8. **Spectrum gradient placement.** Used twice per page max: (a) ambient glow behind the Hero (replacing the orange-accent feel of the cinematic intro) and (b) optional decorative strip near the page's bottom — but neither is required. The default state is monochrome.

---

## File Structure

| Path | Role | Change |
|---|---|---|
| `index.rendered.html` | Public-site shell with inline `<style>` block | Migrate `:root` tokens, typography, surfaces. Re-link Google Fonts. |
| `js/render.js` | JSON → DOM renderer + `COMPONENT_CSS` injection | Rewrite `COMPONENT_CSS` to use new tokens + frosted-glass surfaces. |
| `js/page-init.js` | Cinematic intro / D3 viz logic | Update `C = {...}` palette object (chart colors stay; brand colors switch). |
| `admin/ui/styles.css` | Admin dashboard CSS | Migrate to Dia tokens + DM Sans typography. |
| (no new files) | | Everything stays in the existing structure. |

---

## Task 1: Theme tokens + font loading

**Files:**
- Modify: `index.rendered.html` (the `:root { ... }` declaration in the inline `<style>` block + the `@import url(...)` Google Fonts line at the top of `<style>`)

This task swaps in the Dia palette and types but doesn't touch any rules that use them yet. After this task the site visually looks broken (orange disappears, fonts change) — that's expected. The next tasks rewire the rules.

- [ ] **Step 1: Replace the Google Fonts `@import`**

In `index.rendered.html`, find the `@import url('https://fonts.googleapis.com/css2?...')` line at the top of the `<style>` block. Replace it with:

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
```

Note: weight 300 (light), 400 (regular), 500 (medium), plus italic at 300/400. No serif font loaded.

- [ ] **Step 2: Replace the `:root` declaration**

Find the existing `:root{--bg:#faf7f2;--text:#2a2320;--muted:#8c8078;--accent:#c06830;--card:rgba(255,255,255,.55)}` line. Replace with:

```css
:root{
  /* Dia palette */
  --canvas:#f8f8f8; --snow:#fff; --fog:#efefef; --pebble:#d9d9d9;
  --ash:#7c7c7c; --slate:#959595; --steel:#aeaeae; --graphite:#636363; --ink-black:#000;
  --rose-quartz:#c679c4; --marigold:#ffb005; --signal-blue:#0358f7; --hot-pink:#fd02f5; --spectrum-red:#fa3d1d;
  --spectrum-gradient:linear-gradient(90deg,#c679c4 0%,#fa3d1d 25%,#ffb005 50%,#e1e1fe 75%,#0358f7 100%);

  /* Legacy aliases — every existing rule already references these names */
  --bg:var(--canvas); --text:var(--ink-black); --muted:var(--graphite); --accent:var(--ink-black);
  --card:rgba(255,255,255,.9);

  /* Type */
  --font-display:'DM Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --font-body:'DM Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;

  /* Radii */
  --radius-card:30px; --radius-image:10px; --radius-button:30px; --radius-pill:9999px;

  /* Elevation */
  --shadow-card:rgba(0,0,0,0.08) 0 0 8px 0;
}
```

- [ ] **Step 3: Sanity check**

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "GET / → %{http_code}\n" http://localhost:4000/
curl -s http://localhost:4000/ | grep -c "DM+Sans:ital,wght@0,300"   # expect 1
curl -s http://localhost:4000/ | grep -c "ink-black"                 # expect ≥ 1
```

Open http://localhost:4000/ in a browser. Expected outcome: page loads (no JS errors), background turns near-white, text turns gray/black, accent color turns black (orange highlights are gone). The cinematic intro still animates but with neutral colors. The fonts may briefly look serif until DM Sans 300 loads — that's the Google Fonts swap.

- [ ] **Step 4: Commit**

```bash
git add index.rendered.html
git commit -m "feat(design): introduce Dia color tokens + DM Sans font

Replace warm editorial palette with Dia canvas/ink-black tokens.
Drop Source Serif 4; standardize on DM Sans at weights 300/400/500
following Dia's single-typeface ethos.

Legacy variable names (--bg, --text, --accent, --muted, --card) are
preserved as aliases so existing rules pick up the new palette without
a sweeping rewrite. Subsequent tasks tune typography and surfaces
per-component."
```

---

## Task 2: Public site typography migration

**Files:**
- Modify: `index.rendered.html` (rules inside the `<style>` block that mention `'Source Serif 4'` or set font weight ≥600)

Now that the new fonts are loaded, switch every rule that referenced Source Serif 4 to DM Sans, and pull heading weights down to 300 per Dia's airy-display ethos.

- [ ] **Step 1: Replace serif references in editorial rules**

Find every `font-family:'Source Serif 4',serif` (or just `'Source Serif 4'`) in the inline `<style>` block and replace with `var(--font-body)`. There are roughly 8-10 such rules covering:
- `body` (root)
- `.editorial p`, `.editorial h2`
- `.pullquote`
- `.outro h2`, `.outro p`, `.outro .final-line`
- `.cin-main-title`, `.cin-line`
- `.viz-title`
- `#chart-content` heading rules

After this step, the file should contain ZERO occurrences of `Source Serif 4`. Verify:

```bash
grep -c "Source Serif 4" index.rendered.html
# expect 0
```

- [ ] **Step 2: Bring heading weights down to 300**

In `index.rendered.html`, find rules with `font-weight:700` or `font-weight:600` that target headings or display text. Change to `font-weight:300` for all DISPLAY heading rules (`.cin-main-title`, `.editorial h2`, `.outro h2`, `.viz-title`). Leave body weight as `400`. Leave nav/badge/kicker labels at `500` (Dia uses 500 for UI labels).

Specific edits (replace each block on its existing lines):

```css
.cin-main-title{font-family:var(--font-display);font-size:clamp(2.6rem,7vw,4.5rem);font-weight:300;color:var(--text);line-height:1.11;letter-spacing:-.04em;margin-bottom:.8rem}
.cin-sub-title{font-family:var(--font-body);font-size:clamp(.9rem,1.8vw,1.15rem);color:var(--graphite);font-weight:400;letter-spacing:-.01em}
```

```css
.editorial h2{font-family:var(--font-display);font-size:clamp(2rem,4vw,3.125rem);font-weight:300;margin-bottom:1.2rem;letter-spacing:-.04em;line-height:1.18;color:var(--ink-black)}
.editorial p{font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);margin-bottom:1.25rem;font-weight:400}
.editorial .lead{font-size:1.25rem;font-weight:300;line-height:1.4;letter-spacing:-.01em;color:var(--ink-black)}
.editorial .kicker{font-family:var(--font-body);font-size:.75rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--graphite);margin-bottom:.8rem}
```

```css
.pullquote{border-left:none;padding:1.25rem 0 1.25rem 1.5rem;margin:2.5rem 0;font-family:var(--font-display);font-size:clamp(1.25rem,2.5vw,1.625rem);font-weight:300;font-style:normal;color:var(--ink-black);line-height:1.3;letter-spacing:-.02em;position:relative}
.pullquote::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--spectrum-gradient);border-radius:2px}
.pullquote cite{display:block;font-size:.85rem;font-weight:500;font-style:normal;color:var(--graphite);margin-top:.75rem;font-family:var(--font-body);letter-spacing:.02em}
```

```css
.outro h2{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:1rem;letter-spacing:-.03em;line-height:1.2}
.outro p{font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);margin-bottom:1.2rem;font-weight:400}
.outro .final-line{font-family:var(--font-display);font-size:clamp(1.25rem,2.5vw,1.5rem);font-weight:300;color:var(--ink-black);font-style:normal;margin-top:2.5rem;line-height:1.3;letter-spacing:-.02em}
.outro .source-block{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--fog);font-family:var(--font-body);font-size:.78rem;color:var(--graphite);line-height:1.65}
```

```css
.viz-title{font-family:var(--font-display);font-size:1.5rem;font-weight:300;line-height:1.18;letter-spacing:-.02em;color:var(--ink-black)}
.viz-sub{font-size:.85rem;color:var(--graphite);margin-top:.3rem;font-family:var(--font-body);font-weight:400}
```

- [ ] **Step 3: Update cinematic intro text classes**

Find the rules `.cin-line{...}`, `.cin-l1`, `.cin-l2`, etc. Replace with:

```css
.cin-line{font-family:var(--font-display);color:var(--ink-black);opacity:0;position:absolute;text-align:center;max-width:72vw;line-height:1.4;letter-spacing:-.02em}
.cin-l1,.cin-l2{font-size:clamp(1.3rem,2.6vw,1.75rem);font-weight:300;color:var(--graphite)}
.cin-l3{font-size:clamp(1.35rem,2.8vw,1.9rem);font-weight:400;color:var(--ink-black)}
.cin-l4{font-size:clamp(1.2rem,2.4vw,1.6rem);font-weight:300;color:var(--graphite)}
.cin-l5{font-size:clamp(1.3rem,2.7vw,1.85rem);font-weight:400;color:var(--ink-black)}
.cin-l6{font-size:clamp(1.45rem,3.2vw,2.2rem);font-weight:500;color:var(--ink-black);letter-spacing:-.03em}
```

- [ ] **Step 4: Verify**

```bash
grep -c "Source Serif" index.rendered.html      # 0
grep -c "font-weight:700" index.rendered.html   # 0 (or only inside D3 chart code if any; visually check matches are not in display headings)
grep -c "var(--font-display)" index.rendered.html  # ≥ 6
```

Reload `http://localhost:4000/`. Expected: site reads with light, airy display headings (weight 300) in DM Sans. The cinematic intro lines fade in with thin-weight typography. Pull quotes show a thin spectrum-gradient bar on the left instead of a thick orange line.

- [ ] **Step 5: Commit**

```bash
git add index.rendered.html
git commit -m "feat(design): airy DM Sans typography per Dia ethos

Drop weight 600/700 in favor of weight 300 for all display
headings (Hero title, editorial h2, outro h2, viz-title, cinematic
intro lines). Body stays at 400, UI labels at 500.

Pullquote left border becomes a 3px spectrum-gradient strip
(the one chromatic moment in the editorial flow). Letter-spacing
tightens to -0.02em / -0.04em on display sizes to compress the
airy letterforms at scale per Dia."
```

---

## Task 3: Public site surfaces (cards, scrolly steps, header)

**Files:**
- Modify: `index.rendered.html` (rules `.editorial`, `.outro`, `.viz-panel`, `.scrolly__steps`, `.sc`, `.lang-sw`, `.cin-scroll-cue .arr`)

This task updates surfaces — backgrounds, borders, radii, shadows. The Editorial sections stay flat (long-form reading wants a calm page) but the scrolly step cards become frosted glass, and the language switcher / scroll cue match Dia's neutral aesthetic.

- [ ] **Step 1: Editorial / outro background — keep flat but recolor**

Find the `.editorial { ... }` rule. Replace with:

```css
.editorial{max-width:720px;margin:0 auto;padding:2.5rem 2rem 3rem;position:relative;z-index:3;background:var(--canvas)}
.editorial figure{margin:2.5rem 0;width:100%}
.editorial figure img{width:100%;height:auto;border-radius:var(--radius-image);display:block}
.editorial figcaption{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.6rem;font-style:normal;font-weight:400}
.editorial .separator{width:60px;height:2px;background:var(--spectrum-gradient);margin:3rem auto;border-radius:2px}
```

Find `.outro { ... }`. Replace with:

```css
.outro{max-width:720px;margin:0 auto;padding:3rem 2rem 6rem;font-family:var(--font-body);position:relative;z-index:3;background:var(--canvas)}
```

- [ ] **Step 2: Language switcher → ghost pill**

Find `.lang-sw{...}`. Replace with:

```css
.lang-sw{position:fixed;top:1rem;right:1.5rem;z-index:999;display:flex;gap:0;border-radius:var(--radius-pill);overflow:hidden;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);font-family:var(--font-body);font-size:.72rem;font-weight:500;letter-spacing:.04em;box-shadow:var(--shadow-card)}
.lang-sw button{padding:.45rem 1rem;border:none;cursor:pointer;background:transparent;color:var(--graphite);transition:all .2s ease}
.lang-sw button.active{background:var(--ink-black);color:#fff;border-radius:var(--radius-pill)}
.lang-sw button:hover{color:var(--ink-black)}
```

- [ ] **Step 3: Scroll cue arrow + progress bar**

Find `.cin-scroll-cue` block. Replace with:

```css
.cin-scroll-cue{position:absolute;bottom:2rem;left:0;right:0;text-align:center;z-index:6;color:var(--graphite);font-family:var(--font-body);font-size:.78rem;font-weight:400;display:flex;flex-direction:column;align-items:center;gap:.5rem;opacity:0;letter-spacing:.02em}
.cin-scroll-cue .arr{width:14px;height:14px;border-right:2px solid var(--ink-black);border-bottom:2px solid var(--ink-black);transform:rotate(45deg);animation:bob 2s ease-in-out infinite}
```

Find `.progress{...}`. Replace with:

```css
.progress{position:fixed;top:0;left:0;height:2px;background:var(--spectrum-gradient);z-index:999;transition:width .2s;border-radius:0 2px 2px 0;width:0}
```

- [ ] **Step 4: Scrolly step cards → frosted glass with 30px radius**

Find the `.sc { ... }` rule and its hover/badge children. Replace the relevant block with:

```css
.scrolly__steps{position:relative;z-index:10;width:440px;margin-left:auto;margin-right:5vw}
.step{min-height:95vh;display:flex;align-items:center;padding:1.5rem 0}
.step:first-child{padding-top:22vh}.step:last-child{margin-bottom:12vh}
.sc{background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.4rem 1.6rem 1.5rem;border:none;max-width:440px;box-shadow:var(--shadow-card);text-align:center;opacity:.4;transition:opacity .3s,box-shadow .3s}
.step.is-active .sc{opacity:1;box-shadow:rgba(0,0,0,.12) 0 0 16px 0}
.badge{display:inline-block;font-family:var(--font-body);font-size:.55rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;padding:.2rem .7rem;border-radius:var(--radius-pill);margin-bottom:.6rem;color:#fff}
/* Badge colors remain unchanged — they encode narrative chapter, not theme */
.b-pyramid{background:#c06830}
.b-data{background:#3d7a94}
.b-explain{background:#7a5a90}
.b-future{background:#3d7a4a}
.b-voice{background:#7a3d7a}
.sc h3{font-family:var(--font-body);font-size:1rem;font-weight:400;line-height:1.5;color:var(--ink-black);margin:0;letter-spacing:-.005em}
```

- [ ] **Step 5: Verify**

```bash
grep -c "rgba(255,255,255,.9)" index.rendered.html   # ≥ 2 (lang-sw + sc)
grep -c "backdrop-filter:blur(24px)" index.rendered.html  # ≥ 2
grep -c "spectrum-gradient" index.rendered.html      # ≥ 2 (separator + progress)
```

Reload `http://localhost:4000/`. Expected: language switcher is a frosted pill in the top-right; the orange progress bar at the very top is now a thin spectrum-gradient strip; scrolly step cards appear as frosted-glass white rectangles with 30px rounded corners and the same 8px-blur shadow; orange "separator" lines between editorial sections are now thin spectrum-gradient strips; cinematic intro scroll cue arrow is black.

- [ ] **Step 6: Commit**

```bash
git add index.rendered.html
git commit -m "feat(design): frosted-glass scrolly cards + Dia surfaces

Scrolly step cards become rgba(255,255,255,.9) frosted glass with
30px radius and the 8px-blur Dia shadow. Language switcher and
scroll cue follow the same neutral language. Progress bar and
editorial separator strips switch from solid orange to the
spectrum gradient — the one chromatic moment per page.

Scrolly badge colors stay unchanged: they encode narrative chapter
(pyramid/data/explain/future/voice), not theme."
```

---

## Task 4: Component CSS (`js/render.js` COMPONENT_CSS)

**Files:**
- Modify: `js/render.js` (the `COMPONENT_CSS` template literal)

Rewrites the styles for DropCap, Callout, BigNumber, List, Timeline, StatRow, Aside to use Dia tokens and frosted-glass surfaces where they make sense.

- [ ] **Step 1: Replace the entire `COMPONENT_CSS` constant**

In `js/render.js`, find `const COMPONENT_CSS = \`...\``. Replace its template-literal body with:

```js
const COMPONENT_CSS = `
/* ── DropCap ── */
.editorial p.has-dropcap::first-letter{float:left;font-family:var(--font-display);font-size:4.5rem;line-height:.95;padding:.3rem .6rem .1rem 0;color:var(--ink-black);font-weight:300;letter-spacing:-.04em}

/* ── Inline Callout (inside Editorial) ── */
.callout{border-left:3px solid var(--ink-black);background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:0 16px 16px 0;padding:1rem 1.25rem;margin:1.8rem 0;font-family:var(--font-body);color:var(--ink-black);font-size:.95rem;line-height:1.55;box-shadow:var(--shadow-card)}
.callout-note{border-left-color:var(--signal-blue)}
.callout-warning{border-left-color:var(--spectrum-red)}
.callout-title{font-weight:500;margin-bottom:.3rem;font-size:.95rem;color:var(--ink-black);letter-spacing:-.005em}

/* ── BigNumber (inline stat inside Editorial) ── */
.bignumber{display:block;text-align:center;margin:2.5rem 0;font-family:var(--font-display)}
.bignumber-value{font-family:var(--font-display);font-size:clamp(2.8rem,6vw,4.5rem);font-weight:300;color:var(--ink-black);line-height:1.05;letter-spacing:-.04em;background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.bignumber-label{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);margin-top:.6rem;font-weight:500;letter-spacing:.02em}
.bignumber-context{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.3rem;font-style:normal;font-weight:400}

/* ── List (ordered / unordered, inside Editorial) ── */
.editorial ul.ed-list,.editorial ol.ed-list{margin:1.4rem 0 2rem;padding-left:1.4rem;font-family:var(--font-body);font-size:1.0625rem;line-height:1.55;color:var(--ink-black);font-weight:400}
.editorial ul.ed-list li,.editorial ol.ed-list li{margin-bottom:.7rem}
.editorial ul.ed-list li::marker{color:var(--ink-black)}
.editorial ol.ed-list li::marker{color:var(--graphite);font-weight:500}

/* ── Timeline block ── */
.timeline-block{max-width:720px;margin:0 auto;padding:4rem 2rem;position:relative;z-index:3;background:var(--canvas)}
.timeline-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2rem;letter-spacing:-.03em;color:var(--ink-black)}
.timeline-list{position:relative;padding-left:1.8rem}
.timeline-list::before{content:'';position:absolute;left:6px;top:8px;bottom:8px;width:1px;background:var(--steel)}
.timeline-event{position:relative;margin-bottom:1.8rem}
.timeline-event::before{content:'';position:absolute;left:-1.8rem;top:.55rem;width:13px;height:13px;border-radius:50%;background:var(--ink-black);box-shadow:0 0 0 3px var(--canvas)}
.timeline-when{font-family:var(--font-body);font-size:.72rem;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--graphite);margin-bottom:.3rem}
.timeline-title{font-family:var(--font-display);font-size:1.25rem;font-weight:500;line-height:1.25;margin-bottom:.4rem;color:var(--ink-black);letter-spacing:-.015em}
.timeline-body{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--graphite);font-weight:400}

/* ── StatRow block ── */
.statrow-block{max-width:1100px;margin:0 auto;padding:4rem 2rem;position:relative;z-index:3;background:var(--canvas)}
.statrow-block h3{font-family:var(--font-display);font-size:clamp(1.5rem,3vw,2rem);font-weight:300;margin-bottom:2.4rem;letter-spacing:-.03em;text-align:center;color:var(--ink-black)}
.statrow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:2rem;text-align:center}
.statrow-cell{background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:var(--radius-card);padding:1.8rem 1.4rem;box-shadow:var(--shadow-card)}
.statrow-cell .v{font-family:var(--font-display);font-size:clamp(2.4rem,5vw,3.5rem);font-weight:300;color:var(--ink-black);line-height:1.05;letter-spacing:-.04em;background:var(--spectrum-gradient);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.statrow-cell .l{font-family:var(--font-body);font-size:.95rem;color:var(--ink-black);margin-top:.7rem;font-weight:500;letter-spacing:.01em}
.statrow-cell .c{font-family:var(--font-body);font-size:.78rem;color:var(--graphite);margin-top:.3rem;font-style:normal;font-weight:400}

/* ── Aside block ── */
.aside-block{max-width:720px;margin:3rem auto;padding:1.6rem 1.8rem;border-radius:var(--radius-card);background:rgba(255,255,255,.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-left:3px solid var(--ink-black);font-family:var(--font-body);position:relative;z-index:3;box-shadow:var(--shadow-card)}
.aside-block.tone-note{border-left-color:var(--signal-blue)}
.aside-block.tone-warning{border-left-color:var(--spectrum-red)}
.aside-block h3{font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:.5rem;color:var(--ink-black);letter-spacing:-.01em}
.aside-block p{font-family:var(--font-body);font-size:1rem;line-height:1.55;color:var(--ink-black);margin-bottom:.7rem;font-weight:400}
.aside-block p:last-child{margin-bottom:0}

@media(max-width:900px){
  .timeline-block,.statrow-block{padding:3rem 1.25rem}
  .aside-block{margin:2.5rem 1.25rem}
}
`;
```

- [ ] **Step 2: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/render.js','utf8').replace(/^export /gm,'').replace(/\bimport\(.*\)/g,'null')); console.log('render OK')"
curl -s http://localhost:4000/js/render.js | grep -c "spectrum-gradient"  # ≥ 2
curl -s http://localhost:4000/js/render.js | grep -c "rgba(255,255,255,.9)" # ≥ 4
```

Open http://localhost:4000/ in a browser. Scroll to where new components live (or use the smoketest page from the previous plan if needed). Expected: drop caps render in thin ink-black; callouts and asides are frosted-glass with a thin black/blue/red left bar; big numbers display in spectrum-gradient text using background-clip; timeline dots are ink-black on a thin gray rail; stat cards are frosted with gradient-text values.

- [ ] **Step 3: Commit**

```bash
git add js/render.js
git commit -m "feat(design): Dia treatment for added components

Rewrite COMPONENT_CSS so every Task 3-6 component uses the Dia
token system:
- DropCap: weight 300 ink-black, no orange
- Callout / Aside: frosted glass + thin colored left bar
- BigNumber / StatRow values: spectrum-gradient via background-clip
  (the one place where chromatic emphasis is appropriate)
- Timeline: ink-black dots on a thin steel rail, weight-300 heading
- List: ink-black markers"
```

---

## Task 5: Cinematic intro recolor

**Files:**
- Modify: `js/page-init.js` (the `C = { ... }` palette object near line ~750)

The cinematic intro JS pulls particle colors from a `C` object (e.g. `C.accent`, `C.muted`, `C.text`, `C.bg`). Updating those hex values is enough to recolor the entire intro animation without touching its structure.

- [ ] **Step 1: Find the palette object**

```bash
grep -n "const C={" js/page-init.js
# Should find one match around line 745-755 in a section labelled "Shared helpers"
```

- [ ] **Step 2: Replace it**

Open `js/page-init.js`. Find the line:

```js
const C={
  gold:'#E8A838',orange:'#D4774B',purple:'#8B6BAE',blue:'#5B9BBF',green:'#5BA87A',
  red:'#C45B5B',teal:'#4A9B94',rose:'#C47A8A',lime:'#8BB85A',slate:'#7A8B9A',
  accent:'#c06830',muted:'#8c8078',text:'#2a2320',bg:'#faf7f2'
};
```

Replace with:

```js
const C={
  // D3 chart palette — unchanged; these encode narrative meaning in the visualization.
  gold:'#E8A838',orange:'#D4774B',purple:'#8B6BAE',blue:'#5B9BBF',green:'#5BA87A',
  red:'#C45B5B',teal:'#4A9B94',rose:'#C47A8A',lime:'#8BB85A',slate:'#7A8B9A',
  // Theme colors — switched to Dia tokens. accent is no longer orange.
  accent:'#000000',muted:'#636363',text:'#000000',bg:'#f8f8f8'
};
```

- [ ] **Step 3: Find the cinematic-intro `catColor` map**

Earlier in the file (around line 30), there is:

```js
const catColor = {w:'#c06830', yr:'#8c8078', t:'#5B9BBF', data:'#5BA87A'};
```

Replace with:

```js
// Cinematic intro particle colors. W-questions are the focal point — use ink-black.
// Year / concept / data are categorical (visual variety) — neutral grays + a single warm tone.
const catColor = {w:'#000000', yr:'#959595', t:'#7c7c7c', data:'#c679c4'};
```

(W-question particles become black for strong contrast; years stay slate-gray; concept words a slightly darker gray; data tokens get a single rose-quartz pop drawn from the spectrum gradient.)

- [ ] **Step 4: Verify**

```bash
grep -n "C\.accent\|catColor" js/page-init.js | head -10  # spot-check the palette is referenced where expected
node -e "new Function(require('fs').readFileSync('js/page-init.js','utf8')); console.log('page-init OK')"
```

Reload http://localhost:4000/. Wait for the cinematic intro to play. Expected: particles fade in as gray text with W-questions in black (no orange); the rose-quartz data tokens add a single pink/mauve accent at the bottom of the pyramid. The orange "LEAD" badge that appears mid-animation now uses ink-black background.

Note: there's also CSS that references `var(--accent)` (orange) for animation glyphs. After Task 1, `--accent` already resolves to `#000000`, so these auto-update.

- [ ] **Step 5: Commit**

```bash
git add js/page-init.js
git commit -m "feat(design): recolor cinematic intro for Dia palette

Switch the C palette and catColor map from orange-on-beige to
ink-black-on-canvas. Chart-data colors (gold/orange/purple/blue/green
on the D3 visualization) are left unchanged because they encode
narrative chapter, not theme. Rose-quartz introduced for the data
particles — one chromatic accent drawn from the spectrum gradient."
```

---

## Task 6: Admin panel restyle

**Files:**
- Modify: `admin/ui/styles.css` (entire file)

The admin panel uses a GitHub-ish gray + blue palette. Migrate it to match Dia so the admin feels consistent with the public site.

- [ ] **Step 1: Replace the `:root`-equivalent token usages**

In `admin/ui/styles.css`, no `:root` block exists today. Add one at the very top of the file (right after the header comment), before any rule:

```css
:root {
  /* Dia tokens (same as public site) */
  --canvas:#f8f8f8; --snow:#fff; --fog:#efefef; --pebble:#d9d9d9;
  --ash:#7c7c7c; --slate:#959595; --steel:#aeaeae; --graphite:#636363; --ink-black:#000;
  --rose-quartz:#c679c4; --marigold:#ffb005; --signal-blue:#0358f7; --spectrum-red:#fa3d1d;
  --spectrum-gradient:linear-gradient(90deg,#c679c4 0%,#fa3d1d 25%,#ffb005 50%,#e1e1fe 75%,#0358f7 100%);
  --radius-card:30px; --radius-pill:9999px;
  --shadow-card:rgba(0,0,0,0.08) 0 0 8px 0;
  --font:'DM Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
}
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
```

Note: `@import` MUST appear before any rule. Move it to line 1 (above `:root`) if the linter complains. Alternative: add `<link rel="stylesheet" href="...">` to `admin/ui/index.html` head — but the @import inside the CSS is simpler and self-contained.

- [ ] **Step 2: Update body + button base styles**

Find the `body` rule. Replace with:

```css
body {
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink-black);
  background: var(--canvas);
  -webkit-font-smoothing: antialiased;
  letter-spacing: -.005em;
}
```

Find the `button` base rule. Replace with:

```css
button {
  font: inherit;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,.08);
  background: var(--snow);
  color: var(--ink-black);
  padding: 7px 14px;
  border-radius: var(--radius-pill);
  font-weight: 500;
  transition: background .2s, border-color .2s, color .2s;
}
button:hover { background: var(--fog); }
button.primary { background: var(--pebble); color: var(--ink-black); border-color: var(--pebble); font-weight: 500; }
button.primary:hover { background: var(--ink-black); color: var(--snow); border-color: var(--ink-black); }
button.primary:disabled { background: var(--steel); border-color: var(--steel); color: rgba(0,0,0,.4); cursor: default; }
button.danger { background: var(--snow); color: var(--spectrum-red); border-color: rgba(250,61,29,.3); }
button.danger:hover { background: var(--spectrum-red); color: var(--snow); border-color: var(--spectrum-red); }
button.ghost { background: transparent; border-color: transparent; color: var(--graphite); }
button.ghost:hover { background: var(--fog); color: var(--ink-black); }
button.small { padding: 4px 10px; font-size: 12px; }
```

- [ ] **Step 3: Update login screen + dashboard chrome**

Find `.login {` and `.login-card {`. Replace both with:

```css
.login {
  display: flex; align-items: center; justify-content: center;
  height: 100vh; background: var(--canvas);
  position: relative; overflow: hidden;
}
.login::before {
  content: '';
  position: absolute; inset: 0;
  background: var(--spectrum-gradient);
  opacity: .12; filter: blur(60px);
  pointer-events: none;
}
.login-card {
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 36px 32px;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  width: 340px;
  display: flex; flex-direction: column; gap: 14px;
  position: relative; z-index: 1;
}
.login-title { font-size: 22px; font-weight: 300; text-align: center; margin-bottom: 4px; letter-spacing: -.02em; color: var(--ink-black); }
.login-card input { padding: 10px 14px; border-radius: var(--radius-pill); border: 1px solid rgba(0,0,0,.08); font-family: var(--font); font-size: 14px; }
.login-card button { padding: 10px; background: var(--pebble); color: var(--ink-black); border: 1px solid var(--pebble); font-weight: 500; border-radius: var(--radius-pill); }
.login-card button:hover { background: var(--ink-black); color: var(--snow); border-color: var(--ink-black); }
.error { color: var(--spectrum-red); font-size: 12px; text-align: center; min-height: 16px; }
```

Find `.topbar {`. Replace with:

```css
.topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px;
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(0,0,0,.06);
  flex-shrink: 0;
}
.brand { font-weight: 500; font-size: 14px; color: var(--ink-black); letter-spacing: -.01em; }
.topbar-page label { font-size: 12px; color: var(--graphite); }
.status { font-size: 12px; color: var(--graphite); font-style: normal; font-weight: 400; }
.status.dirty { color: var(--marigold); font-weight: 500; }
.status.saved { color: var(--ink-black); font-weight: 500; }
```

Find `aside, main {`. Replace with:

```css
aside, main {
  background: var(--snow);
  border-right: 1px solid var(--fog);
  overflow: auto;
  min-height: 0;
}
.preview { border-right: 0; display: flex; flex-direction: column; }

.aside-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--fog);
  font-weight: 500;
  font-size: 11px;
  color: var(--graphite);
  text-transform: uppercase;
  letter-spacing: .1em;
  position: sticky; top: 0;
  background: var(--snow);
  z-index: 1;
}
```

- [ ] **Step 4: Update block list, form, subitems**

Find `.block-item {`. Replace its block + child rules with:

```css
.block-list { list-style: none; padding: 8px; }
.block-item {
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 10px 12px;
  margin-bottom: 4px;
  cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  font-size: 13px;
  transition: background .15s, border-color .15s;
}
.block-item:hover { background: var(--fog); }
.block-item.active { background: var(--snow); border-color: rgba(0,0,0,.08); box-shadow: var(--shadow-card); }
.block-type {
  font-weight: 500;
  color: var(--ink-black);
  font-family: var(--font);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .1em;
}
.block-title { flex: 1; color: var(--graphite); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
.block-ctrl { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.block-item:hover .block-ctrl, .block-item.active .block-ctrl { opacity: 1; }
.block-ctrl button { padding: 3px 6px; font-size: 12px; border: 0; background: transparent; color: var(--graphite); border-radius: 6px; }
.block-ctrl button:hover { background: rgba(0,0,0,.06); color: var(--ink-black); }
.block-ctrl button.claude-btn { color: var(--ink-black); }
.block-ctrl button.claude-btn:hover { background: rgba(0,0,0,.06); }

#btn-add-block {
  background: var(--snow); color: var(--ink-black); border: 1px solid rgba(0,0,0,.08);
  font-weight: 500;
  position: relative;
}
#btn-add-block::before {
  content: ''; position: absolute; inset: 0;
  border-radius: inherit;
  background: var(--spectrum-gradient);
  opacity: 0; transition: opacity .25s;
  pointer-events: none;
}
#btn-add-block:hover::before { opacity: .15; }
```

Find `.form-title {` and `.field-label {`. Replace with:

```css
.form-title {
  font-size: 18px; font-weight: 300;
  padding-bottom: 14px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--fog);
  display: flex; align-items: center; gap: 10px;
  letter-spacing: -.01em;
  color: var(--ink-black);
}
.form-title .type-pill {
  font-size: 10px; font-weight: 500;
  color: var(--ink-black); background: var(--fog);
  padding: 3px 9px; border-radius: var(--radius-pill);
  text-transform: uppercase; letter-spacing: .1em;
  font-family: var(--font);
}
.field { margin-bottom: 16px; }
.field-label {
  display: block; font-weight: 500; color: var(--ink-black);
  font-size: 12px; margin-bottom: 5px; letter-spacing: -.005em;
}
```

Find `input[type="text"], input[...]`. Replace with:

```css
input[type="text"], input[type="password"], input[type="number"], textarea, select {
  width: 100%;
  font-family: var(--font); font-size: 13px;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 16px;
  padding: 8px 12px;
  background: var(--snow);
  color: var(--ink-black);
  transition: border-color .2s, box-shadow .2s;
}
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--ink-black);
  box-shadow: rgba(0,0,0,.08) 0 0 0 3px;
}
textarea { resize: vertical; min-height: 60px; line-height: 1.5; border-radius: 16px; }
```

Find `.subitem {`. Replace with:

```css
.subitem {
  border: 1px solid var(--fog);
  border-radius: 16px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--canvas);
}
.subitem-kind {
  font-family: var(--font);
  font-size: 10px; font-weight: 500;
  background: var(--snow);
  color: var(--ink-black);
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  text-transform: uppercase; letter-spacing: .1em;
}
```

- [ ] **Step 5: Update modal + palette card**

Find `.modal {` and `.palette-card {`. Replace with:

```css
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.modal {
  background: rgba(255,255,255,.95);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: var(--radius-card);
  width: 560px; max-width: 90vw; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-card), rgba(0,0,0,.12) 0 20px 60px 0;
}
.modal-head {
  padding: 18px 22px;
  border-bottom: 1px solid var(--fog);
  font-weight: 300; font-size: 18px;
  display: flex; align-items: center; justify-content: space-between;
  letter-spacing: -.02em;
}
.modal-body { padding: 18px 22px; overflow: auto; flex: 1; }
.modal-foot {
  padding: 14px 22px;
  border-top: 1px solid var(--fog);
  display: flex; justify-content: flex-end; gap: 8px;
}

.palette-card {
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 20px;
  padding: 14px;
  cursor: pointer;
  text-align: left;
  background: var(--snow);
  display: flex; flex-direction: column; gap: 6px;
  transition: border-color .2s, box-shadow .2s, transform .15s;
}
.palette-card:hover { background: var(--snow); border-color: var(--ink-black); box-shadow: var(--shadow-card); transform: translateY(-1px); }
.palette-card .name { font-weight: 500; color: var(--ink-black); font-family: var(--font); font-size: 13px; letter-spacing: -.005em; }
.palette-card .desc { color: var(--graphite); font-size: 12px; font-weight: 400; line-height: 1.4; }
.palette-card.with-preview { padding: 12px 14px 14px; }
.palette-preview {
  margin-bottom: 10px; padding: 12px 14px;
  background: var(--canvas);
  border: 1px solid var(--fog);
  border-radius: 12px;
  min-height: 80px;
  display: flex; flex-direction: column; justify-content: center;
  overflow: hidden;
}
.palette-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
```

- [ ] **Step 6: Toast + history rows**

Find `.toast {`. Replace with:

```css
.toast {
  position: fixed; bottom: 24px; right: 24px;
  background: var(--ink-black); color: var(--snow);
  padding: 12px 18px;
  border-radius: var(--radius-pill);
  font-size: 13px; font-weight: 500;
  box-shadow: var(--shadow-card), rgba(0,0,0,.2) 0 8px 24px 0;
  z-index: 2000;
  animation: slidein .2s ease-out;
}
.toast.error { background: var(--spectrum-red); }
.toast.success { background: var(--ink-black); }
@keyframes slidein { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
```

Find `.history-row {`. Replace with:

```css
.history-row {
  padding: 10px 12px; border-radius: 12px;
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font); font-size: 12px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background .15s;
}
.history-row:hover { background: var(--fog); }
.history-ts { flex: 1; color: var(--ink-black); font-weight: 400; }
.history-size { color: var(--graphite); }
```

- [ ] **Step 7: Verify**

```bash
node -c admin/server.js && echo OK   # server unchanged but smoke-check
grep -c "var(--ink-black)" admin/ui/styles.css   # expect ≥ 10
grep -c "var(--spectrum-gradient)" admin/ui/styles.css # expect ≥ 1
grep -c "backdrop-filter:.*blur(24px)\|backdrop-filter: blur(24px)" admin/ui/styles.css # expect ≥ 3
```

Reload http://localhost:4000/admin (force-refresh to bypass CSS cache). Expected: login screen has a soft spectrum gradient ambient glow behind the frosted card; dashboard topbar is frosted glass; buttons are pill-shaped; the `+ Add` button has a subtle spectrum tint on hover; modals are frosted with 30px corners; everything reads in DM Sans 300/400/500 with no orange.

- [ ] **Step 8: Commit**

```bash
git add admin/ui/styles.css
git commit -m "feat(design): migrate admin panel to Dia design system

Single-font DM Sans (300/400/500), pill buttons, 30px frosted-glass
cards, ambient spectrum gradient on the login screen. Token names
match the public site so future shared CSS extraction is trivial.

Status colors: dirty=marigold, saved=ink-black. Danger=spectrum-red.
No remaining blue/orange GitHub-style chrome."
```

---

## Task 7: Visual smoke test

**Files:** none — verification only.

- [ ] **Step 1: Ensure server is running and force browser cache invalidation**

```bash
lsof -ti :4000 | xargs kill 2>/dev/null; sleep 1
ADMIN_PASSWORD=test1234 SESSION_SECRET=test-secret node admin/server.js > /tmp/admin.log 2>&1 &
sleep 2
```

- [ ] **Step 2: Public site visual checks via Chrome MCP**

Use the Chrome preview MCP server to start the admin preview (port 4000) and inspect:

```js
// in this conversation, run:
mcp__Claude_Preview__preview_start({ name: 'admin' })
// then navigate the preview to each URL and screenshot
```

URLs to visit and what to verify visually:

1. `http://localhost:4000/` (the journalism page)
   - [ ] No orange anywhere
   - [ ] Hero title in thin DM Sans 300, large
   - [ ] Cinematic intro plays with black W-questions, gray years, pink data tokens
   - [ ] Progress bar at top is a thin spectrum gradient
   - [ ] Editorial body in DM Sans, headings weight 300
   - [ ] Pullquote has a thin spectrum-gradient left bar (not orange)
   - [ ] Editorial separator strips are spectrum gradient
   - [ ] Scrolly step cards are frosted-glass with 30px corners
   - [ ] Scrolly badge colors (orange/blue/purple/green/pink) DID NOT change — they encode chapter
   - [ ] Outro final line in thin DM Sans 300, ink-black (not italic-orange)
   - [ ] D3 chart colors (gold/orange/purple etc.) DID NOT change — they encode data

2. `http://localhost:4000/admin` (login)
   - [ ] Background is canvas-gray with a soft gradient ambient glow
   - [ ] Login card is frosted with 30px corners
   - [ ] Sign-in button is pill-shaped, neutral pebble fill

3. `http://localhost:4000/admin` (after login)
   - [ ] Topbar is frosted glass
   - [ ] `+ Add` button pill, hover shows soft spectrum tint
   - [ ] Block list cards have hover/active surfaces (frosted feel)
   - [ ] Editor form uses pill inputs with rounded 16px corners
   - [ ] No GitHub-blue anywhere
   - [ ] Modal opens with frosted backdrop + 30px-radius card

4. `http://localhost:4000/admin` → `+ Add` → Editorial → Skip empty block → click Editorial in sidebar → confirm the editor form renders with the new typography. Then add an inline `Big number` item with value `67%`. Confirm preview shows the value with spectrum-gradient text.

- [ ] **Step 3: Check console errors and failed network requests**

```js
mcp__Claude_Preview__preview_console_logs({ serverId: '...', level: 'error', lines: 50 })
mcp__Claude_Preview__preview_network({ serverId: '...', filter: 'failed' })
```

Expected: no console errors, no failed requests. The Google Fonts request for DM Sans should succeed (200).

- [ ] **Step 4: If regressions found, identify which task introduced them**

If you find issues:
- Wrong color on a specific component → trace to Task 1's token rewrite or Task 4's COMPONENT_CSS.
- Wrong font on body text → Task 1's `@import` or Task 2's font-family edits.
- Cinematic intro still orange → Task 5's C/catColor edits didn't land.
- Admin panel still GitHub-blue → Task 6 didn't replace `#0969da` references.

Fix in place, re-test, commit the fix.

- [ ] **Step 5: No commit unless fixes were needed**

If smoke test passes cleanly, no commit. If you fixed regressions, commit them with `fix(design): ...` messages and amend the corresponding task in this plan.

---

## Self-Review

**Spec coverage:**
- ✅ Dia tokens (canvas / ink-black / graphite / spectrum gradient) — Task 1
- ✅ Single-font DM Sans at 300/400/500 — Task 1 (loading) + Task 2 (usage)
- ✅ Drop Source Serif 4 — Task 2 (verify with grep == 0)
- ✅ 30px frosted-glass cards — Task 3 (scrolly), Task 4 (statrow/aside/callout), Task 6 (admin modal/login)
- ✅ Pill buttons + neutral fills — Task 6
- ✅ Spectrum gradient used sparingly — Task 3 (progress, separator, pullquote bar), Task 4 (BigNumber, StatRow values, Aside left bar option), Task 6 (admin login ambient glow + Add-button hover)
- ✅ Weight 300 for display headings — Task 2 + Task 4
- ✅ Cinematic intro recolored — Task 5
- ✅ Chart and badge colors preserved (encode meaning) — explicitly excluded in Tasks 3, 4, 5

**Placeholder scan:** No TBDs, no "implement later", no vague "handle edge cases". Each step shows the actual CSS to type. Verification steps state expected greps and expected visual outcomes.

**Type / token consistency:**
- `--bg`, `--text`, `--muted`, `--accent`, `--card` legacy aliases are kept (Task 1) so Task 2/3 rules that still reference `var(--bg)` etc. continue to work.
- New tokens `--canvas`, `--ink-black`, `--graphite`, `--spectrum-gradient`, `--radius-card`, `--shadow-card`, `--font-display`, `--font-body` are defined in Task 1 and referenced consistently in Tasks 2-6.
- `--font` (short alias) is used in Task 6 (admin) — confirmed defined there.
- The cinematic intro `catColor` keys (w/yr/t/data) match the existing `particleData[].cat` values in `js/page-init.js`.

Plan is internally consistent and ready to execute.
