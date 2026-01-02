import * as assert from 'assert';

import { buildDocRightXml } from '../../../core/docright-xml';

suite('docright-xml', () => {
  test('builds minimal document without callouts or context', () => {
    const output = buildDocRightXml('<p>Hello</p>');

    assert.ok(output.startsWith('<llm-document>'));
    assert.ok(output.includes('<llm-body>'));
    assert.ok(output.includes('<![CDATA[<p>Hello</p>]]>'));
    assert.ok(!output.includes('<llm-overall>'));
    assert.ok(!output.includes('<context>'));
  });

  test('includes overall callouts with CDATA', () => {
    const output = buildDocRightXml('Body', [{ instruction: 'Update title' }]);

    assert.ok(output.includes('<llm-overall>'));
    assert.ok(output.includes('id="overall-1"'));
    assert.ok(output.includes('<instruction>'));
    assert.ok(output.includes('<![CDATA[Update title]]>'));
  });

  test('escapes context fields and wraps reference in CDATA', () => {
    const output = buildDocRightXml('Body', [], [
      { name: 'Spec & Plan', description: 'Use <latest> draft', path: '/tmp/a&b.txt' }
    ]);

    assert.ok(output.includes('<context>'));
    assert.ok(output.includes('<![CDATA[<Spec & Plan>]]>'));
    assert.ok(output.includes('<name>Spec &amp; Plan</name>'));
    assert.ok(output.includes('<description>Use &lt;latest&gt; draft</description>'));
    assert.ok(output.includes('<path>/tmp/a&amp;b.txt</path>'));
  });

  test('escapes CDATA terminator in body html', () => {
    const output = buildDocRightXml('Before ]]> After');

    assert.ok(output.includes('<![CDATA[Before ]]]]>'));
    assert.ok(output.includes('<![CDATA[> After]]>'));
  });
});
