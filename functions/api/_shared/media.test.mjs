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
