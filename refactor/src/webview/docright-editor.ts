import { getNonce } from './nonce';

export type DocRightEditorHtmlOptions = {
  cspSource: string;
  scriptUri: string;
};

export function getDocRightEditorHtml(options: DocRightEditorHtmlOptions): string {
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
  <title>DocRight Document</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .toolbar-group {
      display: flex;
      gap: 6px;
      padding-right: 8px;
      margin-right: 8px;
      border-right: 1px solid var(--vscode-panel-border);
    }
    .toolbar-group:last-child {
      border-right: none;
      margin-right: 0;
      padding-right: 0;
    }
    .toolbar-button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      line-height: 1.2;
      cursor: pointer;
    }
    .toolbar-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .toolbar-button:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .editor-container {
      flex: 1;
      padding: 24px 32px 12px 32px;
      overflow: auto;
      position: relative;
    }
    .scope-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .dr-scope-highlight {
      position: absolute;
      background: transparent;
      border: 2px solid rgba(90, 140, 255, 0.5);
      border-radius: 4px;
    }
    .editor {
      min-height: 100%;
      outline: none;
      line-height: 1.6;
      font-size: 15px;
      white-space: normal;
      position: relative;
      z-index: 1;
    }
    .editor.is-empty::before {
      content: attr(data-placeholder);
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      pointer-events: none;
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
      width: 100%;
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
    .docright-menu {
      position: fixed;
      z-index: 10;
      min-width: 200px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
      border-radius: 6px;
      padding: 4px 0;
      display: none;
    }
    .docright-menu button {
      display: block;
      width: 100%;
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      text-align: left;
      font-size: 12px;
      cursor: pointer;
    }
    .docright-menu button:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .docright-menu button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .docright-menu .menu-sep {
      height: 1px;
      margin: 4px 0;
      background: var(--vscode-panel-border);
    }
    .status {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 6px 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="toolbar" id="toolbar">
    <div class="toolbar-group">
      <button class="toolbar-button" data-action="undo" title="Undo">Undo</button>
      <button class="toolbar-button" data-action="redo" title="Redo">Redo</button>
    </div>
    <div class="toolbar-group">
      <button class="toolbar-button" data-action="bold" title="Bold">B</button>
      <button class="toolbar-button" data-action="italic" title="Italic">I</button>
      <button class="toolbar-button" data-action="underline" title="Underline">U</button>
      <button class="toolbar-button" data-action="strikethrough" title="Strikethrough">S</button>
      <button class="toolbar-button" data-action="code" title="Inline Code">Code</button>
    </div>
    <div class="toolbar-group">
      <button class="toolbar-button" data-action="paragraph" title="Paragraph">P</button>
      <button class="toolbar-button" data-action="h1" title="Heading 1">H1</button>
      <button class="toolbar-button" data-action="h2" title="Heading 2">H2</button>
      <button class="toolbar-button" data-action="quote" title="Quote">Quote</button>
    </div>
    <div class="toolbar-group">
      <button class="toolbar-button" data-action="bulletList" title="Bulleted List">Bullets</button>
      <button class="toolbar-button" data-action="numberList" title="Numbered List">Numbered</button>
    </div>
    <div class="toolbar-group">
      <button class="toolbar-button" data-action="link" title="Insert Link">Link</button>
      <button class="toolbar-button" data-action="table" title="Insert Table">Table</button>
    </div>
  </div>
  <div class="editor-container">
    <div id="scope-overlay" class="scope-overlay"></div>
    <div id="editor" class="editor" contenteditable="true" spellcheck="true" data-placeholder="Start writing..."></div>
  </div>
  <div id="context-menu" class="docright-menu" role="menu">
    <button type="button" data-action="cut">Cut</button>
    <button type="button" data-action="copy">Copy</button>
    <button type="button" data-action="paste">Paste</button>
    <div class="menu-sep"></div>
    <button type="button" data-action="inline">Add Inline Callout</button>
    <button type="button" data-action="overall">Add Overall Callout</button>
  </div>
  <div id="status" class="status">Loading DocRight editor...</div>
  <script type="module" nonce="${nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}
