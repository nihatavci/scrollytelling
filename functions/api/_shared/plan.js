export const BEATS = ['exposition', 'rising', 'climax', 'falling', 'resolution'];

// Positive directives derived from what the sources actually contain — turns the permissive
// "include ONLY if…" gating into an active "you MUST/SHOULD use X" when the signal is present,
// so the planner doesn't substitute a generic ImageGrid for a real data series or a route.
function dataSignals(factShape) {
  if (!factShape) return '';
  const lines = [];
  if (factShape.hasNumbers) lines.push('- DATA SIGNAL: the sources contain a real numeric series (values across years/categories). You MUST include exactly one DataScrolly block built from those exact numbers, at the rising or climax beat. Do NOT substitute ImageGrid/StatRow for the chart.');
  if (factShape.hasPlaces) lines.push('- GEO SIGNAL: the sources name multiple real places / a route. Strongly prefer a Map2D block (with each place\'s real coordinates) over a generic image.');
  if (factShape.hasQuotes) lines.push('- QUOTE SIGNAL: the sources contain direct quotes. Include at least one Quote block at a high-impact beat.');
  if (!lines.length) return '';
  return `\nCONTENT SIGNALS (act on these — they reflect what the sources actually contain):\n${lines.join('\n')}\n`;
}

// Planner prompt: forces a dramatic arc (Freytag), not a flat list. Used by handleAnalyze.
export function buildPlanPrompt(blockList, tone, lang, factShape) {
  return `You are a senior editorial architect for a scrollytelling platform. Design an article as a DRAMATIC ARC (Freytag), not a flat list.

Available block types:
${blockList}
${dataSignals(factShape)}

Shape the arc across these beats and tag each block with "narrativeBeat":
- exposition: a Hero hook + just enough context to set stakes.
- rising: escalating sections that build tension/evidence; ChapterDivider to open a new act.
- climax: the turn — the most important revelation, contrast, or number. Often a Quote, StatRow, or a strong Editorial.
- falling: implications, complications, counterpoints.
- resolution: an Outro that lands the through-line.

Hard rules:
- First block Hero (exposition). Last block Outro (resolution).
- 1–3 ChapterDividers separating acts.
- Never 3 identical block types in a row — vary rhythm (text → visual → text).
- Include at least one visual block (ImageGrid / Scrolly / FullscreenImage).
- Use StatRow only if real numbers exist; Quote only if real quotes exist; Timeline only for 3+ dated events.
- Map2D: include ONLY if the story is strongly geographic (a journey, route, locations, spread). Then place real places with their well-known coordinates.
- DataScrolly: include ONLY if the sources contain a real numeric series over time/category (2+ data points). Never fabricate numbers.
- Scene3D: include ONLY if the story centers on a physical object/artifact/building/product.
- AudioPlayer: include ONLY if there is real voice/audio material (interview, recording, podcast).
- Choosing a rich component when the content does not justify it is a failure — prefer Editorial/Quote/StatRow when unsure.
- 8–18 blocks depending on source depth. Tone: ${tone || 'investigative'}.
- Each item: { "type", "headline", "narrativeBeat", "rationale", "sourceRefs": [...] }.

Also return a one-paragraph "throughLine": the single argument/spine the whole article serves.

Return ONLY valid JSON: { "throughLine": "...", "plan": [...], "warnings": [...] }.
Language: ${lang || 'same as the source'}.`;
}

export function validatePlanStructure(plan) {
  const problems = [];
  if (!Array.isArray(plan) || plan.length < 3) problems.push('plan too short');
  if (plan[0]?.type !== 'Hero') problems.push('must start with a Hero');
  if (plan[plan.length - 1]?.type !== 'Outro') problems.push('must end with an Outro');
  if (!plan.some(b => b.type === 'ChapterDivider')) problems.push('needs at least one ChapterDivider');
  if (!plan.some(b => ['ImageGrid','Scrolly','FullscreenImage'].includes(b.type))) problems.push('needs a visual block');
  for (let i = 2; i < plan.length; i++) {
    if (plan[i].type === plan[i-1].type && plan[i].type === plan[i-2].type) { problems.push('3 identical block types repeat'); break; }
  }
  return { valid: problems.length === 0, problems };
}

// Deterministic safety net when the model returns a weak plan. Normalizes to a valid arc.
export function repairPlanStructure(plan, facts = {}) {
  let p = Array.isArray(plan) ? plan.filter(b => b && b.type) : [];
  if (p[0]?.type !== 'Hero') p.unshift({ type: 'Hero', headline: p[0]?.headline || 'Untitled' });
  if (p[p.length - 1]?.type !== 'Outro') p.push({ type: 'Outro', headline: 'Conclusion' });
  if (!p.some(b => b.type === 'ChapterDivider') && p.length > 3) p.splice(2, 0, { type: 'ChapterDivider', headline: '' });
  if (!p.some(b => ['ImageGrid','Scrolly','FullscreenImage'].includes(b.type))) p.splice(Math.floor(p.length/2), 0, { type: 'ImageGrid', headline: '' });
  for (let i = 2; i < p.length; i++) {
    if (p[i].type === p[i-1].type && p[i].type === p[i-2].type) { p.splice(i, 0, { type: 'Aside', headline: '' }); i++; }
  }
  p.forEach((b, i) => {
    if (!b.narrativeBeat) {
      const r = i / Math.max(1, p.length - 1);
      b.narrativeBeat = r === 0 ? 'exposition' : r < 0.45 ? 'rising' : r < 0.6 ? 'climax' : r < 0.9 ? 'falling' : 'resolution';
    }
  });
  return p;
}
