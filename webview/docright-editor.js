import {
  createEditor,
  $getRoot,
  $getNodeByKey,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $createRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  INSERT_TEXT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  PASTE_COMMAND,
  DROP_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_WORD_COMMAND,
  DELETE_LINE_COMMAND,
  REMOVE_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_HIGH
} from 'lexical';
import {
  registerRichText,
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode
} from '@lexical/rich-text';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { insertList, ListNode, ListItemNode } from '@lexical/list';
import { toggleLink, LinkNode } from '@lexical/link';
import { $createTableNodeWithDimensions, TableNode, TableRowNode, TableCellNode } from '@lexical/table';
import { $setBlocksType } from '@lexical/selection';
import {
  $wrapSelectionInMarkNode,
  $isMarkNode,
  $getMarkIDs,
  $unwrapMarkNode,
  MarkNode
} from '@lexical/mark';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';

const vscode = acquireVsCodeApi();
const editorElement = document.getElementById('editor');
const statusElement = document.getElementById('status');
const contextMenu = document.getElementById('context-menu');
const editorContainer = document.querySelector('.editor-container');
const scopeOverlay = document.getElementById('scope-overlay');

let scopeState = { mode: 'full', selection: null };

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

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

if (!editorElement) {
  setStatus('Editor element not found.');
} else {
  const editor = createEditor({
    namespace: 'DocRight',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, TableNode, TableRowNode, TableCellNode, MarkNode],
    onError(error) {
      console.error(error);
      setStatus('Lexical error - see console.');
    }
  });

  editor.setRootElement(editorElement);
  editorElement.setAttribute('tabindex', '0');
  editorElement.setAttribute('role', 'textbox');

  if (typeof registerRichText === 'function') {
    registerRichText(editor);
  } else {
    setStatus('Lexical failed to load (rich text plugin missing).');
  }

  if (typeof registerHistory === 'function' && typeof createEmptyHistoryState === 'function') {
    registerHistory(editor, createEmptyHistoryState(), 1000);
  }

  editor.setEditable(true);

  const ensureParagraph = () => {
    editor.update(() => {
      const root = $getRoot();
      if (root.getFirstChild() === null) {
        root.append($createParagraphNode());
      }
      root.selectEnd();
    });
  };

  ensureParagraph();

  function reportFocus() {
    vscode.postMessage({ type: 'docright.focus' });
  }

  editorElement.addEventListener('click', () => {
    editor.focus();
    reportFocus();
  });

  const toolbar = document.getElementById('toolbar');

  function setBlocksType(createNode) {
    if (shouldBlockEditing()) {
      return;
    }
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, createNode);
      }
    });
  }

  function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }

  function insertLink() {
    if (shouldBlockEditing()) {
      return;
    }
    const url = window.prompt('Enter URL (leave empty to remove link)', 'https://');
    if (url === null) {
      return;
    }
    const trimmed = url.trim();
    editor.update(() => {
      toggleLink(trimmed.length > 0 ? trimmed : null);
    });
  }

  function insertTable() {
    if (shouldBlockEditing()) {
      return;
    }
    const response = window.prompt('Table size (rows, columns)', '3,3');
    let rows = 3;
    let columns = 3;
    if (response) {
      const parts = response.split(',');
      rows = parsePositiveInt(parts[0], rows);
      columns = parsePositiveInt(parts[1], columns);
    }
    editor.update(() => {
      const selection = $getSelection();
      const tableNode = $createTableNodeWithDimensions(rows, columns, false);
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor.getNode();
        const topLevel = anchor.getTopLevelElementOrThrow();
        topLevel.insertAfter(tableNode);
      } else {
        $getRoot().append(tableNode);
      }
    });
  }

  const actions = {
    undo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
    redo: () => editor.dispatchCommand(REDO_COMMAND, undefined),
    bold: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
    italic: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
    underline: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'),
    strikethrough: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'),
    code: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'),
    paragraph: () => setBlocksType(() => $createParagraphNode()),
    h1: () => setBlocksType(() => $createHeadingNode('h1')),
    h2: () => setBlocksType(() => $createHeadingNode('h2')),
    quote: () => setBlocksType(() => $createQuoteNode()),
    bulletList: () => {
      if (shouldBlockEditing()) {
        return;
      }
      insertList(editor, 'bullet');
    },
    numberList: () => {
      if (shouldBlockEditing()) {
        return;
      }
      insertList(editor, 'number');
    },
    link: () => insertLink(),
    table: () => insertTable()
  };

  if (toolbar) {
    toolbar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }
      const action = button.getAttribute('data-action');
      const handler = actions[action];
      if (handler) {
        handler();
        editor.focus();
        reportFocus();
      }
    });
  }

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  }

  function normalizeScopeState(nextScope) {
    if (!nextScope || nextScope.mode !== 'range' || !nextScope.selection) {
      return { mode: 'full', selection: null };
    }
    const selection = nextScope.selection;
    if (!selection.anchorKey || !selection.focusKey) {
      return { mode: 'full', selection: null };
    }
    return {
      mode: 'range',
      selection: {
        anchorKey: selection.anchorKey,
        anchorOffset: Number.isFinite(selection.anchorOffset) ? selection.anchorOffset : 0,
        anchorType: selection.anchorType || 'text',
        focusKey: selection.focusKey,
        focusOffset: Number.isFinite(selection.focusOffset) ? selection.focusOffset : 0,
        focusType: selection.focusType || 'text',
        isBackward: Boolean(selection.isBackward)
      }
    };
  }

  function getRangeEndpoints(selection) {
    const isBackward = selection.isBackward();
    const start = isBackward ? selection.focus : selection.anchor;
    const end = isBackward ? selection.anchor : selection.focus;
    return { start, end };
  }

  function isPointBeforeOrEqual(a, b) {
    if (typeof a.is === 'function' && a.is(b)) {
      return true;
    }
    return a.isBefore(b);
  }

  function buildScopeRange() {
    if (scopeState.mode !== 'range' || !scopeState.selection) {
      return null;
    }
    const selection = scopeState.selection;
    const anchorNode = $getNodeByKey(selection.anchorKey);
    const focusNode = $getNodeByKey(selection.focusKey);
    if (!anchorNode || !focusNode) {
      return null;
    }
    const range = $createRangeSelection();
    range.anchor.set(selection.anchorKey, selection.anchorOffset, selection.anchorType || 'text');
    range.focus.set(selection.focusKey, selection.focusOffset, selection.focusType || 'text');
    return range;
  }

  function isSelectionWithinScope(selection) {
    if (scopeState.mode !== 'range' || !scopeState.selection) {
      return true;
    }
    if (!$isRangeSelection(selection)) {
      return false;
    }
    const scopeRange = buildScopeRange();
    if (!scopeRange) {
      return true;
    }
    const scopePoints = getRangeEndpoints(scopeRange);
    const selectionPoints = getRangeEndpoints(selection);
    return (
      isPointBeforeOrEqual(scopePoints.start, selectionPoints.start) &&
      isPointBeforeOrEqual(selectionPoints.end, scopePoints.end)
    );
  }

  function applyScopeState(nextScope) {
    scopeState = normalizeScopeState(nextScope);
    if (scopeState.mode !== 'range') {
      clearScopeOverlay();
      return;
    }
    let isValid = true;
    editor.getEditorState().read(() => {
      const scopeRange = buildScopeRange();
      if (!scopeRange) {
        isValid = false;
      }
    });
    if (!isValid) {
      scopeState = { mode: 'full', selection: null };
      clearScopeOverlay();
      vscode.postMessage({ type: 'docright.scopeInvalid' });
      return;
    }
    scheduleScopeOverlayUpdate();
  }

  function shouldBlockEditing() {
    if (scopeState.mode !== 'range') {
      return false;
    }
    let blocked = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        blocked = true;
        return;
      }
      blocked = !isSelectionWithinScope(selection);
    });
    if (blocked) {
      setStatus('Editing locked outside scope.');
    }
    return blocked;
  }

  function registerScopeBlock(command) {
    editor.registerCommand(
      command,
      () => {
        return shouldBlockEditing();
      },
      COMMAND_PRIORITY_HIGH
    );
  }

  let scopeHighlightScheduled = false;

  function clearScopeOverlay() {
    if (!scopeOverlay) {
      return;
    }
    scopeOverlay.innerHTML = '';
  }

  function resolveDomPoint(point) {
    const element = editor.getElementByKey(point.key);
    if (!element) {
      return null;
    }
    if (point.type === 'text') {
      const textNode = element.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const max = textNode.textContent ? textNode.textContent.length : 0;
        return {
          node: textNode,
          offset: Math.min(point.offset, max)
        };
      }
    }
    const max = element.childNodes ? element.childNodes.length : 0;
    return {
      node: element,
      offset: Math.min(point.offset, max)
    };
  }

  function buildDomRangeFromSelection(selection) {
    const points = getRangeEndpoints(selection);
    const start = resolveDomPoint(points.start);
    const end = resolveDomPoint(points.end);
    if (!start || !end) {
      return null;
    }
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (range.collapsed) {
      return null;
    }
    return range;
  }

  function updateScopeOverlay() {
    if (!scopeOverlay || !editorContainer) {
      return;
    }
    if (scopeState.mode !== 'range' || !scopeState.selection) {
      clearScopeOverlay();
      return;
    }
    let rect = null;
    editor.getEditorState().read(() => {
      const scopeRange = buildScopeRange();
      if (!scopeRange) {
        rect = null;
        return;
      }
      const domRange = buildDomRangeFromSelection(scopeRange);
      if (!domRange) {
        rect = null;
        return;
      }
      rect = domRange.getBoundingClientRect();
    });
    clearScopeOverlay();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const containerRect = editorContainer.getBoundingClientRect();
    const scrollLeft = editorContainer.scrollLeft;
    const scrollTop = editorContainer.scrollTop;
    const highlight = document.createElement('div');
    highlight.className = 'dr-scope-highlight';
    highlight.style.left = rect.left - containerRect.left + scrollLeft + 'px';
    highlight.style.top = rect.top - containerRect.top + scrollTop + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    scopeOverlay.appendChild(highlight);
  }

  function scheduleScopeOverlayUpdate() {
    if (scopeHighlightScheduled) {
      return;
    }
    scopeHighlightScheduled = true;
    requestAnimationFrame(() => {
      scopeHighlightScheduled = false;
      updateScopeOverlay();
    });
  }

  function selectionHasCallout(selection) {
    const nodes = selection.getNodes();
    for (const node of nodes) {
      let current = node;
      while (current) {
        if ($isMarkNode(current)) {
          return true;
        }
        current = current.getParent();
      }
    }
    return false;
  }

  function getSelectionPayload() {
    let payload = null;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      payload = {
        anchorKey: selection.anchor.key,
        anchorOffset: selection.anchor.offset,
        anchorType: selection.anchor.type,
        focusKey: selection.focus.key,
        focusOffset: selection.focus.offset,
        focusType: selection.focus.type,
        isBackward: selection.isBackward(),
        isCollapsed: selection.isCollapsed(),
        text: selection.getTextContent(),
        overlapsCallout: selectionHasCallout(selection),
        inScope: isSelectionWithinScope(selection)
      };
    });
    return payload;
  }

  function positionContextMenu(x, y) {
    if (!contextMenu) {
      return;
    }
    const { innerWidth, innerHeight } = window;
    const rect = contextMenu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > innerWidth) {
      left = innerWidth - rect.width - 8;
    }
    if (top + rect.height > innerHeight) {
      top = innerHeight - rect.height - 8;
    }
    contextMenu.style.left = Math.max(8, left) + 'px';
    contextMenu.style.top = Math.max(8, top) + 'px';
  }

  let pendingSelection = null;

  editorElement.addEventListener('contextmenu', (event) => {
    if (!contextMenu) {
      return;
    }
    event.preventDefault();
    reportFocus();
    pendingSelection = getSelectionPayload();
    const inScope = pendingSelection ? pendingSelection.inScope !== false : false;
    const inlineBtn = contextMenu.querySelector('[data-action="inline"]');
    if (inlineBtn) {
      inlineBtn.disabled = !pendingSelection || pendingSelection.overlapsCallout || !inScope;
    }
    const overallBtn = contextMenu.querySelector('[data-action="overall"]');
    if (overallBtn) {
      overallBtn.disabled = !pendingSelection || !inScope;
    }
    const cutBtn = contextMenu.querySelector('[data-action="cut"]');
    if (cutBtn) {
      cutBtn.disabled = scopeState.mode === 'range' && !inScope;
    }
    const pasteBtn = contextMenu.querySelector('[data-action="paste"]');
    if (pasteBtn) {
      pasteBtn.disabled = scopeState.mode === 'range' && !inScope;
    }
    contextMenu.style.display = 'block';
    positionContextMenu(event.clientX, event.clientY);
  });

  if (contextMenu) {
    contextMenu.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }
      const action = button.getAttribute('data-action');
      if (action === 'cut' || action === 'copy' || action === 'paste') {
        document.execCommand(action);
        hideContextMenu();
        return;
      }
      if (action === 'inline') {
        if (!pendingSelection) {
          return;
        }
        if (pendingSelection.inScope === false) {
          setStatus('Inline callouts must be inside the active scope.');
          return;
        }
        if (pendingSelection.overlapsCallout) {
          setStatus('Selection overlaps an existing callout.');
          return;
        }
        vscode.postMessage({ type: 'docright.requestInlineCallout', selection: pendingSelection });
      }
      if (action === 'overall') {
        if (pendingSelection && pendingSelection.inScope === false) {
          setStatus('Overall callouts must be inside the active scope.');
          return;
        }
        vscode.postMessage({ type: 'docright.requestOverallCallout', selection: pendingSelection });
      }
      hideContextMenu();
    });
  }

  window.addEventListener('click', () => {
    hideContextMenu();
  });

  window.addEventListener('blur', () => {
    hideContextMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideContextMenu();
    }
  });

  if (editorContainer) {
    editorContainer.addEventListener('scroll', () => {
      scheduleScopeOverlayUpdate();
    });
  }

  window.addEventListener('resize', () => {
    scheduleScopeOverlayUpdate();
  });

  function findMarkNodesById(node, id, results) {
    if ($isMarkNode(node) && node.hasID(id)) {
      results.push(node);
    }
    if (node.getChildren) {
      const children = node.getChildren();
      for (const child of children) {
        findMarkNodesById(child, id, results);
      }
    }
  }

  function applyInlineCallout(id, selection) {
    if (!id || !selection) {
      return;
    }
    try {
      editor.update(() => {
        const range = $createRangeSelection();
        range.anchor.set(selection.anchorKey, selection.anchorOffset, selection.anchorType || 'text');
        range.focus.set(selection.focusKey, selection.focusOffset, selection.focusType || 'text');
        $setSelection(range);
        $wrapSelectionInMarkNode(range, selection.isBackward, id);
      });
    } catch (error) {
      console.error(error);
      setStatus('Failed to apply callout highlight.');
    }
  }

  function selectInlineCallout(id) {
    let targetKey = null;
    editor.update(() => {
      const matches = [];
      findMarkNodesById($getRoot(), id, matches);
      if (matches.length === 0) {
        return;
      }
      const target = matches[0];
      target.selectStart();
      target.selectEnd();
      targetKey = target.getKey();
    });

    if (targetKey) {
      const element = editor.getElementByKey(targetKey);
      if (element && element.scrollIntoView) {
        element.scrollIntoView({ block: 'center' });
      }
    }
  }

  function removeInlineCallout(id) {
    editor.update(() => {
      const matches = [];
      findMarkNodesById($getRoot(), id, matches);
      if (matches.length === 0) {
        return;
      }
      matches.forEach((node) => {
        $unwrapMarkNode(node);
      });
    });
  }

  function collectMarkIds(node, ids) {
    if ($isMarkNode(node)) {
      const nodeIds = node.getIDs();
      if (nodeIds && nodeIds.length > 0) {
        ids.push(nodeIds[0]);
      }
    }
    if (node.getChildren) {
      const children = node.getChildren();
      for (const child of children) {
        collectMarkIds(child, ids);
      }
    }
  }

  function buildHtmlWithCallouts(inlineCallouts) {
    let html = '';
    let orderedIds = [];
    editor.getEditorState().read(() => {
      orderedIds = [];
      collectMarkIds($getRoot(), orderedIds);
      html = $generateHtmlFromNodes(editor, null);
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const marks = Array.from(doc.querySelectorAll('mark'));
    const instructionMap = new Map();
    if (Array.isArray(inlineCallouts)) {
      inlineCallouts.forEach((item) => {
        if (item && item.id) {
          instructionMap.set(item.id, item.instruction || '');
        }
      });
    }

    marks.forEach((mark, index) => {
      const id = orderedIds[index];
      if (!id) {
        return;
      }
      const edit = doc.createElement('llm-edit');
      edit.setAttribute('id', id);
      const instruction = instructionMap.get(id);
      if (instruction) {
        const instructionEl = doc.createElement('instruction');
        instructionEl.textContent = instruction;
        edit.appendChild(instructionEl);
      }
      while (mark.firstChild) {
        edit.appendChild(mark.firstChild);
      }
      mark.replaceWith(edit);
    });

    let output = doc.body.innerHTML;
    const instructionPattern = new RegExp('<instruction>([^]*?)</instruction>', 'g');
    output = output.replace(instructionPattern, (match, inner) => {
      const restored = inner
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      return '<instruction>' + restored + '</instruction>';
    });
    return output;
  }


  function collectAllMarkNodes(node, results) {
    if ($isMarkNode(node)) {
      results.push(node);
    }
    if (node.getChildren) {
      const children = node.getChildren();
      for (const child of children) {
        collectAllMarkNodes(child, results);
      }
    }
  }

  function clearAllInlineCallouts() {
    editor.update(() => {
      const marks = [];
      collectAllMarkNodes($getRoot(), marks);
      if (marks.length === 0) {
        return;
      }
      marks.forEach((node) => {
        $unwrapMarkNode(node);
      });
    });
  }

  function applyHtmlToScope(html) {
    editor.update(() => {
      const dom = new DOMParser().parseFromString(html || '', 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);
      if (scopeState.mode === 'range' && scopeState.selection) {
        const scopeRange = buildScopeRange();
        if (!scopeRange) {
          return;
        }
        $setSelection(scopeRange);
        if (nodes.length === 0) {
          scopeRange.insertText('');
        } else {
          scopeRange.insertNodes(nodes);
        }
        scopeRange.selectEnd();
      } else {
        const root = $getRoot();
        root.clear();
        if (nodes.length === 0) {
          root.append($createParagraphNode());
        } else {
          root.append(...nodes);
        }
        root.selectEnd();
      }
    });
    scheduleScopeOverlayUpdate();
  }

  let lastSelectionId = null;
  editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => {
      let nextId = null;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        const anchorNode = selection.anchor.getNode();
        const ids = $getMarkIDs(anchorNode, selection.anchor.offset);
        if (ids && ids.length > 0) {
          nextId = ids[0];
        }
      });
      if (nextId !== lastSelectionId) {
        lastSelectionId = nextId;
        vscode.postMessage({ type: 'docright.selection', id: nextId });
      }
      return false;
    },
    COMMAND_PRIORITY_LOW
  );

  [
    INSERT_TEXT_COMMAND,
    INSERT_PARAGRAPH_COMMAND,
    INSERT_LINE_BREAK_COMMAND,
    PASTE_COMMAND,
    DROP_COMMAND,
    CUT_COMMAND,
    DELETE_CHARACTER_COMMAND,
    DELETE_WORD_COMMAND,
    DELETE_LINE_COMMAND,
    REMOVE_TEXT_COMMAND,
    FORMAT_TEXT_COMMAND
  ].forEach((command) => registerScopeBlock(command));

  let ignoreUpdates = false;

  function updateEmptyState() {
    let isEmpty = true;
    editor.getEditorState().read(() => {
      isEmpty = $getRoot().getTextContent().trim().length === 0;
    });
    editorElement.classList.toggle('is-empty', isEmpty);
  }

  editor.registerUpdateListener(({ editorState }) => {
    if (ignoreUpdates) {
      return;
    }
    const json = JSON.stringify(editorState.toJSON());
    vscode.postMessage({ type: 'docright.update', state: json });
    updateEmptyState();
    scheduleScopeOverlayUpdate();
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || !message.type) {
      return;
    }

    switch (message.type) {
      case 'docright.load':
        if (typeof message.state === 'string' && message.state.trim().length > 0) {
          try {
            ignoreUpdates = true;
            const parsed = editor.parseEditorState(message.state);
            editor.setEditorState(parsed);
            editor.setEditable(true);
            ensureParagraph();
            scheduleScopeOverlayUpdate();
          } catch (error) {
            console.error(error);
            setStatus('Failed to load document state.');
          } finally {
            ignoreUpdates = false;
            updateEmptyState();
          }
        }
        editor.focus();
        setStatus('Ready (editable: ' + editor.isEditable() + ')');
        break;
      case 'docright.saved':
        setStatus('Saved');
        break;
      case 'docright.error':
        setStatus(message.message || 'Save failed.');
        break;
      case 'docright.applyInlineCallout':
        applyInlineCallout(message.id, message.selection);
        break;
      case 'docright.selectInlineCallout':
        selectInlineCallout(message.id);
        break;
      case 'docright.removeInlineCallout':
        removeInlineCallout(message.id);
        break;
      case 'docright.setScope':
        applyScopeState(message.scope);
        break;
      case 'docright.requestScopeSelection':
        vscode.postMessage({
          type: 'docright.scopeSelection',
          selection: getSelectionPayload()
        });
        break;
      case 'docright.clearInlineCallouts':
        clearAllInlineCallouts();
        break;
      case 'docright.applyScopeUpdate':
        if (message.scope) {
          applyScopeState(message.scope);
        }
        applyHtmlToScope(message.html || '');
        vscode.postMessage({
          type: 'docright.applyScopeComplete',
          requestId: message.requestId
        });
        break;
      case 'docright.export':
        try {
          const html = buildHtmlWithCallouts(message.inlineCallouts);
          vscode.postMessage({
            type: 'docright.exportResult',
            requestId: message.requestId,
            html
          });
        } catch (error) {
          vscode.postMessage({
            type: 'docright.exportError',
            requestId: message.requestId,
            message: error.message || 'Failed to export DocRight HTML.'
          });
        }
        break;
      default:
        break;
    }
  });

  updateEmptyState();
  vscode.postMessage({ type: 'docright.ready' });
}
