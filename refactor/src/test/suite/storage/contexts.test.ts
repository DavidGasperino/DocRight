import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadDocRightContexts, saveDocRightContexts } from '../../../storage/docright-contexts';

suite('storage:contexts', () => {
  test('load returns empty items when missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-contexts-'));
    const state = await loadDocRightContexts(dir);

    assert.deepStrictEqual(state.items, []);
  });

  test('save then load returns items', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-contexts-'));
    await saveDocRightContexts(dir, {
      items: [{ id: 'context-1', name: 'Spec', description: 'Desc', path: '/tmp/spec.md' }]
    });

    const loaded = await loadDocRightContexts(dir);
    assert.strictEqual(loaded.items.length, 1);
    assert.strictEqual(loaded.items[0].name, 'Spec');
  });
});
