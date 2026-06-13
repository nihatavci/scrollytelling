import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectMedia } from './media.js';

test('FullscreenImage with empty imageSrc gets a mock + keeps AI alt', () => {
  const out = injectMedia('FullscreenImage', { imageSrc: '', imageAlt: 'a flooded street' }, 0);
  assert.match(out.imageSrc, /\/assets\/mock\/mesh-/);
  assert.equal(out.imageAlt, 'a flooded street');
});
test('ImageGrid fills every empty item src and rotates art', () => {
  const out = injectMedia('ImageGrid', { images: [{src:'',caption:'x'},{src:'',caption:'y'}] }, 1);
  assert.ok(out.images.every(im => /\/assets\/mock\//.test(im.src)));
  assert.notEqual(out.images[0].src, out.images[1].src);
});
test('non-media block passes through unchanged', () => {
  const data = { content: [{kind:'p', html:'hi'}] };
  assert.deepEqual(injectMedia('Editorial', data, 0), data);
});
test('Scene3D with empty glbUrl gets the mock object + scene camera defaults', () => {
  const out = injectMedia('Scene3D', { glbUrl: '', scenes: [{ heading: 'h', body: 'b' }] }, 0);
  assert.equal(out.glbUrl, '/assets/mock/object.glb');
  assert.ok(out.scenes[0].camera && out.scenes[0].target && out.scenes[0].fov);
});
test('AudioPlayer with empty coverSrc gets mock art, audioSrc left empty', () => {
  const out = injectMedia('AudioPlayer', { coverSrc: '', audioSrc: '', title: 't' }, 0);
  assert.match(out.coverSrc, /\/assets\/mock\//);
  assert.equal(out.audioSrc, '');
});
test('Scene3D preserves real camera values when present', () => {
  const out = injectMedia('Scene3D', { glbUrl: '', scenes: [{ camera:{x:5,y:5,z:5}, heading:'h', body:'b' }] }, 0);
  assert.equal(out.scenes[0].camera.x, 5);
});
