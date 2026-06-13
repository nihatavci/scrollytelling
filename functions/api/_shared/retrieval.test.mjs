import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, selectRelevantChunks } from './retrieval.js';

test('chunkText splits long text on sentence boundaries with overlap', () => {
  const text = 'A. '.repeat(5000); // ~15k chars
  const chunks = chunkText(text, 8000, 200);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(c => c.length <= 8200));
});

test('selectRelevantChunks ranks by query overlap and respects the char budget', () => {
  const chunks = [
    'The river flooded the village in 1998 causing damage.',
    'Quarterly revenue rose to 4.2 million dollars last year.',
    'Unrelated text about gardening and tomatoes.',
  ];
  const picked = selectRelevantChunks(chunks, 'flood village damage 1998', 60);
  assert.ok(picked[0].includes('flooded'));
  assert.ok(picked.join('').length <= 60);
});
