import * as vscode from 'vscode';

import { getNonce } from '../webview/nonce';

export class DocRightQuickstartViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'docRight.quickstart';
  private view: vscode.WebviewView | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message.type !== 'string') {
        return;
      }
      if (message.type === 'startNew') {
        await vscode.commands.executeCommand('docRight.startSessionNew');
        return;
      }
      if (message.type === 'startResume') {
        await vscode.commands.executeCommand('docRight.startSessionResume');
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DocRight Quickstart</title>
  <style nonce="${nonce}">
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
    }
    .title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    button {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="title">DocRight Quickstart</div>
  <div class="hint">Choose how you want to begin.</div>
  <div class="actions">
    <button id="start-new" type="button">Start Session</button>
    <button id="start-resume" type="button">Resume Session</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('start-new').addEventListener('click', () => {
      vscode.postMessage({ type: 'startNew' });
    });
    document.getElementById('start-resume').addEventListener('click', () => {
      vscode.postMessage({ type: 'startResume' });
    });
  </script>
</body>
</html>`;
  }
}
