import { getNonce } from './nonce';

export type CalloutsPanelOptions = {
  cspSource: string;
  scriptUri: string;
};

export function getCalloutsPanelHtml(options: CalloutsPanelOptions): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: https:`,
    `style-src ${options.cspSource} 'nonce-${nonce}'`,
    `script-src ${options.cspSource} 'nonce-${nonce}'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DocRight Callouts</title>
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 8px;
    }
    .empty {
      opacity: 0.7;
      margin: 8px 0;
    }
    .empty.small {
      font-size: 12px;
      margin: 6px 0;
    }
    .list {
      display: grid;
      gap: 6px;
      margin-bottom: 10px;
    }
    .callout-list {
      max-height: 120px;
      overflow-y: auto;
    }
    .context-list {
      max-height: 180px;
      overflow-y: auto;
    }
    .context-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .context-item.active {
      border-color: var(--vscode-focusBorder);
    }
    .context-toggle {
      margin-top: 2px;
      width: 14px;
      height: 14px;
      accent-color: var(--vscode-button-background);
    }
    .context-details {
      flex: 1;
    }
    .list-item {
      text-align: left;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      cursor: pointer;
    }
    .list-item.selected {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
    .context-title {
      font-weight: 600;
    }
    .context-desc {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
    }
    .context-path {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 2px;
      word-break: break-all;
    }
    textarea {
      width: 100%;
      min-height: 90px;
      resize: vertical;
      font-family: var(--vscode-font-family);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px;
      box-sizing: border-box;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      border: 1px solid var(--vscode-button-background);
      color: var(--vscode-button-background);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .section-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .label {
      font-size: 12px;
      opacity: 0.7;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 12px;
      opacity: 0.7;
      margin-bottom: 8px;
    }
    details {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 6px 8px;
      margin-bottom: 10px;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .section-body {
      margin-top: 8px;
    }
    .status-row {
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
  </style>
</head>
<body>
  <div id="content">
    <div id="meta" class="meta"></div>
    <div id="no-editor" class="empty">Open a text document to manage callouts.</div>

    <details id="context-section" open>
      <summary>Context Files</summary>
      <div class="section-body">
        <div class="section-actions">
          <button id="context-add" class="secondary" type="button">Add Context File</button>
          <button id="context-insert" type="button">Insert Into Instruction</button>
          <button id="context-open" class="secondary" type="button">Open</button>
          <button id="context-remove" class="secondary" type="button">Remove</button>
        </div>
        <div id="context-empty" class="empty small">No context files yet.</div>
        <div id="context-list" class="list context-list"></div>
      </div>
    </details>

    <div id="callouts-sections">
      <details id="scope-section" open>
        <summary>Scope</summary>
        <div class="section-body">
          <div id="scope-status" class="meta"></div>
          <div class="section-actions">
            <button id="scope-selection" class="secondary" type="button">Use Selection</button>
            <button id="scope-full" type="button">Full Document</button>
          </div>
        </div>
      </details>

      <details id="llm-section" open>
        <summary>Prompt Preview</summary>
        <div class="section-body">
          <div id="llm-status" class="meta status-row">
            <span id="llm-status-dot" class="status-dot"></span>
            <span id="llm-status-text"></span>
          </div>
          <div class="section-actions">
            <button id="llm-open" type="button">Generate Prompt</button>
          </div>
        </div>
      </details>

      <details id="iterations-section" open>
        <summary>Iterations</summary>
        <div class="section-body">
          <div class="section-actions">
            <button id="save-iteration" class="secondary" type="button">Save Iteration</button>
            <button id="open-timeline" type="button">Timeline</button>
          </div>
          <div id="iterations-empty" class="empty small">No iterations saved yet.</div>
          <div id="iterations-list" class="list callout-list"></div>
        </div>
      </details>

      <details id="overall-section" open>
        <summary>Overall Callouts</summary>
        <div class="section-body">
          <div class="section-actions">
            <button id="overall-add" class="secondary" type="button">Add Overall Callout</button>
          </div>
          <div id="overall-empty" class="empty small">No overall callouts yet.</div>
          <div id="overall-list" class="list callout-list"></div>
          <div class="label">Overall Instruction</div>
          <textarea id="overall-instruction" placeholder="Select an overall callout to edit."></textarea>
          <div class="actions">
            <button id="overall-save" type="button">Save</button>
            <button id="overall-remove" class="secondary" type="button">Remove</button>
          </div>
        </div>
      </details>

      <details id="inline-section" open>
        <summary>Inline Callouts</summary>
        <div class="section-body">
          <div id="inline-empty" class="empty small">No inline callouts yet.</div>
          <div id="inline-list" class="list callout-list"></div>
          <div class="label">Instruction</div>
          <textarea id="inline-instruction" placeholder="Select a callout to edit."></textarea>
          <div class="actions">
            <button id="inline-save" type="button">Save</button>
            <button id="inline-remove" class="secondary" type="button">Remove</button>
          </div>
        </div>
      </details>
    </div>
  </div>

  <script type="module" nonce="${nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}
