const vscode = acquireVsCodeApi();
const contentEl = document.getElementById('content');
const metaEl = document.getElementById('meta');
const noEditorEl = document.getElementById('no-editor');
const calloutsSectionsEl = document.getElementById('callouts-sections');

const scopeSectionEl = document.getElementById('scope-section');
const scopeStatusEl = document.getElementById('scope-status');
const scopeSelectionBtn = document.getElementById('scope-selection');
const scopeFullBtn = document.getElementById('scope-full');

const llmSectionEl = document.getElementById('llm-section');
const llmStatusDotEl = document.getElementById('llm-status-dot');
const llmStatusTextEl = document.getElementById('llm-status-text');
const llmOpenBtn = document.getElementById('llm-open');

const iterationsSectionEl = document.getElementById('iterations-section');
const iterationSaveBtn = document.getElementById('save-iteration');
const iterationsListEl = document.getElementById('iterations-list');
const iterationsEmptyEl = document.getElementById('iterations-empty');

const contextListEl = document.getElementById('context-list');
const contextAddBtn = document.getElementById('context-add');
const contextInsertBtn = document.getElementById('context-insert');
const contextOpenBtn = document.getElementById('context-open');
const contextRemoveBtn = document.getElementById('context-remove');
const contextEmptyEl = document.getElementById('context-empty');

const overallListEl = document.getElementById('overall-list');
const overallInstructionEl = document.getElementById('overall-instruction');
const overallSaveBtn = document.getElementById('overall-save');
const overallRemoveBtn = document.getElementById('overall-remove');
const overallAddBtn = document.getElementById('overall-add');
const overallEmptyEl = document.getElementById('overall-empty');

const inlineListEl = document.getElementById('inline-list');
const inlineInstructionEl = document.getElementById('inline-instruction');
const inlineSaveBtn = document.getElementById('inline-save');
const inlineRemoveBtn = document.getElementById('inline-remove');
const inlineEmptyEl = document.getElementById('inline-empty');

let state = {
  hasEditor: false,
  docName: '',
  contexts: [],
  selectedContextId: null,
  overallCallouts: [],
  inlineCallouts: [],
  selectedOverallId: null,
  selectedInlineId: null,
  scope: { supported: false },
  llm: { supported: false, status: 'Idle', isRunning: false, canApply: false },
  iterations: []
};

let activeTarget = null;

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || !message.type) {
    return;
  }
  if (message.type === 'state') {
    state = message;
    render();
    return;
  }
  if (message.type === 'insertContextReference') {
    insertContextReference(message);
  }
});

function setActiveTarget(target, notify) {
  activeTarget = target;
  if (notify !== false) {
    vscode.postMessage({ type: 'instructionFocus', target });
  }
}

function getPreferredTarget() {
  if (activeTarget) {
    return activeTarget;
  }
  if (state.selectedOverallId) {
    return 'overall';
  }
  if (state.selectedInlineId) {
    return 'inline';
  }
  return null;
}

function insertIntoTextarea(textarea, token) {
  if (!token) {
    return;
  }
  const value = textarea.value || '';
  let start = textarea.selectionStart;
  let end = textarea.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number') {
    start = value.length;
    end = value.length;
  }
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  let insertion = token;
  if (needsSpaceBefore) {
    insertion = ' ' + insertion;
  }
  if (needsSpaceAfter) {
    insertion = insertion + ' ';
  }
  const nextValue = before + insertion + after;
  textarea.value = nextValue;
  const caret = (before + insertion).length;
  textarea.selectionStart = caret;
  textarea.selectionEnd = caret;
  textarea.focus();
}

function normalizeContextToken(token) {
  const trimmed = (token || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed;
  }
  return '<' + trimmed + '>';
}

function insertContextReference(message) {
  const token = normalizeContextToken(message.token);
  const target = message.target || getPreferredTarget();
  if (!token || !target) {
    return;
  }
  const textarea = target === 'overall' ? overallInstructionEl : inlineInstructionEl;
  if (!textarea || textarea.disabled) {
    return;
  }
  insertIntoTextarea(textarea, token);
}

function render() {
  if (!contentEl) {
    return;
  }
  contentEl.style.display = 'block';
  if (!state.hasEditor) {
    noEditorEl.style.display = 'block';
    calloutsSectionsEl.style.display = 'none';
    metaEl.textContent = '';
  } else {
    noEditorEl.style.display = 'none';
    calloutsSectionsEl.style.display = 'block';
    metaEl.textContent = state.docName ? 'Document: ' + state.docName : '';
  }

  if (state.scope && state.scope.supported) {
    scopeSectionEl.style.display = 'block';
    const scopeMode = state.scope.mode === 'range' ? 'Selection (locked outside)' : 'Full document';
    scopeStatusEl.textContent = 'Scope: ' + scopeMode;
    scopeSelectionBtn.disabled = !state.hasEditor;
    scopeFullBtn.disabled = !state.hasEditor || state.scope.mode !== 'range';
  } else {
    scopeSectionEl.style.display = 'none';
  }

  if (state.llm && state.llm.supported) {
    llmSectionEl.style.display = 'block';
    const statusText = state.llm.status ? state.llm.status : 'Idle';
    if (llmStatusTextEl) {
      llmStatusTextEl.textContent = 'LLM: ' + statusText;
    }
    if (llmStatusDotEl) {
      llmStatusDotEl.className = 'status-dot';
      const lowered = String(statusText).toLowerCase();
      if (state.llm.isRunning) {
        llmStatusDotEl.classList.add('running');
      } else if (state.llm.canApply) {
        llmStatusDotEl.classList.add('ready');
      } else if (lowered.includes('error') || lowered.includes('failed')) {
        llmStatusDotEl.classList.add('error');
      }
    }
    llmOpenBtn.disabled = !state.hasEditor;
  } else {
    llmSectionEl.style.display = 'none';
  }

  if (state.iterations && state.llm && state.llm.supported) {
    iterationsSectionEl.style.display = 'block';
    iterationSaveBtn.disabled = !state.hasEditor;
    iterationsListEl.innerHTML = '';
    if (state.iterations.length === 0) {
      iterationsEmptyEl.style.display = 'block';
    } else {
      iterationsEmptyEl.style.display = 'none';
      state.iterations.forEach((iteration) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'list-item';
        item.dataset.id = iteration.id;
        item.textContent = iteration.label || iteration.id;
        if (iteration.createdAt) {
          item.title = iteration.createdAt;
        }
        iterationsListEl.appendChild(item);
      });
    }
  } else {
    iterationsSectionEl.style.display = 'none';
  }

  contextListEl.innerHTML = '';
  if (state.contexts.length === 0) {
    contextEmptyEl.style.display = 'block';
  } else {
    contextEmptyEl.style.display = 'none';
    state.contexts.forEach((contextItem) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-item' + (contextItem.id === state.selectedContextId ? ' selected' : '');
      item.dataset.id = contextItem.id;

      const title = document.createElement('div');
      title.className = 'context-title';
      title.textContent = '#' + String(contextItem.displayNumber) + ' ' + contextItem.name;
      item.appendChild(title);

      if (contextItem.description) {
        const desc = document.createElement('div');
        desc.className = 'context-desc';
        desc.textContent = contextItem.description;
        item.appendChild(desc);
      }

      const pathEl = document.createElement('div');
      pathEl.className = 'context-path';
      pathEl.textContent = contextItem.path;
      item.appendChild(pathEl);

      contextListEl.appendChild(item);
    });
  }

  const selectedContext = state.contexts.find((contextItem) => contextItem.id === state.selectedContextId);
  contextInsertBtn.disabled = !selectedContext || !state.hasEditor;
  contextOpenBtn.disabled = !selectedContext;
  contextRemoveBtn.disabled = !selectedContext;

  if (!state.hasEditor) {
    return;
  }

  overallListEl.innerHTML = '';
  if (state.overallCallouts.length === 0) {
    overallEmptyEl.style.display = 'block';
  } else {
    overallEmptyEl.style.display = 'none';
    state.overallCallouts.forEach((callout) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-item' + (callout.id === state.selectedOverallId ? ' selected' : '');
      item.dataset.id = callout.id;
      item.textContent = '#' + String(callout.displayNumber) + ' ' + callout.snippet;
      item.title = callout.instruction;
      overallListEl.appendChild(item);
    });
  }

  const selectedOverall = state.overallCallouts.find((callout) => callout.id === state.selectedOverallId);
  overallInstructionEl.value = selectedOverall ? selectedOverall.instruction : '';
  overallInstructionEl.placeholder = selectedOverall ? '' : 'Select an overall callout to edit.';
  overallInstructionEl.disabled = !selectedOverall;
  overallSaveBtn.disabled = !selectedOverall;
  overallRemoveBtn.disabled = !selectedOverall;

  inlineListEl.innerHTML = '';
  if (state.inlineCallouts.length === 0) {
    inlineEmptyEl.style.display = 'block';
  } else {
    inlineEmptyEl.style.display = 'none';
    state.inlineCallouts.forEach((callout) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-item' + (callout.id === state.selectedInlineId ? ' selected' : '');
      item.dataset.id = callout.id;
      item.textContent = '#' + String(callout.displayNumber) + ' ' + callout.snippet;
      item.title = callout.instruction;
      inlineListEl.appendChild(item);
    });
  }

  const selectedInline = state.inlineCallouts.find((callout) => callout.id === state.selectedInlineId);
  inlineInstructionEl.value = selectedInline ? selectedInline.instruction : '';
  inlineInstructionEl.placeholder = selectedInline ? '' : 'Select a callout to edit.';
  inlineInstructionEl.disabled = !selectedInline;
  inlineSaveBtn.disabled = !selectedInline;
  inlineRemoveBtn.disabled = !selectedInline;
}

contextListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.list-item');
  if (!button) {
    return;
  }
  vscode.postMessage({ type: 'selectContext', id: button.dataset.id });
});

contextAddBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'addContextFile' });
});

contextInsertBtn.addEventListener('click', () => {
  const selected = state.contexts.find((contextItem) => contextItem.id === state.selectedContextId);
  if (!selected) {
    return;
  }
  insertContextReference({ token: selected.name });
});

contextOpenBtn.addEventListener('click', () => {
  if (!state.selectedContextId) {
    return;
  }
  vscode.postMessage({ type: 'openContext', id: state.selectedContextId });
});

contextRemoveBtn.addEventListener('click', () => {
  if (!state.selectedContextId) {
    return;
  }
  vscode.postMessage({ type: 'removeContext', id: state.selectedContextId });
});

scopeSelectionBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'setScopeSelection' });
});

scopeFullBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'setScopeFull' });
});

llmOpenBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'runLlm' });
});

iterationSaveBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'saveIteration' });
});

iterationsListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.list-item');
  if (!button) {
    return;
  }
  vscode.postMessage({ type: 'restoreIteration', id: button.dataset.id });
});

overallListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.list-item');
  if (!button) {
    return;
  }
  setActiveTarget('overall');
  vscode.postMessage({ type: 'selectOverallCallout', id: button.dataset.id });
});

inlineListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.list-item');
  if (!button) {
    return;
  }
  setActiveTarget('inline');
  vscode.postMessage({ type: 'selectCallout', id: button.dataset.id });
});

overallInstructionEl.addEventListener('focus', () => {
  setActiveTarget('overall');
});

inlineInstructionEl.addEventListener('focus', () => {
  setActiveTarget('inline');
});

overallSaveBtn.addEventListener('click', () => {
  if (!state.selectedOverallId) {
    return;
  }
  vscode.postMessage({
    type: 'updateOverallInstruction',
    id: state.selectedOverallId,
    instruction: overallInstructionEl.value
  });
});

overallRemoveBtn.addEventListener('click', () => {
  if (!state.selectedOverallId) {
    return;
  }
  vscode.postMessage({ type: 'removeOverallCallout', id: state.selectedOverallId });
});

overallAddBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'addOverallCallout' });
});

inlineSaveBtn.addEventListener('click', () => {
  if (!state.selectedInlineId) {
    return;
  }
  vscode.postMessage({
    type: 'updateInstruction',
    id: state.selectedInlineId,
    instruction: inlineInstructionEl.value
  });
});

inlineRemoveBtn.addEventListener('click', () => {
  if (!state.selectedInlineId) {
    return;
  }
  vscode.postMessage({ type: 'removeCallout', id: state.selectedInlineId });
});

render();
