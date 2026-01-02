import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { defaultSettings, getSettingsPath, loadSettings, normalizeSettings, saveSettings } from '../../settings/settings';

suite('settings', () => {
  test('normalizeSettings fills defaults', () => {
    const normalized = normalizeSettings({
      llm: { defaultModel: 'gpt-4o' },
      ui: { autosaveDelayMs: 1000 }
    });

    assert.strictEqual(normalized.llm.defaultModel, 'gpt-4o');
    assert.strictEqual(normalized.llm.promptChunkSize, defaultSettings.llm.promptChunkSize);
    assert.strictEqual(normalized.ui.autosaveDelayMs, 1000);
    assert.strictEqual(normalized.ui.columns.editor, defaultSettings.ui.columns.editor);
  });

  test('loadSettings returns defaults when file is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-settings-'));
    const settings = await loadSettings(dir);

    assert.strictEqual(settings.llm.defaultModel, defaultSettings.llm.defaultModel);
    assert.strictEqual(settings.iterations.autoSave, defaultSettings.iterations.autoSave);
  });

  test('loadSettings reads override file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-settings-'));
    const settingsPath = getSettingsPath(dir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ llm: { defaultModel: 'test-model' } }, null, 2));

    const settings = await loadSettings(dir);
    assert.strictEqual(settings.llm.defaultModel, 'test-model');
  });

  test('saveSettings writes normalized file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docright-settings-'));
    const overrides = normalizeSettings({
      llm: { baseUrl: 'https://example.com' }
    });

    await saveSettings(dir, overrides);
    const saved = JSON.parse(fs.readFileSync(getSettingsPath(dir), 'utf8')) as typeof overrides;

    assert.strictEqual(saved.llm.baseUrl, 'https://example.com');
    assert.strictEqual(saved.llm.defaultModel, defaultSettings.llm.defaultModel);
  });
});
