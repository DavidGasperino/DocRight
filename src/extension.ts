import * as path from 'path';
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
import { DocRightCalloutsHost } from './host/callouts-panel-host';

type RefactorApi = {
  getLlmDiagnostics: () => ReturnType<LlmController['getDiagnostics']>;
};

export function activate(context: vscode.ExtensionContext): RefactorApi {
  const logger = createLogger(true);
  let activeRoot: string | null = null;
  let llmController: LlmController | null = null;
  let llmPanelHost: LlmPanelHost | null = null;
  let editorHost: DocRightEditorHost | null = null;
  let calloutsHost: DocRightCalloutsHost | null = null;

  const ensureHosts = (settings: Awaited<ReturnType<typeof ensureSettingsFile>>) => {
    if (!llmController) {
      llmController = new LlmController(settings, logger);
      llmPanelHost = new LlmPanelHost(context.extensionUri, llmController, settings, logger);
    } else if (llmPanelHost) {
      llmController.updateSettings(settings);
      llmPanelHost.updateSettings(settings);
    }

    if (!editorHost) {
      editorHost = new DocRightEditorHost(context.extensionUri, settings, logger);
    } else {
      editorHost.updateSettings(settings);
    }
    if (llmPanelHost && editorHost) {
      llmPanelHost.setEditorHost(editorHost);
    }

    if (editorHost && llmPanelHost && llmController && !calloutsHost) {
      calloutsHost = new DocRightCalloutsHost(
        context.extensionUri,
        editorHost,
        llmPanelHost,
        llmController,
        settings,
        logger
      );
      editorHost.setCalloutsChangedHandler(() => {
        void calloutsHost?.refresh();
      });
      llmPanelHost.setCalloutsRefreshHandler(() => {
        void calloutsHost?.refresh();
      });
    } else if (calloutsHost) {
      calloutsHost.updateSettings(settings);
    }
  };

  const getSessionRoot = (): string | null => activeRoot ?? getWorkspaceRoot();

  const pickDocRightRoot = async (): Promise<{ root: string; mode: 'new' | 'resume' } | null> => {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Start a new DocRight project', value: 'new' as const },
        { label: 'Resume an existing DocRight project', value: 'resume' as const }
      ],
      { placeHolder: 'Start a new DocRight session or resume an existing one' }
    );
    if (!choice) {
      return null;
    }

    const workspaceRoot = getWorkspaceRoot();
    const folders = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri: workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined,
      openLabel: 'Select project folder'
    });
    if (!folders || folders.length === 0) {
      return null;
    }
    return { root: folders[0].fsPath, mode: choice.value };
  };

  const openRooPanel = async (settings: Awaited<ReturnType<typeof ensureSettingsFile>>) => {
    const extensionAvailable = settings.roo.extensionIds.some((id) => vscode.extensions.getExtension(id));
    if (!extensionAvailable) {
      return;
    }
    try {
      await vscode.commands.executeCommand('roo-cline.openInNewTab');
      llmPanelHost?.markRooOpened();
    } catch (error) {
      logger.debug('Failed to open Roo panel', error);
    }
  };

  const openLlmPanelForRoot = async (
    root: string,
    settings: Awaited<ReturnType<typeof ensureSettingsFile>>
  ) => {
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
      llmPanelHost.setRoot(root);
      await llmPanelHost.open(prompt, {
        viewColumn: vscode.ViewColumn.Three,
        preserveFocus: true
      });
    }
  };

  const startSession = vscode.commands.registerCommand('docRight.startSession', async () => {
    const selection = await pickDocRightRoot();
    if (!selection) {
      return;
    }
    const { root, mode } = selection;
    activeRoot = root;

    if (mode === 'new') {
      if (await docRightConfigExists(root)) {
        void vscode.window.showErrorMessage('DocRight config already exists in this folder.');
        return;
      }
      const confirmed = await vscode.window.showInformationMessage(
        `Create DocRight project in ${root}?`,
        { modal: true },
        'Create'
      );
      if (confirmed !== 'Create') {
        return;
      }
      const settings = await ensureSettingsFile(root);
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
      if (calloutsHost) {
        await calloutsHost.open(root, { viewColumn: vscode.ViewColumn.Two, preserveFocus: true });
      }
      await openLlmPanelForRoot(root, settings);
      await openRooPanel(settings);
      void vscode.window.showInformationMessage('DocRight project created.');
      return;
    }

    const config = await loadDocRightConfig(root);
    if (!config) {
      void vscode.window.showErrorMessage('No DocRight config found in that folder.');
      return;
    }
    const settings = await ensureSettingsFile(root);
    ensureHosts(settings);
    if (editorHost) {
      await editorHost.open(root);
    }
    if (calloutsHost) {
      await calloutsHost.open(root, { viewColumn: vscode.ViewColumn.Two, preserveFocus: true });
    }
    await openLlmPanelForRoot(root, settings);
    await openRooPanel(settings);
    void vscode.window.showInformationMessage('DocRight project resumed.');
  });

  const openLlmPanel = vscode.commands.registerCommand('docRightRefactor.openLlmPanel', async () => {
    const root = getSessionRoot();
    if (!root) {
      void vscode.window.showErrorMessage('Open a workspace folder to open the LLM panel.');
      return;
    }

    const settings = await ensureSettingsFile(root);
    await openLlmPanelForRoot(root, settings);
  });

  const openEditor = vscode.commands.registerCommand('docRightRefactor.openEditor', async () => {
    const root = getSessionRoot();
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
    const root = getSessionRoot();
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
    const root = getSessionRoot();
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

  const closeRooResponseEditor = async (document: vscode.TextDocument): Promise<void> => {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const responseSuffix = path.join('.docright', 'llm', 'roo_response.html');
    if (!document.uri.fsPath.endsWith(responseSuffix)) {
      return;
    }
    const active = vscode.window.activeTextEditor;
    if (!active || active.document !== document) {
      return;
    }
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  };

  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => void closeRooResponseEditor(document)));

  return {
    getLlmDiagnostics: () => llmController?.getDiagnostics() ?? { lastPromptId: null, lastPromptLength: null }
  };
}

export function deactivate() {
  // No-op
}
