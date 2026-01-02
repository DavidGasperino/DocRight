import * as assert from 'assert';

import { buildDocRightPrompt, renderIterationPreamble } from '../../../core/prompt';
import { type DocRightScopeState } from '../../../core/scope';

suite('prompt', () => {
  const fullScope: DocRightScopeState = { mode: 'full', selection: null };
  const rangeScope: DocRightScopeState = {
    mode: 'range',
    selection: {
      anchorKey: 'a',
      anchorOffset: 0,
      anchorType: 'text',
      focusKey: 'b',
      focusOffset: 10,
      focusType: 'text',
      isBackward: false
    }
  };

  test('renderIterationPreamble replaces scope tokens', () => {
    const template = 'Scope={{scope_mode}} @ {{scope_location}}';
    const output = renderIterationPreamble(template, rangeScope);

    assert.ok(output.includes('Scope=selection'));
    assert.ok(output.includes('User-selected range in the document.'));
  });

  test('buildDocRightPrompt joins non-empty sections', () => {
    const prompt = buildDocRightPrompt({
      llmPreamble: 'Preamble',
      iterationPreambleTemplate: 'Scope={{scope_mode}}',
      scope: fullScope,
      xml: '<xml/>'
    });

    assert.strictEqual(prompt, 'Preamble\n\nScope=full\n\n<xml/>');
  });

  test('buildDocRightPrompt skips empty sections', () => {
    const prompt = buildDocRightPrompt({
      llmPreamble: '',
      iterationPreambleTemplate: '',
      scope: fullScope,
      xml: '<xml/>'
    });

    assert.strictEqual(prompt, '<xml/>');
  });
});
