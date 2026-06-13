# Rich-Component Story Generation — Design Spec

**Date:** 2026-06-13
**Status:** approved-for-planning

## Purpose

Teach the AI Full Article Builder to generate **complex stories that use the platform's rich components** — `Map2D` (2D map scrollytelling), `DataScrolly` (animated data charts), `Scene3D` (3D), and `AudioPlayer` — not just text/image blocks. Validate the output through a **recursive generate → inspect → fix loop** until each component clears a per-type quality bar.

Today the planner can only emit `DataScrolly` among the rich types; `Scene3D`, `Map2D`, `AudioPlayer` are absent from its block menu, so the AI cannot build map/3D/audio stories at all. The data-driven blocks also carry accuracy risk (hallucinated coordinates/numbers), and 3D/audio need binary assets the AI can't produce (they fall back to the existing mock library).

## Scope & order

1. **First pass:** `Map2D` + `DataScrolly` (data-driven scrollytelling — real AI content, most testable).
2. **Second pass:** `Scene3D` + `AudioPlayer` (mock-asset-backed + AI text).

Out of scope: external image search, a permanent auto-scoring eval product, a geocoding dependency (added later only if the loop proves Map2D coordinates fail badly).

## Approach

**Schema-rich + grounded + mock-fallback, hardened toward deterministic guards only where the loop proves it's needed.** Extend the existing schema-grounded engine (`functions/api/_shared/*`) rather than build a parallel system. Start lean; let curated test stories expose real failure modes; fix per iteration.

## Architecture / components

All server pieces extend the shared modules built in the prior plan.

- **`functions/api/_shared/blocks.js`**
  - Enrich `BLOCK_SCHEMAS` examples for `Map2D`, `DataScrolly`, `Scene3D`, `AudioPlayer` so deepseek emits correctly-shaped structured data (markers with lat/lng, chartSpec with numeric series, scenes with headings/body).
  - `validateBlockData` already has required-fields for these (`Map2D:['steps']`, `DataScrolly:['steps']`, `Scene3D` n/a, `AudioPlayer:['audioSrc']`). Add **structural** checks: `Map2D` needs ≥1 marker with numeric lat/lng in valid range (lat −90..90, lng −180..180); `DataScrolly` needs `chartSpec.data` with ≥2 points of numeric `yField`. For AudioPlayer specifically, the **article-builder generation path** treats a missing `audioSrc` as acceptable (it injects a cover; the audio file is an upload-pending state) by not rejecting on that field — while `/api/generate` keeps requiring `audioSrc` unchanged for manually-created audio blocks.
- **`functions/api/article-builder.js`**
  - Add `Scene3D`, `Map2D`, `AudioPlayer` to `AVAILABLE_BLOCK_TYPES` with precise "use only when…" guidance.
  - The planner (`buildPlanPrompt`) gains gating rules: `Map2D` only when the story is strongly geographic/route-based; `DataScrolly` only with a real numeric series; `Scene3D` only for a physical object/artifact; `AudioPlayer` only when there is voice/audio material. Don't force these.
  - Extend `factShape` with `hasPlaces` (detect location facts) to inform the planner; reuse `hasNumbers`/`hasDates`.
  - Per-block generation already injects each type's schema via `buildSystemPrompt`. Add per-type grounding to the block prompt: *"Use only place names / numbers present in the sources. For Map2D, use each place's well-known real coordinates; never invent precise coordinates for places not in the sources. If you cannot ground it, omit the block."*
- **`functions/api/_shared/media.js`** — `injectMedia` gains: `Scene3D` → set `glbUrl` to `/assets/mock/object.glb` (+ ensure each scene has camera defaults) when empty; `AudioPlayer` → set `coverSrc` to mock art when empty (leave `audioSrc` empty — upload pending).
- **`functions/api/_shared/quality.js`** — `assessBlockQuality` gains per-type checks: Map2D (markers present + in range), DataScrolly (≥2 numeric points), Scene3D (every scene has heading + body), AudioPlayer (title + description present).

### Test harness (lets me run the loop without admin login)

- **`functions/api/article-test.js`** — a route gated by a `TEST_KEY` secret (compared to `env.TEST_KEY`; 404/401 if absent or mismatched). Accepts `{ sources, lang, tone }`, runs the **real** analyze→generate pipeline server-side (same code path as production), and returns the full generated doc `{ meta, blocks }` as JSON. Runs `deepseek-v4-pro` (small per-call cost). **Disabled at the end** by unsetting `TEST_KEY` and deleting the file in the final commit.
- **`/_story_test.html`** (repo root, dev-only, deleted at end) — accepts a doc via `window.__PAGE_DATA__` and renders it through `js/render.js`, so I screenshot + inspect each iteration with the preview tools.
- **Curated test stories** — 3–4 source texts (I write them; topics swappable) engineered to force each component: an expedition/migration route (→Map2D), a measurable trend over time (→DataScrolly), a physical artifact/product (→Scene3D), an oral-history/interview (→AudioPlayer).

## Data flow (per loop iteration)

1. `curl /api/article-test` (with `TEST_KEY` + a curated source) → generated doc JSON.
2. Drop the doc into `/_story_test.html`; load in preview; screenshot.
3. Catalogue breakage: schema mismatch (block renders empty/wrong), blank render, hallucinated/out-of-range coords, <2 chart points, flat prose, wrong component chosen.
4. Fix the root cause (schema example / planner rule / grounding prompt / validator / media injection).
5. Redeploy; regenerate the same story; confirm the specific defect is gone and nothing regressed.
6. Repeat until the story clears the component's quality bar. Commit each fix atomically.

## Per-component quality bars ("done")

- **Map2D:** renders a map; ≥2 markers at plausible in-range coordinates near the named real places; steps fly between them; step text reads as narrative, not captions.
- **DataScrolly:** renders a chart with ≥2 real data points traceable to the source numbers; steps annotate meaningful points; axis labels correct.
- **Scene3D:** renders the mock object; each saved scene has a heading + body that advance the narrative (not "Scene 1").
- **AudioPlayer:** renders mock cover + real title/description; clearly a "ready for audio upload" state, not broken.
- **Cross-cutting (from the prior plan's "aha" bar):** real text in correct fields, narrative arc holds, the right component is chosen for the content (no Map2D on a non-geographic story).

## Error handling

- **Hallucinated coordinates (Map2D):** grounding rule + validator (in-range check) + quality flag. If the loop shows the model invents bad coordinates for well-known places, add a small deterministic known-places lookup or a geocode step (deferred until evidenced).
- **Insufficient data (DataScrolly):** if `chartSpec.data` < 2 numeric points, the validator rejects → one repair retry → if still bad, the planner shouldn't have chosen it (quality flag surfaces it; planner gating tightened).
- **Wrong component chosen:** planner gating rules + the loop catches it; tighten `buildPlanPrompt` rules.
- **Model/endpoint failure:** `callModel` already falls back Workers-AI; `parseAIResponse` repairs JSON; `repairPlanStructure` guarantees a valid plan.

## Security

- `/api/article-test` is gated by `TEST_KEY` (server secret), never exposed in client code, and **removed** (file deleted + secret unset) in the finalizing step. It does not touch user data or Supabase — it only runs the stateless generation pipeline.
- `/_story_test.html` is dev-only and deleted at the end.

## Testing

- Unit tests (`node --test`) for the new deterministic logic: the in-range coordinate check, the ≥2-numeric-points check, scene heading/body check, `injectMedia` for Scene3D/AudioPlayer, `factShape.hasPlaces` detection.
- Integration: the recursive loop itself is the integration test — each curated story must clear its quality bar with a screenshot as evidence.

## Decomposition note

This is one coherent subsystem delivered in two passes (Map2D+DataScrolly, then Scene3D+AudioPlayer), each independently shippable and valuable. The recursive loop is the working method, not a separate deliverable.
