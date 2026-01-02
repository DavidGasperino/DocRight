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

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
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

  constructor(extensionUri: vscode.Uri, settings: DocRightSettings, logger: Logger) {
    this.extensionUri = extensionUri;
    this.settings = settings;
    this.logger = logger;
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
  }

  isOpenForRoot(root: string): boolean {
    return Boolean(this.panel && this.root === root);
  }

  async open(root: string): Promise<void> {
    if (this.panel && this.root && this.root !== root) {
      this.panel.dispose();
    }

    this.root = root;
    await this.loadProjectState(root);

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
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
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
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
    this.postMessage({ type: 'docright.requestScopeSelection' });
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
    await saveDocRightScope(this.root, this.scopeState);
    this.postDocRightScope();
  }

  async requestHtmlExport(): Promise<string> {
    if (!this.panel) {
      throw new Error('DocRight editor is not open.');
    }
    if (!this.webviewReady) {
      throw new Error('DocRight editor is not ready yet.');
    }
    const inlineCallouts = this.getInlineCalloutPayloads();
    const requestId = this.exportCounter++;
    return new Promise<string>((resolve, reject) => {
      this.exportRequests.set(requestId, { resolve, reject });
      this.postMessage({ type: 'docright.export', requestId, inlineCallouts });
    });
  }

  async applyScopeUpdate(html: string, scope: DocRightScopeState | null): Promise<void> {
    if (!this.panel) {
      throw new Error('DocRight editor is not open.');
    }
    if (!this.webviewReady) {
      throw new Error('DocRight editor is not ready yet.');
    }
    const requestId = this.applyCounter++;
    return new Promise<void>((resolve, reject) => {
      this.applyRequests.set(requestId, { resolve, reject });
      this.postMessage({ type: 'docright.applyScopeUpdate', requestId, scope, html });
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
        await this.applyScopeSelection(message.selection);
        break;
      case 'docright.scopeInvalid':
        await this.setScopeToFull();
        break;
      case 'docright.selection':
        this.handleSelectionChange(message.id);
        break;
      case 'docright.applyScopeComplete': {
        const entry = this.applyRequests.get(message.requestId);
        if (entry) {
          this.applyRequests.delete(message.requestId);
          entry.resolve(undefined);
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
      default:
        break;
    }
  }

  private async applyScopeSelection(selection: DocRightSelectionPayload): Promise<void> {
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

    await saveDocRightScope(this.root, this.scopeState);
    this.postDocRightScope();
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

    this.postMessage({ type: 'docright.applyInlineCallout', id, selection });
  }

  private async handleOverallCalloutRequest(selection: DocRightSelectionPayload): Promise<void> {
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

    if (!this.root) {
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
