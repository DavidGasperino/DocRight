import { getNonce } from './nonce';

export type LlmPanelOptions = {
  debugEnabled: boolean;
  cspSource: string;
  scriptUri: string;
};

export function getLlmPanelHtml(options: LlmPanelOptions): string {
  const nonce = getNonce();
  const debugEnabled = options.debugEnabled ? 'true' : 'false';
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: https:`,
    `style-src ${options.cspSource} 'nonce-${nonce}' 'unsafe-inline'`,
    `script-src ${options.cspSource} 'nonce-${nonce}'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DocRight LLM</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100vh;
      box-sizing: border-box;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .row label {
      font-size: 12px;
      opacity: 0.8;
    }
    textarea {
      width: 100%;
      min-height: 180px;
      resize: vertical;
      font-family: var(--vscode-font-family);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px;
      box-sizing: border-box;
    }
    button {
      background: transparent;
      color: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-background);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      border-color: var(--vscode-button-background);
      color: var(--vscode-button-background);
    }
    button.is-active,
    button:active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .split {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
      flex: 1;
      min-height: 0;
    }
    .pane {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
    }
    .pane textarea {
      flex: 1;
      min-height: 0;
    }
    .response-preview {
      flex: 1;
      min-height: 0;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 12px;
      overflow: auto;
      line-height: 1.6;
      font-size: 14px;
      white-space: normal;
      position: relative;
    }
    .response-preview.is-empty::before {
      content: attr(data-placeholder);
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      pointer-events: none;
    }
    .label {
      font-size: 12px;
      opacity: 0.7;
    }
    .meta {
      font-size: 12px;
      opacity: 0.7;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
    }
    .status-dot.running {
      background: var(--vscode-testing-iconQueued, #d19a00);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-testing-iconQueued, #d19a00) 30%, transparent);
    }
    .status-dot.ready {
      background: var(--vscode-testing-iconPassed, #2ea043);
    }
    .status-dot.error {
      background: var(--vscode-testing-iconFailed, #f85149);
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      opacity: 0.8;
    }
    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle .slider {
      position: relative;
      width: 36px;
      height: 18px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 999px;
      box-sizing: border-box;
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .toggle .slider::after {
      content: '';
      position: absolute;
      top: 1px;
      left: 1px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--vscode-button-foreground);
      transition: transform 0.2s ease;
    }
    .toggle input:checked + .slider {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }
    .toggle input:checked + .slider::after {
      transform: translateX(16px);
    }
    .dr-paragraph {
      margin: 0 0 0.9em 0;
    }
    .dr-heading-h1 {
      font-size: 1.6em;
      font-weight: 600;
      margin: 0.8em 0 0.4em 0;
    }
    .dr-heading-h2 {
      font-size: 1.3em;
      font-weight: 600;
      margin: 0.6em 0 0.3em 0;
    }
    .dr-quote {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      color: var(--vscode-textBlockQuote-foreground);
      margin: 0.6em 0;
      padding-left: 12px;
    }
    .dr-list-ol,
    .dr-list-ul {
      margin: 0 0 0.9em 1.4em;
      padding: 0;
    }
    .dr-list-item {
      margin: 0.2em 0;
    }
    .dr-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
    }
    .dr-text-bold {
      font-weight: 600;
    }
    .dr-text-italic {
      font-style: italic;
    }
    .dr-text-underline {
      text-decoration: underline;
    }
    .dr-text-strikethrough {
      text-decoration: line-through;
    }
    .dr-text-code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.2));
      border-radius: 3px;
      padding: 0 3px;
    }
    .dr-table {
      width: auto;
      min-width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 0 0 0.9em 0;
    }
    .dr-table-cell,
    .dr-table-cell-header {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
      vertical-align: top;
    }
    .dr-table-cell-header {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
    }
    .dr-mark {
      background: rgba(255, 200, 0, 0.35);
      border-radius: 2px;
      padding: 0 1px;
    }
    .dr-mark-overlap {
      background: rgba(255, 170, 0, 0.45);
    }
  </style>
</head>
<body data-debug-enabled="${debugEnabled}">
  <div class="row">
    <button id="send-roo" class="secondary" type="button">Send to Roo</button>
  </div>
  <div id="status" class="status">
    <span id="status-dot" class="status-dot"></span>
    <span id="status-text" class="meta"></span>
  </div>
  <div class="row">
    <span class="label">Roo mode: <span id="roo-mode"></span></span>
    <label class="toggle">
      <input id="auto-save" type="checkbox" />
      <span class="slider"></span>
      <span>Auto-save iteration</span>
    </label>
  </div>
  <div class="split">
    <div class="pane">
      <div class="label">Prompt</div>
      <textarea id="prompt" placeholder="Prompt preview will appear here."></textarea>
    </div>
    <div class="pane">
      <div class="label">Response (preview)</div>
      <div
        id="response-preview"
        class="response-preview"
        data-placeholder="LLM response will appear here."
        role="document"
        aria-label="LLM response preview"
      ></div>
      <div class="actions">
        <button id="apply" type="button">Apply to DocRight</button>
        <button id="reject" class="secondary" type="button">Reject</button>
        <button id="save-iteration" class="secondary" type="button">Save Iteration</button>
      </div>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}
