import { getNonce } from './nonce';

export type TimelinePanelOptions = {
  cspSource: string;
  scriptUri: string;
};

export function getTimelinePanelHtml(options: TimelinePanelOptions): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; script-src 'nonce-${nonce}'; style-src ${options.cspSource} 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DocRight Timeline</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family, system-ui);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .timeline-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .timeline-title {
      font-size: 14px;
      font-weight: 600;
    }
    .timeline-subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .timeline-empty {
      margin-top: 24px;
      color: var(--vscode-descriptionForeground);
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .timeline-row {
      position: relative;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: var(--vscode-editorWidget-background);
    }
    .timeline-row:hover {
      border-color: var(--vscode-editorWidget-border);
    }
    .timeline-label {
      font-family: var(--vscode-editor-font-family, ui-monospace);
      white-space: pre;
      font-size: 12px;
      margin-bottom: 2px;
    }
    .timeline-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .timeline-button {
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      color: inherit;
      padding: 0;
      cursor: pointer;
      font: inherit;
    }
    .timeline-tooltip {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 6px;
      min-width: 220px;
      max-width: 360px;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-editorHoverWidget-border);
      background: var(--vscode-editorHoverWidget-background);
      color: var(--vscode-editorHoverWidget-foreground);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 10;
    }
    .timeline-row:hover .timeline-tooltip {
      display: block;
    }
    .tooltip-title {
      font-weight: 600;
      margin-bottom: 6px;
    }
    .tooltip-meta {
      font-size: 12px;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
    }
    .tooltip-meta div {
      margin-bottom: 2px;
    }
    .tooltip-summary {
      font-size: 12px;
    }
    .tooltip-summary ul {
      margin: 6px 0 0 18px;
      padding: 0;
    }
  </style>
</head>
<body>
  <div class="timeline-header">
    <div class="timeline-title">DocRight Timeline</div>
    <div class="timeline-subtitle">Hover nodes for summaries.</div>
  </div>
  <div id="timeline-empty" class="timeline-empty">No iterations found yet.</div>
  <div id="timeline-list" class="timeline-list" hidden></div>
  <script type="module" nonce="${nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}
