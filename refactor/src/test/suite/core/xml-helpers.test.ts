import * as assert from 'assert';

import { escapeXml, escapeXmlAttr, wrapCdata } from '../../../core/xml-helpers';

suite('xml-helpers', () => {
  test('escapeXml handles angle brackets and ampersands', () => {
    const value = 'a & b < c > d';
    assert.strictEqual(escapeXml(value), 'a &amp; b &lt; c &gt; d');
  });

  test('escapeXmlAttr handles quotes', () => {
    const value = '"quoted" and \'single\'';
    assert.strictEqual(escapeXmlAttr(value), '&quot;quoted&quot; and &apos;single&apos;');
  });

  test('wrapCdata escapes terminator', () => {
    const value = 'before ]]> after';
    const wrapped = wrapCdata(value);
    assert.ok(wrapped.includes('<![CDATA[before ]]]]><![CDATA[> after]]>'));
  });
});
