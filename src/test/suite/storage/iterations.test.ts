import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  listDocRightIterationMetadata,
  loadDocRightIterationState,
  restoreDocRightIteration,
  saveDocRightIteration
} from '../../../storage/docright-iterations';

suite('storage:iterations', () => {
  test('save tracks head and parent relationships', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-iterations-'));

    const first = await saveDocRightIteration(dir, {
      reason: 'manual',
      summaryBullets: ['Initial snapshot']
    });
    const state1 = await loadDocRightIterationState(dir);
    assert.strictEqual(state1.headId, first.id);

    const second = await saveDocRightIteration(dir, {
      reason: 'pre-apply',
      summaryBullets: ['Applied changes']
    });
    const meta = await listDocRightIterationMetadata(dir);
    const secondMeta = meta.find((entry) => entry.id === second.id);
    assert.ok(secondMeta);
    assert.strictEqual(secondMeta?.parentId, first.id);

    await restoreDocRightIteration(dir, first.id);
    const state2 = await loadDocRightIterationState(dir);
    assert.strictEqual(state2.headId, first.id);

    const third = await saveDocRightIteration(dir, {
      reason: 'manual',
      summaryBullets: ['Forked from first']
    });
    const meta2 = await listDocRightIterationMetadata(dir);
    const thirdMeta = meta2.find((entry) => entry.id === third.id);
    assert.ok(thirdMeta);
    assert.strictEqual(thirdMeta?.parentId, first.id);
  });
});
