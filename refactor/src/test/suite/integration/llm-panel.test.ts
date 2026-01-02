import * as assert from 'assert';
import * as vscode from 'vscode';

suite('integration: llm panel', () => {
  test('opens panel and receives prompt', async () => {
    assert.ok(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0, 'No workspace open for tests.');

    const extension = vscode.extensions.getExtension('local.llm-callouts-refactor');
    assert.ok(extension, 'Refactor extension not found');
    const api = (await extension.activate()) as { getLlmDiagnostics: () => { lastPromptLength: number | null } };

    await vscode.commands.executeCommand('docRightRefactor.openLlmPanel');

    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const diagnostics = api.getLlmDiagnostics();
      if (diagnostics.lastPromptLength !== null) {
        assert.ok(diagnostics.lastPromptLength >= 0);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.fail('Timed out waiting for prompt to reach the webview.');
    }).timeout(10000);
  });
