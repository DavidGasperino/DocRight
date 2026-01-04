import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { getDocRightRooResponsePath } from '../storage/docright-paths';
import { ensureDir } from '../storage/fs';
import { type DocRightSettings } from '../settings/settings';
import { type LlmController } from '../llm/controller';
import { buildDocRightSummaryInstructions, extractDocRightSummary } from '../llm/summary';
import { type Logger } from './logger';

type RooApi = {
  sidebarProvider?: unknown;
  startNewTask?: (options: { text: string; newTab?: boolean }) => Promise<void>;
  sendMessage?: (text: string) => Promise<void>;
};

type RooProvider = {
  createTask?: (
    prompt: string,
    images?: unknown[],
    options?: unknown,
    meta?: { consecutiveMistakeLimit?: number }
  ) => Promise<void>;
  removeClineFromStack?: () => Promise<void>;
  postStateToWebview?: () => Promise<void>;
  postMessageToWebview?: (message: unknown) => Promise<void>;
};

export class RooIntegration {
  private root: string | null = null;
  private watcher: fs.FSWatcher | null = null;
  private responsePath: string | null = null;
  private lastContent: string | null = null;
  private lastSummaryKey: string | null = null;
  private readTimeout: NodeJS.Timeout | null = null;
  private taskStarted = false;
  private opened = false;
  private settings: DocRightSettings;
  private controller: LlmController;
  private logger: Logger;

  constructor(settings: DocRightSettings, controller: LlmController, logger: Logger) {
    this.settings = settings;
    this.controller = controller;
    this.logger = logger;
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
  }

  markOpened(): void {
    this.opened = true;
    this.taskStarted = false;
  }

  setRoot(root: string | null): void {
    if (this.root === root) {
      return;
    }
    this.root = root;
    this.taskStarted = false;
    this.opened = false;
    this.stopWatcher();
  }

  dispose(): void {
    this.stopWatcher();
  }

  stop(): void {
    this.stopWatcher();
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.root) {
      throw new Error('No DocRight project is open.');
    }
    const trimmedPrompt = String(prompt || '').trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt is empty.');
    }

    const responsePath = this.getResponsePath(this.root);
    await ensureDir(path.dirname(responsePath));
    await fs.promises.writeFile(responsePath, '', 'utf8');
    this.startWatcher(responsePath);

    const rooPrompt = this.buildRooPrompt(trimmedPrompt, responsePath, this.root);
    this.controller.updateState({
      prompt: rooPrompt,
      response: '',
      status: 'Waiting for Roo response...',
      isRunning: true,
      canApply: false
    });
    await this.controller.postState();

    try {
      const opened = await this.ensureRooPanel();
      if (opened) {
        this.taskStarted = false;
      }
      await this.focusRooPanel();
      const rooApi = await this.getRooApi();
      const rooProvider = this.getRooProvider(rooApi);

      await this.setRooMode('ask', rooApi, rooProvider);
      await this.delay(200);
      await this.sendMessageToRoo(rooProvider, rooApi, rooPrompt);
      this.taskStarted = true;
    } catch (error) {
      this.stopWatcher();
      const messageText = error instanceof Error ? error.message : 'Failed to start Roo Code task.';
      this.controller.updateState({
        status: messageText,
        isRunning: false,
        canApply: false
      });
      await this.controller.postState();
      throw new Error(messageText);
    }
  }

  private buildRooPrompt(basePrompt: string, responsePath: string, root: string): string {
    const relativePath = this.toPosixPath(path.relative(root, responsePath));
    const absolutePath = this.toPosixPath(responsePath);
    const instructions = [
      'Roo Code response instructions:',
      `- Project root: ${this.toPosixPath(root)}`,
      `- Write ONLY the updated HTML for the scoped section to: ${relativePath}`,
      '- The output path is relative to the project root.',
      `- Absolute path: ${absolutePath}`,
      '- Use the absolute path when writing the file.',
      '- Overwrite the file contents; no code fences or extra commentary.',
      '- Do not modify any other files.',
      '- Stop after writing the file.',
      ...buildDocRightSummaryInstructions()
    ].join('\n');
    return [basePrompt, instructions].filter(Boolean).join('\n\n');
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendMessageToRoo(
    rooProvider: RooProvider | null,
    rooApi: RooApi | null,
    text: string
  ): Promise<void> {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return;
    }
    if (rooProvider && typeof rooProvider.postMessageToWebview === 'function') {
      try {
        await rooProvider.postMessageToWebview({
          type: 'invoke',
          invoke: 'sendMessage',
          text: trimmed,
          images: []
        });
        return;
      } catch (error) {
        // fall through to other strategies
      }
    }
    try {
      await this.pasteRooPrompt(trimmed);
      await vscode.commands.executeCommand('roo-cline.acceptInput');
      return;
    } catch (error) {
      // fall through to API
    }
    if (rooApi && typeof rooApi.sendMessage === 'function') {
      await rooApi.sendMessage(trimmed);
      return;
    }
    throw new Error('Unable to deliver message to Roo Code.');
  }

  private getResponsePath(root: string): string {
    return getDocRightRooResponsePath(root);
  }

  private toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
  }

  private stopWatcher(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (error) {
        // ignore
      }
      this.watcher = null;
    }
    if (this.readTimeout) {
      clearTimeout(this.readTimeout);
      this.readTimeout = null;
    }
  }

  private startWatcher(responsePath: string): void {
    this.stopWatcher();
    this.responsePath = responsePath;
    this.lastContent = null;
    this.lastSummaryKey = null;
    try {
      const dir = path.dirname(responsePath);
      const fileName = path.basename(responsePath);
      this.watcher = fs.watch(dir, (_eventType, filename) => {
        if (!filename || filename === fileName) {
          this.scheduleRead();
        }
      });
    } catch (error) {
      this.watcher = null;
    }
  }

  private scheduleRead(): void {
    if (this.readTimeout) {
      clearTimeout(this.readTimeout);
    }
    this.readTimeout = setTimeout(() => {
      this.readTimeout = null;
      void this.readResponse();
    }, 200);
  }

  private async readResponse(): Promise<void> {
    if (!this.responsePath) {
      return;
    }
    try {
      const raw = await fs.promises.readFile(this.responsePath, 'utf8');
      const { cleaned, bullets } = extractDocRightSummary(raw);
      const content = cleaned.trim();
      const summaryKey = bullets.join('\n');
      if (!content || (content === this.lastContent && summaryKey === this.lastSummaryKey)) {
        return;
      }
      this.lastContent = content;
      this.lastSummaryKey = summaryKey;
      this.controller.setResponseWithSummary(content, bullets);
      this.controller.updateState({
        status: 'Roo response received',
        isRunning: false,
        canApply: true
      });
      await this.controller.postState();
    } catch (error) {
      // ignore until file appears
    }
  }

  private async getRooApi(): Promise<RooApi | null> {
    for (const extensionId of this.settings.roo.extensionIds) {
      const extension = vscode.extensions.getExtension(extensionId);
      if (!extension) {
        continue;
      }
      if (!extension.isActive) {
        try {
          await extension.activate();
        } catch (error) {
          continue;
        }
      }
      return (extension.exports as RooApi) || null;
    }
    return null;
  }

  private getRooProvider(rooApi: RooApi | null): RooProvider | null {
    if (!rooApi || !rooApi.sidebarProvider) {
      return null;
    }
    const baseProvider = rooApi.sidebarProvider as RooProvider & {
      constructor?: {
        activeInstances?: Array<{ view?: { viewType?: string } }>;
        tabPanelId?: string;
        getVisibleInstance?: () => RooProvider | null;
      };
    };
    const ProviderClass = baseProvider && baseProvider.constructor;
    if (ProviderClass && ProviderClass.activeInstances && ProviderClass.tabPanelId) {
      for (const instance of ProviderClass.activeInstances) {
        if (instance && instance.view && instance.view.viewType === ProviderClass.tabPanelId) {
          return instance as RooProvider;
        }
      }
    }
    if (ProviderClass && typeof ProviderClass.getVisibleInstance === 'function') {
      const visible = ProviderClass.getVisibleInstance();
      if (visible) {
        return visible;
      }
    }
    return baseProvider;
  }

  private hasVisibleRooPanel(rooApi: RooApi | null): boolean {
    if (!rooApi || !rooApi.sidebarProvider) {
      return false;
    }
    const baseProvider = rooApi.sidebarProvider as RooProvider & {
      constructor?: {
        activeInstances?: Array<{ view?: { viewType?: string } }>;
        tabPanelId?: string;
        getVisibleInstance?: () => RooProvider | null;
      };
    };
    const ProviderClass = baseProvider && baseProvider.constructor;
    if (ProviderClass && ProviderClass.activeInstances && ProviderClass.tabPanelId) {
      for (const instance of ProviderClass.activeInstances) {
        if (instance && instance.view && instance.view.viewType === ProviderClass.tabPanelId) {
          return true;
        }
      }
    }
    if (ProviderClass && typeof ProviderClass.getVisibleInstance === 'function') {
      return Boolean(ProviderClass.getVisibleInstance());
    }
    return false;
  }

  private async setRooMode(mode: string, rooApi?: RooApi | null, rooProvider?: RooProvider | null): Promise<void> {
    const normalized = String(mode || '').trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const slashCommand = this.getSlashModeCommand(normalized);
    if (slashCommand) {
      const resolvedApi = rooApi ?? (await this.getRooApi());
      const resolvedProvider = rooProvider ?? this.getRooProvider(resolvedApi);
      try {
        await this.sendMessageToRoo(resolvedProvider, resolvedApi, slashCommand);
        return;
      } catch (error) {
        // fall through to command-based switches
      }
    }
    const candidates = [
      { command: 'roo-cline.setMode', args: normalized },
      { command: 'roo-cline.setMode', args: { mode: normalized } },
      { command: 'roo-cline.switchMode', args: normalized },
      { command: 'roo-cline.switchMode', args: { mode: normalized } }
    ];
    for (const candidate of candidates) {
      try {
        await vscode.commands.executeCommand(candidate.command, candidate.args);
        return;
      } catch (error) {
        // try the next command
      }
    }
  }

  private getSlashModeCommand(mode: string): string | null {
    switch (mode) {
      case 'ask':
        return '/ask';
      case 'code':
        return '/code';
      case 'architect':
        return '/architect';
      default:
        return null;
    }
  }

  private async pasteRooPrompt(prompt: string): Promise<void> {
    const previousClipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.commands.executeCommand('roo-cline.focusInput');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await vscode.env.clipboard.writeText(prompt);
      const pasteCommands = ['workbench.action.paste', 'editor.action.clipboardPasteAction'];
      let pasted = false;
      for (const command of pasteCommands) {
        try {
          await vscode.commands.executeCommand(command);
          pasted = true;
          break;
        } catch (error) {
          // try the next paste command
        }
      }
      if (!pasted) {
        throw new Error('Unable to paste into Roo Code input.');
      }
    } finally {
      await vscode.env.clipboard.writeText(previousClipboard);
    }
  }

  private async ensureRooPanel(): Promise<boolean> {
    if (this.opened) {
      return false;
    }
    const rooApi = await this.getRooApi();
    if (this.hasVisibleRooPanel(rooApi)) {
      this.opened = true;
      return false;
    }
    try {
      await vscode.commands.executeCommand('roo-cline.openInNewTab');
      this.opened = true;
      this.taskStarted = false;
      await this.moveActiveEditorToColumn(this.getRooColumn());
      return true;
    } catch (error) {
      this.logger.debug('Failed to open Roo panel', error);
      return false;
    }
  }

  private async focusRooPanel(): Promise<void> {
    if (!this.opened) {
      return;
    }
    const column = this.getRooColumn();
    if (!this.hasEditorGroup(column)) {
      return;
    }
    try {
      await vscode.commands.executeCommand(this.getEditorGroupFocusCommand(column));
    } catch (error) {
      // ignore focus errors
    }
  }

  private getRooColumn(): vscode.ViewColumn {
    const value = Number(this.settings.ui.columns.roo);
    if (Number.isFinite(value) && value > 0) {
      return value as vscode.ViewColumn;
    }
    return vscode.ViewColumn.Four;
  }

  private getEditorGroupFocusCommand(column: vscode.ViewColumn): string {
    switch (column) {
      case vscode.ViewColumn.One:
        return 'workbench.action.focusFirstEditorGroup';
      case vscode.ViewColumn.Two:
        return 'workbench.action.focusSecondEditorGroup';
      case vscode.ViewColumn.Three:
        return 'workbench.action.focusThirdEditorGroup';
      case vscode.ViewColumn.Four:
        return 'workbench.action.focusFourthEditorGroup';
      default:
        return 'workbench.action.focusLastEditorGroup';
    }
  }

  private async moveActiveEditorToColumn(targetColumn: vscode.ViewColumn): Promise<void> {
    const tabGroups = vscode.window.tabGroups;
    if (!tabGroups || !tabGroups.activeTabGroup) {
      return;
    }
    const targetIndex = Math.max(0, Math.min(Number(targetColumn) - 1, 3));
    if (tabGroups.all.length <= targetIndex) {
      return;
    }
    for (let i = 0; i < 6; i += 1) {
      const currentIndex = tabGroups.all.indexOf(tabGroups.activeTabGroup);
      if (currentIndex === -1 || currentIndex === targetIndex) {
        return;
      }
      if (currentIndex < targetIndex) {
        await vscode.commands.executeCommand('workbench.action.moveActiveEditorToRightGroup');
      } else {
        await vscode.commands.executeCommand('workbench.action.moveActiveEditorToLeftGroup');
      }
    }
  }

  private hasEditorGroup(column: vscode.ViewColumn): boolean {
    const tabGroups = vscode.window.tabGroups;
    if (!tabGroups) {
      return false;
    }
    const targetIndex = Math.max(0, Math.min(Number(column) - 1, 3));
    return tabGroups.all.length > targetIndex;
  }
}
