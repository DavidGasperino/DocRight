import * as vscode from 'vscode';

import { type DocRightSettings } from '../settings/settings';
import { loadDocRightDocument, saveDocRightDocument } from '../storage/docright-document';
import {
  loadDocRightCallouts,
  saveDocRightCallouts,
  type DocRightCalloutsState,
  type DocRightInlineCallout,
  type DocRightOverallCallout
} from '../storage/docright-callouts';
import { loadDocRightContexts, type DocRightContextsState } from '../storage/docright-contexts';
import { loadDocRightScope, saveDocRightScope } from '../storage/docright-scope';
import { type DocRightScopeState } from '../core/scope';
import { getDocRightEditorHtml } from '../webview/docright-editor';
import {
  type DocRightFromWebviewMessage,
  type DocRightSelectionPayload,
  type DocRightInlineCalloutPayload,
  type DocRightToWebviewMessage,
  isDocRightFromWebviewMessage
} from '../webview/docright-editor-messages';
import { type Logger } from './logger';
import { appendDiagnosticsLog } from './ui-diagnostics';

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class DocRightEditorHost {
  private panel: vscode.WebviewPanel | null = null;
  private root: string | null = null;
  private settings: DocRightSettings;
  private logger: Logger;
  private extensionUri: vscode.Uri;
  private calloutsState: DocRightCalloutsState | null = null;
  private contextsState: DocRightContextsState | null = null;
  private scopeState: DocRightScopeState | null = null;
  private docState: string | null = null;
  private webviewReady = false;
  private pendingLoad = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private pendingSaveState: string | null = null;
  private exportRequests = new Map<number, PendingRequest<string>>();
  private applyRequests = new Map<number, PendingRequest<void>>();
  private exportCounter = 1;
  private applyCounter = 1;
  private nextInlineId = 1;
  private nextOverallId = 1;
  private editorActive = false;
  private lastSelectionPayload: DocRightSelectionPayload | null = null;
  private calloutsChangedHandler: (() => void) | null = null;
  private readyWaiters: ReadyWaiter[] = [];

  constructor(extensionUri: vscode.Uri, settings: DocRightSettings, logger: Logger) {
    this.extensionUri = extensionUri;
    this.settings = settings;
    this.logger = logger;
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
  }

  setCalloutsChangedHandler(handler: (() => void) | null): void {
    this.calloutsChangedHandler = handler;
  }

  async flushPendingSave(): Promise<void> {
    await this.flushSave();
  }

  async reloadFromDisk(): Promise<void> {
    if (!this.root) {
      return;
    }
    await this.loadProjectState(this.root);
    if (this.panel) {
      await this.postDocRightState();
      this.postDocRightScope();
    }
  }

  async selectInlineCallout(id: string | null): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const nextId = this.calloutsState.inline.some((item) => item.id === id) ? id : null;
    this.calloutsState.selectedInlineId = nextId;
    this.postMessage({ type: 'docright.selectInlineCallout', id: nextId });
    this.calloutsChangedHandler?.();
  }

  async selectOverallCallout(id: string | null): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const nextId = this.calloutsState.overall.some((item) => item.id === id) ? id : null;
    this.calloutsState.selectedOverallId = nextId;
    this.calloutsChangedHandler?.();
  }

  async updateInlineInstruction(id: string, instruction: string): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const target = this.calloutsState.inline.find((item) => item.id === id);
    if (!target) {
      return;
    }
    target.instruction = instruction.trim();
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();
  }

  async updateOverallInstruction(id: string, instruction: string): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const target = this.calloutsState.overall.find((item) => item.id === id);
    if (!target) {
      return;
    }
    target.instruction = instruction.trim();
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();
  }

  async removeInlineCallout(id: string): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const nextInline = this.calloutsState.inline.filter((item) => item.id !== id);
    if (nextInline.length === this.calloutsState.inline.length) {
      return;
    }
    this.calloutsState.inline = nextInline;
    if (this.calloutsState.selectedInlineId === id) {
      this.calloutsState.selectedInlineId = null;
    }
    this.updateCalloutCounters();
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.postMessage({ type: 'docright.removeInlineCallout', id });
    this.calloutsChangedHandler?.();
  }

  async removeOverallCallout(id: string): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const nextOverall = this.calloutsState.overall.filter((item) => item.id !== id);
    if (nextOverall.length === this.calloutsState.overall.length) {
      return;
    }
    this.calloutsState.overall = nextOverall;
    if (this.calloutsState.selectedOverallId === id) {
      this.calloutsState.selectedOverallId = null;
    }
    this.updateCalloutCounters();
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();
  }

  async addOverallCalloutFromPanel(): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }
    if (this.scopeState.locked === false) {
      void vscode.window.showInformationMessage('Lock scope to add callouts.');
      return;
    }
    const instruction = await vscode.window.showInputBox({
      title: 'Overall Callout',
      prompt: 'Describe the overall change for this document',
      placeHolder: 'e.g. tighten tone, clarify structure, fix inconsistencies'
    });
    if (instruction === undefined) {
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      void vscode.window.showErrorMessage('Instruction cannot be empty.');
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    const id = `overall-${String(this.nextOverallId++)}`;
    const item: DocRightOverallCallout = { id, instruction: trimmed };
    this.calloutsState.overall.push(item);
    this.calloutsState.selectedOverallId = id;
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();
  }

  async clearCallouts(): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }
    this.calloutsState.inline = [];
    this.calloutsState.overall = [];
    this.calloutsState.selectedInlineId = null;
    this.calloutsState.selectedOverallId = null;
    this.updateCalloutCounters();
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.postMessage({ type: 'docright.clearInlineCallouts' });
    this.calloutsChangedHandler?.();
  }

  isOpenForRoot(root: string): boolean {
    return Boolean(this.panel && this.root === root);
  }

  private getPreferredViewColumn(): vscode.ViewColumn {
    const value = Number(this.settings.ui.columns.editor);
    if (Number.isFinite(value) && value > 0) {
      return value as vscode.ViewColumn;
    }
    return vscode.ViewColumn.One;
  }

  async open(root: string): Promise<void> {
    if (this.panel && this.root && this.root !== root) {
      this.panel.dispose();
    }

    this.root = root;
    await this.loadProjectState(root);
    const viewColumn = this.getPreferredViewColumn();

    if (this.panel) {
      this.panel.reveal(viewColumn, true);
      if (this.webviewReady) {
        await this.postDocRightState();
        this.postDocRightScope();
      } else {
        this.pendingLoad = true;
      }
      return;
    }

    this.webviewReady = false;
    this.pendingLoad = true;
    this.panel = vscode.window.createWebviewPanel(
      'docRightRefactor.editor',
      `DocRight Document (${vscode.workspace.name ?? 'Refactor'})`,
      { viewColumn, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!isDocRightFromWebviewMessage(message)) {
        this.logger.debug('unknown editor message', message);
        return;
      }
      await this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      void this.flushSave();
      this.panel = null;
      this.root = null;
      this.webviewReady = false;
      this.pendingLoad = false;
      this.editorActive = false;
      this.docState = null;
      this.calloutsState = null;
      this.contextsState = null;
      this.scopeState = null;
      this.rejectReadyWaiters('DocRight editor is not open.');
    });

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'docright-editor.js')
    ).toString();
    this.panel.webview.html = getDocRightEditorHtml({
      cspSource: this.panel.webview.cspSource,
      scriptUri
    });
  }

  async setScopeToSelection(): Promise<void> {
    if (!this.panel) {
      void vscode.window.showInformationMessage('Open the DocRight editor to set scope.');
      return;
    }
    await this.awaitWebviewReady();
    const selection = this.lastSelectionPayload;
    const canUseSelection =
      selection && !selection.isCollapsed && selection.text && selection.text.trim().length > 0;
    this.postMessage({
      type: 'docright.requestScopeSelection',
      selection: canUseSelection ? selection : null
    });
    if (this.root) {
      void appendDiagnosticsLog(this.root, 'docright.scope.requested', {
        hasSelection: Boolean(canUseSelection),
        selectionLength: selection?.text ? selection.text.length : 0
      });
    }
  }

  async setScopeToFull(): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }
    this.scopeState.mode = 'full';
    this.scopeState.selection = null;
    this.scopeState.locked = true;
    this.scopeState.markerId = null;
    await saveDocRightScope(this.root, this.scopeState);
    this.postDocRightScope();
  }

  async setScopeUnlock(): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }
    this.scopeState.locked = false;
    this.scopeState.markerId = null;
    await saveDocRightScope(this.root, this.scopeState);
    this.postDocRightScope();
  }

  async requestHtmlExport(options?: {
    scope?: DocRightScopeState | null;
    useActiveScope?: boolean;
  }): Promise<string> {
    if (!this.panel) {
      throw new Error('DocRight editor is not open.');
    }
    await this.awaitWebviewReady();
    const inlineCallouts = this.getInlineCalloutPayloads();
    const requestId = this.exportCounter++;
    const scope = options?.scope ?? null;
    const useActiveScope = options?.useActiveScope ?? false;
    return new Promise<string>((resolve, reject) => {
      this.exportRequests.set(requestId, { resolve, reject });
      this.postMessage({ type: 'docright.export', requestId, inlineCallouts, scope, useActiveScope });
    });
  }

  async applyScopeUpdate(
    html: string,
    options?: { scope?: DocRightScopeState | null; useActiveScope?: boolean }
  ): Promise<void> {
    if (!this.panel) {
      throw new Error('DocRight editor is not open.');
    }
    await this.awaitWebviewReady();
    const requestId = this.applyCounter++;
    const scope = options?.scope ?? null;
    const useActiveScope = options?.useActiveScope ?? false;
    return new Promise<void>((resolve, reject) => {
      this.applyRequests.set(requestId, { resolve, reject });
      this.postMessage({ type: 'docright.applyScopeUpdate', requestId, scope, useActiveScope, html });
    });
  }

  private async loadProjectState(root: string): Promise<void> {
    this.calloutsState = await loadDocRightCallouts(root);
    this.contextsState = await loadDocRightContexts(root);
    this.scopeState = await loadDocRightScope(root);
    this.docState = await loadDocRightDocument(root);
    this.updateCalloutCounters();
  }

  private updateCalloutCounters(): void {
    const inline = this.calloutsState?.inline ?? [];
    const overall = this.calloutsState?.overall ?? [];
    this.nextInlineId = nextIdForPrefix(inline, 'inline');
    this.nextOverallId = nextIdForPrefix(overall, 'overall');
  }

  async reloadCallouts(): Promise<void> {
    if (!this.root) {
      return;
    }
    this.calloutsState = await loadDocRightCallouts(this.root);
    this.updateCalloutCounters();
  }

  private async postDocRightState(): Promise<void> {
    if (!this.root) {
      return;
    }
    if (!this.docState) {
      this.docState = await loadDocRightDocument(this.root);
    }
    this.postMessage({ type: 'docright.load', state: this.docState });
  }

  private postDocRightScope(): void {
    if (!this.scopeState) {
      return;
    }
    this.postMessage({ type: 'docright.setScope', scope: this.scopeState });
  }

  private scheduleSave(stateJson: string): void {
    this.pendingSaveState = stateJson;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    const delay = this.settings.ui.autosaveDelayMs;
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, delay);
  }

  private async flushSave(): Promise<void> {
    if (!this.root || !this.pendingSaveState) {
      return;
    }
    const state = this.pendingSaveState;
    this.pendingSaveState = null;
    try {
      await saveDocRightDocument(this.root, state);
      this.postMessage({ type: 'docright.saved', at: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save DocRight document.';
      this.postMessage({ type: 'docright.error', message });
    }
  }

  private postMessage(message: DocRightToWebviewMessage): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private getInlineCalloutPayloads(): DocRightInlineCalloutPayload[] {
    if (!this.calloutsState) {
      return [];
    }
    return this.calloutsState.inline.map((item) => ({
      id: item.id,
      instruction: item.instruction
    }));
  }

  private async handleMessage(message: DocRightFromWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'docright.ready':
        this.webviewReady = true;
        this.resolveReadyWaiters();
        if (this.pendingLoad) {
          this.pendingLoad = false;
          await this.postDocRightState();
          this.postDocRightScope();
        }
        break;
      case 'docright.update':
        if (typeof message.state === 'string') {
          this.docState = message.state;
          this.scheduleSave(message.state);
        }
        break;
      case 'docright.focus':
        this.editorActive = true;
        break;
      case 'docright.requestInlineCallout':
        await this.handleInlineCalloutRequest(message.selection);
        break;
      case 'docright.requestOverallCallout':
        await this.handleOverallCalloutRequest(message.selection);
        break;
      case 'docright.scopeSelection':
        await this.applyScopeSelection(message.selection, message.markerId ?? null);
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.scopeSelection', {
            markerId: message.markerId ?? null,
            selectionLength: message.selection?.text ? message.selection.text.length : 0,
            selectionPreview: message.selection?.text ? message.selection.text.slice(0, 120) : null
          });
        }
        break;
      case 'docright.scopeInvalid':
        await this.setScopeUnlock();
        break;
      case 'docright.selection':
        this.handleSelectionChange(message.id);
        break;
      case 'docright.selectionPayload':
        this.lastSelectionPayload = message.selection ?? null;
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.selectionPayload', {
            selectionLength: message.selection?.text ? message.selection.text.length : 0,
            selectionPreview: message.selection?.text ? message.selection.text.slice(0, 120) : null
          });
        }
        break;
      case 'docright.applyScopeComplete': {
        const entry = this.applyRequests.get(message.requestId);
        if (entry) {
          this.applyRequests.delete(message.requestId);
          entry.resolve(undefined);
        }
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.apply.complete', {
            requestId: message.requestId,
            resolution: message.resolution ?? null,
            scope: this.scopeState
              ? {
                  mode: this.scopeState.mode,
                  locked: this.scopeState.locked,
                  markerId: this.scopeState.markerId ?? null
                }
              : null
          });
        }
        break;
      }
      case 'docright.applyScopeError': {
        const entry = this.applyRequests.get(message.requestId);
        if (entry) {
          this.applyRequests.delete(message.requestId);
          entry.reject(new Error(message.message || 'Failed to apply scoped update.'));
        }
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.apply.error', {
            requestId: message.requestId,
            message: message.message || null,
            scope: this.scopeState
              ? {
                  mode: this.scopeState.mode,
                  locked: this.scopeState.locked,
                  markerId: this.scopeState.markerId ?? null
                }
              : null
          });
        }
        break;
      }
      case 'docright.applyTrace': {
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.apply.trace', {
            stage: message.stage,
            ...message.detail
          });
        }
        break;
      }
      case 'docright.scopeTrace': {
        if (this.root) {
          void appendDiagnosticsLog(this.root, 'docright.scope.trace', {
            stage: message.stage,
            ...message.detail
          });
        }
        break;
      }
      case 'docright.exportResult': {
        const entry = this.exportRequests.get(message.requestId);
        if (entry) {
          this.exportRequests.delete(message.requestId);
          entry.resolve(message.html);
        }
        break;
      }
      case 'docright.exportError': {
        const entry = this.exportRequests.get(message.requestId);
        if (entry) {
          this.exportRequests.delete(message.requestId);
          entry.reject(new Error(message.message || 'DocRight export failed.'));
        }
        break;
      }
      case 'docright.copyMarkdown': {
        try {
          const fallbackText = message.text || message.html || '';
          const clipboardText = message.markdown && message.markdown.trim().length > 0 ? message.markdown : fallbackText;
          await vscode.env.clipboard.writeText(clipboardText);
          this.postMessage({ type: 'docright.copyMarkdownResult', success: true });
        } catch (error) {
          this.postMessage({
            type: 'docright.copyMarkdownResult',
            success: false,
            message: error instanceof Error ? error.message : 'Clipboard copy failed.'
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private async applyScopeSelection(selection: DocRightSelectionPayload, markerId: string | null): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    if (!selection || selection.isCollapsed || !selection.text || !selection.text.trim()) {
      void vscode.window.showInformationMessage('Select a range of text to set the scope.');
      return;
    }

    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }

    const existingMarkerId = this.scopeState.markerId;
    const keepMarkerId =
      !markerId && existingMarkerId && this.scopeState.locked && this.scopeState.mode === 'range';

    this.scopeState.mode = 'range';
    this.scopeState.selection = {
      anchorKey: selection.anchorKey,
      anchorOffset: selection.anchorOffset,
      anchorType: selection.anchorType || 'text',
      focusKey: selection.focusKey,
      focusOffset: selection.focusOffset,
      focusType: selection.focusType || 'text',
      isBackward: Boolean(selection.isBackward)
    };
    this.scopeState.locked = true;
    this.scopeState.markerId = keepMarkerId ? existingMarkerId : markerId;

    await saveDocRightScope(this.root, this.scopeState);
    this.postDocRightScope();
  }

  private async awaitWebviewReady(): Promise<void> {
    if (this.webviewReady) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('DocRight editor is not ready yet.'));
      }, 5000);
      this.readyWaiters.push({ resolve, reject, timer });
    });
  }

  private resolveReadyWaiters(): void {
    if (this.readyWaiters.length === 0) {
      return;
    }
    const waiters = this.readyWaiters.splice(0, this.readyWaiters.length);
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve();
    });
  }

  private rejectReadyWaiters(message: string): void {
    if (this.readyWaiters.length === 0) {
      return;
    }
    const waiters = this.readyWaiters.splice(0, this.readyWaiters.length);
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    });
  }

  private handleSelectionChange(calloutId: string | null): void {
    if (!this.calloutsState) {
      return;
    }
    const nextId = this.calloutsState.inline.some((item) => item.id === calloutId) ? calloutId : null;
    if (this.calloutsState.selectedInlineId === nextId) {
      return;
    }
    this.calloutsState.selectedInlineId = nextId;
    this.calloutsChangedHandler?.();
  }

  private async handleInlineCalloutRequest(selection: DocRightSelectionPayload): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    if (!selection || !selection.text || !selection.text.trim()) {
      void vscode.window.showInformationMessage('Select text in DocRight to attach an inline callout.');
      return;
    }
    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }
    if (this.scopeState.locked === false) {
      void vscode.window.showInformationMessage('Lock scope to add callouts.');
      return;
    }
    if (this.scopeState?.mode === 'range' && selection.inScope === false) {
      void vscode.window.showInformationMessage('Inline callouts must be inside the active scope.');
      return;
    }
    if (selection.overlapsCallout) {
      void vscode.window.showErrorMessage('This selection overlaps an existing callout.');
      return;
    }

    const instruction = await vscode.window.showInputBox({
      title: 'Inline Callout',
      prompt: 'Describe the change for this selection'
    });
    if (instruction === undefined) {
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      void vscode.window.showErrorMessage('Instruction cannot be empty.');
      return;
    }

    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }

    const id = `inline-${String(this.nextInlineId++)}`;
    const item: DocRightInlineCallout = {
      id,
      instruction: trimmed,
      text: selection.text
    };
    this.calloutsState.inline.push(item);
    this.calloutsState.selectedInlineId = id;
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();

    this.postMessage({ type: 'docright.applyInlineCallout', id, selection });
  }

  private async handleOverallCalloutRequest(selection: DocRightSelectionPayload): Promise<void> {
    if (!this.root) {
      void vscode.window.showInformationMessage('No DocRight project is open.');
      return;
    }
    if (!this.scopeState) {
      this.scopeState = await loadDocRightScope(this.root);
    }
    if (this.scopeState.locked === false) {
      void vscode.window.showInformationMessage('Lock scope to add callouts.');
      return;
    }
    if (this.scopeState?.mode === 'range' && selection && selection.inScope === false) {
      void vscode.window.showInformationMessage('Overall callouts must be inside the active scope.');
      return;
    }
    const instruction = await vscode.window.showInputBox({
      title: 'Overall Callout',
      prompt: 'Describe the overall change for this document'
    });
    if (instruction === undefined) {
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      void vscode.window.showErrorMessage('Instruction cannot be empty.');
      return;
    }

    if (!this.calloutsState) {
      this.calloutsState = await loadDocRightCallouts(this.root);
    }

    const id = `overall-${String(this.nextOverallId++)}`;
    const item: DocRightOverallCallout = { id, instruction: trimmed };
    this.calloutsState.overall.push(item);
    this.calloutsState.selectedOverallId = id;
    await saveDocRightCallouts(this.root, this.calloutsState);
    this.calloutsChangedHandler?.();
  }
}

function nextIdForPrefix(items: Array<{ id: string }>, prefix: string): number {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const item of items) {
    const match = pattern.exec(item.id);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) {
        max = Math.max(max, value);
      }
    }
  }
  return max + 1;
}
