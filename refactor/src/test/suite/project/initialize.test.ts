import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { defaultSettings, getSettingsPath } from '../../../settings/settings';
import { initializeDocRightProject } from '../../../project/initialize';
import {
  DEFAULT_CALLOUTS_STATE,
  DEFAULT_CONTEXTS_STATE,
  DEFAULT_ITERATION_PREAMBLE,
  DEFAULT_LLM_PREAMBLE,
  DEFAULT_LLM_SESSION,
  DEFAULT_SCOPE_STATE,
  getDefaultLexicalDoc
} from '../../../project/templates';
import {
  getDocRightCalloutsPath,
  getDocRightConfigPath,
  getDocRightContextsPath,
  getDocRightDocumentPath,
  getDocRightLlmSessionPath,
  getDocRightPromptPath,
  getDocRightScopePath
} from '../../../storage/docright-paths';
import { loadDocRightConfig } from '../../../storage/docright-config';

suite('project: initialize', () => {
  test('initializeDocRightProject creates default project files', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docright-refactor-'));
    const createdAt = '2026-01-01T00:00:00.000Z';

    const config = await initializeDocRightProject(root, defaultSettings, { createdAt });

    assert.strictEqual(config.version, 1);
    assert.strictEqual(config.createdAt, createdAt);
    assert.strictEqual(config.document.file, 'document.lexical.json');

    assert.ok(fs.existsSync(getDocRightConfigPath(root)));
    const storedConfig = await loadDocRightConfig(root);
    assert.ok(storedConfig);
    assert.strictEqual(storedConfig?.version, 1);
    assert.strictEqual(storedConfig?.document.file, 'document.lexical.json');

    assert.ok(fs.existsSync(getSettingsPath(root)));

    const llmPreamble = await fs.promises.readFile(
      getDocRightPromptPath(root, defaultSettings.prompts.llmPreambleFile),
      'utf8'
    );
    assert.strictEqual(llmPreamble.trim(), DEFAULT_LLM_PREAMBLE);

    const iterationPreamble = await fs.promises.readFile(
      getDocRightPromptPath(root, defaultSettings.prompts.iterationPreambleFile),
      'utf8'
    );
    assert.strictEqual(iterationPreamble.trim(), DEFAULT_ITERATION_PREAMBLE);

    const docRaw = await fs.promises.readFile(getDocRightDocumentPath(root), 'utf8');
    assert.deepStrictEqual(JSON.parse(docRaw), getDefaultLexicalDoc());

    const calloutsRaw = await fs.promises.readFile(getDocRightCalloutsPath(root), 'utf8');
    assert.deepStrictEqual(JSON.parse(calloutsRaw), DEFAULT_CALLOUTS_STATE);

    const contextsRaw = await fs.promises.readFile(getDocRightContextsPath(root), 'utf8');
    assert.deepStrictEqual(JSON.parse(contextsRaw), DEFAULT_CONTEXTS_STATE);

    const scopeRaw = await fs.promises.readFile(getDocRightScopePath(root), 'utf8');
    assert.deepStrictEqual(JSON.parse(scopeRaw), DEFAULT_SCOPE_STATE);

    const sessionRaw = await fs.promises.readFile(getDocRightLlmSessionPath(root), 'utf8');
    assert.deepStrictEqual(JSON.parse(sessionRaw), DEFAULT_LLM_SESSION);
  });

  test('initializeDocRightProject throws when config exists', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docright-refactor-'));

    await initializeDocRightProject(root, defaultSettings);

    await assert.rejects(
      () => initializeDocRightProject(root, defaultSettings),
      /already exists/i
    );
  });
});
