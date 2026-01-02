import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadDocRightCallouts, saveDocRightCallouts } from '../../../storage/docright-callouts';

suite('storage:callouts', () => {
  test('load returns default when missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-callouts-'));
    const state = await loadDocRightCallouts(dir);

    assert.deepStrictEqual(state.inline, []);
    assert.deepStrictEqual(state.overall, []);
  });

  test('save then load returns callouts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-callouts-'));
    await saveDocRightCallouts(dir, {
      inline: [{ id: 'inline-1', instruction: 'Fix', text: 'Text' }],
      overall: [{ id: 'overall-1', instruction: 'Overall' }],
      selectedInlineId: 'inline-1',
      selectedOverallId: null
    });

    const loaded = await loadDocRightCallouts(dir);
    assert.strictEqual(loaded.inline.length, 1);
    assert.strictEqual(loaded.overall.length, 1);
  });
});
