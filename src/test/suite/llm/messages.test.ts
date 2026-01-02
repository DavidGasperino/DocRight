import * as assert from 'assert';

import { isLlmFromWebviewMessage } from '../../../webview/messages';

suite('llm:messages', () => {
  test('accepts known message types', () => {
    assert.ok(isLlmFromWebviewMessage({ type: 'llm.ready' }));
    assert.ok(isLlmFromWebviewMessage({ type: 'llm.requestPrompt' }));
    assert.ok(isLlmFromWebviewMessage({ type: 'llm.promptReceived', id: 1, length: 10 }));
  });

  test('rejects unknown messages', () => {
    assert.ok(!isLlmFromWebviewMessage({ type: 'unknown' }));
    assert.ok(!isLlmFromWebviewMessage(null));
  });
});
