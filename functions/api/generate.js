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
      title: 'Pyramidenanteil nach Jahrzehnt', subtitle: 'Anteil der Artikel mit Summary Lead', source: 'Birkner et al., eigene Erhebung (n=8.527)',
      chartSpec: { kind: 'bar', xField: 'decade', yField: 'percent', xLabel: 'Jahrzehnt', yLabel: 'Anteil (%)', data: [{ decade: '1920er', percent: 42 }, { decade: '1950er', percent: 45 }, { decade: '1980er', percent: 48 }, { decade: '2000er', percent: 38 }, { decade: '2020er', percent: 32 }] },
      steps: [
        { badgeKind: 'data', badgeLabel: 'Daten', body: 'Über Jahrzehnte liegt der Anteil bei 40–50 %. Weder Nationalsozialismus noch DDR konnten die Form brechen.', vizState: {} },
        { badgeKind: 'data', badgeLabel: 'Daten', body: 'Die 1980er markieren den Höhepunkt — fast jeder zweite Artikel beginnt mit einem Summary Lead.', vizState: { highlightX: '1980er', annotation: '48 %' } },
        { badgeKind: 'future', badgeLabel: 'Wende', body: 'Erst ab 2004 sinkt der Wert deutlich. Der Grund: nicht politischer Druck, sondern der digitale Newsfeed.', vizState: { highlightX: '2020er', annotation: '32 %', chartType: 'line' } }
      ],
    },
    description: `Data-driven scrolly with D3 animated chart. The chart engine supports fluid transitions between chart types.

Fields:
- title, subtitle, source (academic citation)
- chartSpec: { kind: "bar"|"line"|"area"|"scatter", xField, yField, xLabel, yLabel, data: [{...}] }
- steps: array of { badgeKind: "data"|"pyramid"|"explain"|"future"|"voice", badgeLabel: "short label", body: "HTML narrative text", vizState: { chartType?, highlightX?, annotation?, filter?, sort? } }

IMPORTANT vizState capabilities:
- chartType: "bar"|"line"|"area"|"scatter" — changing this between steps MORPHS the chart type with smooth animation (bars shrink to dots, dots connect into lines, etc.)
- highlightX: value matching xField — highlights that data point with a pulsing accent dot and vertical rule
- annotation: text shown as a floating pill above the highlighted point
- filter: { field: "col", values: ["a","b"] } — filters visible data points
- sort: "ascending"|"descending" — reorders bars with animation

DESIGN RULES:
- Start with bars (step 1 = overview), then highlight specific values, then morph to line for trends
- Each step should reveal ONE new insight about the data
- Use 3-5 steps minimum — each with a different vizState
- Use realistic data with specific numbers and German labels
- Every DataScrolly needs at least one chartType morph between steps for visual impact`,
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
        { id: 'route-main', points: [[52.52,13.405],[51.34,12.37],[50.93,11.59],[50.11,8.68]], color: '#c06830', weight: 3, animate: true, label: 'Telegrafenlinie' }
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
    description: `Scrollytelling map — sticky interactive map with story cards that fly between locations as the reader scrolls. Like NYT/Reuters geographic storytelling.

Top-level fields:
- title (string, optional): heading above the map
- subtitle (string, optional): subheading
- source (string, optional): data source attribution below map
- height (string): map height. "100vh" (full viewport, default), "80vh", "60vh", "500px".
- maxWidth (string): max container width. "1400px" (default), "1100px", "100%".
- layout (string): "side" (map left, cards right — default) or "behind" (full-viewport map, cards float on top).
- tileStyle (string): map tile appearance. "default" (clean, no city labels — best for scrollytelling), "clean" (smooth minimal), "toner" (high-contrast B&W, no labels), "watercolor" (artistic), "toner-lite" (light B&W), "dark" (dark smooth), "osm" (standard OSM with labels).
- initialCenter ([lat, lng]): starting center point. Use real coordinates.
- initialZoom (number): starting zoom 1-18. Country=6, region=9, city=12, neighborhood=15, street=17.
- flyDuration (number): seconds for fly-to animation between steps. Default 2.
- scrollZoom (boolean): allow scroll wheel zoom. Default false.
- mapRadius (string): border-radius of the map container. "16px" default, "0" for sharp.

Geographic features (defined once, referenced by ID in steps):
- markers (array): each has:
  - id (string): unique ID referenced by steps (e.g. "berlin", "marker-1")
  - lat (number): latitude (decimal degrees)
  - lng (number): longitude (decimal degrees)
  - label (string): text on the marker circle (e.g. "1", "A", emoji)
  - name (string): place name shown below the marker dot (e.g. "Berlin", "Honolulu"). ALWAYS set this — it replaces tile city labels.
  - popupHtml (string): HTML popup content. Use <strong> for titles, <br> for line breaks.
  - color (string): hex color for marker. Default "#c06830".
- routes (array): animated polyline paths. Each has:
  - id (string): unique ID referenced by steps
  - points (array): array of [lat, lng] coordinate pairs defining the path. Use 4-8 points along the real route.
  - color (string): hex color. Default "#c06830".
  - weight (number): line thickness. Default 3.
  - animate (boolean): if true, route draws progressively when triggered. Default true.
  - label (string): text shown at midpoint of route.
  - dashArray (string): dash pattern e.g. "10,6" for dashed. Empty for solid.
- areas (array): polygon highlights. Each has:
  - id (string): unique ID
  - points (array): array of [lat, lng] coordinate pairs forming the boundary
  - color (string): hex color. Default "#c06830".
  - fillOpacity (number): 0-1. Default 0.2.
  - label (string): popup text when clicked.

Scrollytelling steps:
- steps (array): each step controls what the reader sees. Each has:
  - badgeKind (string): pyramid/data/explain/future/voice
  - badgeLabel (string): short label on the badge
  - heading (string, optional): step heading
  - body (string): 2-3 punchy sentences about this location/moment
  - mapState (object): controls the map for this step:
    - center ([lat, lng]): fly the camera here
    - zoom (number): zoom level to fly to
    - showMarkers (string[]): IDs of markers to show (others hidden). ["berlin","frankfurt"]
    - showAreas (string[]): IDs of areas to show
    - animateRoute (string|null): route ID to animate drawing. null = no route this step.
    - tileStyle (string|null): switch tile style. null = keep current.
    - fitBounds (boolean): if true, fit map to all visible features instead of flyTo

- caption (string, optional): caption below the block
- credit (string): attribution line

CRITICAL: Use real geographic coordinates. Look up actual lat/lng for cities, landmarks, regions. Each step should fly to a different location to create the scrollytelling journey. Write 3-5 steps.`,
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
${JSON.stringify(schema.example, null, 2)}

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
${JSON.stringify(schema.example, null, 2)}

${mode === 'improve' ? `You are IMPROVING an existing block. The user's current data is provided — apply their requested changes and return the COMPLETE updated data object.

IMPROVE RULES:
- Keep all existing fields unless the user explicitly asks to change them
- If the user says "make images smaller" or "smaller layout" → change layout to "editorial" (720px narrow)
- If they say "bigger" or "wider" or "full width" → change layout to "bleed" or "full"
- If they say "2 grid" or "3 columns" etc → set the layout field accordingly
- If they say "remove image 2" or "swap images" → modify the images array
- If they say "add caption" or "change credit" → update those fields
- If they mention sizing like "make the image half size" → change layout to "editorial" for narrow
- For Scrolly blocks: if they say "remove images" → clear imageSrc fields. If "add image to step 3" → set imageSrc on that step
- For Scrolly blocks sizing: "make images smaller" → set imageSize to "small" (35%). "make images bigger" → imageSize "large" (65%). "medium" → "medium" (50%). "full width" → "full". Or use exact values like "40%".
- For Scrolly blocks: "make images shorter" or "less tall" → set imageHeight to "60vh" or "70vh". "taller" → "100vh".
- For Scrolly blocks: "round corners" → set imageRadius to "12px" or "24px". "sharp" or "no radius" → "0".
- For Scrolly blocks: "narrower layout" → reduce maxWidth (e.g. "1100px"). "wider" → increase (e.g. "1600px").
- For Map2D blocks: "zoom in" → increase initialZoom or step mapState.zoom by 2. "zoom out" → decrease by 2.
- For Map2D blocks: "focus on [city]" → change initialCenter to that city's real coordinates and set initialZoom to 13.
- For Map2D blocks: "add marker at [place]" → add to markers array with real lat/lng and a unique id, and add id to relevant step's showMarkers.
- For Map2D blocks: "dark map" or "dark tiles" → set tileStyle to "dark". "watercolor" → "watercolor". "black and white" → "toner". "clean" → "toner-lite".
- For Map2D blocks: "smaller map" → set height to "60vh" or "400px". "bigger" or "full screen" → "100vh". "full width" → maxWidth "100%".
- For Map2D blocks: "draw route from A to B" → add a route with real coordinate waypoints and a unique id. "add area around [place]" → add area polygon.
- For Map2D blocks: "behind layout" or "fullscreen map" → set layout to "behind". "side layout" → "side".
- For Map2D blocks: "faster transitions" → reduce flyDuration. "slower" → increase flyDuration.
- For FullscreenImage blocks: "darker overlay" or "darker" → increase scrimOpacity. "lighter" → decrease scrimOpacity. "center text" → overlayPosition "center". "add kicker" → set kicker field. "no animation" → kenBurns false. "scroll indicator" or "scroll cue" → scrollCue true. "top-left" → overlayPosition "top-left". "no scrim" → scrimOpacity 0.
- For AudioPlayer blocks: "change color" → update accentColor and waveformColor. "add transcript" → set transcript text. "shorter description" → trim description. "remove cover" → clear coverSrc. "add cover" → set coverSrc.
- Universal: every block supports "bgOpacity" (number 0-1) to control the page background image visibility behind this block. "show background" → bgOpacity 0.3. "hide background" → bgOpacity 0. "strong background" → bgOpacity 0.5-0.8.
- ALWAYS return the complete data object with ALL fields, not just the changed ones` : 'You are creating a NEW block from scratch based on the user prompt. Write in the SAME language the user used.'}`;
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
      userMessage = `Current block data:\n${JSON.stringify(currentData, null, 2)}\n\nDIRECT PASTE — replace the text content with exactly this (preserve verbatim, do NOT rewrite):\n${prompt}`;
    } else {
      userMessage = `DIRECT PASTE — structure this text into the block fields. Preserve EVERY word exactly as-is:\n${prompt}`;
    }
  } else if (mode === 'improve' && currentData) {
    userMessage = `Current block data:\n${JSON.stringify(currentData, null, 2)}\n\nRequested change: ${prompt}`;
  }
  if (images && images.length > 0) {
    userMessage += `\n\nThe user uploaded ${images.length} image(s). Reference them using these URLs:\n${images.map((u, i) => `Image ${i + 1}: ${u}`).join('\n')}`;
  }

  try {
    const aiResponse = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4096,
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

    return new Response(JSON.stringify({ data }), {
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
