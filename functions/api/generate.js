// functions/api/generate.js
// AI content generation via Cloudflare Workers AI (Llama 3.3 70B)
// No API key needed — uses the CF account's Workers AI binding.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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
- steps (array): each step has:
  - stepIndex (number): 0-based index
  - badgeKind (string): one of pyramid/data/explain/future/voice — pick based on content
  - badgeLabel (string): short label shown on the badge
  - imageSrc (string): URL of the image shown in the sticky panel when this step is active. Leave empty string if no image.
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

function buildSystemPrompt(type, mode, lang) {
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) return null;

  const langHint = lang
    ? `\nIMPORTANT: The page language is "${lang}". Generate ALL content in ${lang === 'de' ? 'German' : lang === 'en' ? 'English' : lang === 'tr' ? 'Turkish' : lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang}. Do NOT use any other language.`
    : '\nIMPORTANT: Detect the language from the user prompt and generate ALL content in that same language.';

  return `You are the content engine for ScrollyCMS — a platform for creating premium scrollytelling stories with interactive visualizations and rich narrative.

${VOICE_GUIDE}
${langHint}

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation, no wrapping. Just the raw JSON object.
2. The JSON must match this exact schema for block type "${type}":

${schema.description}

Example output (note: examples may be in German — adapt to the correct language):
${JSON.stringify(schema.example, null, 2)}

${mode === 'improve' ? 'You are IMPROVING an existing block. Keep the structure, apply the requested changes, return the complete updated data object.' : 'You are creating a NEW block from scratch based on the user prompt. Write in the SAME language the user used.'}`;
}

export async function onRequest(context) {
  const { request, env } = context;

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

  const { type, prompt, images, currentData, mode, lang } = body;

  if (!type || !prompt) {
    return new Response(JSON.stringify({ error: 'Missing type or prompt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(type, mode || 'create', lang);
  if (!systemPrompt) {
    return new Response(JSON.stringify({ error: `Unknown block type: ${type}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let userMessage = prompt;
  if (mode === 'improve' && currentData) {
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
