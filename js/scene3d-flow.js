// js/scene3d-flow.js — pretext flowing text wrapped around the Scene3D model.
// Public: flowSupported(), loadPretext(), computeOccupancy(), createFlowText(opts)
//
// --- Verified @chenglou/pretext API (headless probe 2026-06-08, esm.sh) ---
// prepareWithSegments(text, font) -> PreparedText (opaque; cache per text change)
// Variable per-line width walk (what we use):
//   let cursor = { segmentIndex: 0, graphemeIndex: 0 };
//   const range = layoutNextLineRange(prep, cursor, maxWidthPx); // null at end
//   const { text } = materializeLineRange(prep, range);          // range.text is empty; materialize gives text
//   advance: cursor = range.end ({segmentIndex,graphemeIndex}); stop when range==null or end===cursor
// (layoutWithLines(prep,w,lineH) -> {lineCount,height,lines:[{text,width,start,end}]} for fixed width.)

const PRETEXT_CDN = 'https://esm.sh/@chenglou/pretext';
let _ptPromise = null;
export function loadPretext() {
  if (!_ptPromise) _ptPromise = import(PRETEXT_CDN);
  return _ptPromise;
}
export function flowSupported() {
  return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
}

// Layout constants
const FONT_PX = 17, LINE_H = 27, BANDS = 12, PAD = 26, GUTTER = 36, MIN_W = 52;
const FONT = `${FONT_PX}px Georgia, 'Times New Roman', serif`;

// Build a coarse per-band [left,right] screen-x occupancy interval for the model.
// 14 sample points (8 box corners + 6 face centers) projected to screen — no readback.
export function computeOccupancy(THREE, camera, model, W, H) {
  const bands = new Array(BANDS).fill(null);
  if (!camera || !model) return bands;
  const box = new THREE.Box3().setFromObject(model);
  if (!isFinite(box.min.x)) return bands;
  const mn = box.min, mx = box.max, cx = (mn.x + mx.x) / 2, cy = (mn.y + mx.y) / 2, cz = (mn.z + mx.z) / 2;
  const pts = [
    [mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z], [mn.x, mx.y, mn.z], [mx.x, mx.y, mn.z],
    [mn.x, mn.y, mx.z], [mx.x, mn.y, mx.z], [mn.x, mx.y, mx.z], [mx.x, mx.y, mx.z],
    [cx, cy, mn.z], [cx, cy, mx.z], [mn.x, cy, cz], [mx.x, cy, cz], [cx, mn.y, cz], [cx, mx.y, cz],
  ];
  const v = new THREE.Vector3();
  const lo = new Array(BANDS).fill(Infinity), hi = new Array(BANDS).fill(-Infinity);
  for (const [x, y, z] of pts) {
    v.set(x, y, z).project(camera);
    if (v.z > 1) continue;
    const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    const b = Math.max(0, Math.min(BANDS - 1, Math.floor(sy / H * BANDS)));
    if (sx < lo[b]) lo[b] = sx;
    if (sx > hi[b]) hi[b] = sx;
  }
  for (let b = 0; b < BANDS; b++) {
    if (lo[b] === Infinity) continue;
    bands[b] = [Math.max(0, lo[b] - PAD), Math.min(W, hi[b] + PAD)];
  }
  // Vertically dilate occupancy by 1 band so the silhouette reads continuous.
  const dil = bands.slice();
  for (let b = 0; b < BANDS; b++) {
    for (const nb of [b - 1, b + 1]) {
      if (nb < 0 || nb >= BANDS || !bands[nb]) continue;
      if (!dil[b]) dil[b] = bands[nb].slice();
      else { dil[b][0] = Math.min(dil[b][0], bands[nb][0]); dil[b][1] = Math.max(dil[b][1], bands[nb][1]); }
    }
  }
  return dil;
}

export { FONT, FONT_PX, LINE_H, BANDS, GUTTER, MIN_W };

// createFlowText(opts) — controller that lays out prose into columns and draws it
// onto a 2D canvas, wrapping around the model's occupancy each call to relayout().
// opts: { THREE, textCanvas, getCamera, getModel, getColor, text, columns }
export async function createFlowText(opts) {
  const { THREE, textCanvas, getCamera, getModel, getColor } = opts;
  if (!flowSupported()) return null;
  let P; try { P = await loadPretext(); } catch (_) { return null; }
  const ctx = textCanvas.getContext('2d');
  if (!ctx) return null;
  let columns = Math.max(1, Math.min(3, opts.columns || 2));
  let margin = Math.max(0, opts.margin || 0);   // horizontal page inset (px)
  let W = 1, H = 1;
  const splitParas = (t) => String(t || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  let prepared = splitParas(opts.text).map(p => P.prepareWithSegments(p, FONT));
  let _lastText = String(opts.text || '');

  function resize(w, h, dpr) {
    W = Math.max(w, 1); H = Math.max(h, 1);
    const r = dpr || Math.min(window.devicePixelRatio || 1, 2);
    textCanvas.width = Math.floor(W * r); textCanvas.height = Math.floor(H * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  function setText(t, cols) {
    if (cols) columns = Math.max(1, Math.min(3, cols));
    const str = String(t || '');
    if (str === _lastText && !cols) return; // no-op if unchanged (avoids re-prepare churn)
    _lastText = str;
    prepared = splitParas(str).map(p => P.prepareWithSegments(p, FONT));
  }
  function setMargin(m) { margin = Math.max(0, m || 0); }

  // Widest open horizontal segment for a given line-y within a column.
  function openSegment(occ, y, colX, colW) {
    const b = Math.max(0, Math.min(BANDS - 1, Math.floor(y / H * BANDS)));
    const iv = occ[b];
    const colR = colX + colW;
    if (!iv || iv[1] <= colX || iv[0] >= colR) return { x: colX, w: colW }; // model misses column
    const leftW = iv[0] - colX, rightW = colR - iv[1];
    return leftW >= rightW ? { x: colX, w: Math.max(0, leftW) } : { x: iv[1], w: Math.max(0, rightW) };
  }

  function relayout() {
    if (!W || !H || !prepared.length) return;
    ctx.clearRect(0, 0, W, H);
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = (getColor && getColor()) || '#111';
    const occ = computeOccupancy(THREE, getCamera(), getModel(), W, H);
    const usableW = Math.max(MIN_W, W - margin * 2);
    const colW = (usableW - GUTTER * (columns - 1)) / columns;
    const topPad = LINE_H + 8, botPad = LINE_H;
    let pi = 0, col = 0, y = topPad;
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let safety = 0;
    while (pi < prepared.length && col < columns && safety++ < 4000) {
      const colX = margin + col * (colW + GUTTER);
      const seg = openSegment(occ, y, colX, colW);
      if (seg.w < MIN_W) { y += LINE_H; if (y > H - botPad) { col++; y = topPad; } continue; }
      const range = P.layoutNextLineRange(prepared[pi], cursor, seg.w);
      if (!range) { pi++; cursor = { segmentIndex: 0, graphemeIndex: 0 }; y += LINE_H * 0.7; continue; }
      let text = '';
      try { text = (P.materializeLineRange(prepared[pi], range).text || '').trimEnd(); } catch (_) {}
      if (text) ctx.fillText(text, seg.x, y);
      const end = range.end;
      if (end && end.segmentIndex === cursor.segmentIndex && end.graphemeIndex === cursor.graphemeIndex) {
        pi++; cursor = { segmentIndex: 0, graphemeIndex: 0 }; y += LINE_H * 0.7; // paragraph done
      } else {
        cursor = end; y += LINE_H;
      }
      if (y > H - botPad) { col++; y = topPad; }
    }
  }

  resize(textCanvas.clientWidth, textCanvas.clientHeight);
  return { relayout, resize, setText, setMargin, dispose() { try { ctx.clearRect(0, 0, W, H); } catch (_) {} } };
}
