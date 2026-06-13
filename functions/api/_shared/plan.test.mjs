import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanStructure, repairPlanStructure } from './plan.js';

test('validatePlanStructure flags a flat all-Editorial plan', () => {
  const plan = Array.from({length:5}, () => ({ type: 'Editorial' }));
  const r = validatePlanStructure(plan);
  assert.equal(r.valid, false);
  assert.ok(r.problems.some(p => /Hero/.test(p)));
  assert.ok(r.problems.some(p => /identical|repeat/i.test(p)));
});

test('repairPlanStructure yields a valid arc: Hero first, Outro last, a chapter divider, a beat on each', () => {
  const fixed = repairPlanStructure([{type:'Editorial'},{type:'Editorial'},{type:'Editorial'}], { hasNumbers:true, hasQuotes:true });
  assert.equal(fixed[0].type, 'Hero');
  assert.equal(fixed[fixed.length-1].type, 'Outro');
  assert.ok(fixed.some(b => b.type === 'ChapterDivider'));
  assert.ok(fixed.every(b => b.narrativeBeat));
  assert.equal(validatePlanStructure(fixed).valid, true);
});
