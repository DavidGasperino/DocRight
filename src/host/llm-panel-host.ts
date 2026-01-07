import * as vscode from 'vscode';

import { type DocRightSettings } from '../settings/settings';
import { loadDocRightScope } from '../storage/docright-scope';
import { saveDocRightIteration } from '../storage/docright-iterations';
import { loadDocRightContexts, saveDocRightContexts } from '../storage/docright-contexts';
import { getDocRightRooResponsePath } from '../storage/docright-paths';
import { LlmController } from '../llm/controller';
import { extractDocRightSummary } from '../llm/summary';
import { getLlmPanelHtml } from '../webview/llm-panel';
import { isLlmFromWebviewMessage } from '../webview/messages';
import { type Logger } from './logger';
import { RooIntegration } from './roo';
import { type DocRightEditorHost } from './docright-editor-host';
import { promptSummaryBullets } from './iteration-summary';
import { appendDiagnosticsLog, captureTabGroups } from './ui-diagnostics';

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
  private refreshTimeline: (() => void) | null = null;

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

  isOpen(): boolean {
    return Boolean(this.panel);
  }

  getViewColumn(): vscode.ViewColumn | null {
    return this.panel?.viewColumn ?? null;
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

  setTimelineRefreshHandler(handler: (() => void) | null): void {
    this.refreshTimeline = handler;
  }

  async restoreResponseFromDisk(root: string): Promise<void> {
    const responsePath = getDocRightRooResponsePath(root);
    let raw = '';
    try {
      const buffer = await vscode.workspace.fs.readFile(vscode.Uri.file(responsePath));
      raw = Buffer.from(buffer).toString('utf8');
    } catch (error) {
      raw = '';
    }

    const { cleaned, bullets } = extractDocRightSummary(raw);
    const trimmed = cleaned.trim();
    this.controller.setResponseWithSummary(trimmed, bullets);
    this.controller.updateState({
      status: trimmed ? 'Iteration restored' : 'Idle',
      isRunning: false,
      canApply: trimmed.length > 0
    });
    await this.controller.postState();
  }

  private async resetContextSelections(): Promise<void> {
    const root = this.root;
    if (!root) {
      return;
    }
    const contextsState = await loadDocRightContexts(root);
    let changed = false;
    const nextItems = contextsState.items.map((item) => {
      if (item.active) {
        changed = true;
      }
      return { ...item, active: false };
    });
    if (!changed) {
      return;
    }
    await saveDocRightContexts(root, { items: nextItems });
    this.refreshCallouts?.();
  }

  async open(
    prompt: string,
    options?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean }
  ): Promise<void> {
    const viewColumn = options?.viewColumn ?? vscode.ViewColumn.Beside;
    const preserveFocus = options?.preserveFocus ?? true;
    if (this.panel) {
      this.panel.title = 'DocRight LLM';
      const revealColumn = this.panel.viewColumn ?? viewColumn;
      this.logUiEvent('llm.open.reveal', {
        requestedViewColumn: viewColumn,
        preserveFocus,
        panelViewColumn: this.panel.viewColumn ?? null,
        revealColumn
      });
      this.panel.reveal(revealColumn, preserveFocus);
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
    this.logUiEvent('llm.open.created', {
      requestedViewColumn: viewColumn,
      preserveFocus,
      panelViewColumn: this.panel.viewColumn ?? null
    });

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
          await this.resetContextSelections();
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

    this.panel.onDidChangeViewState((event) => {
      this.logUiEvent('llm.viewState', {
        active: event.webviewPanel.active,
        visible: event.webviewPanel.visible,
        viewColumn: event.webviewPanel.viewColumn ?? null
      });
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

  private logUiEvent(event: string, extra?: Record<string, unknown>): void {
    if (!this.root) {
      return;
    }
    const payload = {
      root: this.root,
      llmViewColumn: this.panel?.viewColumn ?? null,
      tabGroups: captureTabGroups(),
      ...(extra ?? {})
    };
    void appendDiagnosticsLog(this.root, event, payload);
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
      await this.resetContextSelections();
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
    this.controller.setResponse('');
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
    let summaryBullets: string[] = [];
    if (reason === 'manual') {
      const manualBullets = await promptSummaryBullets('Iteration summary');
      if (manualBullets === null) {
        return;
      }
      summaryBullets = manualBullets;
    } else {
      summaryBullets = this.controller.getLastSummaryBullets();
    }
    const iteration = await saveDocRightIteration(root, {
      scope,
      model: llmState.model ?? null,
      reason,
      summaryBullets
    });
    this.refreshTimeline?.();
    if (reason === 'manual') {
      void vscode.window.showInformationMessage(`Saved iteration ${iteration.label}.`);
    }
  }
}
