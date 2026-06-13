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
test('Map2D with no in-range marker is flagged', () => {
  const r = assessBlockQuality('Map2D', { steps:[{body:'x'}], markers: [] });
  assert.equal(r.ok, false);
});
test('Map2D with a valid marker passes', () => {
  const r = assessBlockQuality('Map2D', { steps:[{body:'x'}], markers: [{ lat: 52.5, lng: 13.4 }] });
  assert.equal(r.ok, true);
});
test('Scene3D with a scene missing body is flagged', () => {
  const r = assessBlockQuality('Scene3D', { scenes: [{ heading: 'h' }] });
  assert.equal(r.ok, false);
});
test('DataScrolly with <2 numeric points is flagged', () => {
  const r = assessBlockQuality('DataScrolly', { chartSpec: { yField:'v', data:[{v:1}] }, steps:[{body:'x'}] });
  assert.equal(r.ok, false);
});
test('AudioPlayer missing description is flagged', () => {
  const r = assessBlockQuality('AudioPlayer', { title: 't' });
  assert.equal(r.ok, false);
});
