import * as path from 'path';
import * as vscode from 'vscode';

import { buildSnippet } from '../core/callouts';
import { buildPromptPreview } from './prompt-preview';
import { loadDocRightCallouts } from '../storage/docright-callouts';
import { loadDocRightContexts, saveDocRightContexts, type DocRightContextItem } from '../storage/docright-contexts';
import { listDocRightIterations, restoreDocRightIteration, saveDocRightIteration } from '../storage/docright-iterations';
import { loadDocRightScope } from '../storage/docright-scope';
import { type DocRightSettings, ensureSettingsFile } from '../settings/settings';
import { getCalloutsPanelHtml } from '../webview/callouts-panel';
import {
  type CalloutsFromWebviewMessage,
  type CalloutsStateMessage,
  type CalloutsToWebviewMessage,
  isCalloutsFromWebviewMessage
} from '../webview/callouts-panel-messages';
import { type LlmController } from '../llm/controller';
import { type Logger } from './logger';
import { DocRightEditorHost } from './docright-editor-host';
import { type LlmPanelHost } from './llm-panel-host';
import { promptSummaryBullets } from './iteration-summary';
import { DocRightTimelinePanelHost } from './timeline-panel-host';

export class DocRightCalloutsHost {
  private panel: vscode.WebviewPanel | null = null;
  private root: string | null = null;
  private extensionUri: vscode.Uri;
  private logger: Logger;
  private editorHost: DocRightEditorHost;
  private llmPanelHost: LlmPanelHost;
  private llmController: LlmController;
  private settings: DocRightSettings;
  private timelinePanelHost: DocRightTimelinePanelHost;
  private selectedContextId: string | null = null;
  private selectedInlineId: string | null = null;
  private selectedOverallId: string | null = null;
  private lastInstructionTarget: 'inline' | 'overall' | null = null;
  private lastInstructionWebview: vscode.Webview | null = null;
  private refreshTimeline: (() => void) | null = null;

  constructor(
    extensionUri: vscode.Uri,
    editorHost: DocRightEditorHost,
    llmPanelHost: LlmPanelHost,
    llmController: LlmController,
    timelinePanelHost: DocRightTimelinePanelHost,
    settings: DocRightSettings,
    logger: Logger
  ) {
    this.extensionUri = extensionUri;
    this.editorHost = editorHost;
    this.llmPanelHost = llmPanelHost;
    this.llmController = llmController;
    this.timelinePanelHost = timelinePanelHost;
    this.settings = settings;
    this.logger = logger;
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
  }

  setTimelineRefreshHandler(handler: (() => void) | null): void {
    this.refreshTimeline = handler;
  }

  async open(root: string, options?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean }): Promise<void> {
    const viewColumn = options?.viewColumn ?? vscode.ViewColumn.Two;
    const preserveFocus = options?.preserveFocus ?? true;
    this.root = root;

    if (this.panel) {
      this.panel.reveal(viewColumn, preserveFocus);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'docRightRefactor.calloutsPanel',
      'DocRight Callouts',
      { viewColumn, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'callouts-panel.js')
    );

    this.panel.webview.html = getCalloutsPanelHtml({
      cspSource: this.panel.webview.cspSource,
      scriptUri: scriptUri.toString()
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!isCalloutsFromWebviewMessage(message)) {
        this.logger.debug('unknown callouts message', message);
        return;
      }
      await this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.lastInstructionWebview = null;
      this.lastInstructionTarget = null;
      this.panel = null;
    });

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel || !this.root) {
      return;
    }
    const payload = await this.buildState(this.root);
    void this.panel.webview.postMessage(payload);
  }

  private async handleMessage(message: CalloutsFromWebviewMessage): Promise<void> {
    if (!this.root) {
      return;
    }
    switch (message.type) {
      case 'selectCallout':
        await this.selectInlineCallout(message.id);
        break;
      case 'updateInstruction':
        await this.editorHost.updateInlineInstruction(message.id, message.instruction);
        break;
      case 'removeCallout':
        await this.editorHost.removeInlineCallout(message.id);
        break;
      case 'selectOverallCallout':
        await this.selectOverallCallout(message.id);
        break;
      case 'updateOverallInstruction':
        await this.editorHost.updateOverallInstruction(message.id, message.instruction);
        break;
      case 'removeOverallCallout':
        await this.editorHost.removeOverallCallout(message.id);
        break;
      case 'addOverallCallout':
        await this.editorHost.addOverallCalloutFromPanel();
        break;
      case 'selectContext':
        this.selectContext(message.id);
        break;
      case 'removeContext':
        await this.removeContext(message.id);
        break;
      case 'openContext':
        await this.openContext(message.id);
        break;
      case 'insertSelectedContext':
        await this.insertContextReferenceById(message.id);
        break;
      case 'addContextFile':
        await this.addContextFile();
        break;
      case 'toggleContextActive':
        await this.toggleContextActive(message.id, message.active);
        break;
      case 'setScopeSelection':
        await this.editorHost.setScopeToSelection();
        break;
      case 'setScopeFull':
        await this.editorHost.setScopeToFull();
        break;
      case 'runLlm':
        await this.runLlm();
        break;
      case 'saveIteration':
        await this.saveIteration();
        break;
      case 'openTimeline':
        await this.openTimelinePanel();
        break;
      case 'restoreIteration':
        await this.restoreIteration(message.id);
        await this.refresh();
        break;
      case 'instructionFocus':
        this.lastInstructionTarget = message.target;
        this.lastInstructionWebview = this.panel?.webview ?? null;
        break;
      default:
        break;
    }
    if (message.type !== 'instructionFocus') {
      await this.refresh();
    }
  }

  private async openTimelinePanel(): Promise<void> {
    if (!this.root) {
      return;
    }
    await this.timelinePanelHost.open(this.root, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
  }

  private async buildState(root: string): Promise<CalloutsStateMessage> {
    const contextsState = await loadDocRightContexts(root);
    const contexts = contextsState.items.map((item, index) => ({
      id: item.id,
      displayNumber: index + 1,
      name: item.name,
      description: item.description,
      path: item.path,
      active: Boolean(item.active)
    }));

    const selectedContextId =
      this.selectedContextId && contexts.some((item) => item.id === this.selectedContextId)
        ? this.selectedContextId
        : null;
    this.selectedContextId = selectedContextId;

    const hasEditor = this.editorHost.isOpenForRoot(root);
    if (!hasEditor) {
      return {
        type: 'state',
        hasEditor: false,
        docName: '',
        contexts,
        selectedContextId,
        overallCallouts: [],
        inlineCallouts: [],
        selectedOverallId: null,
        selectedInlineId: null,
        scope: { supported: false },
        llm: { supported: false, status: 'Idle', isRunning: false, canApply: false },
        iterations: []
      };
    }

    const calloutsState = await loadDocRightCallouts(root);
    const inlineCallouts = calloutsState.inline.map((item, index) => ({
      id: item.id,
      displayNumber: index + 1,
      instruction: item.instruction,
      snippet: buildSnippet(item.text || '')
    }));

    const overallCallouts = calloutsState.overall.map((item, index) => ({
      id: item.id,
      displayNumber: index + 1,
      instruction: item.instruction,
      snippet: buildSnippet(item.instruction || '')
    }));

    const nextInlineId =
      this.selectedInlineId && inlineCallouts.some((item) => item.id === this.selectedInlineId)
        ? this.selectedInlineId
        : calloutsState.selectedInlineId;
    const nextOverallId =
      this.selectedOverallId && overallCallouts.some((item) => item.id === this.selectedOverallId)
        ? this.selectedOverallId
        : calloutsState.selectedOverallId;

    this.selectedInlineId = inlineCallouts.some((item) => item.id === nextInlineId) ? nextInlineId : null;
    this.selectedOverallId = overallCallouts.some((item) => item.id === nextOverallId) ? nextOverallId : null;

    const scopeState = await loadDocRightScope(root);
    const llmState = this.llmController.getStateSnapshot();
    const iterations = await listDocRightIterations(root);

    return {
      type: 'state',
      hasEditor: true,
      docName: path.basename(root),
      contexts,
      selectedContextId,
      overallCallouts,
      inlineCallouts,
      selectedOverallId: this.selectedOverallId,
      selectedInlineId: this.selectedInlineId,
      scope: { supported: true, mode: scopeState.mode },
      llm: {
        supported: true,
        status: llmState.status || 'Idle',
        isRunning: Boolean(llmState.isRunning),
        canApply: Boolean(llmState.canApply)
      },
      iterations
    };
  }

  private async selectInlineCallout(id: string): Promise<void> {
    this.selectedInlineId = id;
    await this.editorHost.selectInlineCallout(id);
  }

  private async selectOverallCallout(id: string): Promise<void> {
    this.selectedOverallId = id;
    await this.editorHost.selectOverallCallout(id);
  }

  private selectContext(id: string): void {
    this.selectedContextId = id;
  }

  private async addContextFile(): Promise<void> {
    if (!this.root) {
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      title: 'Select a context file',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Add Context File'
    });

    if (!selected || selected.length === 0) {
      return;
    }

    const fileUri = selected[0];
    const suggestedName = path.basename(fileUri.fsPath);
    const name = await vscode.window.showInputBox({
      title: 'Context Name',
      prompt: 'Name to reference in callouts',
      value: suggestedName
    });

    if (name === undefined) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      void vscode.window.showErrorMessage('Context name cannot be empty.');
      return;
    }

    const contextsState = await loadDocRightContexts(this.root);
    const duplicate = contextsState.items.some(
      (item) => item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      void vscode.window.showErrorMessage('A context file with this name already exists.');
      return;
    }

    const description = await vscode.window.showInputBox({
      title: 'Context Description',
      prompt: 'Short description (optional)'
    });

    if (description === undefined) {
      return;
    }

    const item: DocRightContextItem = {
      id: `context-${this.nextContextId(contextsState.items)}`,
      name: trimmedName,
      description: description.trim(),
      path: fileUri.fsPath,
      active: false
    };

    contextsState.items.push(item);
    await saveDocRightContexts(this.root, contextsState);
    this.selectedContextId = item.id;
  }

  private async removeContext(id: string): Promise<void> {
    if (!this.root) {
      return;
    }
    const contextsState = await loadDocRightContexts(this.root);
    const nextItems = contextsState.items.filter((item) => item.id !== id);
    if (nextItems.length === contextsState.items.length) {
      return;
    }
    contextsState.items = nextItems;
    await saveDocRightContexts(this.root, contextsState);
    if (this.selectedContextId === id) {
      this.selectedContextId = null;
    }
  }

  private async openContext(id: string): Promise<void> {
    if (!this.root) {
      return;
    }
    const contextsState = await loadDocRightContexts(this.root);
    const item = contextsState.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(item.path));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open context file.';
      void vscode.window.showErrorMessage(`Failed to open context file: ${message}`);
    }
  }

  private async insertContextReferenceById(id: string): Promise<void> {
    if (!this.root) {
      return;
    }
    const contextsState = await loadDocRightContexts(this.root);
    const item = contextsState.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    if (!item.active) {
      void vscode.window.showInformationMessage('Enable the context checkbox to insert it.');
      return;
    }
    this.insertContextReferenceToken(item.name);
  }

  private async toggleContextActive(id: string, active: boolean): Promise<void> {
    if (!this.root) {
      return;
    }
    const contextsState = await loadDocRightContexts(this.root);
    const item = contextsState.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    item.active = Boolean(active);
    await saveDocRightContexts(this.root, contextsState);
  }

  private insertContextReferenceToken(token: string): void {
    if (!token) {
      return;
    }
    if (!this.lastInstructionWebview || !this.lastInstructionTarget) {
      void vscode.window.showInformationMessage(
        'Focus an instruction box in the callouts panel to insert context.'
      );
      return;
    }
    const payload: CalloutsToWebviewMessage = {
      type: 'insertContextReference',
      target: this.lastInstructionTarget,
      token
    };
    void this.lastInstructionWebview.postMessage(payload);
  }

  private async runLlm(): Promise<void> {
    if (!this.root) {
      return;
    }
    const callouts = await loadDocRightCallouts(this.root);
    if (callouts.inline.length === 0 && callouts.overall.length === 0) {
      void vscode.window.showInformationMessage('Add at least one callout before generating a prompt.');
      return;
    }
    let html = '';
    if (this.editorHost.isOpenForRoot(this.root)) {
      try {
        html = await this.editorHost.requestHtmlExport();
      } catch (error) {
        this.logger.debug('Failed to export editor HTML for LLM prompt', error);
      }
    }
    this.settings = await ensureSettingsFile(this.root);
    const prompt = await buildPromptPreview(this.root, this.settings, { html });
    this.llmPanelHost.setRoot(this.root);
    await this.llmPanelHost.open(prompt, { viewColumn: vscode.ViewColumn.Three, preserveFocus: true });
  }

  private async saveIteration(): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    await this.editorHost.flushPendingSave();
    const scope = await loadDocRightScope(this.root);
    const llmState = this.llmController.getStateSnapshot();
    const summaryBullets = await promptSummaryBullets('Iteration summary');
    if (summaryBullets === null) {
      return;
    }
    const iteration = await saveDocRightIteration(this.root, {
      scope,
      model: llmState.model ?? null,
      reason: 'manual',
      summaryBullets
    });
    this.refreshTimelineViews();
    void vscode.window.showInformationMessage(`Saved iteration ${iteration.label}.`);
  }

  private async restoreIteration(iterationId: string): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }

    let targetId = iterationId;
    if (!targetId) {
      const iterations = await listDocRightIterations(this.root);
      if (iterations.length === 0) {
        void vscode.window.showInformationMessage('No iterations saved yet.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        iterations.map((item) => ({ label: item.label, id: item.id })),
        { title: 'Restore iteration' }
      );
      if (!picked) {
        return;
      }
      targetId = picked.id;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Restore iteration #${targetId}? This will overwrite the current document state.`,
      { modal: true },
      'Restore'
    );
    if (confirm !== 'Restore') {
      return;
    }

    try {
      await restoreDocRightIteration(this.root, targetId);
      await this.editorHost.reloadFromDisk();
      await this.llmPanelHost.restoreResponseFromDisk(this.root);
      await this.refresh();
      this.refreshTimelineViews();
      void vscode.window.showInformationMessage(`Restored iteration #${targetId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore iteration.';
      void vscode.window.showErrorMessage(message);
    }
  }

  private refreshTimelineViews(): void {
    this.refreshTimeline?.();
    void this.timelinePanelHost.refresh();
  }

  private nextContextId(items: DocRightContextItem[]): number {
    let maxId = 0;
    for (const item of items) {
      const match = /^context-(\d+)$/.exec(item.id);
      if (!match) {
        continue;
      }
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxId = Math.max(maxId, value);
      }
    }
    return maxId + 1;
  }
}
