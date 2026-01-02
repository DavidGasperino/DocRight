import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readDocRightPrompt, writeDocRightPrompt } from '../../../storage/docright-prompts';

suite('storage:prompts', () => {
  test('read returns fallback when missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-prompts-'));
    const value = await readDocRightPrompt(dir, 'missing.txt', 'fallback');

    assert.strictEqual(value, 'fallback');
  });

  test('write then read returns contents', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-prompts-'));
    await writeDocRightPrompt(dir, 'example.txt', 'Hello');

    const value = await readDocRightPrompt(dir, 'example.txt', 'fallback');
    assert.strictEqual(value, 'Hello');
  });
});
