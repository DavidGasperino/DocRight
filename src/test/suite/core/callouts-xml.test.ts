import * as assert from 'assert';

import { buildCalloutsXml } from '../../../core/callouts-xml';

suite('callouts-xml', () => {
  test('builds xml with inline callouts', () => {
    const output = buildCalloutsXml('Hello world', [
      { startOffset: 0, endOffset: 5, instruction: 'Capitalize' }
    ]);

    assert.ok(output.includes('<llm-edit id="1">'));
    assert.ok(output.includes('<![CDATA[Capitalize]]>'));
    assert.ok(output.includes('Hello'));
  });

  test('throws on overlapping callouts', () => {
    assert.throws(() => {
      buildCalloutsXml('Hello', [
        { startOffset: 0, endOffset: 4, instruction: 'One' },
        { startOffset: 2, endOffset: 5, instruction: 'Two' }
      ]);
    }, /Overlapping instructions/);
  });

  test('includes overall and context blocks', () => {
    const output = buildCalloutsXml(
      'Body',
      [],
      [{ instruction: 'Overall change' }],
      [{ name: 'Spec', description: 'Desc', path: '/tmp/spec.md' }]
    );

    assert.ok(output.includes('<llm-overall>'));
    assert.ok(output.includes('Overall change'));
    assert.ok(output.includes('<context>'));
    assert.ok(output.includes('<name>Spec</name>'));
  });
});
