const ART = ['/assets/mock/mesh-aurora.svg', '/assets/mock/mesh-ember.svg', '/assets/mock/mesh-tide.svg'];
const pick = (n) => ART[((n % ART.length) + ART.length) % ART.length];

// Fill empty image slots on generated media blocks so nothing renders blank. AI-written
// alt/caption is preserved (it describes the ideal photo to drop in later).
export function injectMedia(type, data, beatIndex = 0) {
  const d = { ...data };
  const empty = (v) => v == null || v === '';
  switch (type) {
    case 'FullscreenImage': if (empty(d.imageSrc)) d.imageSrc = pick(beatIndex); break;
    case 'FullBleed':       if (empty(d.mediaSrc)) d.mediaSrc = pick(beatIndex); break;
    case 'Quote':           if (empty(d.portraitSrc)) d.portraitSrc = '/assets/mock/portrait.svg'; break;
    case 'ImageCompare':    if (empty(d.beforeSrc)) d.beforeSrc = '/assets/mock/compare-before.svg';
                            if (empty(d.afterSrc))  d.afterSrc  = '/assets/mock/compare-after.svg'; break;
    case 'ImageGrid':
      if (Array.isArray(d.images)) d.images = d.images.map((im, i) => empty(im.src) ? { ...im, src: pick(beatIndex + i) } : im);
      break;
    case 'Scrolly':
      if (Array.isArray(d.steps)) d.steps = d.steps.map((s, i) => empty(s.imageSrc) ? { ...s, imageSrc: pick(beatIndex + i) } : s);
      break;
    case 'Scene3D':
      if (empty(d.glbUrl)) d.glbUrl = '/assets/mock/object.glb';
      if (Array.isArray(d.scenes)) d.scenes = d.scenes.map(s => ({
        camera: { x: 1.6, y: 1.2, z: 3.2 },
        target: { x: 0, y: 0, z: 0 },
        fov: 45,
        ...s,
      }));
      break;
    case 'AudioPlayer':
      if (empty(d.coverSrc)) d.coverSrc = pick(beatIndex);
      break;
  }
  return d;
}
