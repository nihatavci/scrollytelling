import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessBlockQuality } from './quality.js';

test('flags [NEEDS SOURCE] placeholder', () => {
  const r = assessBlockQuality('Editorial', { content: [{ kind:'p', html:'It rose to [NEEDS SOURCE].' }] });
  assert.ok(r.issues.some(i => /NEEDS SOURCE/.test(i)));
});
test('flags an empty Editorial', () => {
  const r = assessBlockQuality('Editorial', { content: [] });
  assert.equal(r.ok, false);
});
test('passes a substantive Editorial', () => {
  const r = assessBlockQuality('Editorial', { content: [{kind:'h2',text:'A real heading'},{kind:'p',html:'A paragraph long enough to read as real prose, not filler text at all here.'}] });
  assert.equal(r.ok, true);
});
