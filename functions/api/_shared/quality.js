export function assessBlockQuality(type, data) {
  const issues = [];
  const flat = JSON.stringify(data || {});
  if (/\[NEEDS SOURCE\]/i.test(flat)) issues.push('contains [NEEDS SOURCE] placeholder');
  const words = (flat.replace(/<[^>]+>/g, ' ').match(/[a-zà-ÿ0-9]+/gi) || []).length;
  const TEXTY = ['Editorial','Hero','Quote','Outro','Aside','ChapterDivider'];
  if (TEXTY.includes(type) && words < 6) issues.push(`${type} has almost no text`);
  if (type === 'Editorial' && (!Array.isArray(data?.content) || data.content.length === 0)) issues.push('Editorial has no content items');
  return { ok: issues.length === 0, issues };
}
