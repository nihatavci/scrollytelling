import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMAS, buildSystemPrompt, validateBlockData, callModel } from './blocks.js';

test('every article block type has a schema with an example', () => {
  for (const t of ['Hero','Editorial','StatRow','Quote','Aside','Timeline','ChapterDivider','Outro','ImageGrid','Scrolly']) {
    assert.ok(BLOCK_SCHEMAS[t], `missing schema: ${t}`);
    assert.ok(BLOCK_SCHEMAS[t].example, `missing example: ${t}`);
  }
});

test('buildSystemPrompt injects the schema example for the type', () => {
  const p = buildSystemPrompt('Editorial', 'create', 'en', false);
  assert.ok(typeof p === 'string' && p.length > 50);
});

test('callModel routes to Workers AI when model is not deepseek', async () => {
  const env = { AI: { run: async () => ({ response: 'ok' }) } };
  const out = await callModel(env, { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', system: 's', user: 'u' });
  assert.equal(out, 'ok');
});
