import * as vscode from 'vscode';

import { type DocRightSettings } from '../settings/settings';
import { LlmController } from '../llm/controller';
import { getLlmPanelHtml } from '../webview/llm-panel';
import { isLlmFromWebviewMessage } from '../webview/messages';
import { type Logger } from './logger';

export class LlmPanelHost {
  private panel: vscode.WebviewPanel | null = null;
  private controller: LlmController;
  private settings: DocRightSettings;
  private logger: Logger;

  constructor(controller: LlmController, settings: DocRightSettings, logger: Logger) {
    this.controller = controller;
    this.settings = settings;
    this.logger = logger;
  }

  updateSettings(settings: DocRightSettings): void {
    this.settings = settings;
    this.controller.updateSettings(settings);
  }

  async open(prompt: string): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      this.controller.setPrompt(prompt);
      await this.controller.postState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'docRightRefactor.llmPanel',
      'DocRight LLM (Refactor)',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.controller.setMessenger({
      postMessage: (message) => this.panel?.webview.postMessage(message) ?? Promise.resolve(false)
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!isLlmFromWebviewMessage(message)) {
        this.logger.debug('unknown webview message', message);
        return;
      }
      await this.controller.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
      this.controller.setMessenger(null);
    });

    this.panel.webview.html = getLlmPanelHtml({
      debugEnabled: this.settings.diagnostics.debugLogging
    });

    this.controller.setPrompt(prompt);
    await this.controller.postState();
  }
}
