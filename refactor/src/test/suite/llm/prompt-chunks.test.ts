import * as assert from 'assert';

import { buildPromptChunks } from '../../../llm/prompt-chunks';

suite('llm:prompt-chunks', () => {
  test('returns single empty chunk for empty string', () => {
    const result = buildPromptChunks('', 5);
    assert.strictEqual(result.total, 1);
    assert.deepStrictEqual(result.chunks, ['']);
  });

  test('splits into chunks by size', () => {
    const result = buildPromptChunks('abcdef', 2);
    assert.strictEqual(result.total, 3);
    assert.deepStrictEqual(result.chunks, ['ab', 'cd', 'ef']);
  });

  test('throws on invalid chunk size', () => {
    assert.throws(() => buildPromptChunks('abc', 0), /chunkSize/);
  });
});
