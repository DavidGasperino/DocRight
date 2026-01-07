import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { registerRichText, HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table';
import { MarkNode } from '@lexical/mark';
import { $generateNodesFromDOM } from '@lexical/html';

const vscode = acquireVsCodeApi();
const debugEnabled = document.body?.dataset?.debugEnabled === 'true';
const promptEl = document.getElementById('prompt');
const responsePreviewEl = document.getElementById('response-preview');
const statusDotEl = document.getElementById('status-dot');
const statusTextEl = document.getElementById('status-text');
const rooModeEl = document.getElementById('roo-mode');
const autoSaveEl = document.getElementById('auto-save');
const sendRooBtn = document.getElementById('send-roo');
const applyBtn = document.getElementById('apply');
const rejectBtn = document.getElementById('reject');
const saveBtn = document.getElementById('save-iteration');

const theme = {
  paragraph: 'dr-paragraph',
  heading: {
    h1: 'dr-heading-h1',
    h2: 'dr-heading-h2'
  },
  quote: 'dr-quote',
  list: {
    listitem: 'dr-list-item',
    nested: {
      listitem: 'dr-list-item-nested'
    },
    ol: 'dr-list-ol',
    ul: 'dr-list-ul'
  },
  link: 'dr-link',
  text: {
    bold: 'dr-text-bold',
    italic: 'dr-text-italic',
    underline: 'dr-text-underline',
    strikethrough: 'dr-text-strikethrough',
    code: 'dr-text-code'
  },
  table: 'dr-table',
  tableCell: 'dr-table-cell',
  tableCellHeader: 'dr-table-cell-header',
  mark: 'dr-mark',
  markOverlap: 'dr-mark-overlap'
};

let responseEditor = null;
if (responsePreviewEl) {
  responseEditor = createEditor({
    namespace: 'DocRightResponsePreview',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, TableNode, TableRowNode, TableCellNode, MarkNode],
    onError(error) {
      console.error(error);
    }
  });
  responseEditor.setRootElement(responsePreviewEl);
  responseEditor.setEditable(false);
  responsePreviewEl.setAttribute('tabindex', '0');
  responsePreviewEl.setAttribute('role', 'document');
  if (typeof registerRichText === 'function') {
    registerRichText(responseEditor);
  }
}

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

function updateResponseEmptyState() {
  if (!responseEditor || !responsePreviewEl) {
    return;
  }
  let isEmpty = true;
  responseEditor.getEditorState().read(() => {
    isEmpty = $getRoot().getTextContent().trim().length === 0;
  });
  responsePreviewEl.classList.toggle('is-empty', isEmpty);
}

function renderResponsePreview(value) {
  if (!responseEditor || !responsePreviewEl) {
    return;
  }
  responseEditor.update(() => {
    const root = $getRoot();
    root.clear();
    const raw = String(value || '').trim();
    if (!raw) {
      root.append($createParagraphNode());
      return;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/html');
      const nodes = $generateNodesFromDOM(responseEditor, doc);
      if (nodes.length === 0) {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(raw));
        root.append(paragraph);
      } else {
        root.append(...nodes);
      }
    } catch (error) {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(raw));
      root.append(paragraph);
    }
  });
  updateResponseEmptyState();
}

function render() {
  if (promptEl) {
    promptEl.value = state.prompt || '';
  }
  renderResponsePreview(state.response || '');
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
  if (sendRooBtn) {
    sendRooBtn.disabled = state.isRunning;
  }
  if (applyBtn) {
    applyBtn.disabled = !state.canApply || state.isRunning;
  }
  if (rejectBtn) {
    rejectBtn.disabled = state.isRunning;
  }
  if (saveBtn) {
    saveBtn.disabled = false;
  }
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

if (sendRooBtn) {
  sendRooBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'llm.sendRoo',
      prompt: promptEl ? promptEl.value : ''
    });
  });
}

if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'llm.apply',
      response: state.response
    });
  });
}

if (rejectBtn) {
  rejectBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'llm.reject' });
  });
}

if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'llm.saveIteration' });
  });
}

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
