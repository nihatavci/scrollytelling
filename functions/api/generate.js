// functions/api/generate.js
// AI content generation via Cloudflare Workers AI (Llama 3.3 70B)
// No API key needed — uses the CF account's Workers AI binding.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── Rate Limiting (per-isolate in-memory) ──
const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
const ipCounts = new Map(); // ip → { count, resetAt }
let requestCounter = 0;

function checkRateLimit(ip) {
  const now = Date.now();

  // Periodic cleanup: every 100 requests, purge stale entries
  requestCounter++;
  if (requestCounter % 100 === 0) {
    for (const [key, entry] of ipCounts) {
      if (now > entry.resetAt) ipCounts.delete(key);
    }
  }

  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return null; // allowed
  }
  entry.count++;
  if (entry.count > RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return retryAfter; // blocked
  }
  return null; // allowed
}

// ── Voice & Style Guide ──
const VOICE_GUIDE = `
VOICE & STYLE — Premium scrollytelling editorial standard:

LANGUAGE RULE (CRITICAL):
- Detect the language of the user's prompt and generate ALL content in that SAME language.
- If the user writes in English, respond entirely in English.
- If the user writes in German, respond entirely in German.
- If the user writes in Turkish, respond entirely in Turkish.
- NEVER mix languages. NEVER default to German. Match the user's language exactly.

WRITING RULES:
- Short, punchy sentences that land. Then a longer one for rhythm.
- Use concrete examples, real names, real dates, real publications
- Open with a surprising angle — a paradox, a striking fact, an anecdote
- Weave citations naturally: "As Schudson observed..."
- Use em-dashes (—) for dramatic pauses, not commas
- Numbers are specific: "8,527 articles", "over 40 percent", not "many" or "numerous"
- Each section tells a mini-story with a beginning, turn, and landing
- Kickers use "Act One · The Invention" style (act + theme with middot)
- Paragraphs use "html" field (not "text") for p items — allows inline HTML for emphasis
- Captions are informative, not decorative: explain what the reader sees AND why it matters
- End editorial sections with a {kind:"separator"} item

TONE: Authoritative but accessible. Academic rigor with storytelling flair. Never dry, never clickbait.
`;

// ── Block schemas with rich examples from the reference site ──
const BLOCK_SCHEMAS = {
  Hero: {
    example: {
      brand: 'Thomas Birkner präsentiert',
      titleHtml: 'Die Nachricht als<br><span>Jahrhunderterfindung</span>',
      subtitle: 'Das Pyramidenprinzip im deutschen Journalismus seit 1924',
      scrollCueText: 'Nach unten scrollen',
      lines: [
        { cls: 'cin-l1', text: '1605: die Zeitung. 1870: die Idee. Das Wichtigste kommt zuerst.' },
        { cls: 'cin-l2', text: 'Wer. Was. Wann. Wo. — Nicht die Mächtigen entscheiden. Journalist:innen.' },
        { cls: 'cin-l3', text: 'NS-Diktatur. Zweiter Weltkrieg. DDR. Die Pyramide: unerschüttert.' },
        { cls: 'cin-l4', text: 'Dann brach das Finanzierungsmodell. Dann kam der Algorithmus.' },
        { cls: 'cin-l5', text: '8.527 Artikel. 100 Jahre. 15 Journalist:innen. Drei Generationen.' },
        { cls: 'cin-l6', text: 'Die Pyramide stirbt nicht. Sie verwandelt sich.' }
      ]
    },
    description: `Hero section at the top of a scrollytelling page.
Fields:
- brand (string): small caps line at top, e.g. "Autorin Name präsentiert"
- titleHtml (string): main title. Use <span>word</span> to highlight one word in accent color. Use <br> for line break.
- subtitle (string): one-line subtitle under the title
- scrollCueText (string): scroll prompt, e.g. "Nach unten scrollen"
- lines (array of objects): each {cls: "cin-lN", text: "..."} — dramatic lines shown one by one before the title appears. 4-6 lines. Each is a punchy, staccato sentence. Use periods between phrases for rhythm. The last line should be the thesis.`,
  },

  Editorial: {
    example: {
      content: [
        { kind: 'kicker', text: 'Erster Akt · Die Erfindung' },
        { kind: 'h2', text: 'Das Wichtigste steht am Anfang' },
        { kind: 'lead', text: 'Es gibt zwei Arten, die Dinge zu erzählen: Von Anfang bis Ende oder direkt vom Ende her. Die kurze Textmessage an die beste Freundin wird ganz sicher lauten: „Wir haben uns geküsst!" Das ist die zentrale Botschaft. Und so funktioniert auch die journalistische Nachricht.' },
        { kind: 'p', html: 'Sie stellt die wichtigste Information ganz nach vorne, in den „summary lead". Diese Form entstand Ende des 19. Jahrhunderts im US-amerikanischen Journalismus. Als Erklärung dienten zunächst die unsicheren Telegrafenleitungen — das Wichtigste gleich zu Beginn, falls die Leitung zusammenbrach.' },
        { kind: 'pullquote', text: '"The summary lead was a literary invention that asserted the journalist\'s authority to define for readers the most important element of a news event."', cite: '— Michael Schudson, 1991' },
        { kind: 'p', html: 'Mit dieser Erfindung war es die Aufgabe des Journalismus, zu entscheiden, was das Wichtigste sei. Nicht mehr die Mächtigen erklären, was wichtig ist, sondern Journalist:innen übernehmen dies für die Bürger:innen. Eine demokratische Idee in ihrer besten Form.' },
        { kind: 'separator' }
      ]
    },
    description: `Editorial long-form section — the core storytelling block. Field: content (array of items).
IMPORTANT: For "p" items, use "html" field (not "text"). For kicker/h2/lead/pullquote, use "text" field.

Structure a good Editorial section like this:
1. kicker — "Akt-Nummer · Thema" style (e.g. "Dritter Akt · Der Wandel")
2. h2 — a compelling, specific heading (not generic)
3. lead — the hook. Start with a surprising angle, an anecdote, a paradox. 2-3 sentences.
4. 2-3 paragraphs (p with html field) — develop the argument with real examples, names, dates
5. pullquote — a striking original quote (preferably English from a scholar) with "— Author, Year"
6. 1-2 more paragraphs — land the argument
7. separator — end the section

Available item kinds:
- kicker: {kind:"kicker", text} — small caps label
- h2: {kind:"h2", text} — section heading
- lead: {kind:"lead", text} — larger opening paragraph
- p: {kind:"p", html} — paragraph (use html field!)
- dropcap: {kind:"dropcap", text} — paragraph with decorative first letter
- pullquote: {kind:"pullquote", text, cite} — featured quote
- bigNumber: {kind:"bigNumber", value, label} — e.g. "8.527" / "Artikel analysiert"
- callout: {kind:"callout", text} — highlighted info box
- highlight: {kind:"highlight", text} — marker-style emphasis
- separator: {kind:"separator"} — section end divider
- list: {kind:"list", ordered (bool), items (array of strings)}
- stepList: {kind:"stepList", items: [{title, body}]}
- factCheck: {kind:"factCheck", claim, verdict ("TRUE"/"FALSE"/"MISLEADING"), explanation}
- footnote: {kind:"footnote", marker, note}

Mix item kinds for visual variety. Never just a wall of "p" items.`,
  },

  Scrolly: {
    example: {
      scrollyId: 'scrolly-1',
      stepsId: 'steps-1',
      imageSize: 'medium',
      imageHeight: '80vh',
      imageRadius: '12px',
      maxWidth: '1400px',
      steps: [
        { stepIndex: 0, badgeKind: 'pyramid', badgeLabel: 'Pyramide', imageSrc: '', body: 'Eine Form erfindet die demokratische Oeffentlichkeit: Journalist:innen — nicht Maechtige — bestimmen, was das Wichtigste ist. Diese Entscheidung traegt eine Struktur: die umgekehrte Pyramide.' },
        { stepIndex: 1, badgeKind: 'data', badgeLabel: 'Summary Lead', imageSrc: '', body: 'Deutschland ist Weltmeister. — FAZ, 13. Juli 2014. Vier Woerter, vier W-Fragen beantwortet. Der Summary Lead in seiner reinsten Form: kein Spannungsbogen, kein Vorenthalten — das Ergebnis zuerst.' },
        { stepIndex: 2, badgeKind: 'future', badgeLabel: 'Umgelegte Pyramide', imageSrc: '', body: 'Canavilhas (2006) dreht die Logik um: statt von wichtig nach unwichtig — von innen nach aussen. Schicht 1: das nackte Was. Schicht 4: voller Kontext. Nutzer:innen waehlen ihre eigene Tiefe.' }
      ]
    },
    description: `Scrollytelling section: sticky image on the left, text cards scroll on the right. Each step has its own image that fades in when the step becomes active.

Fields:
- scrollyId (string): unique ID like "scrolly-1"
- stepsId (string): unique ID like "steps-1"
- imageSize (string): controls image column width. Use "small" (35%), "medium" (50%), "large" (65%), "full" (1fr), or any CSS value like "40%" or "300px". Default is full width.
- imageHeight (string): CSS height for the sticky image panel. Examples: "100vh" (full viewport), "80vh", "60vh", "400px". Default "100vh".
- imageRadius (string): border-radius for the image panel. Examples: "0" (sharp), "12px" (rounded), "24px" (very rounded). Default "0".
- maxWidth (string): max container width. Examples: "1400px" (wide), "1100px" (editorial), "900px" (narrow). Default "1400px".
- cardWidth (string): CSS width for the text card column. Examples: "minmax(320px,420px)" (default), "minmax(280px,360px)" (narrower cards). Default "minmax(320px,420px)".
- steps (array): each step has:
  - stepIndex (number): 0-based index
  - badgeKind (string): one of pyramid/data/explain/future/voice — pick based on content
  - badgeLabel (string): short label shown on the badge
  - imageSrc (string): URL of the image shown in the sticky panel when this step is active. Leave empty string if no image.
  - heading (string): optional step heading displayed above body text
  - body (string): 2-3 punchy sentences. Use em-dashes for drama. Concrete numbers and names. Do NOT embed <img> tags in body — use imageSrc instead.

Write 3-4 steps. Each step should reveal one insight, building on the previous.`,
  },

  Outro: {
    example: { h2: 'Die Pyramide lebt', paragraphs: ['Die umgekehrte Pyramide hat Diktaturen überlebt, Weltkriege, die Teilung eines Landes. Sie hat die Digitalisierung überlebt — wenn auch nicht unbeschadet.', 'Was sich ändert, ist nicht die Idee. Sondern das Medium, das sie trägt.'], finalLine: 'Die Pyramide stirbt nicht. Sie verwandelt sich.', sourcesHtml: 'Schudson, M. (1991) · Barnhurst, K. & Nerone, J. (2001) · Marinos, A. (2021)' },
    description: 'Closing section. Fields: h2 (heading), paragraphs (array of strings — each a punchy paragraph), finalLine (the final emphasized thesis statement), sourcesHtml (academic citations separated by " · ").',
  },

  StatRow: {
    example: { title: 'In Zahlen', stats: [{ value: '8.527', label: 'Artikel analysiert' }, { value: '100', label: 'Jahre Pressegeschichte' }, { value: '40%', label: 'Pyramidenanteil über Jahrzehnte' }] },
    description: 'Row of 2-4 large statistics. Fields: title (optional heading), stats (array of {value, label}). Use specific numbers, not vague ones.',
  },

  Timeline: {
    example: { title: 'Meilensteine der Nachrichtenform', events: [{ date: '1690', title: 'Tobias Peucer', body: 'Erste akademische Arbeit über Nachrichtenauswahl — „De relationibus novellis" in Leipzig.' }, { date: '1924', title: 'Warren im deutschen Markt', body: 'Carl N. Warrens „Modern News Reporting" wird zum Standardwerk. Die Pyramide erreicht Deutschland systematisch.' }] },
    description: 'Vertical timeline of dated events. Fields: title (optional heading), events (array of {date, title, body}). Each event should be specific — real dates, real names, real significance.',
  },

  Aside: {
    example: { tone: 'info', title: 'Was ist der Summary Lead?', body: 'Der Summary Lead fasst die wichtigsten W-Fragen (Wer, Was, Wann, Wo, Warum) im ersten Absatz zusammen. Er wurde Ende des 19. Jahrhunderts im US-Journalismus entwickelt und verbreitete sich im 20. Jahrhundert weltweit.\n\nDer Begriff geht auf die Metapher der „umgekehrten Pyramide" zurück: Das Wichtigste steht oben, Details folgen in abnehmender Relevanz.' },
    description: 'Highlighted callout box. Fields: tone (info/warning/tip/neutral), title (optional), body (text, use \\n\\n for paragraph breaks). Use for context, definitions, or background that enriches the narrative.',
  },

  ChapterDivider: {
    example: { number: 'II', title: 'Die Stabilität', subtitle: 'Ein Jahrhundert der Kontinuität' },
    description: 'Chapter break between major sections. Fields: number (Roman numeral or label), title (the chapter theme), subtitle (optional — a more evocative subtitle).',
  },

  Quote: {
    example: { text: 'The summary lead was a literary invention that asserted the journalist\'s authority to define for readers the most important element of a news event.', attribution: 'Michael Schudson', role: 'Historiker, Columbia University', portraitSrc: '', sourceUrl: '', sourceLabel: 'Discovering the News, 1991' },
    description: 'Featured money quote — large display. Fields: text (the quote, no surrounding marks), attribution (name), role (optional — title/affiliation), portraitSrc (leave empty), sourceUrl (optional), sourceLabel (optional). Prefer original-language quotes from recognized scholars/journalists.',
  },

  VideoEmbed: {
    example: { url: 'https://www.youtube.com/watch?v=example', caption: 'Die umgekehrte Pyramide erklärt in 3 Minuten', credit: 'via Deutschlandfunk' },
    description: 'Video embed. Fields: url (YouTube/Vimeo URL), caption (informative description), credit (source attribution).',
  },

  DataScrolly: {
    example: {
      title: 'Internet Users by Region', subtitle: 'Percentage of population online, 2000–2023', source: 'ITU World Telecommunication Indicators (2024)',
      chartSpec: { kind: 'bar', xField: 'year', yField: 'percent', xLabel: 'Year', yLabel: 'Internet users (% of population)',
        data: [
          { year: '2000', percent: 6.7 }, { year: '2003', percent: 12.3 }, { year: '2005', percent: 15.8 },
          { year: '2007', percent: 20.6 }, { year: '2010', percent: 29.3 }, { year: '2012', percent: 35.1 },
          { year: '2015', percent: 43.4 }, { year: '2017', percent: 48.7 }, { year: '2020', percent: 59.5 },
          { year: '2023', percent: 67.4 },
        ],
      },
      steps: [
        { badgeKind: 'data', badgeLabel: 'Overview', body: 'In 2000, fewer than 7% of the world population was online. The internet was still a luxury — concentrated in wealthy nations with fixed broadband.', vizState: {} },
        { badgeKind: 'data', badgeLabel: 'Growth', body: 'By 2010, nearly a third of humanity had internet access. Mobile broadband was the catalyst — bringing connectivity to regions that had never seen a landline.', vizState: { highlightX: '2010', annotation: '29.3%' } },
        { badgeKind: 'explain', badgeLabel: 'Acceleration', body: 'The smartphone revolution drove the steepest climb. Between 2010 and 2020, a billion new users came online — mostly in Sub-Saharan Africa and South Asia.', vizState: { highlightX: '2020', annotation: '59.5%', chartType: 'line' } },
        { badgeKind: 'future', badgeLabel: 'Today', body: 'By 2023, two-thirds of the world is connected. But 2.6 billion people remain offline — nearly all in the Global South. The digital divide is narrowing, but far from closed.', vizState: { highlightX: '2023', annotation: '67.4%', chartType: 'area' } },
      ],
    },
    description: `Data-driven scrolly with D3 animated chart. NYT/Reuters-quality data storytelling with fluid animated transitions between chart types.

CRITICAL RULES — follow these exactly or the chart will look broken:
1. DATA MINIMUM: chartSpec.data MUST have at least 6 data points. 8-12 is ideal. NEVER use fewer than 6.
2. REAL DATA: Use real, plausible data with specific numbers. Research actual statistics for the topic. If you cannot find exact numbers, use well-informed estimates clearly labeled in the source field as "estimated based on [reason]".
3. NARRATIVE-DATA SYNC: Every number mentioned in a step's body text MUST exist in chartSpec.data. If a step says "reached 59.5%", then { percent: 59.5 } must be in the data array. NEVER reference numbers that aren't in the chart.
4. HIGHLIGHTX MATCH: Every vizState.highlightX value MUST exactly match an xField value in the data array. If xField values are strings like "2010", use highlightX: "2010" (string). If numbers, use numbers.
5. ANNOTATION MATCH: vizState.annotation should show the actual y-value for the highlighted point, formatted with units (e.g. "29.3%", "$4.2T", "1,200").
6. PROGRESSIVE REVELATION: Step 1 shows the overview (no highlight). Steps 2+ each highlight ONE data point and explain its significance. At least one step should morph the chart type.
7. STEP COUNT: Use 4-5 steps minimum. Each reveals ONE new insight. No step should repeat what a previous step said.
8. DESCRIPTIVE LABELS: xLabel and yLabel must be descriptive with units in parentheses, e.g. "GDP per capita (USD)", "Year", "Share of articles (%)". Never use generic labels like "x" or "value".
9. SOURCE CITATION: The source field must name the actual data source (institution, publication, year). If using estimates, say "Author estimate based on [source]".
10. CHART TYPE STRATEGY: Start with "bar" for overview, use "line" to show trends over time, "area" to emphasize cumulative growth, "scatter" for correlation. Every DataScrolly needs at least one chartType morph.

Fields:
- title (string): descriptive chart title, states what is being measured
- subtitle (string): adds detail — time period, geographic scope, or methodology note
- source (string): data source citation with year
- chartSpec: { kind: "bar"|"line"|"area"|"scatter", xField, yField, xLabel, yLabel, data: [{...}] }
  - kind: initial chart type (first step uses this)
  - xField/yField: keys in data objects to map to axes
  - xLabel/yLabel: axis labels with units
  - data: array of objects, each with at least xField and yField keys. MINIMUM 6 items.
- steps: array of { badgeKind, badgeLabel, body, vizState }
  - badgeKind: "data"|"explain"|"future"|"pyramid"|"voice" — sets the step badge color
  - badgeLabel: 1-2 word label (e.g. "Overview", "Peak", "Turning Point", "Today")
  - body: 2-3 sentences of narrative. Reference specific data points. Use em-dashes for drama.
  - vizState: { chartType?, highlightX?, annotation?, filter?, sort? }
    - chartType: morphs chart with animation (bars shrink to dots, dots connect into lines, etc.)
    - highlightX: value matching xField — highlights with pulsing accent dot and vertical rule
    - annotation: text pill shown above highlighted point
    - filter: { field: "col", values: ["a","b"] } — filters visible data
    - sort: "ascending"|"descending" — reorders bars with animation`,
  },

  VizPanel: {
    example: { initialTitle: 'Die umgekehrte Pyramide', initialSub: 'nach Marinos (2021, S. 10)' },
    description: 'Visualization panel header. Fields: initialTitle (chart title), initialSub (subtitle with citation).',
  },

  ImageCompare: {
    example: {
      mode: 'slider',
      beforeSrc: '/images/berlin-1945.jpg',
      beforeLabel: '1945',
      afterSrc: '/images/berlin-2024.jpg',
      afterLabel: '2024',
      initialPosition: 50,
      caption: 'Der Potsdamer Platz — 80 Jahre zwischen Trümmern und Hochhäusern.',
      credit: 'Archiv / Eigene Aufnahme'
    },
    description: `Before/after image comparison with a draggable slider. Shows two images overlapping with a vertical divider the user can drag to reveal one vs the other.

Fields:
- mode (string): "slider" (default) — draggable vertical divider
- beforeSrc (string): URL of the "before" image
- beforeLabel (string): short label, e.g. "1945"
- afterSrc (string): URL of the "after" image
- afterLabel (string): short label, e.g. "2024"
- initialPosition (number 0-100): starting divider position as %, default 50
- caption (string): informative caption explaining what changed and why it matters
- credit (string): photo credit / source

WRITING RULES: Caption should explain the significance, not just describe. Labels should be specific dates or states, not generic "Before/After".`,
  },

  ImageHotspot: {
    example: {
      src: '/images/pyramid-diagram.png',
      alt: 'Die umgekehrte Pyramide — Aufbau',
      hotspots: [
        { x: 50, y: 12, icon: 'number', label: '1', title: 'Der Lead', body: 'Die wichtigste Information in 1-2 Sätzen. Wer, was, wann, wo — das Ergebnis zuerst.' },
        { x: 50, y: 38, icon: 'number', label: '2', title: 'Der Kontext', body: 'Hintergründe, Zitate, Einordnung. Was bedeutet das Ereignis? Warum jetzt?' },
        { x: 50, y: 65, icon: 'number', label: '3', title: 'Die Details', body: 'Zusätzliche Fakten, Zahlen, historischer Kontext. Absteigend nach Relevanz.' },
        { x: 50, y: 88, icon: 'pulse', label: '4', title: 'Kann wegfallen', body: 'Hintergrundinformation, die ohne Informationsverlust gestrichen werden kann.' },
      ],
      caption: 'Anatomie einer Nachricht: Die umgekehrte Pyramide im Querschnitt.',
      credit: 'Grafik: Eigene Darstellung'
    },
    description: `Annotated image with numbered or pulsing interactive markers. Clicking a marker reveals a tooltip.

Fields:
- src (string): URL of the background image
- alt (string): accessible description
- hotspots (array): each has x (0-100), y (0-100), icon ("number" or "pulse"), label (1-3 chars), title, body (supports HTML)
- caption (string): overall caption
- credit (string): image credit

WRITING RULES: Each hotspot teaches one thing. Title is 2-4 words. Body is 1-2 sentences max. 3-6 hotspots total.`,
  },

  AccordionBlock: {
    example: {
      title: 'Methodik',
      multiOpen: false,
      items: [
        { heading: 'Wie wurden die Daten erhoben?', body: 'Wir analysierten 8.527 Artikel aus fünf Tageszeitungen (FAZ, SZ, taz, BILD, Die Welt) im Zeitraum 1924 bis 2024. Die Auswahl erfolgte als Zufallsstichprobe mit Schichtung nach Jahrzehnt und Zeitung.', defaultOpen: false },
        { heading: 'Was gilt als umgekehrte Pyramide?', body: 'Ein Artikel wurde als Pyramidenform klassifiziert, wenn der erste Absatz mindestens drei der fuenf W-Fragen beantwortet und die folgenden Absaetze in absteigender Informationsrelevanz angeordnet sind.', defaultOpen: false },
        { heading: 'Einschraenkungen', body: 'Die Studie erfasst nur Printausgaben und deren Digitalarchive. Rein digitale Formate wie Liveblogs oder Social-Media-Posts wurden nicht beruecksichtigt.', defaultOpen: false },
      ]
    },
    description: `Collapsible accordion for methodology, FAQ, glossary, or supplementary content.

Fields:
- title (string): optional heading above the accordion
- multiOpen (boolean): if true, multiple items can be open at once. Default false.
- items (array): each has heading (string), body (string, plain text, one paragraph per item), defaultOpen (boolean)

WRITING RULES: Use for content that's important but would disrupt narrative. Headings should be questions when possible. Keep body text to a single paragraph per item — concise and direct.`,
  },

  ProgressNav: {
    example: {
      mode: 'bar',
      autoGenerate: true,
      showPercentage: false,
    },
    description: `Reading progress bar fixed at the top of the viewport. Optionally shows chapter navigation dots on the right side. Auto-detects ChapterDivider blocks.

Fields:
- mode (string): "bar" (thin progress line at top — default)
- autoGenerate (boolean): if true (default), auto-creates chapter dots from ChapterDivider blocks
- chapters (array, optional): manual chapter list, each { id, label }
- showPercentage (boolean): default false

IMPORTANT: This block should be the FIRST block in the page's block list.`,
  },

  EmbedBlock: {
    example: {
      provider: 'datawrapper',
      url: 'https://datawrapper.dwcdn.net/abc123/',
      aspectRatio: 'auto',
      maxWidth: '720px',
      caption: 'Quelle: Statistisches Bundesamt, eigene Berechnung',
      lazyLoad: true,
    },
    description: `Responsive embed container for third-party content: Datawrapper, Flourish, social media, Spotify, or any iframe URL.

Fields:
- provider (string): "datawrapper", "flourish", "twitter", "instagram", "spotify", or "custom"
- url (string): the embed URL
- embedHtml (string, optional): raw HTML embed code instead of url
- aspectRatio (string): "16:9", "4:3", "1:1", or "auto" (default, best for Datawrapper)
- maxWidth (string): CSS max-width, e.g. "720px"
- caption (string): source attribution
- lazyLoad (boolean): default true
- fallbackImage (string, optional): static image fallback

For Datawrapper, always use aspectRatio "auto" — Datawrapper sends its own height via postMessage.`,
  },

  ImageGrid: {
    example: {
      layout: 'wide',
      title: '',
      images: [
        { src: 'https://example.com/photo1.jpg', alt: 'Newsroom in the 1920s', caption: 'The FAZ newsroom, circa 1924' },
        { src: 'https://example.com/photo2.jpg', alt: 'Modern digital newsroom', caption: 'A digital-first newsroom in 2024' },
        { src: 'https://example.com/photo3.jpg', alt: 'Printing press', caption: 'Rotary press at the Berliner Tageblatt' }
      ],
      caption: 'Photos: Bundesarchiv, DPA',
      credit: ''
    },
    description: `Smart image grid with auto-layout. Detects the number of images and picks the best grid arrangement automatically. Supports natural language layout hints.

Fields:
- layout (string): controls width and arrangement. Accepts natural language:
  - Width: "editorial" (narrow 720px), "wide" (1100px, default), "full" (edge-to-edge), "bleed" (beyond container)
  - Arrangement: "2 grid" (2 columns), "3 columns", "masonry", "row" (single horizontal strip), "stack" (vertical)
  - Or combine: "wide 3 grid", "bleed masonry", "editorial 2 columns"
  - If empty, auto-detects best layout from image count (1=hero, 2=side-by-side, 3=1big+2small, 4=2x2, 5=reuters, 6=3x2)
- title (string, optional): heading above the grid
- images (array): each image has:
  - src (string): image URL
  - alt (string): accessibility description
  - caption (string, optional): hover caption overlay
  - span (number, optional): set to 2 to make image span two columns
  - wide (boolean, optional): same as span:2
  - tall (boolean, optional): span two rows
- caption (string, optional): overall caption below the grid
- credit (string, optional): photo credit line

The user may paste raw image URLs — put each URL as a src in the images array. Generate meaningful alt text and captions.`,
  },

  Map2D: {
    example: {
      title: 'Die Reise der Nachricht',
      subtitle: 'Von Berlin nach Frankfurt — 1900',
      source: 'Bundesarchiv',
      height: '100vh',
      maxWidth: '1400px',
      layout: 'side',
      tileStyle: 'toner-lite',
      initialCenter: [51.5, 10.5],
      initialZoom: 6,
      flyDuration: 2,
      scrollZoom: false,
      markers: [
        { id: 'berlin', lat: 52.52, lng: 13.405, label: '1', name: 'Berlin', popupHtml: '<strong>Berlin</strong><br>Hauptredaktion der Vossischen Zeitung', color: '#c06830' },
        { id: 'frankfurt', lat: 50.11, lng: 8.68, label: '2', name: 'Frankfurt', popupHtml: '<strong>Frankfurt</strong><br>Druckerei und Vertrieb', color: '#5d8fa8' }
      ],
      routes: [
        { id: 'route-main', points: [[52.52,13.405],[52.1,12.8],[51.65,12.1],[51.34,11.4],[50.93,10.5],[50.55,9.6],[50.11,8.68]], color: '#c06830', weight: 2, animate: true, label: 'Telegrafenlinie' }
      ],
      areas: [],
      steps: [
        { badgeKind: 'pyramid', badgeLabel: 'Start', body: 'Im Berliner Presseviertel beginnt die Reise jeder Meldung.', mapState: { center: [52.52, 13.405], zoom: 14, showMarkers: ['berlin'], showAreas: [], animateRoute: null } },
        { badgeKind: 'data', badgeLabel: 'Unterwegs', body: 'Per Telegraf reist die Nachricht 500 km nach Sueden.', mapState: { center: [51.34, 12.37], zoom: 8, showMarkers: ['berlin'], animateRoute: 'route-main' } },
        { badgeKind: 'future', badgeLabel: 'Ankunft', body: 'In Frankfurt erreicht sie die Druckerei.', mapState: { center: [50.11, 8.68], zoom: 13, showMarkers: ['berlin', 'frankfurt'], animateRoute: 'route-main' } }
      ],
      caption: '',
      credit: 'Kartendaten: OpenStreetMap'
    },
    description: `Scrollytelling map — sticky interactive map with story cards. Like NYT/WaPo geographic storytelling.

CRITICAL RULES — follow these exactly or the map will break:
1. Route endpoints MUST exactly match marker coordinates. If marker "berlin" is at [52.52, 13.405], the route MUST start or end at exactly [52.52, 13.405]. No approximations.
2. Use real, accurate coordinates for every place. Look up actual lat/lng.
3. Routes need 5-10 waypoints following the real geographic path (roads, shipping lanes, flight arcs). Never draw straight lines between distant points.
4. Every marker referenced in showMarkers must exist in the markers array.
5. Every route referenced in animateRoute must exist in the routes array.
6. The first step should NOT animate a route — it sets the scene. Route animation starts from step 2+.
7. Step center coordinates should match or be near the action (a marker, a route midpoint).
8. Use "behind" layout for immersive stories, "side" for analytical/data stories.

Fields:
- title, subtitle, source (strings, optional)
- height: "100vh" (default), "80vh", "60vh"
- maxWidth: "100%" (default for behind), "1400px" (for side)
- layout: "behind" (fullscreen map, cards float) or "side" (map left, cards right)
- tileStyle: "default" (clean, no labels — best), "toner-lite" (light labels), "dark", "watercolor", "osm"
- initialCenter: [lat, lng] — starting view
- initialZoom: 1-18. World=3, continent=4, country=6, region=9, city=12, street=16
- flyDuration: seconds for transitions. Default 2.

markers array — each: { id, lat, lng, label, name, popupHtml, color }
- label: "1", "2", "A", etc. (shown on dot)
- name: place name below dot. ALWAYS set — tiles have no labels.
- color: hex. Default "#c06830". Use different colors for origin vs destination.

routes array — each: { id, points, color, weight, animate, label, dashArray }
- points: [[lat,lng], ...] — 5-10 waypoints. FIRST point = origin marker coords. LAST point = destination marker coords.
- weight: line thickness. Default 2. Use 1.5 for secondary routes, 2 for primary.
- dashArray: "8,5" for dashed (sea routes, flights), null for solid (roads, rails)

areas array — each: { id, points, color, fillOpacity }

steps array — each: { badgeKind, badgeLabel, heading, body, mapState }
- badgeKind: pyramid/data/explain/future/voice
- heading: short title for this step
- body: 2-3 punchy sentences
- mapState: { center, zoom, showMarkers, showAreas, animateRoute, tileStyle, fitBounds }
  - showMarkers: IDs of markers visible this step
  - animateRoute: route ID to draw, or null
  - fitBounds: true to auto-zoom to all visible features

Example route connecting markers correctly:
  markers: [{ id:"a", lat:52.52, lng:13.405, ... }, { id:"b", lat:50.11, lng:8.68, ... }]
  routes: [{ id:"r1", points:[[52.52,13.405],[52.1,12.3],[51.3,11.0],[50.8,9.5],[50.11,8.68]], ... }]
  ↑ First point = marker "a" coords, Last point = marker "b" coords. Middle points follow the real path.

credit: "OpenStreetMap" (always include)`,
  },

  FullscreenImage: {
    example: {
      imageSrc: '/images/berlin-reichstag-night.jpg',
      imageAlt: 'Der Reichstag bei Nacht, beleuchtet von innen',
      kicker: 'INVESTIGATION',
      title: 'Die Nacht, die alles <span>veränderte</span>',
      subtitle: 'Als die Nachricht schneller wurde als die Wahrheit.',
      body: '',
      overlayPosition: 'bottom-left',
      scrimOpacity: 0.45,
      scrimDirection: 'bottom',
      kenBurns: true,
      scrollCue: false,
      caption: 'Der Reichstag, Februar 1933 — Symbol einer Zeitenwende.',
      credit: 'Foto: Bundesarchiv'
    },
    description: `Full-viewport immersive image with text overlay. 100vh image-only hero with Ken Burns animation and flexible overlay positions.

Fields:
- imageSrc (string): image URL
- imageAlt (string): alt text for accessibility
- kicker (string, optional): small category label above the title (e.g. "INVESTIGATION", "CHAPTER 3")
- title (string): big display heading. Supports inline HTML — use <span>word</span> for accent color.
- subtitle (string, optional): one-line subtitle below the title
- body (string, optional): short paragraph below subtitle
- overlayPosition (string): "bottom-left" (default), "bottom-right", "center", "top-left"
- scrimOpacity (number 0-1): gradient darkness over the image. Default 0.45.
- scrimDirection (string): "bottom" (default — darkens toward bottom), "top" (darkens toward top), "radial" (darkens from center outward)
- kenBurns (boolean): subtle slow zoom animation on the image. Default true.
- scrollCue (boolean): show a bouncing "scroll" indicator at bottom center. Default false.
- caption (string, optional): image caption below the block
- credit (string, optional): photographer credit

WRITING RULES: Title should be dramatic, 3-6 words. Kicker is uppercase, 1-2 words max. Caption explains significance, not just description.`,
  },

  AudioPlayer: {
    example: {
      audioSrc: '/audio/episode-01.mp3',
      title: 'Die Stimme der Pyramide',
      subtitle: 'PODCAST · FOLGE 1',
      description: 'Wie eine journalistische Form die demokratische Öffentlichkeit erfand — und warum sie heute wichtiger ist denn je.',
      duration: '4:32',
      waveformColor: '#c06830',
      accentColor: '#c06830',
      coverSrc: '/images/podcast-cover.jpg',
      transcript: '',
      caption: '',
      credit: 'Produktion: Birkner Media Lab'
    },
    description: `Audio player block — clean, professional design with waveform visualization, play/pause, progress bar, and time display.

Fields:
- audioSrc (string): audio file URL
- title (string): episode or clip title
- subtitle (string, optional): series name or context (displayed as small caps above title)
- description (string, optional): 1-2 sentence description of the audio content
- duration (string, optional): human-readable duration like "4:32"
- waveformColor (string): hex color for waveform bars. Default uses accent color.
- accentColor (string): play button and progress bar color. Default uses accent color.
- coverSrc (string, optional): cover art image URL
- transcript (string, optional): full transcript text (expandable by user)
- caption (string, optional): caption below the player
- credit (string, optional): production credit

WRITING RULES: Title should be evocative, not generic. Subtitle is uppercase series/context. Description hooks the listener in 1-2 sentences.`,
  },

  FullBleed: {
    example: {
      mediaSrc: '/images/redaktion-1924.jpg',
      mediaType: 'image',
      overlayPosition: 'bottom-left',
      scrimOpacity: 0.45,
      height: '100vh',
      title: 'Der Wandel beginnt',
      subtitle: 'Als das Papier verschwand, musste der Journalismus sich neu erfinden.',
      body: 'Die Digitalisierung brachte nicht nur neue Kanäle — sie veränderte die DNA der Nachricht selbst.'
    },
    description: `Full-bleed viewport-height media block — the "Snow Fall" signature. A large image or looping video fills the entire viewport, with text floating on top over a gradient scrim.

Fields:
- mediaSrc (string): URL of the background image
- mediaType (string): "image" (default), "video", or "loop" (autoplaying muted video)
- videoSrc (string): URL of the video file (if mediaType is video/loop)
- posterSrc (string): poster image for video (shown while loading)
- overlayPosition (string): "center", "bottom-left" (default), or "bottom-right"
- scrimOpacity (number 0-1): darkness of the gradient overlay, default 0.4
- height (string): "100vh" (default), "75vh", or "50vh"
- title (string): large display heading, supports inline HTML
- subtitle (string): one-line subtitle
- body (string): optional short paragraph, supports inline HTML

WRITING RULES for FullBleed:
- Title should be dramatic, 3-6 words max. Use <span>word</span> for one accent word.
- Subtitle is the thesis in one sentence. Evocative, not descriptive.
- Body is optional — only if the image needs narrative context. Keep under 2 sentences.`,
  },
  Parallax: {
    example: {
      backgroundSrc: '',
      backgroundAlt: 'Mountain landscape',
      midgroundSrc: '',
      midgroundAlt: 'Trees in mid-distance',
      foregroundSrc: '',
      foregroundAlt: 'Flowers in foreground',
      headline: 'Die Tiefe der Geschichte',
      subtitle: 'Drei Ebenen, ein Augenblick — Parallax erzählt räumlich.',
      overlayPosition: 'center',
      tint: 'dark',
    },
    description: `Layered depth parallax block — 2-3 images shift at different scroll speeds for cinematic immersion. Used as chapter openers or dramatic section breaks.

Fields:
- backgroundSrc (string): URL of the deepest/slowest layer image
- backgroundAlt (string): alt text for background
- midgroundSrc (string): URL of the middle layer image (optional)
- midgroundAlt (string): alt text for midground
- foregroundSrc (string): URL of the closest/fastest layer image (optional)
- foregroundAlt (string): alt text for foreground
- headline (string): large display heading overlaid on the parallax
- subtitle (string): one-line subtitle
- overlayPosition (string): "center" (default), "bottom-left", "bottom-right", or "top-left"
- tint (string): "dark" (default), "light", or "none"

WRITING RULES for Parallax:
- Headline: dramatic, 3-6 words. This is a chapter opener.
- Subtitle: evocative single sentence, not descriptive.
- Image fields are URLs — leave empty strings if no images are provided (user uploads separately).
- tint "dark" is best for light text on dark images, "light" for dark landscapes.`,
  },
};

// ── Per-type improve rules (token savings: only send relevant rules) ──
const IMPROVE_RULES = {
  _universal: [
    'Keep all existing fields unless the user explicitly asks to change them',
    'Every block supports "bgOpacity" (number 0-1) to control page background image visibility. "show background" → bgOpacity 0.3. "hide background" → bgOpacity 0. "strong background" → bgOpacity 0.5-0.8.',
    'ALWAYS return the complete data object with ALL fields, not just the changed ones',
  ],
  ImageGrid: [
    '"make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)',
    '"bigger" or "wider" or "full width" → layout "bleed" or "full"',
    '"2 grid" or "3 columns" etc → set layout field accordingly',
    '"remove image 2" or "swap images" → modify images array',
    '"add caption" or "change credit" → update those fields',
    '"make the image half size" → layout "editorial" for narrow',
  ],
  Scrolly: [
    '"remove images" → clear imageSrc fields. "add image to step 3" → set imageSrc on that step',
    '"make images smaller" → imageSize "small" (35%). "bigger" → "large" (65%). "medium" → "medium" (50%). "full width" → "full". Or exact values like "40%".',
    '"make images shorter" or "less tall" → imageHeight "60vh" or "70vh". "taller" → "100vh".',
    '"round corners" → imageRadius "12px" or "24px". "sharp" or "no radius" → "0".',
    '"narrower layout" → reduce maxWidth (e.g. "1100px"). "wider" → increase (e.g. "1600px").',
  ],
  Map2D: [
    '"zoom in" → increase initialZoom or step mapState.zoom by 2. "zoom out" → decrease by 2.',
    '"focus on [city]" → change initialCenter to that city\'s real coordinates and set initialZoom to 13.',
    '"add marker at [place]" → add to markers array with real lat/lng, unique id, and add id to relevant step\'s showMarkers.',
    '"draw route from A to B" → add route. CRITICAL: first point = origin marker [lat,lng], last point = destination marker [lat,lng]. Add 5-8 intermediate waypoints following the real path. Route weight should be 2.',
    '"dark map" → tileStyle "dark". "watercolor" → "watercolor". "b&w" → "toner". "clean" → "toner-lite".',
    '"behind layout" or "fullscreen" → layout "behind". "side layout" → "side".',
    'When editing routes, ALWAYS verify route start/end points match the connected markers\' exact lat/lng coordinates.',
    '"thinner lines" → reduce route weight (min 1). "thicker" → increase (max 4). "dashed" → dashArray "8,5".',
  ],
  DataScrolly: [
    '"more data" or "add data points" → add more entries to chartSpec.data (minimum 6 total, aim for 8-12).',
    '"better data" or "use real data" → replace generic values with realistic, specific numbers. Update source field.',
    '"add step" → add a new step with unique vizState (highlight a different data point, morph chart type, or add filter).',
    '"bar chart" → chartSpec.kind "bar" and reset chartType overrides. "line chart" → "line". "area" → "area". "scatter" → "scatter".',
    '"fix labels" or "better labels" → update xLabel and yLabel to be descriptive with units in parentheses.',
    '"add source" → set a plausible academic/institutional source citation.',
    'ALWAYS ensure every highlightX in steps matches an xField value in the data, and every number mentioned in step body text exists in the data.',
  ],
  FullscreenImage: [
    '"darker overlay" or "darker" → increase scrimOpacity. "lighter" → decrease.',
    '"center text" → overlayPosition "center". "top-left" → overlayPosition "top-left".',
    '"add kicker" → set kicker field. "no animation" → kenBurns false.',
    '"scroll indicator" or "scroll cue" → scrollCue true. "no scrim" → scrimOpacity 0.',
  ],
  AudioPlayer: [
    '"change color" → update accentColor and waveformColor.',
    '"add transcript" → set transcript text. "shorter description" → trim description.',
    '"remove cover" → clear coverSrc. "add cover" → set coverSrc.',
  ],
};

function buildSystemPrompt(type, mode, lang, direct) {
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) return null;

  const langHint = lang
    ? `\nIMPORTANT: The page language is "${lang}". Generate ALL content in ${lang === 'de' ? 'German' : lang === 'en' ? 'English' : lang === 'tr' ? 'Turkish' : lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang}. Do NOT use any other language.`
    : '\nIMPORTANT: Detect the language from the user prompt and generate ALL content in that same language.';

  // ── Direct mode: structure text as-is, NO rewriting ──
  if (direct) {
    return `You are a content STRUCTURING engine for ScrollyCMS. Your job is to take raw text and place it into the correct JSON fields for a "${type}" block.

ABSOLUTELY CRITICAL — DIRECT MODE RULES:
1. DO NOT rewrite, rephrase, enhance, expand, or modify any text. Use the EXACT words the user provided.
2. DO NOT add sentences, paragraphs, or content that wasn't in the original text.
3. DO NOT change tone, style, grammar, or punctuation. Preserve everything verbatim.
4. Your ONLY job is to identify which text goes into which field — title, body, paragraphs, etc.
5. Return ONLY valid JSON — no markdown fences, no explanation, no wrapping.

How to split text into fields for "${type}":
- First line (if short, under ~80 chars) → title / h2 / heading field
- Second short line → subtitle / kicker if applicable
- Remaining text → body / paragraphs / content items
- If improving existing data, only replace the text content fields. Keep all non-text fields (layout, images, styles, coordinates, etc.) unchanged.

The JSON must match this schema:
${schema.description}

Example structure:
${JSON.stringify(schema.example)}

${mode === 'improve' ? 'You are updating an existing block. The current data is provided. Replace ONLY the text content fields with the new text (verbatim). Keep all other fields (images, layout, style, coordinates, etc.) exactly as they are. Return the COMPLETE data object.' : 'Create a new block by placing the provided text into the correct fields. For any non-text fields (images, layout, etc.), use sensible defaults from the example.'}`;
  }

  // ── AI Enhanced mode (original behavior) ──
  return `You are the content engine for ScrollyCMS — a platform for creating premium scrollytelling stories with interactive visualizations and rich narrative.

${VOICE_GUIDE}
${langHint}

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation, no wrapping. Just the raw JSON object.
2. The JSON must match this exact schema for block type "${type}":

${schema.description}

Example output (note: examples may be in German — adapt to the correct language):
${JSON.stringify(schema.example)}

${mode === 'improve' ? (() => {
    const typeRules = IMPROVE_RULES[type] || [];
    const allRules = [...IMPROVE_RULES._universal, ...typeRules];
    return `You are IMPROVING an existing block. The user's current data is provided — apply their requested changes and return the COMPLETE updated data object.

IMPROVE RULES:
${allRules.map(r => `- ${r}`).join('\n')}`;
  })() : 'You are creating a NEW block from scratch based on the user prompt. Write in the SAME language the user used.'}`;
}

function validateBlockData(type, data) {
  if (!data || typeof data !== 'object') return 'Response is not a valid object';

  const REQUIRED_FIELDS = {
    Hero: ['titleHtml'],
    Editorial: ['content'],
    FullscreenImage: ['imageSrc', 'title'],
    FullBleed: ['title'],
    Parallax: ['headline'],
    Quote: ['text'],
    Aside: ['title', 'body'],
    Outro: ['h2'],
    ChapterDivider: ['title'],
    Scrolly: ['steps'],
    DataScrolly: ['steps'],
    Map2D: ['steps'],
    AudioPlayer: ['audioSrc'],
    StatRow: ['stats'],
    Timeline: ['events'],
    ImageCompare: ['beforeSrc', 'afterSrc'],
    ImageHotspot: ['imageSrc', 'hotspots'],
    AccordionBlock: ['items'],
    ImageGrid: ['images'],
    VizPanel: ['spec'],
    VideoEmbed: ['src'],
    EmbedBlock: ['html'],
    ProgressNav: ['items'],
    Separator: [],
    Figure: ['images'],
  };

  const required = REQUIRED_FIELDS[type];
  if (!required) return null; // unknown type, skip validation

  const missing = required.filter(f => data[f] === undefined || data[f] === null);
  if (missing.length > 0) return `Missing required fields: ${missing.join(', ')}`;

  // Array fields must be arrays
  const ARRAY_FIELDS = ['content', 'steps', 'stats', 'events', 'hotspots', 'items', 'images', 'paragraphs'];
  for (const f of ARRAY_FIELDS) {
    if (data[f] !== undefined && !Array.isArray(data[f])) {
      return `Field '${f}' must be an array, got ${typeof data[f]}`;
    }
  }

  return null; // valid
}

// DataScrolly quality assessment — extracted to functions/lib/datascrolly-quality.js for testability
// In Cloudflare Workers ESM context we can't require(), so we inline-import at module level.
// The canonical source is functions/lib/datascrolly-quality.js (CJS for Node tests).
// To keep a single source of truth without a build step, we duplicate the function here
// via a thin wrapper that delegates to the same logic.
// NOTE: If you change the scoring logic, update functions/lib/datascrolly-quality.js too.

function assessDataScrollyQuality(type, data) {
  if (type !== 'DataScrolly' || !data) return null;
  const warnings = [];
  let score = 100;

  const spec = data.chartSpec || {};
  const chartData = Array.isArray(spec.data) ? spec.data : [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const xF = spec.xField || 'x';
  const yF = spec.yField || 'y';

  if (chartData.length < 3) {
    warnings.push('Very few data points (' + chartData.length + '). Add more data for a meaningful chart.');
    score -= 40;
  } else if (chartData.length < 6) {
    warnings.push('Only ' + chartData.length + ' data points. Consider adding more for richer visualization.');
    score -= 15;
  }

  const yValues = chartData.map(d => +d[yF]).filter(v => !isNaN(v));
  const allRound = yValues.length > 2 && yValues.every(v => v % 5 === 0 || v % 10 === 0);
  const allSimple = yValues.length > 0 && yValues.every(v => v <= 100 && v === Math.round(v));
  const isSequential = yValues.length >= 3 && yValues.every((v, i) => i === 0 || v > yValues[i - 1]);
  if (allRound && allSimple && isSequential && yValues[0] <= 10) {
    warnings.push('Data values look like placeholders (10, 20, 30...). Replace with real data for the topic.');
    score -= 30;
  }

  const xLabel = (spec.xLabel || '').toLowerCase();
  const yLabel = (spec.yLabel || '').toLowerCase();
  if (['x', 'value', 'label', 'category', ''].includes(xLabel)) {
    warnings.push('X-axis label is generic ("' + spec.xLabel + '"). Use a descriptive label with units.');
    score -= 10;
  }
  if (['y', 'value', 'count', ''].includes(yLabel)) {
    warnings.push('Y-axis label is generic ("' + spec.yLabel + '"). Use a descriptive label with units.');
    score -= 10;
  }

  if (!data.source || data.source.length < 5) {
    warnings.push('No data source cited. Add a source for credibility.');
    score -= 10;
  }

  const xValues = new Set(chartData.map(d => String(d[xF])));
  steps.forEach((s, i) => {
    const hx = s.vizState?.highlightX;
    if (hx != null && !xValues.has(String(hx))) {
      warnings.push('Step ' + (i + 1) + ' highlights "' + hx + '" which doesn\'t exist in the chart data.');
      score -= 10;
    }
  });

  const hasMorph = steps.some(s => s.vizState?.chartType);
  if (!hasMorph && steps.length >= 3) {
    warnings.push('No chart type transitions between steps. Add chartType morphing for visual impact.');
    score -= 5;
  }

  return { score: Math.max(0, score), warnings };
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── Rate limit check (before auth to save resources on spam) ──
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const retryAfter = checkRateLimit(ip);
  if (retryAfter) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.AI) {
    return new Response(JSON.stringify({ error: 'Workers AI not configured. Redeploy with AI binding in wrangler.toml.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type, prompt, images, currentData, mode, lang, direct } = body;

  if (!type || !prompt) {
    return new Response(JSON.stringify({ error: 'Missing type or prompt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(type, mode || 'create', lang, direct);
  if (!systemPrompt) {
    return new Response(JSON.stringify({ error: `Unknown block type: ${type}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let userMessage = prompt;
  if (direct) {
    // Direct mode: tell the AI this is raw content to structure, not a prompt
    if (mode === 'improve' && currentData) {
      userMessage = `Current block data:\n${JSON.stringify(currentData)}\n\nDIRECT PASTE — replace the text content with exactly this (preserve verbatim, do NOT rewrite):\n${prompt}`;
    } else {
      userMessage = `DIRECT PASTE — structure this text into the block fields. Preserve EVERY word exactly as-is:\n${prompt}`;
    }
  } else if (mode === 'improve' && currentData) {
    userMessage = `Current block data:\n${JSON.stringify(currentData)}\n\nRequested change: ${prompt}`;
  }
  if (images && images.length > 0) {
    const isAudio = type === 'AudioPlayer';
    const fileLabel = isAudio ? 'audio file' : 'image';
    const fieldHint = isAudio ? ' Use the first audio URL as the audioSrc field value.' : '';
    userMessage += `\n\nThe user uploaded ${images.length} ${fileLabel}(s). Reference them using these exact URLs:\n${images.map((u, i) => `${isAudio ? 'Audio' : 'Image'} ${i + 1}: ${u}`).join('\n')}${fieldHint}`;
  }

  try {
    // DataScrolly and Map2D need more tokens for complex structured data
    const maxTokens = (type === 'DataScrolly' || type === 'Map2D') ? 6144 : 4096;
    const aiResponse = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    // Workers AI response: { response: object|string } or plain string
    let data;
    const raw = aiResponse?.response ?? aiResponse;

    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      data = raw;
    } else {
      let text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      let jsonStr = text.trim();
      // Strip markdown code fences
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      // Extract the JSON object if there's surrounding text
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];

      try {
        data = JSON.parse(jsonStr);
      } catch {
        // Fix common AI JSON issues: unescaped newlines inside string values
        const fixed = jsonStr
          .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')   // newlines inside "value" strings
          .replace(/,\s*([}\]])/g, '$1')            // trailing commas
          .replace(/'/g, "'");                       // smart quotes → plain
        try {
          data = JSON.parse(fixed);
        } catch (e2) {
          throw new Error('AI did not return valid JSON. Raw: ' + text.slice(0, 300));
        }
      }
    }

    const validationError = validateBlockData(type, data);
    if (validationError) {
      return new Response(JSON.stringify({ error: `AI returned invalid data: ${validationError}` }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // DataScrolly quality assessment — include warnings in response
    const quality = assessDataScrollyQuality(type, data);
    const responseBody = quality
      ? { data, quality: { score: quality.score, warnings: quality.warnings } }
      : { data };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('AI generation error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Generation failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
