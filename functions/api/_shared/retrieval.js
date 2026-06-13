// Lightweight lexical retrieval — no embeddings. Keeps each block's prompt focused on its
// own source material and within a hard char budget (fixes context overflow).
export function chunkText(text, size = 8000, overlap = 200) {
  if (text.length <= size) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + size * 0.7) end = lastPeriod + 2;
    }
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  return chunks;
}

const STOP = new Set('the a an and or of to in on at for with is are was were be it this that as by from'.split(' '));
function tokens(s) { return (s.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/gi) || []).filter(w => !STOP.has(w)); }

export function selectRelevantChunks(chunks, query, charBudget = 9000) {
  const q = new Set(tokens(query));
  const scored = chunks.map((c, i) => {
    const ts = tokens(c);
    let hits = 0; for (const t of ts) if (q.has(t)) hits++;
    return { c, i, score: hits / Math.sqrt(ts.length + 1) };
  }).sort((a, b) => b.score - a.score || a.i - b.i);
  const out = [];
  let used = 0;
  for (const { c } of scored) {
    if (used >= charBudget) break;
    const slice = c.slice(0, Math.max(0, charBudget - used));
    if (!slice) break;
    out.push(slice); used += slice.length;
  }
  return out.length ? out : (chunks[0] ? [chunks[0].slice(0, charBudget)] : []);
}
