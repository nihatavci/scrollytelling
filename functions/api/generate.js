// functions/api/generate.js
// AI content generation via Cloudflare Workers AI (Llama 3.3 70B)
// No API key needed — uses the CF account's Workers AI binding.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── Voice & Style Guide (extracted from "Die Nachricht als Jahrhunderterfindung") ──
const VOICE_GUIDE = `
VOICE & STYLE — "Jahrhunderterfindung" editorial standard:

You write like the best German feature journalism — ZEIT, SZ Magazin, brand eins.

RULES:
- German (Hochdeutsch), gender-inclusive (Journalist:innen, Bürger:innen)
- Short, punchy sentences that land. Then a longer one for rhythm.
- Use concrete examples, real names, real dates, real publications
- Open with a surprising angle — a WhatsApp message, a comic, a paradox
- Weave academic citations naturally: "Barnhurst und Nerone beobachteten, dass..."
- Use em-dashes (—) for dramatic pauses, not commas
- Pullquotes: prefer English originals from scholars, with attribution "— Author, Year"
- Numbers are specific: "8.527 Artikel", "über 40 Prozent", not "viele" or "zahlreiche"
- Each section tells a mini-story with a beginning, turn, and landing
- Kickers use "Erster Akt · Die Erfindung" style (act + theme with middot)
- Paragraphs use "html" field (not "text") for p items — allows inline HTML for emphasis
- Captions are informative, not decorative: explain what the reader sees AND why it matters
- End editorial sections with a {kind:"separator"} item

TONE: Authoritative but accessible. Academic rigor with storytelling flair. Never dry, never clickbait.

REAL EXAMPLE from the reference site:
- Lead: "Es gibt zwei Arten, die Dinge zu erzählen: Von Anfang bis Ende oder direkt vom Ende her. Die kurze Textmessage an die beste Freundin wird ganz sicher lauten: 'Wir haben uns geküsst!' Das ist die zentrale Botschaft."
- Scrolly step: "NS-Propaganda-Apparat, DDR-Parteipresse — beide haben die Pyramide nicht gebrochen. 40–50% über Jahrzehnte. Erst nach 2004 sinkt der Wert auf 30–35%. Nicht die Diktatur. Der Newsfeed."
- Hero lines: "1605: die Zeitung. 1870: die Idee. Das Wichtigste kommt zuerst." / "8.527 Artikel. 100 Jahre. 15 Journalist:innen. Drei Generationen."
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
        { stepIndex: 0, badgeKind: 'pyramid', badgeLabel: 'Pyramide', body: 'Eine Form erfindet die demokratische Öffentlichkeit: Journalist:innen — nicht Mächtige — bestimmen, was das Wichtigste ist. Diese Entscheidung trägt eine Struktur: die umgekehrte Pyramide.' },
        { stepIndex: 1, badgeKind: 'data', badgeLabel: 'Summary Lead', body: '„Deutschland ist Weltmeister." — FAZ, 13. Juli 2014. Vier Wörter, vier W-Fragen beantwortet. Der Summary Lead in seiner reinsten Form: kein Spannungsbogen, kein Vorenthalten — das Ergebnis zuerst.' },
        { stepIndex: 2, badgeKind: 'future', badgeLabel: 'Umgelegte Pyramide', body: 'Canavilhas (2006) dreht die Logik um: statt von wichtig nach unwichtig — von innen nach außen. Schicht 1: das nackte Was. Schicht 4: voller Kontext. Nutzer:innen wählen ihre eigene Tiefe.' }
      ]
    },
    description: `Scrolly section with sticky visualization and stepped narrative.
Fields:
- scrollyId (string): unique ID like "scrolly-1"
- stepsId (string): unique ID like "steps-1"
- steps (array): each step has:
  - stepIndex (number): 0-based index
  - badgeKind (string): one of pyramid/data/explain/future/voice — pick based on content
  - badgeLabel (string): short label shown on the badge, e.g. "Pyramide", "NLP-Methode", "Korpus"
  - body (string): 2-3 punchy sentences. Use em-dashes for drama. Concrete numbers and names. The last sentence should land with impact.

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
};

function buildSystemPrompt(type, mode) {
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) return null;

  return `You are the content engine for ScrollyCMS — a platform for creating scrollytelling stories in the style of "Die Nachricht als Jahrhunderterfindung", an award-winning interactive feature about 100 years of German journalism.

${VOICE_GUIDE}

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation, no wrapping. Just the raw JSON object.
2. The JSON must match this exact schema for block type "${type}":

${schema.description}

Example output:
${JSON.stringify(schema.example, null, 2)}

${mode === 'improve' ? 'You are IMPROVING an existing block. Keep the structure, apply the requested changes, return the complete updated data object.' : 'You are creating a NEW block from scratch. Match the Jahrhunderterfindung quality standard.'}`;
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

  const { type, prompt, images, currentData, mode } = body;

  if (!type || !prompt) {
    return new Response(JSON.stringify({ error: 'Missing type or prompt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(type, mode || 'create');
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
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      try {
        data = JSON.parse(jsonStr);
      } catch {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) {
          data = JSON.parse(match[0]);
        } else {
          throw new Error('AI did not return valid JSON. Raw: ' + text.slice(0, 200));
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
