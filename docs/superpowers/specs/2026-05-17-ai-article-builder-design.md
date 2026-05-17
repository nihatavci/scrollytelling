# AI Full Article Builder — Design Spec

## Problem

Currently, ScrollyCMS generates content one block at a time. To build a full scrollytelling article, the editor must manually create each block, describe what they want, and assemble the pieces. There's no way to feed the system source material (research PDFs, interview transcripts, article drafts) and get a complete, structured article back.

## Solution

A new "Build Full Article" feature that takes mixed source material (pasted text, uploaded files, URLs), analyzes it with AI, proposes a block-by-block article structure with rationale, lets the editor approve/edit the plan, then generates all blocks with source-grounded error prevention.

## Flow

Four phases:

### Phase 1: Ingest

User opens the article builder modal and provides source material through three input methods:

- **Paste text** — large textarea for article drafts, research notes, interview transcripts
- **Upload files** — PDF and DOCX parsed client-side (pdf.js and mammoth.js)
- **Add URLs** — fetched and text-extracted via a lightweight scrape endpoint

User also selects:
- **Article language** — dropdown (German, English, Turkish, etc.)
- **Tone** — button group (Investigative, Explainer, Feature, Opinion)

All inputs are parsed into a unified `sources[]` array of text chunks before hitting the API.

### Phase 2: Analyze & Plan

AI performs two passes:

**Pass 1 — Fact Extraction:** AI reads all source chunks and extracts every verifiable claim: names, dates, numbers, quotes, statistics. Each fact gets a source reference (which source, which section). AI auto-flags claims that are extreme numbers, historical dates, or direct quotes for manual verification.

**Pass 2 — Structure Proposal:** Using the extracted facts, AI proposes an ordered list of blocks. Each proposed block includes:
- Block type (Hero, Editorial, Scrolly, StatRow, etc.)
- Headline / summary of what the block will contain
- Rationale — why this block type at this position in the story
- Source references — which source material feeds this block

The plan is displayed as an editable list. User can:
- Drag to reorder blocks
- Remove blocks from the plan
- Add new blocks to the plan
- Dismiss or acknowledge fact verification flags

### Phase 3: Generate

User clicks "Generate Article". AI generates each block one at a time, sending:
- The plan item for that block
- The relevant source chunks (not the full corpus)
- The extracted facts
- The overall article context (title, tone, previous block summaries)

A progress bar shows generation status. Each completed block gets a confidence tag.

### Phase 4: Review

All generated blocks are inserted into the page. The editor sees:
- Total block count and how many were flagged
- Blocks with medium or low confidence get a yellow/red badge in the sidebar
- The editor can use the normal block editor and Enhance button to refine

## Error Prevention — Three Layers

### Layer 1: Fact Extraction (before planning)

Before proposing any structure, AI reads all sources and extracts verifiable claims. Each claim is tagged with its source reference. AI auto-flags:
- Extreme numbers (percentages above 80%, large dollar amounts)
- Historical dates
- Direct quotes
- Statistics from tables or charts

Flagged items appear with a yellow warning icon. The user can verify or dismiss each flag before proceeding to generation.

### Layer 2: Source Grounding (during generation)

The system prompt for block generation strictly constrains AI:
- "Only use information present in the provided sources"
- "Do not invent names, dates, numbers, or quotes not found in the sources"
- "If a block needs information not available in the sources, insert a `[NEEDS SOURCE]` placeholder instead of fabricating content"
- Each block's prompt includes the specific source chunks relevant to that block, not the full corpus

### Layer 3: Confidence Tags (after generation)

Every generated block receives a confidence rating:
- **high** — all content directly traceable to source material
- **medium** — mostly sourced but AI performed synthesis or inference
- **low** — AI filled gaps, rephrased significantly, or couldn't find source support

The confidence rating is stored in `block.data._confidence` and displayed as a badge in the block sidebar:
- High: no badge (normal)
- Medium: yellow dot badge
- Low: red dot badge

## Technical Architecture

### New API Endpoints

#### `functions/api/article-builder.js`

Single endpoint handling two actions via the `action` parameter in the request body.

**`action: 'analyze'`**

Input:
```json
{
  "action": "analyze",
  "sources": [
    { "type": "text", "content": "...", "label": "Pasted notes" },
    { "type": "text", "content": "...", "label": "report.pdf" },
    { "type": "text", "content": "...", "label": "https://example.com/article" }
  ],
  "lang": "de",
  "tone": "investigative"
}
```

Output:
```json
{
  "facts": [
    { "claim": "47% of newsrooms cut staff", "source": "report.pdf", "section": "page 3", "flag": null },
    { "claim": "Revenue dropped 83% since 2004", "source": "report.pdf", "section": "table 2", "flag": "extreme_number" }
  ],
  "plan": [
    { "type": "Hero", "headline": "Die Stille Krise", "rationale": "Opens with central tension from interview", "sourceRefs": ["interview.docx p.2"] },
    { "type": "Editorial", "headline": "Background", "rationale": "Reader needs baseline context", "sourceRefs": ["report.pdf p.1-3"] },
    { "type": "StatRow", "headline": "3 key WHO numbers", "rationale": "Anchors argument with data", "sourceRefs": ["report.pdf table 2"] }
  ],
  "warnings": ["Source material is 12,000 words — article may need to be selective"]
}
```

Processing strategy for long content:
1. Split sources into ~2000-token chunks
2. First AI call: summarize each chunk into key facts, quotes, data points
3. Second AI call: using all summaries, propose article structure

**`action: 'generate-block'`**

Input:
```json
{
  "action": "generate-block",
  "type": "StatRow",
  "planItem": { "headline": "3 key WHO numbers", "rationale": "Anchors argument", "sourceRefs": ["report.pdf table 2"] },
  "sourceChunks": ["...relevant text..."],
  "facts": ["47% of newsrooms cut staff", "Revenue dropped 83%", "12 countries affected"],
  "articleContext": { "title": "Die Stille Krise", "tone": "investigative", "lang": "de", "blockIndex": 2, "totalBlocks": 14 },
  "lang": "de"
}
```

Output:
```json
{
  "data": { "title": "", "stats": [{"value": "47%", "label": "Redaktionen", "context": "bauten Personal ab"}] },
  "confidence": "high",
  "sourceRefs": ["report.pdf table 2, row 3"]
}
```

#### `functions/api/scrape.js`

Lightweight URL text extraction endpoint.

Input:
```json
{
  "url": "https://example.com/article"
}
```

Output:
```json
{
  "title": "Article Title",
  "text": "Extracted article text...",
  "wordCount": 1200
}
```

Implementation: Fetch the URL, parse HTML, extract main content using simple heuristics (find `<article>`, `<main>`, or largest text-dense `<div>`; strip nav, header, footer, sidebar, script, style elements). No external dependencies — pure HTML string parsing.

### Client-Side File Parsing

No server-side file parsing. Everything happens in the browser:

- **PDF**: pdf.js via CDN (`https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs`) — extract text from each page
- **DOCX**: mammoth.js via CDN (`https://cdn.jsdelivr.net/npm/mammoth@1/mammoth.browser.min.js`) — convert to plain text
- **Plain text / Markdown**: Pass through directly
- **URLs**: Sent to `/api/scrape` endpoint for server-side fetch + extraction

All parsed content normalizes into:
```javascript
{ type: 'text', content: 'extracted text...', label: 'filename.pdf' }
```

### Admin UI

#### New file: `admin/ui/article-builder.js`

Loaded after `app.js` in `index.html`. Exposes `window.openArticleBuilder()` as a global so app.js can call it from its click handler.

Contains:
- `openArticleBuilder()` — opens a large modal with the 4-phase flow
- Phase 1 UI: tabbed input (Paste / Upload / URL), file parsing, source list management
- Phase 2 UI: fact list with flags, draggable plan editor, block type badges
- Phase 3 UI: progress bar, per-block status (queued/generating/done/failed)
- Phase 4 UI: summary with confidence breakdown, "Insert into Page" button

Communication with app.js: The article builder uses `SB.generate()` (already global via supabase-client.js) for AI calls. To insert generated blocks back into the page, app.js exposes `window._insertBlocks(blocks)` — a thin wrapper that appends to the current page's `blocks[]` array, saves the draft, and re-renders the block list.

#### Modifications to existing files:

**`admin/ui/index.html`:**
- Add pdf.js CDN script tag
- Add mammoth.js CDN script tag
- Add `article-builder.js` script tag (after `app.js`)
- Add topbar button: `<button id="btn-article-builder">⚡ Full Article</button>`

**`admin/ui/app.js`:**
- Expose `window._insertBlocks = function(blocks) { ... }` — appends blocks to current page, saves draft, re-renders
- Add click handler: `$('#btn-article-builder').addEventListener('click', window.openArticleBuilder);`
- Add confidence badge rendering in `renderBlockList()`: if `block.data._confidence === 'medium'` show yellow dot, if `'low'` show red dot

**`admin/ui/styles.css`:**
- Append `.ab-*` styles for article builder modal, phases, progress bar, fact list, plan editor, confidence badges

### Context Window Strategy

Llama 3.3 70B has approximately 8K token context. Strategy for handling long source material:

1. **Chunking**: Split all source text into chunks of ~2000 tokens each
2. **Summarize phase**: For each chunk, AI extracts key facts, quotes, and data points (~200 tokens per summary)
3. **Plan phase**: Send all summaries (compressed) to AI for structure proposal
4. **Generate phase**: Per block, send only the relevant source chunk(s) + plan item + article context

This means the analyze action may make multiple AI calls (one per chunk for summarization, then one for planning). The generate-block action makes one AI call per block.

Rate limiting: The existing 20-requests-per-60-seconds limit on `/api/generate` does not apply to the new endpoint. The article builder endpoint gets its own rate limit of 5 analyze requests per 60 seconds and 30 generate-block requests per 60 seconds.

## File Map

| File | Change | Responsibility |
|---|---|---|
| `functions/api/article-builder.js` | Create | Analyze + generate-block endpoint |
| `functions/api/scrape.js` | Create | URL text extraction |
| `admin/ui/article-builder.js` | Create | Full article builder UI (modal, 4 phases) |
| `admin/ui/index.html` | Modify | Add CDN scripts, script tag, topbar button |
| `admin/ui/app.js` | Modify | Expose `_insertBlocks`, add button handler, confidence badge in renderBlockList |
| `admin/ui/styles.css` | Modify | Append `.ab-*` styles |

## What We're NOT Building (YAGNI)

- No persistent storage of sources (they live in memory during the builder session only)
- No diff view comparing AI output to source text (confidence tags are sufficient for v1)
- No collaborative review workflow (single editor model)
- No automatic fact-checking against external databases (only against uploaded sources)
- No "regenerate single block" inside the builder (use the existing Enhance button after)
- No source material re-upload (start fresh each time)
- No saving/resuming partial article builds

## Success Criteria

1. User can paste text, upload PDF/DOCX, and add URLs — all parsed into unified source material
2. AI extracts facts with source references and flags suspicious claims
3. AI proposes a coherent article structure with rationale per block
4. User can reorder, add, and remove blocks from the plan before generation
5. AI generates all approved blocks with source-grounded prompting
6. Each block has a confidence tag (high/medium/low) visible in the sidebar
7. `[NEEDS SOURCE]` placeholders appear instead of fabricated content
8. Generated article renders correctly in the preview
9. No regression to existing single-block creation or enhance flows
