# Tailor-Made Block Creation Cards — Design Spec

## Problem

Every block type in ScrollyCMS currently goes through the same generic creation flow: pick type from palette, open Claude AI modal (text description + optional file upload), AI generates block data. This means adding a Before/After image comparison shows the same text-box-and-upload UI as adding a Timeline or a Quote. The creation experience is disconnected from what the component actually does.

## Solution

Replace the generic Claude modal with **purpose-built Creation Cards** — each block type gets its own mini-form showing exactly the inputs that block needs, with labeled upload zones, smart defaults, and layout that mirrors the component's output. AI assistance remains available as a toggle that fills the form fields rather than replacing them.

## Architecture

### Flow

```
User clicks "+ Add" -> Palette opens -> Picks block type
    |
    v
Purpose-built Creation Card opens in modal
    |-- Shows inputs THIS block actually needs
    |-- Upload zones labeled for their purpose (not generic)
    |-- Smart defaults pre-filled
    |-- Small "Let Claude help" toggle at bottom
    |     |-- Expands text area: "Describe what you want"
    |     |-- AI fills the form fields (same form, not a new modal)
    |
    v
User fills fields -> clicks "Create" -> block inserted
```

### Data Structure

A new `BLOCK_CREATION_CARDS` object sits alongside the existing `BLOCK_SCHEMAS`:

```js
BLOCK_CREATION_CARDS = {
  ImageCompare: {
    headline: 'Before & After',
    hint: 'Upload two images to compare side by side',
    fields: [
      { key: 'beforeSrc', label: 'Before image', kind: 'image_upload', required: true },
      { key: 'afterSrc',  label: 'After image',  kind: 'image_upload', required: true },
      { key: 'beforeLabel', label: 'Before label', kind: 'text', placeholder: 'e.g., 2019' },
      { key: 'afterLabel',  label: 'After label',  kind: 'text', placeholder: 'e.g., 2024' },
      { key: 'caption', label: 'Caption', kind: 'text', optional: true },
    ],
    layout: 'side-by-side-uploads'   // optional layout hint for the renderer
  },
  // ... one entry per block type
}
```

### Key Principles

1. **Creation cards are a view layer on top of schemas** — they don't replace BLOCK_SCHEMAS, they define a curated subset of fields for the creation moment
2. **AI fills the form, not replaces it** — "Let Claude help" expands a text area; AI output populates the same form fields
3. **After creation, the full editor is available** — renderEditor() with all schema fields still works for fine-tuning
4. **Upload zones match what the component needs** — ImageCompare shows "Before" + "After" labeled zones, not a generic file drop
5. **Smart defaults** — fields pre-filled where sensible (e.g., StatRow starts with 3 stat slots, Scrolly starts with 2 steps)

---

## Block Creation Cards — All 24 Types

### Category: Opening & Structure

#### Hero (The Lede)

- **headline**: "The Lede"
- **hint**: "The opening scene — first thing your reader sees"
- **fields**:
  - `titleHtml` — text, label "Headline", required
  - `subtitle` — text, label "Subtitle"
  - `brand` — text, label "Brand line (small caps at top)"
  - `heroImage` — image_upload, label "Hero background image", optional
  - `lines` — repeater, label "Intro lines (appear one by one before headline)"
    - Each line: text input
    - [+ Add line] button
  - `scrollCueText` — text, label "Scroll cue text", default "Scroll"

#### ChapterDivider

- **headline**: "Chapter Break"
- **hint**: "Mark the start of a new section"
- **fields**:
  - `number` — text (short), label "Chapter #"
  - `title` — text, label "Title", required
  - `subtitle` — text, label "Subtitle"

#### ProgressNav

- **headline**: "Progress Navigation"
- **hint**: "Section labels shown as progress dots"
- **fields**:
  - `sections` — repeater, label "Section labels"
    - Each section: text input + delete button
    - [+ Add section] button
    - Min 2, max 10

---

### Category: The Narrative

#### Editorial

- **headline**: "Editorial Section"
- **hint**: "Prose, headings, and images that tell your story"
- **fields**:
  - `sectionType` — button_group, label "What kind of section?", options: ["Text", "Lead paragraph", "Text + Image"]
  - `kicker` — text, label "Kicker (small caps above title)", placeholder "THE EVIDENCE"
  - `heading` — text, label "Section heading"
  - `body` — textarea, label "Paste or write your text", hint "Each paragraph becomes a separate block. Supports **bold** and *italic*."
- **post-processing**: Split body text on double-newlines into separate `{ kind: 'p', html: '...' }` items in `content[]`. Prepend `{ kind: 'h2', text: heading }` if heading provided. Prepend `{ kind: 'kicker', text: kicker }` if kicker provided.

#### Scrolly (Scroll-driven story)

- **headline**: "Scroll Story"
- **hint**: "Images that change as the reader scrolls through your narrative"
- **fields**:
  - `stepCount` — select, label "How many steps?", options [2, 3, 4, 5], default 3
  - `steps` — repeater (count driven by stepCount), each step:
    - `badgeKind` — select, label "Badge", options from BADGE_OPTIONS
    - `imageSrc` — image_upload, label "Step image"
    - `body` — textarea, label "Step text"
  - `imageSize` — select, label "Image size", options ["small", "medium", "large"], default "medium"
  - `imageHeight` — text, label "Image height", default "80vh"
- **layout**: Each step rendered as a card with image upload on left, text on right

#### DataScrolly (Chart + scroll steps)

- **headline**: "Data Story"
- **hint**: "A chart that transforms as readers scroll through your argument"
- **fields**:
  - `title` — text, label "Chart title", required
  - `source` — text, label "Data source"
  - `chartKind` — button_group, label "Chart type", options: ["bar", "line", "area"]
  - `dataInput` — textarea, label "Data (CSV format: Label, Value)", placeholder "Germany, 83\nFrance, 67\nSpain, 47"
  - `steps` — repeater, each step:
    - `text` — textarea, label "Step narration"
    - `highlight` — text, label "Highlight which bar/line"
- **post-processing**: Parse CSV into `chartSpec.data[]` array; generate `chartSpec` with axis labels derived from headers

---

### Category: Immersive Moments

#### FullBleed

- **headline**: "Full Bleed Scene"
- **hint**: "Edge-to-edge image or video with text overlay"
- **fields**:
  - `mediaSrc` — image_upload, label "Background image (or video)", required, accepts image+video
  - `kicker` — text, label "Kicker"
  - `title` — text, label "Title overlay"
  - `textPosition` — select, label "Text position", options ["top-left", "center", "bottom-left", "bottom-right"], default "center"
  - `overlayDarkness` — range, label "Darken overlay", min 0, max 100, default 60, unit "%"

#### FullscreenImage

- **headline**: "Fullscreen Image"
- **hint**: "A single powerful image that fills the viewport"
- **fields**:
  - `imageSrc` — image_upload, label "Hero image", required
  - `kicker` — text, label "Kicker"
  - `title` — text, label "Title"
  - `caption` — text, label "Caption"
  - `credit` — text, label "Photo credit"
  - `textPosition` — select, label "Text position", options ["bottom-left", "bottom-center", "bottom-right", "center"], default "bottom-left"

#### VideoEmbed

- **headline**: "Video"
- **hint**: "Embed a YouTube, Vimeo, or other video"
- **fields**:
  - `url` — text, label "Video URL", placeholder "https://youtube.com/watch?v=...", required
  - `caption` — text, label "Caption"
  - `credit` — text, label "Credit"
- **behavior**: On URL paste, attempt to extract thumbnail for a preview in the creation card

#### AudioPlayer

- **headline**: "Audio Player"
- **hint**: "Podcast episode, interview clip, or ambient sound"
- **fields**:
  - `audioSrc` — audio_upload, label "Audio file", hint "MP3, WAV, OGG, M4A", required
  - `title` — text, label "Show / Episode title"
  - `description` — textarea, label "Description"
  - `coverSrc` — image_upload, label "Cover art"
  - `speakerName` — text, label "Speaker name"
- **layout**: Audio upload zone prominent at top; cover art upload as small square beside speaker name

---

### Category: Evidence & Proof

#### ImageCompare (Before / After)

- **headline**: "Before & After"
- **hint**: "Two images with a slider to compare"
- **fields**:
  - `beforeSrc` — image_upload, label "Before image", required
  - `afterSrc` — image_upload, label "After image", required
  - `beforeLabel` — text, label "Before label", placeholder "e.g., 2019"
  - `afterLabel` — text, label "After label", placeholder "e.g., 2024"
  - `caption` — text, label "Caption"
- **layout**: `side-by-side-uploads` — two upload zones rendered horizontally with labels underneath

#### ImageHotspot

- **headline**: "Annotated Image"
- **hint**: "An image with clickable pins that reveal details"
- **fields**:
  - `imageSrc` — image_upload, label "Image to annotate", required
  - `hotspots` — repeater, label "Hotspot pins"
    - Each: `label` (text), `description` (textarea), `x` (number, 0-100), `y` (number, 0-100)
    - [+ Add pin] button
    - Hint: "Fine-tune pin positions after creation by editing the block"

#### ImageGrid

- **headline**: "Image Grid"
- **hint**: "Multiple images in a grid layout"
- **fields**:
  - `layoutChoice` — button_group, label "Layout", options with visual indicators:
    - "2 side-by-side" (2 columns)
    - "2x2 grid" (4 images)
    - "3 across" (3 columns)
  - `images` — repeater (count driven by layoutChoice), each:
    - `src` — image_upload, label "Image N"
    - `caption` — text, label "Caption"
  - `gridCaption` — text, label "Grid caption"
- **behavior**: Number of upload zones dynamically matches layout selection

#### EmbedBlock

- **headline**: "Embed"
- **hint**: "Datawrapper, Flourish, social posts, or any iframe"
- **fields**:
  - `embedCode` — textarea, label "Paste URL or embed code", placeholder "https://... or <iframe>...</iframe>", required
  - `caption` — text, label "Caption"
- **hint text below field**: "Supported: Datawrapper, Flourish, Twitter/X, Instagram, Spotify"

---

### Category: Voices & Data

#### Quote

- **headline**: "Quote"
- **hint**: "A voice in your story — testimony, expert opinion, or reaction"
- **fields**:
  - `text` — textarea, label "Quote text", placeholder "Type the quote here...", required
  - `attribution` — text, label "Name", required
  - `role` — text, label "Role / title"
  - `portraitSrc` — image_upload, label "Portrait photo"
  - `sourceUrl` — text, label "Source URL"
  - `sourceLabel` — text, label "Source name"
- **layout**: Quote text area prominent; portrait upload as small square beside name/role fields

#### StatRow (Key Numbers)

- **headline**: "Key Numbers"
- **hint**: "2-5 statistics that anchor your argument"
- **fields**:
  - `title` — text, label "Section title", optional
  - `stats` — repeater (default 3, min 2, max 5), each stat rendered as a mini-card:
    - `value` — text (short), label "Value", placeholder "83M"
    - `label` — text (short), label "Label", placeholder "People"
    - `context` — text, label "Context", optional
  - [+ Add stat] button
- **layout**: `stat-cards` — stats rendered side by side as mini-cards, mirroring the final output

#### Map2D

- **headline**: "Interactive Map"
- **hint**: "A map that flies between locations as readers scroll"
- **fields**:
  - `locationSearch` — text, label "Map center", placeholder "Search location..."
  - `lat` — number, label "Latitude", inline pair with lng
  - `lng` — number, label "Longitude"
  - `zoom` — range, label "Zoom", min 1, max 18, default 6
  - `mapStyle` — select, label "Map style", options ["streets", "satellite", "light", "dark"]
  - `markers` — repeater, label "Markers"
    - Each: `location` (text), `label` (text), `lat` (number), `lng` (number)
    - [+ Add marker] button
  - `routeLine` — toggle, label "Draw route between markers"
  - `steps` — repeater, label "Story steps (scroll-driven)"
    - Each: `flyTo` (text, label "Fly to location"), `text` (textarea, label "Step text")
    - [+ Add step] button

#### Timeline

- **headline**: "Timeline"
- **hint**: "Key moments arranged chronologically"
- **fields**:
  - `title` — text, label "Timeline title"
  - `events` — repeater (default 3, min 2), each event as a card:
    - `when` — text, label "When", placeholder "1440"
    - `title` — text, label "What happened"
    - `body` — textarea, label "Detail"
  - [+ Add event] button

---

### Category: Supporting

#### Aside (Context Box)

- **headline**: "Context Box"
- **hint**: "Background info, methodology notes, or warnings"
- **fields**:
  - `tone` — button_group, label "Tone", options:
    - "Info" (icon: info circle)
    - "Note" (icon: pencil)
    - "Warning" (icon: warning triangle)
  - `title` — text, label "Title", required
  - `body` — textarea, label "Body text", required

#### AccordionBlock

- **headline**: "Expandable Sections"
- **hint**: "Collapsible Q&A or detail sections"
- **fields**:
  - `heading` — text, label "Section heading", optional
  - `items` — repeater (default 2, min 1), each as a card:
    - `title` — text, label "Title / Question", required
    - `body` — textarea, label "Body / Answer", required
  - [+ Add section] button

#### Outro

- **headline**: "Closing"
- **hint**: "The final words, credits, and sources"
- **fields**:
  - `h2` — text, label "Closing heading"
  - `body` — textarea, label "Final paragraph(s)", hint "Separate paragraphs with blank lines"
  - `finalLine` — text, label "Final line (italic accent)", placeholder "A closing thought..."
  - `sourcesHtml` — textarea, label "Sources (HTML)", hint "Use <a href> tags for links"

#### VizPanel

- **headline**: "Visualization Panel"
- **hint**: "Container for D3 data visualization"
- **fields**:
  - `initialTitle` — text, label "Title"
  - `initialSub` — text, label "Subtitle"
- **note**: Minimal creation card — this block hosts the D3 viz, advanced config via full editor after creation

---

## AI Toggle Behavior

When user clicks "Let Claude help", a text area slides open at the bottom of the creation card (same modal):

- Text area with placeholder: "Describe what you want..."
- [Generate] button
- On generate: API call to existing `/api/generate` endpoint
- Response data populates the **same form fields** above (not a separate modal)
- For image fields, AI returns description text as placeholder that the user replaces with uploads
- User can then review/edit the AI-filled values before clicking "Create"

The toggle is a progressive disclosure — most users fill the form directly; AI is there as an accelerator.

---

## Field Kinds for Creation Cards

The creation card renderer needs these field kinds:

| Kind | Renders As | Used By |
|---|---|---|
| `text` | Single-line input | Most blocks — titles, labels, names |
| `textarea` | Multi-line textarea | Editorial body, quote text, descriptions |
| `image_upload` | Drag-and-drop zone with preview | All image fields |
| `audio_upload` | Drag-and-drop zone (audio icon) | AudioPlayer |
| `video_upload` | Drag-and-drop zone (video icon) | FullBleed (when video) |
| `select` | Dropdown | Map style, badge kind, image size |
| `button_group` | Horizontal button row | Chart type, tone, section type, layout |
| `range` | Slider with value display | Zoom, overlay darkness |
| `toggle` | On/off switch | Route line, optional features |
| `number` | Number input | Lat/lng, hotspot coordinates |
| `repeater` | Add/remove cards | Steps, events, stats, markers, lines |

---

## Implementation Scope

### What Changes
- New `BLOCK_CREATION_CARDS` object in `app.js` (one entry per block type)
- New `openCreationCard(type, opts)` function replaces `openClaudeModal()` as the palette click target
- New `renderCreationField(fieldDef, data, onChange)` function to render creation card fields
- Palette click handlers updated: `openClaudeModal({ mode: 'create', type })` becomes `openCreationCard(type)`
- Upload zones reuse existing `uploadToSupabase()` infrastructure with labeled zones

### What Stays the Same
- `BLOCK_SCHEMAS` — unchanged
- `BLOCK_PREVIEWS` — unchanged
- `PALETTE_CATEGORIES` — unchanged
- `renderEditor()` — unchanged (post-creation editing)
- `renderBlockList()` — unchanged
- `defaultDataFor()` — used as fallback for fields not filled in creation card
- Upload mechanism — reused, just with labeled zones
- `/api/generate` endpoint — reused for AI toggle

### What Gets Removed
- Generic file upload zone in creation flow

### What Gets Modified
- `openClaudeModal()` — the `mode: 'create'` path is replaced by `openCreationCard()`. The `mode: 'enhance'` path (editing existing blocks with AI) remains unchanged and continues to use the Claude modal.

---

## Success Criteria

1. Every block type has a purpose-built creation form that matches what it actually does
2. Image/audio/video upload zones are labeled for their specific purpose (not generic)
3. AI assistance is available as a toggle, fills the same form fields
4. No regression in block creation — all 24 types can still be created
5. Creation cards use existing upload infrastructure
6. After creation, full editor (renderEditor) still works for fine-tuning
7. Mobile-responsive — creation cards work on phone screens
