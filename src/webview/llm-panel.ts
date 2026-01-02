import { getNonce } from './nonce';

export type LlmPanelOptions = {
  debugEnabled: boolean;
};

export function getLlmPanelHtml(options: LlmPanelOptions): string {
  const nonce = getNonce();
  const debugEnabled = options.debugEnabled ? 'true' : 'false';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DocRight LLM (Refactor)</title>
  <style>
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
  </style>
</head>
<body>
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
      <textarea id="response" placeholder="LLM response will appear here."></textarea>
      <div class="actions">
        <button id="apply" type="button">Apply to DocRight</button>
        <button id="reject" class="secondary" type="button">Reject</button>
        <button id="save-iteration" class="secondary" type="button">Save Iteration</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const debugEnabled = ${debugEnabled};
    const promptEl = document.getElementById('prompt');
    const responseEl = document.getElementById('response');
    const statusDotEl = document.getElementById('status-dot');
    const statusTextEl = document.getElementById('status-text');
    const rooModeEl = document.getElementById('roo-mode');
    const autoSaveEl = document.getElementById('auto-save');
    const sendRooBtn = document.getElementById('send-roo');
    const applyBtn = document.getElementById('apply');
    const rejectBtn = document.getElementById('reject');
    const saveBtn = document.getElementById('save-iteration');

    let state = {
      prompt: '',
      response: '',
      status: 'Idle',
      model: 'gpt-4o-mini',
      canApply: false,
      isRunning: false,
      autoSaveIteration: true,
      rooMode: 'ask'
    };
    let promptTransfer = null;
    let promptRequestPending = false;
    let promptRequestTimer = null;

    responseEl.readOnly = true;

    function debugLog(message, data) {
      if (!debugEnabled) {
        return;
      }
      vscode.postMessage({ type: 'llm.debug', message, data });
    }

    function clearPromptRequest() {
      promptRequestPending = false;
      if (promptRequestTimer) {
        clearTimeout(promptRequestTimer);
        promptRequestTimer = null;
      }
    }

    function isPromptReady() {
      return String(state.status || '').toLowerCase().includes('prompt ready');
    }

    function requestPrompt() {
      if (promptRequestPending) {
        return;
      }
      promptRequestPending = true;
      debugLog('requestPrompt');
      vscode.postMessage({ type: 'llm.requestPrompt' });
      promptRequestTimer = setTimeout(() => {
        promptRequestPending = false;
        promptRequestTimer = null;
        if (!state.prompt && isPromptReady()) {
          requestPrompt();
        }
      }, 1000);
    }

    function normalizePreviewText(value) {
      return value
        .replace(/\\r\\n/g, '\\n')
        .replace(/\\r/g, '\\n')
        .replace(/[ \\t]+\\n/g, '\\n')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
    }

    function toReadableResponse(value) {
      if (!value) {
        return '';
      }
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(value, 'text/html');
        const text = doc.body ? doc.body.innerText : '';
        if (text && text.trim()) {
          return normalizePreviewText(text);
        }
      } catch (error) {
        // fall back to raw value
      }
      return normalizePreviewText(value);
    }

    function render() {
      promptEl.value = state.prompt || '';
      responseEl.value = toReadableResponse(state.response || '');
      if (rooModeEl) {
        rooModeEl.textContent = state.rooMode || 'ask';
      }
      if (autoSaveEl) {
        autoSaveEl.checked = Boolean(state.autoSaveIteration);
      }
      const statusText = state.status ? state.status : 'Idle';
      if (statusTextEl) {
        statusTextEl.textContent = 'Status: ' + statusText;
      }
      if (statusDotEl) {
        statusDotEl.className = 'status-dot';
        const lowered = String(statusText).toLowerCase();
        if (state.isRunning) {
          statusDotEl.classList.add('running');
        } else if (state.canApply) {
          statusDotEl.classList.add('ready');
        } else if (lowered.includes('error') || lowered.includes('failed')) {
          statusDotEl.classList.add('error');
        }
      }
      sendRooBtn.disabled = state.isRunning;
      applyBtn.disabled = !state.canApply || state.isRunning;
      rejectBtn.disabled = state.isRunning;
      saveBtn.disabled = false;
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !message.type) {
        return;
      }
      switch (message.type) {
        case 'llm.state': {
          debugLog('recv llm.state', { hasPrompt: typeof message.prompt === 'string', status: message.status });
          state = { ...state, ...message };
          if (typeof message.prompt === 'string') {
            state.prompt = message.prompt;
            clearPromptRequest();
          } else if (!state.prompt && String(state.status || '').toLowerCase().includes('prompt ready')) {
            requestPrompt();
          }
          render();
          break;
        }
        case 'llm.prompt':
          state.prompt = String(message.prompt || '');
          clearPromptRequest();
          render();
          vscode.postMessage({ type: 'llm.promptReceived', id: message.id, length: state.prompt.length });
          break;
        case 'llm.promptStart': {
          clearPromptRequest();
          const total = Number(message.total);
          if (!Number.isFinite(total) || total <= 0) {
            state.prompt = '';
            render();
            break;
          }
          promptTransfer = {
            id: message.id,
            total,
            chunks: new Array(total),
            received: 0
          };
          break;
        }
        case 'llm.promptChunk': {
          if (!promptTransfer || promptTransfer.id !== message.id) {
            break;
          }
          const index = Number(message.index);
          if (!Number.isFinite(index) || index < 0 || index >= promptTransfer.total) {
            break;
          }
          if (promptTransfer.chunks[index] === undefined) {
            promptTransfer.received += 1;
          }
          promptTransfer.chunks[index] = String(message.chunk || '');
          break;
        }
        case 'llm.promptEnd': {
          if (!promptTransfer || promptTransfer.id !== message.id) {
            break;
          }
          const complete = promptTransfer.received === promptTransfer.total;
          if (complete) {
            state.prompt = promptTransfer.chunks.join('');
            render();
            vscode.postMessage({ type: 'llm.promptReceived', id: message.id, length: state.prompt.length });
          }
          promptTransfer = null;
          clearPromptRequest();
          if (!complete) {
            requestPrompt();
          }
          break;
        }
        default:
          break;
      }
    });

    sendRooBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'llm.sendRoo',
        prompt: promptEl.value
      });
    });

    applyBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'llm.apply',
        response: state.response
      });
    });

    rejectBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'llm.reject' });
    });

    saveBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'llm.saveIteration' });
    });

    if (autoSaveEl) {
      autoSaveEl.addEventListener('change', () => {
        vscode.postMessage({ type: 'llm.toggleAutoSave', enabled: autoSaveEl.checked });
      });
    }

    function notifyReady() {
      vscode.postMessage({ type: 'llm.ready' });
      requestPrompt();
    }
    window.addEventListener('focus', notifyReady);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        notifyReady();
      }
    });
    render();
    notifyReady();
  </script>
</body>
</html>`;
}
