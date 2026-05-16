# Component Palette Preview Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 22 BLOCK_PREVIEWS mockups in the admin component palette with polished, consistent static miniatures that clearly communicate what each block type looks like when rendered.

**Architecture:** Single-file change — rewrite the `BLOCK_PREVIEWS` object (lines 404–535 of `admin/ui/app.js`). Each value is an inline HTML string rendered inside a `.palette-preview` container (padding: 12px 14px, background: #f8f8f8, border-radius: 12px, min-height: 80px, max-width ~200px). All use `DM Sans` font with the admin's CSS variables. No JS, no animation — pure static HTML+inline-CSS miniatures.

**Tech Stack:** Inline HTML strings, CSS variables from admin styles.css

---

## Design System for Previews

All 22 previews follow these rules:

| Token | Value | Usage |
|---|---|---|
| Font | `'DM Sans',sans-serif` | Everything |
| Black | `#1a1a1a` | Headings, primary text |
| Gray | `#888` | Secondary labels, captions |
| Light gray | `#e5e5e5` | Skeleton lines, borders |
| Accent | `#6366f1` | Active indicators, highlights |
| Warm accent | `#f59e0b` | Stats, numbers |
| Container bg | `#fff` | Cards, panels |
| Skeleton line | 4–5px tall `#e5e5e5` rounded bars | Body text placeholders |
| Border radius | 6px cards, 3px inner elements | Consistent rounding |
| Max height | ~90px for the mockup area | Fits palette card |

---

### Task 1: Replace all BLOCK_PREVIEWS with redesigned mockups

**Files:**
- Modify: `admin/ui/app.js:404-535` (the `BLOCK_PREVIEWS` object)

- [ ] **Step 1: Replace the entire BLOCK_PREVIEWS object**

Replace lines 404–535 of `admin/ui/app.js` (from `const BLOCK_PREVIEWS = {` through the closing `};`) with the following:

```javascript
const BLOCK_PREVIEWS = {
  Hero: `
    <div style="text-align:center;padding:8px 0;">
      <div style="font:500 5.5px 'DM Sans',sans-serif;letter-spacing:.2em;color:#888;text-transform:uppercase;">BRAND</div>
      <div style="font:300 20px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:6px;letter-spacing:-.03em;line-height:1.1;">Big Title <span style="color:#6366f1;">Word</span></div>
      <div style="font:400 8px 'DM Sans',sans-serif;color:#888;margin-top:4px;">A subtitle that explains</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:2px;color:#bbb;">
        <div style="font:400 5.5px 'DM Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;">SCROLL</div>
        <div style="width:6px;height:6px;border-right:1.5px solid #bbb;border-bottom:1.5px solid #bbb;transform:rotate(45deg);"></div>
      </div>
    </div>`,
  ChapterDivider: `
    <div style="text-align:center;padding:10px 0;">
      <div style="font:500 7px 'DM Sans',sans-serif;letter-spacing:.15em;color:#888;text-transform:uppercase;">CHAPTER I</div>
      <div style="font:300 17px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:5px;letter-spacing:-.02em;">The Beginning</div>
      <div style="font:400 7.5px 'DM Sans',sans-serif;color:#888;margin-top:3px;">Optional subtitle line</div>
      <div style="margin:8px auto 0;width:36px;height:2px;background:linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#e1e1fe,#0358f7);border-radius:2px;"></div>
    </div>`,
  Editorial: `
    <div>
      <div style="font:500 6px 'DM Sans',sans-serif;letter-spacing:.12em;color:#6366f1;text-transform:uppercase;margin-bottom:4px;">KICKER</div>
      <div style="font:500 13px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;letter-spacing:-.01em;">Section heading</div>
      <div style="font:400 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.5;margin-top:5px;">Lead paragraph text that introduces the section with larger font.</div>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">
        <div style="height:4px;background:#e5e5e5;border-radius:2px;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:90%;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:70%;"></div>
      </div>
      <div style="margin-top:6px;border-left:2px solid linear-gradient(#c679c4,#0358f7);padding-left:8px;border-image:linear-gradient(#c679c4,#0358f7) 1;">
        <div style="font:300 9px 'DM Sans',sans-serif;color:#1a1a1a;font-style:italic;line-height:1.35;">"Pull quote goes here."</div>
      </div>
    </div>`,
  Scrolly: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.2;background:linear-gradient(135deg,#f0f0f0 0%,#e8e8e8 100%);border-radius:6px;display:flex;align-items:center;justify-content:center;min-height:72px;position:relative;">
        <svg viewBox="0 0 40 40" width="24" height="24" style="opacity:.3;"><rect x="4" y="8" width="32" height="24" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><path d="M4 14h32" stroke="#666" stroke-width="1"/><circle cx="15" cy="22" r="4" fill="none" stroke="#666" stroke-width="1"/><path d="M24 19h8M24 23h6" stroke="#666" stroke-width="1" stroke-linecap="round"/></svg>
        <div style="position:absolute;top:4px;left:6px;font:500 5px 'DM Sans',sans-serif;color:#888;letter-spacing:.06em;">STICKY IMAGE</div>
      </div>
      <div style="flex:0.8;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1.5px solid #6366f1;border-radius:6px;padding:5px 6px;">
          <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;">
            <div style="width:4px;height:4px;border-radius:1px;background:#6366f1;"></div>
            <div style="font:600 5.5px 'DM Sans',sans-serif;color:#6366f1;letter-spacing:.04em;">STEP 1</div>
          </div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:85%;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:60%;margin-top:2px;"></div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:5px 6px;opacity:.45;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">Step 2</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:70%;margin-top:3px;"></div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:5px 6px;opacity:.3;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">Step 3</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:55%;margin-top:3px;"></div>
        </div>
      </div>
    </div>`,
  DataScrolly: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.3;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:6px 7px;min-height:72px;">
        <div style="font:500 7px 'DM Sans',sans-serif;color:#1a1a1a;margin-bottom:2px;">Chart Title</div>
        <div style="font:400 5.5px 'DM Sans',sans-serif;color:#888;margin-bottom:6px;">Subtitle</div>
        <svg viewBox="0 0 100 35" style="width:100%;height:32px;">
          <line x1="8" y1="30" x2="95" y2="30" stroke="#e5e5e5" stroke-width=".5"/>
          <line x1="8" y1="20" x2="95" y2="20" stroke="#e5e5e5" stroke-width=".3" stroke-dasharray="2,2"/>
          <line x1="8" y1="10" x2="95" y2="10" stroke="#e5e5e5" stroke-width=".3" stroke-dasharray="2,2"/>
          <polyline points="10,28 22,24 36,18 50,20 64,12 78,8 92,5" stroke="#6366f1" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="64" cy="12" r="2.5" fill="#6366f1"/>
          <line x1="64" y1="3" x2="64" y2="30" stroke="#f59e0b" stroke-width=".7" stroke-dasharray="1.5,1.5"/>
        </svg>
        <div style="font:400 5px 'DM Sans',sans-serif;color:#aaa;margin-top:2px;">Source: data</div>
      </div>
      <div style="flex:0.7;display:flex;flex-direction:column;gap:3px;">
        <div style="background:#fff;border:1.5px solid #6366f1;border-radius:5px;padding:4px 5px;">
          <div style="font:600 5px 'DM Sans',sans-serif;color:#6366f1;letter-spacing:.04em;margin-bottom:2px;">DATA · STEP 1</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:70%;margin-top:2px;"></div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.4;">
          <div style="font:500 5px 'DM Sans',sans-serif;color:#888;">Step 2</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.25;">
          <div style="font:500 5px 'DM Sans',sans-serif;color:#888;">Step 3</div>
        </div>
      </div>
    </div>`,
  Quote: `
    <div style="padding:6px 0;">
      <div style="font:300 12px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.3;letter-spacing:-.02em;padding-left:10px;position:relative;">
        <span style="position:absolute;left:-2px;top:-6px;font-size:26px;color:#6366f1;opacity:.3;font-family:Georgia,serif;line-height:1;">&ldquo;</span>
        The most important quote from your story goes here.
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;padding-left:10px;">
        <div style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#e5e5e5,#d0d0d0);flex-shrink:0;"></div>
        <div>
          <div style="font:500 7.5px 'DM Sans',sans-serif;color:#1a1a1a;">Speaker Name</div>
          <div style="font:400 6.5px 'DM Sans',sans-serif;color:#888;">Role · Organization</div>
        </div>
      </div>
    </div>`,
  VideoEmbed: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2a2a 100%);border-radius:6px;height:54px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
      <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
        <div style="width:0;height:0;border-left:9px solid #fff;border-top:5.5px solid transparent;border-bottom:5.5px solid transparent;margin-left:2px;"></div>
      </div>
      <div style="position:absolute;bottom:4px;left:6px;right:6px;height:2px;background:rgba(255,255,255,.15);border-radius:1px;">
        <div style="width:35%;height:100%;background:#f43f5e;border-radius:1px;"></div>
      </div>
    </div>
    <div style="font:400 7px 'DM Sans',sans-serif;color:#888;margin-top:4px;">Caption · <span style="font-style:italic;color:#aaa;">credit</span></div>`,
  Timeline: `
    <div style="display:flex;flex-direction:column;gap:8px;padding-left:10px;border-left:2px solid #e5e5e5;position:relative;">
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#6366f1;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#6366f1;text-transform:uppercase;">1945</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">First event title</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:80%;margin-top:3px;"></div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#e5e5e5;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">1962</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">Second event</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:6px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#e5e5e5;margin-left:-13.5px;margin-top:1px;flex-shrink:0;box-shadow:0 0 0 2px #f8f8f8;"></div>
        <div>
          <div style="font:600 6px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">1989</div>
          <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">Third event</div>
        </div>
      </div>
    </div>`,
  StatRow: `
    <div style="display:flex;gap:4px;text-align:center;">
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#f59e0b;line-height:1;letter-spacing:-.02em;">67%</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">Metric</div>
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#f59e0b;line-height:1;letter-spacing:-.02em;">2.4k</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">Count</div>
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px 4px;">
        <div style="font:600 18px 'DM Sans',sans-serif;color:#f59e0b;line-height:1;letter-spacing:-.02em;">3×</div>
        <div style="font:500 6px 'DM Sans',sans-serif;color:#1a1a1a;margin-top:3px;">Growth</div>
      </div>
    </div>`,
  Aside: `
    <div style="border-left:3px solid #6366f1;background:rgba(99,102,241,.04);border-radius:0 6px 6px 0;padding:8px 10px;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
        <svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="7" fill="none" stroke="#6366f1" stroke-width="1.5"/><path d="M8 5v4M8 11v.5" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/></svg>
        <div style="font:600 8.5px 'DM Sans',sans-serif;color:#1a1a1a;">Aside Title</div>
      </div>
      <div style="font:400 7.5px 'DM Sans',sans-serif;color:#555;line-height:1.5;">Highlighted callout with supplementary context for the reader.</div>
    </div>`,
  Outro: `
    <div>
      <div style="font:500 13px 'DM Sans',sans-serif;color:#1a1a1a;letter-spacing:-.01em;">Closing Section</div>
      <div style="margin-top:5px;display:flex;flex-direction:column;gap:3px;">
        <div style="height:4px;background:#e5e5e5;border-radius:2px;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:85%;"></div>
        <div style="height:4px;background:#e5e5e5;border-radius:2px;width:60%;"></div>
      </div>
      <div style="font:300 9.5px 'DM Sans',sans-serif;color:#1a1a1a;font-style:italic;margin-top:8px;line-height:1.3;letter-spacing:-.01em;">A final thought that lingers.</div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e5e5;font:400 6px 'DM Sans',sans-serif;color:#aaa;">Sources: Author (Year) · Author (Year)</div>
    </div>`,
  FullBleed: `
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#333 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 20%,rgba(0,0,0,.65) 100%);"></div>
      <div style="position:absolute;top:6px;right:8px;">
        <svg viewBox="0 0 16 16" width="10" height="10" style="opacity:.4;"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
      </div>
      <div style="position:absolute;bottom:8px;left:10px;right:10px;z-index:1;">
        <div style="font:600 14px 'DM Sans',sans-serif;color:#fff;line-height:1.1;letter-spacing:-.02em;">Full Bleed</div>
        <div style="font:400 7px 'DM Sans',sans-serif;color:rgba(255,255,255,.7);margin-top:3px;">Immersive full-viewport section with video or image</div>
      </div>
    </div>`,
  FullscreenImage: `
    <div style="background:linear-gradient(135deg,#2c1810 0%,#1a1510 100%);border-radius:6px;height:70px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.6) 100%);"></div>
      <div style="position:absolute;bottom:7px;left:10px;z-index:1;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.15em;color:rgba(255,255,255,.6);text-transform:uppercase;">KICKER</div>
        <div style="font:500 13px 'DM Sans',sans-serif;color:#fff;line-height:1.1;margin-top:2px;">Title <span style="color:#f59e0b;">Word</span></div>
        <div style="font:400 6.5px 'DM Sans',sans-serif;color:rgba(255,255,255,.65);margin-top:2px;">subtitle text</div>
      </div>
      <div style="position:absolute;bottom:5px;right:8px;display:flex;flex-direction:column;align-items:center;gap:1px;">
        <div style="width:5px;height:5px;border-right:1px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.5);transform:rotate(45deg);"></div>
      </div>
    </div>`,
  ImageCompare: `
    <div style="border-radius:6px;overflow:hidden;height:60px;position:relative;display:flex;">
      <div style="flex:1;background:linear-gradient(135deg,#d4c5b0 0%,#a89880 100%);display:flex;align-items:center;justify-content:center;">
        <div style="font:500 7px 'DM Sans',sans-serif;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.08em;">Before</div>
      </div>
      <div style="width:3px;background:#fff;position:relative;z-index:2;box-shadow:0 0 6px rgba(0,0,0,.3);">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
          <div style="font:700 7px 'DM Sans',sans-serif;color:#888;">⇔</div>
        </div>
      </div>
      <div style="flex:1;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);display:flex;align-items:center;justify-content:center;">
        <div style="font:500 7px 'DM Sans',sans-serif;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.08em;">After</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:3px;">
      <div style="font:400 6px 'DM Sans',sans-serif;color:#888;">← Drag to compare →</div>
    </div>`,
  ImageHotspot: `
    <div style="background:linear-gradient(135deg,#f0f0f0 0%,#e0e0e0 100%);border-radius:6px;height:64px;position:relative;overflow:hidden;">
      <svg viewBox="0 0 40 40" width="28" height="28" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.15;"><rect x="2" y="6" width="36" height="28" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><circle cx="14" cy="18" r="4" fill="none" stroke="#666" stroke-width="1"/><path d="M2 28l10-8 6 4 8-10 12 8" stroke="#666" stroke-width="1" fill="none"/></svg>
      <div style="position:absolute;top:12px;left:20px;width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;">1</div>
      <div style="position:absolute;top:32px;right:24px;width:16px;height:16px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;">2</div>
      <div style="position:absolute;bottom:10px;left:40px;width:16px;height:16px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font:700 7px 'DM Sans',sans-serif;color:#fff;">3</div>
    </div>
    <div style="font:400 6px 'DM Sans',sans-serif;color:#888;margin-top:3px;">Click markers to reveal info</div>`,
  AccordionBlock: `
    <div style="display:flex;flex-direction:column;gap:3px;">
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">Section heading one</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#6366f1;transform:rotate(180deg);">⌃</div>
        </div>
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">
          <div style="height:3px;background:#e5e5e5;border-radius:1px;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:85%;"></div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:55%;"></div>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">Section heading two</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#888;">⌃</div>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:5px;padding:6px 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font:500 8px 'DM Sans',sans-serif;color:#1a1a1a;">Section heading three</div>
          <div style="font:400 10px 'DM Sans',sans-serif;color:#888;">⌃</div>
        </div>
      </div>
    </div>`,
  VizPanel: `
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:8px;min-height:68px;">
      <div style="font:500 7px 'DM Sans',sans-serif;color:#1a1a1a;margin-bottom:6px;">Visualization Title</div>
      <svg viewBox="0 0 100 40" style="width:100%;height:36px;">
        <rect x="8" y="28" width="10" height="10" rx="1" fill="#6366f1" opacity=".3"/>
        <rect x="22" y="18" width="10" height="20" rx="1" fill="#6366f1" opacity=".5"/>
        <rect x="36" y="8" width="10" height="30" rx="1" fill="#6366f1" opacity=".7"/>
        <rect x="50" y="14" width="10" height="24" rx="1" fill="#6366f1" opacity=".6"/>
        <rect x="64" y="4" width="10" height="34" rx="1" fill="#6366f1"/>
        <rect x="78" y="10" width="10" height="28" rx="1" fill="#6366f1" opacity=".8"/>
        <line x1="5" y1="38.5" x2="95" y2="38.5" stroke="#e5e5e5" stroke-width=".5"/>
      </svg>
    </div>`,
  ProgressNav: `
    <div>
      <div style="height:3px;background:#e5e5e5;border-radius:2px;position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:40%;background:linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#6366f1);border-radius:2px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;gap:2px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;">
            <div style="width:3px;height:3px;border-radius:50%;background:#fff;"></div>
          </div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#6366f1;">I</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#6366f1;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#6366f1;">II</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#e5e5e5;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#aaa;">III</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#e5e5e5;"></div>
          <div style="font:500 5px 'DM Sans',sans-serif;color:#aaa;">IV</div>
        </div>
      </div>
      <div style="font:400 6px 'DM Sans',sans-serif;color:#888;text-align:center;margin-top:4px;">Chapter navigation + reading progress</div>
    </div>`,
  EmbedBlock: `
    <div style="border:1.5px dashed #d0d0d0;border-radius:6px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
      <svg viewBox="0 0 24 24" width="16" height="16" style="opacity:.35;"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" stroke="#666" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="font:500 7px 'DM Sans',sans-serif;color:#888;">Embed</div>
      <div style="font:400 5.5px 'DM Sans',sans-serif;color:#aaa;">Datawrapper · Flourish · iframe</div>
    </div>`,
  ImageGrid: `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
      <div style="background:linear-gradient(135deg,#e8e8e8,#d8d8d8);border-radius:4px;height:32px;grid-row:span 2;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="12" height="12" style="opacity:.3;"><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="#666" stroke-width="1.5"/><circle cx="8" cy="10" r="2" fill="none" stroke="#666" stroke-width="1"/><path d="M2 16l6-4 3 2 5-6 6 4" stroke="#666" stroke-width="1" fill="none"/></svg>
      </div>
      <div style="background:linear-gradient(135deg,#e8e8e8,#ddd);border-radius:4px;height:14px;"></div>
      <div style="background:linear-gradient(135deg,#e8e8e8,#ddd);border-radius:4px;height:14px;"></div>
    </div>
    <div style="font:400 6px 'DM Sans',sans-serif;color:#888;margin-top:3px;text-align:center;">Auto-layout grid · 2–6 images</div>`,
  Map2D: `
    <div style="display:flex;gap:6px;align-items:stretch;">
      <div style="flex:1.2;background:linear-gradient(135deg,#e8e4df 0%,#d4cdc5 100%);border-radius:6px;min-height:68px;position:relative;overflow:hidden;">
        <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.2;">
          <path d="M10 15 Q20 30 40 28 Q60 26 70 40" stroke="#666" stroke-width="1" fill="none" stroke-dasharray="3,2"/>
          <path d="M15 45 Q30 35 50 38 Q65 40 80 30" stroke="#666" stroke-width=".7" fill="none" opacity=".5"/>
        </svg>
        <div style="position:absolute;top:10px;left:14px;width:10px;height:10px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
        <div style="position:absolute;top:28px;right:16px;width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
        <div style="position:absolute;bottom:8px;left:30px;width:10px;height:10px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
      </div>
      <div style="flex:0.7;display:flex;flex-direction:column;gap:3px;">
        <div style="background:rgba(255,255,255,.9);border:1px solid rgba(99,102,241,.3);border-radius:5px;padding:4px 5px;">
          <div style="font:600 5.5px 'DM Sans',sans-serif;color:#6366f1;margin-bottom:2px;">📍 Location A</div>
          <div style="height:3px;background:#e5e5e5;border-radius:1px;width:80%;"></div>
        </div>
        <div style="background:rgba(255,255,255,.7);border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.5;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">📍 Location B</div>
        </div>
        <div style="background:rgba(255,255,255,.5);border:1px solid #e5e5e5;border-radius:5px;padding:4px 5px;opacity:.3;">
          <div style="font:500 5.5px 'DM Sans',sans-serif;color:#888;">📍 Location C</div>
        </div>
      </div>
    </div>`,
  AudioPlayer: `
    <div style="display:flex;gap:8px;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:7px;">
      <div style="width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 4h2l4-3v14l-4-3H3a1 1 0 01-1-1V5a1 1 0 011-1z" fill="#fff" opacity=".9"/><path d="M11.5 5.5a3.5 3.5 0 010 5" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/></svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font:600 5px 'DM Sans',sans-serif;letter-spacing:.06em;color:#888;text-transform:uppercase;">PODCAST</div>
        <div style="font:500 8.5px 'DM Sans',sans-serif;color:#1a1a1a;line-height:1.2;">Episode Title</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
          <div style="width:14px;height:14px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <div style="width:0;height:0;border-left:5px solid #fff;border-top:3px solid transparent;border-bottom:3px solid transparent;margin-left:1px;"></div>
          </div>
          <div style="flex:1;display:flex;align-items:flex-end;gap:1px;height:14px;">
            ${Array.from({length:24},(_,i)=>`<div style="flex:1;background:#6366f1;opacity:${i<8?'.6':'.2'};border-radius:.5px;height:${20+Math.abs(Math.sin(i*.45))*80}%;min-width:1px;"></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`,
};
```

- [ ] **Step 2: Verify syntax**

Run: `node -c admin/ui/app.js`
Expected: no errors

- [ ] **Step 3: Visual verify in browser**

Open `http://localhost:3000/admin`, sign in, click "+ Add" to open the palette modal. Confirm:
- All 22 block types show preview cards
- No blank/missing preview areas
- Cards are visually consistent (same font sizes, colors, spacing)
- Each card clearly communicates what the component does at a glance

- [ ] **Step 4: Commit**

```bash
git add admin/ui/app.js
git commit -m "feat: redesign all 22 component palette previews with consistent visual system"
```

---

## Self-Review

**Spec coverage:** All 22 block types in PALETTE_BLOCKS now have a BLOCK_PREVIEWS entry:
- ✅ 15 existing: Hero, ChapterDivider, Editorial, Scrolly, DataScrolly, Quote, VideoEmbed, Timeline, StatRow, Aside, Outro, VizPanel, Map2D, FullscreenImage, AudioPlayer
- ✅ 7 previously missing: FullBleed, ImageCompare, ImageHotspot, AccordionBlock, ProgressNav, EmbedBlock, ImageGrid

**Placeholder scan:** No TBDs, TODOs, or vague instructions. Every preview is complete HTML.

**Type consistency:** All previews use the same design tokens (`#1a1a1a`, `#888`, `#e5e5e5`, `#6366f1`, `#f59e0b`, `DM Sans`). Object keys match PALETTE_BLOCKS type strings exactly.
