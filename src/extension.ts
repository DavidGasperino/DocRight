import * as vscode from 'vscode';

import { getWorkspaceRoot } from './host/workspace';
import { ensureSettingsFile } from './settings/settings';
import { createLogger } from './host/logger';
import { LlmController } from './llm/controller';
import { LlmPanelHost } from './host/llm-panel-host';
import { buildPromptPreview } from './host/prompt-preview';
import { initializeDocRightProject } from './project/initialize';
import { docRightConfigExists, loadDocRightConfig } from './storage/docright-config';
import { DocRightEditorHost } from './host/docright-editor-host';

type RefactorApi = {
  getLlmDiagnostics: () => ReturnType<LlmController['getDiagnostics']>;
};

export function activate(context: vscode.ExtensionContext): RefactorApi {
  const logger = createLogger(true);
  let llmController: LlmController | null = null;
  let llmPanelHost: LlmPanelHost | null = null;
  let editorHost: DocRightEditorHost | null = null;

  const ensureHosts = (settings: Awaited<ReturnType<typeof ensureSettingsFile>>) => {
    if (!llmController) {
      llmController = new LlmController(settings, logger);
      llmPanelHost = new LlmPanelHost(llmController, settings, logger);
    } else if (llmPanelHost) {
      llmController.updateSettings(settings);
      llmPanelHost.updateSettings(settings);
    }

    if (!editorHost) {
      editorHost = new DocRightEditorHost(context.extensionUri, settings, logger);
    } else {
      editorHost.updateSettings(settings);
    }
  };

  const startSession = vscode.commands.registerCommand('docRightRefactor.startSession', async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to start DocRight.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    const config = await loadDocRightConfig(root);

    if (!config) {
      if (await docRightConfigExists(root)) {
        void vscode.window.showErrorMessage('DocRight config exists but could not be parsed.');
        return;
      }
      const confirmed = await vscode.window.showInformationMessage(
        `Create a DocRight project in ${root}?`,
        { modal: true },
        'Create'
      );
      if (confirmed !== 'Create') {
        return;
      }

      try {
        await initializeDocRightProject(root, settings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Failed to create DocRight project: ${message}`);
        return;
      }

      ensureHosts(settings);
      if (editorHost) {
        await editorHost.open(root);
      }
      void vscode.window.showInformationMessage('DocRight project created.');
      return;
    }

    ensureHosts(settings);
    if (editorHost) {
      await editorHost.open(root);
    }
    const message = `DocRight settings ready (model: ${settings.llm.defaultModel}).`;
    void vscode.window.showInformationMessage(message);
  });

  const openLlmPanel = vscode.commands.registerCommand('docRightRefactor.openLlmPanel', async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to open the LLM panel.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);

    let html = '';
    if (editorHost && editorHost.isOpenForRoot(root)) {
      try {
        html = await editorHost.requestHtmlExport();
      } catch (error) {
        logger.debug('Failed to export editor HTML for LLM prompt', error);
      }
    }

    const prompt = await buildPromptPreview(root, settings, { html });
    if (llmPanelHost) {
      await llmPanelHost.open(prompt);
    }
  });

  const openEditor = vscode.commands.registerCommand('docRightRefactor.openEditor', async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to open the DocRight editor.');
      return;
    }

    const config = await loadDocRightConfig(root);
    if (!config) {
      void vscode.window.showErrorMessage('No DocRight project found in this workspace.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.open(root);
    }
  });

  const setScopeSelection = vscode.commands.registerCommand('docRightRefactor.setScopeSelection', async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to set scope.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.setScopeToSelection();
    }
  });

  const setScopeFull = vscode.commands.registerCommand('docRightRefactor.setScopeFull', async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to set scope.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.setScopeToFull();
    }
  });

  context.subscriptions.push(startSession);
  context.subscriptions.push(openLlmPanel);
  context.subscriptions.push(openEditor);
  context.subscriptions.push(setScopeSelection);
  context.subscriptions.push(setScopeFull);

  return {
    getLlmDiagnostics: () => llmController?.getDiagnostics() ?? { lastPromptId: null, lastPromptLength: null }
  };
}

export function deactivate() {
  // No-op
}
