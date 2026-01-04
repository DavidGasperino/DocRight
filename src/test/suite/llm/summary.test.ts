import * as assert from 'assert';

import {
  DOC_RIGHT_SUMMARY_END,
  DOC_RIGHT_SUMMARY_START,
  extractDocRightSummary
} from '../../../llm/summary';

suite('llm:summary', () => {
  test('extracts summary bullets and cleans response', () => {
    const raw = [
      '<p>Hello</p>',
      DOC_RIGHT_SUMMARY_START,
      '- First change',
      '- Second change',
      DOC_RIGHT_SUMMARY_END
    ].join('\n');

    const result = extractDocRightSummary(raw);
    assert.strictEqual(result.cleaned, '<p>Hello</p>');
    assert.deepStrictEqual(result.bullets, ['First change', 'Second change']);
    assert.strictEqual(result.hadSummary, true);
  });

  test('returns original when no summary', () => {
    const raw = '<p>Nothing to see</p>';
    const result = extractDocRightSummary(raw);
    assert.strictEqual(result.cleaned, '<p>Nothing to see</p>');
    assert.deepStrictEqual(result.bullets, []);
    assert.strictEqual(result.hadSummary, false);
  });
});
