import * as assert from 'assert';

import { applyOffsetChanges, buildSnippet, findOverlap, type OffsetItem } from '../../../core/callouts';

suite('callouts', () => {
  test('buildSnippet trims and truncates', () => {
    assert.strictEqual(buildSnippet('   '), '(empty selection)');
    assert.strictEqual(buildSnippet('short text'), 'short text');
    const longText = 'a'.repeat(50);
    assert.strictEqual(buildSnippet(longText), `${'a'.repeat(37)}...`);
  });

  test('findOverlap detects intersecting ranges', () => {
    const items: OffsetItem[] = [
      { startOffset: 5, endOffset: 10 },
      { startOffset: 15, endOffset: 20 }
    ];

    assert.ok(findOverlap(items, 8, 12));
    assert.ok(!findOverlap(items, 10, 15));
  });

  test('applyOffsetChanges shifts offsets', () => {
    const items = [
      { startOffset: 5, endOffset: 10 },
      { startOffset: 20, endOffset: 30 }
    ];

    const updated = applyOffsetChanges(items, [
      { rangeOffset: 0, rangeLength: 0, text: 'abc' }
    ]);

    assert.strictEqual(updated, true);
    assert.deepStrictEqual(items, [
      { startOffset: 8, endOffset: 13 },
      { startOffset: 23, endOffset: 33 }
    ]);
  });

  test('applyOffsetChanges drops empty ranges', () => {
    const items = [
      { startOffset: 0, endOffset: 2 }
    ];

    const updated = applyOffsetChanges(items, [
      { rangeOffset: 0, rangeLength: 2, text: '' }
    ]);

    assert.strictEqual(updated, true);
    assert.strictEqual(items.length, 0);
  });
});
