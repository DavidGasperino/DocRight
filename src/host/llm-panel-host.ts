import * as vscode from 'vscode';

import { type DocRightSettings } from '../settings/settings';
import { loadDocRightScope } from '../storage/docright-scope';
import { saveDocRightIteration } from '../storage/docright-iterations';
import { LlmController } from '../llm/controller';
import { getLlmPanelHtml } from '../webview/llm-panel';
import { isLlmFromWebviewMessage } from '../webview/messages';
import { type Logger } from './logger';
import { RooIntegration } from './roo';
import { type DocRightEditorHost } from './docright-editor-host';

export class LlmPanelHost {
  private panel: vscode.WebviewPanel | null = null;
  private controller: LlmController;
  private settings: DocRightSettings;
  private logger: Logger;
  private extensionUri: vscode.Uri;
  private roo: RooIntegration;
  private editorHost: DocRightEditorHost | null = null;
  private root: string | null = null;
  private refreshCallouts: (() => void) | null = null;

  constructor(extensionUri: vscode.Uri, controller: LlmController, settings: DocRightSettings, logger: Logger) {
    this.extensionUri = extensionUri;
    this.controller = controller;
    this.settings = settings;
    this.logger = logger;
    this.roo = new RooIntegration(settings, controller, logger);
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
    this.controller.updateSettings(settings);
    this.roo.updateSettings(settings);
  }

  setEditorHost(editorHost: DocRightEditorHost | null): void {
    this.editorHost = editorHost;
  }

  setRoot(root: string | null): void {
    this.root = root;
    this.roo.setRoot(root);
  }

  markRooOpened(): void {
    this.roo.markOpened();
  }

  setCalloutsRefreshHandler(handler: (() => void) | null): void {
    this.refreshCallouts = handler;
  }

  async open(
    prompt: string,
    options?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean }
  ): Promise<void> {
    const viewColumn = options?.viewColumn ?? vscode.ViewColumn.Beside;
    const preserveFocus = options?.preserveFocus ?? true;
    if (this.panel) {
      this.panel.title = 'DocRight LLM';
      this.panel.reveal(viewColumn, preserveFocus);
      this.controller.setPrompt(prompt);
      await this.controller.postState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'docRightRefactor.llmPanel',
      'DocRight LLM',
      { viewColumn, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.controller.setMessenger({
      postMessage: (message) => this.panel?.webview.postMessage(message) ?? Promise.resolve(false)
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!isLlmFromWebviewMessage(message)) {
        this.logger.debug('unknown webview message', message);
        return;
      }
      if (message.type === 'llm.sendRoo') {
        try {
          await this.roo.sendPrompt(message.prompt);
        } catch (error) {
          const messageText = error instanceof Error ? error.message : 'Failed to start Roo Code task.';
          void vscode.window.showErrorMessage(messageText);
        }
        return;
      }
      if (message.type === 'llm.apply') {
        await this.applyResponse(message.response);
        return;
      }
      if (message.type === 'llm.reject') {
        await this.rejectResponse();
        return;
      }
      if (message.type === 'llm.saveIteration') {
        await this.saveIteration('manual');
        return;
      }
      await this.controller.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.roo.dispose();
      this.panel = null;
      this.controller.setMessenger(null);
    });

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'llm-panel.js')
    );

    this.panel.webview.html = getLlmPanelHtml({
      debugEnabled: this.settings.diagnostics.debugLogging,
      cspSource: this.panel.webview.cspSource,
      scriptUri: scriptUri.toString()
    });

    this.controller.setPrompt(prompt);
    await this.controller.postState();
  }

  private async applyResponse(response: string): Promise<void> {
    const root = this.root;
    if (!root) {
      void vscode.window.showErrorMessage('No DocRight project is open.');
      return;
    }
    if (!this.editorHost || !this.editorHost.isOpenForRoot(root)) {
      void vscode.window.showErrorMessage('Open the DocRight document before applying changes.');
      return;
    }
    const trimmed = String(response || '').trim();
    if (!trimmed) {
      void vscode.window.showErrorMessage('LLM response is empty.');
      return;
    }

    try {
      const llmState = this.controller.getStateSnapshot();
      const scope = await loadDocRightScope(root);
      if (llmState.autoSaveIteration) {
        await this.saveIteration('pre-apply');
      }
      await this.editorHost.applyScopeUpdate(trimmed, scope);
      await this.editorHost.clearCallouts();
      this.refreshCallouts?.();
      this.roo.stop();
      this.controller.updateState({
        status: 'Applied',
        canApply: false,
        isRunning: false
      });
      await this.controller.postState();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Failed to apply LLM response.';
      void vscode.window.showErrorMessage(messageText);
    }
  }

  private async rejectResponse(): Promise<void> {
    this.roo.stop();
    this.controller.updateState({
      status: 'Rejected',
      canApply: false,
      isRunning: false
    });
    await this.controller.postState();
  }

  private async saveIteration(reason: 'manual' | 'pre-apply'): Promise<void> {
    const root = this.root;
    if (!root) {
      void vscode.window.showErrorMessage('No DocRight project is open.');
      return;
    }
    if (this.editorHost) {
      await this.editorHost.flushPendingSave();
    }
    const llmState = this.controller.getStateSnapshot();
    const scope = await loadDocRightScope(root);
    const iteration = await saveDocRightIteration(root, {
      scope,
      model: llmState.model ?? null,
      reason
    });
    if (reason === 'manual') {
      void vscode.window.showInformationMessage(`Saved iteration ${iteration.label}.`);
    }
  }
}
