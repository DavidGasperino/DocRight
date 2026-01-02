import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadDocRightScope, saveDocRightScope } from '../../../storage/docright-scope';
import { type DocRightScopeState } from '../../../core/scope';

suite('storage:scope', () => {
  test('load returns full when missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-scope-'));
    const scope = await loadDocRightScope(dir);

    assert.strictEqual(scope.mode, 'full');
    assert.strictEqual(scope.selection, null);
  });

  test('save then load returns normalized scope', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-scope-'));
    const scope: DocRightScopeState = {
      mode: 'range',
      selection: {
        anchorKey: 'a',
        anchorOffset: 0,
        anchorType: 'text',
        focusKey: 'b',
        focusOffset: 1,
        focusType: 'text',
        isBackward: false
      }
    };

    await saveDocRightScope(dir, scope);
    const loaded = await loadDocRightScope(dir);

    assert.strictEqual(loaded.mode, 'range');
    assert.ok(loaded.selection);
  });
});
