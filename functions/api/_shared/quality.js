export function assessBlockQuality(type, data) {
  const issues = [];
  const flat = JSON.stringify(data || {});
  if (/\[NEEDS SOURCE\]/i.test(flat)) issues.push('contains [NEEDS SOURCE] placeholder');
  const words = (flat.replace(/<[^>]+>/g, ' ').match(/[a-zà-ÿ0-9]+/gi) || []).length;
  const TEXTY = ['Editorial','Hero','Quote','Outro','Aside','ChapterDivider'];
  if (TEXTY.includes(type) && words < 6) issues.push(`${type} has almost no text`);
  if (type === 'Editorial' && (!Array.isArray(data?.content) || data.content.length === 0)) issues.push('Editorial has no content items');
  if (type === 'Map2D') {
    const ms = Array.isArray(data?.markers) ? data.markers : [];
    if (!ms.some(m => Number.isFinite(+m?.lat) && Number.isFinite(+m?.lng) && Math.abs(+m.lat) <= 90 && Math.abs(+m.lng) <= 180)) issues.push('Map2D has no valid in-range marker');
  }
  if (type === 'DataScrolly') {
    const cs = data?.chartSpec || {}; const yf = cs.yField;
    const numeric = (Array.isArray(cs.data) ? cs.data : []).filter(p => p && yf && Number.isFinite(+p[yf]));
    if (numeric.length < 2) issues.push('DataScrolly chart has fewer than 2 numeric points');
  }
  if (type === 'Scene3D') {
    const sc = Array.isArray(data?.scenes) ? data.scenes : [];
    if (sc.length < 1 || !sc.every(s => s && s.heading && s.body)) issues.push('Scene3D scenes are missing heading/body');
  }
  if (type === 'AudioPlayer') {
    if (!data?.title || !data?.description) issues.push('AudioPlayer missing title/description');
  }
  return { ok: issues.length === 0, issues };
}
