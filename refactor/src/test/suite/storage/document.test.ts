import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadDocRightDocument, saveDocRightDocument } from '../../../storage/docright-document';
import { getDocRightDocumentPath } from '../../../storage/docright-paths';
import { getDefaultLexicalDoc } from '../../../project/templates';

suite('storage:document', () => {
  test('load returns fallback and writes file when missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-doc-'));
    const state = await loadDocRightDocument(dir);

    const parsed = JSON.parse(state);
    assert.deepStrictEqual(parsed, getDefaultLexicalDoc());
    assert.ok(fs.existsSync(getDocRightDocumentPath(dir)));
  });

  test('save then load returns stored state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-doc-'));
    const payload = JSON.stringify({ root: { children: [] } });
    await saveDocRightDocument(dir, payload);

    const loaded = await loadDocRightDocument(dir);
    assert.strictEqual(loaded.trim(), payload);
  });
});
