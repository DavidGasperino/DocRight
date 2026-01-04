import * as vscode from 'vscode';

import { docRightConfigExists } from '../storage/docright-config';
import { listDocRightIterationMetadata, loadDocRightIterationState } from '../storage/docright-iterations';
import { type Logger } from './logger';
import { buildTimelineGraph } from './timeline-graph';
import { getTimelinePanelHtml } from '../webview/timeline-panel';
import {
  type TimelinePanelFromWebviewMessage,
  type TimelinePanelStateMessage,
  isTimelinePanelFromWebviewMessage
} from '../webview/timeline-panel-messages';

export class DocRightTimelinePanelHost {
  private panel: vscode.WebviewPanel | null = null;
  private root: string | null = null;
  private extensionUri: vscode.Uri;
  private logger: Logger;

  constructor(extensionUri: vscode.Uri, logger: Logger) {
    this.extensionUri = extensionUri;
    this.logger = logger;
  }

  async open(root: string, options?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean }): Promise<void> {
    const viewColumn = options?.viewColumn ?? vscode.ViewColumn.Beside;
    const preserveFocus = options?.preserveFocus ?? false;
    this.root = root;

    if (this.panel) {
      this.panel.reveal(viewColumn, preserveFocus);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'docRightRefactor.timelinePanel',
      'DocRight Timeline',
      { viewColumn, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'timeline-panel.js')
    );

    this.panel.webview.html = getTimelinePanelHtml({
      cspSource: this.panel.webview.cspSource,
      scriptUri: scriptUri.toString()
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!isTimelinePanelFromWebviewMessage(message)) {
        this.logger.debug('unknown timeline panel message', message);
        return;
      }
      await this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel || !this.root) {
      return;
    }
    const items = await this.loadTimelineItems(this.root);
    const payload: TimelinePanelStateMessage = { type: 'timelineState', items };
    void this.panel.webview.postMessage(payload);
  }

  private async loadTimelineItems(root: string) {
    if (!(await docRightConfigExists(root))) {
      return [];
    }
    const metadata = await listDocRightIterationMetadata(root);
    if (metadata.length === 0) {
      return [];
    }
    const state = await loadDocRightIterationState(root);
    const headId = state.headId ?? null;
    return buildTimelineGraph(metadata, headId);
  }

  private async handleMessage(message: TimelinePanelFromWebviewMessage): Promise<void> {
    if (!this.root) {
      return;
    }
    if (message.type === 'showDetails') {
      await vscode.commands.executeCommand('docRight.timeline.showDetails', this.root, message.id);
    }
  }
}
