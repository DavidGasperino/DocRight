import {
  createEditor,
  $getRoot,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $createParagraphNode,
  $createTextNode,
  $isTextNode,
  ElementNode,
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
import {
  $createTableNodeWithDimensions,
  $getElementGridForTableNode,
  $getTableCellNodeFromLexicalNode,
  $getTableColumnIndexFromTableCellNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowIndexFromTableCellNode,
  $getTableRowNodeFromTableCellNodeOrThrow,
  $insertTableColumn,
  $insertTableRow,
  $removeTableRowAtIndex,
  $deleteTableColumn,
  $isTableCellNode,
  $unmergeCell,
  TableCellHeaderStates,
  TableNode,
  TableRowNode,
  TableCellNode
} from '@lexical/table';
import { $setBlocksType, $patchStyleText } from '@lexical/selection';
import {
  $wrapSelectionInMarkNode,
  $isMarkNode,
  $getMarkIDs,
  $unwrapMarkNode,
  MarkNode
} from '@lexical/mark';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';

const vscode = acquireVsCodeApi();
const editorElement = document.getElementById('editor');
const statusElement = document.getElementById('status');
const contextMenu = document.getElementById('context-menu');
const editorContainer = document.querySelector('.editor-container');
const scopeOverlay = document.getElementById('scope-overlay');
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('docright-search');
const searchPrevButton = document.getElementById('docright-search-prev');
const searchNextButton = document.getElementById('docright-search-next');
const searchCount = document.getElementById('docright-search-count');

let scopeState = { mode: 'full', selection: null, locked: false, markerId: null };
let searchState = {
  query: '',
  matches: [],
  index: 0,
  textSnapshot: ''
};

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

const SCOPE_MARKER_KIND_START = 'start';
const SCOPE_MARKER_KIND_END = 'end';

class ScopeMarkerNode extends ElementNode {
  __markerId;
  __markerKind;

  static getType() {
    return 'docright-scope-marker';
  }

  static clone(node) {
    return new ScopeMarkerNode(node.__markerId, node.__markerKind, node.__key);
  }

  constructor(markerId, markerKind, key) {
    super(key);
    this.__markerId = markerId;
    this.__markerKind = markerKind;
  }

  getMarkerId() {
    return this.__markerId;
  }

  getMarkerKind() {
    return this.__markerKind;
  }

  createDOM() {
    const element = document.createElement('span');
    element.dataset.docrightScope = this.__markerKind;
    element.dataset.docrightScopeId = this.__markerId;
    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  updateDOM(prev, dom) {
    if (prev.__markerKind !== this.__markerKind) {
      dom.dataset.docrightScope = this.__markerKind;
    }
    if (prev.__markerId !== this.__markerId) {
      dom.dataset.docrightScopeId = this.__markerId;
    }
    return false;
  }

  exportJSON() {
    const base = super.exportJSON();
    return {
      ...base,
      type: 'docright-scope-marker',
      version: 1,
      markerId: this.__markerId,
      markerKind: this.__markerKind
    };
  }

  static importJSON(serialized) {
    const node = new ScopeMarkerNode(serialized.markerId, serialized.markerKind);
    if (typeof serialized.format === 'number') {
      node.setFormat(serialized.format);
    }
    if (typeof serialized.indent === 'number') {
      node.setIndent(serialized.indent);
    }
    if (typeof serialized.direction === 'string') {
      node.setDirection(serialized.direction);
    }
    return node;
  }

  exportDOM() {
    const element = document.createElement('span');
    element.setAttribute('data-docright-scope', this.__markerKind);
    element.setAttribute('data-docright-scope-id', this.__markerId);
    element.style.display = 'none';
    return { element };
  }

  isInline() {
    return true;
  }

  isIsolated() {
    return true;
  }

  canBeEmpty() {
    return true;
  }
}

function $createScopeMarkerNode(markerId, markerKind) {
  return new ScopeMarkerNode(markerId, markerKind);
}

function $isScopeMarkerNode(node) {
  return node instanceof ScopeMarkerNode;
}

if (!editorElement) {
  setStatus('Editor element not found.');
} else {
  if (MarkNode && typeof MarkNode.prototype.excludeFromCopy === 'function') {
    const originalExcludeFromCopy = MarkNode.prototype.excludeFromCopy;
    MarkNode.prototype.excludeFromCopy = function (destination) {
      if (destination === 'html') {
        return false;
      }
      return originalExcludeFromCopy.call(this, destination);
    };
  }

  const editor = createEditor({
    namespace: 'DocRight',
    theme,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      TableNode,
      TableRowNode,
      TableCellNode,
      MarkNode,
      ScopeMarkerNode
    ],
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

  function normalizeSearchQuery(value) {
    return value.trim();
  }

  function updateSearchUI() {
    const total = searchState.matches.length;
    const current = total === 0 ? 0 : searchState.index + 1;
    if (searchCount) {
      searchCount.textContent = `${current} / ${total}`;
    }
    if (searchPrevButton) {
      searchPrevButton.disabled = total === 0;
    }
    if (searchNextButton) {
      searchNextButton.disabled = total === 0;
    }
  }

  function shouldPreserveSearchFocus() {
    if (!searchInput) {
      return false;
    }
    const active = document.activeElement;
    return active === searchInput || active === searchPrevButton || active === searchNextButton;
  }

  function selectSearchMatch(index, options = { preserveFocus: false }) {
    const match = searchState.matches[index];
    if (!match) {
      return;
    }
    editor.update(() => {
      const range = $createRangeSelection();
      range.anchor.set(match.key, match.start, 'text');
      range.focus.set(match.key, match.end, 'text');
      $setSelection(range);
    });
    if (options.preserveFocus && shouldPreserveSearchFocus()) {
      setTimeout(() => {
        searchInput.focus({ preventScroll: true });
      }, 0);
    } else {
      editor.focus();
    }
    setTimeout(() => {
      const element = editor.getElementByKey(match.key);
      if (element && element.scrollIntoView) {
        element.scrollIntoView({ block: 'center' });
      }
    }, 0);
  }

  let searchHighlightScheduled = false;

  function clearSearchOverlay() {
    if (searchOverlay) {
      searchOverlay.innerHTML = '';
    }
  }

  function buildDomRangeFromMatch(match) {
    const start = resolveDomPoint({ key: match.key, offset: match.start, type: 'text' });
    const end = resolveDomPoint({ key: match.key, offset: match.end, type: 'text' });
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

  function updateSearchOverlay() {
    if (!searchOverlay || !editorContainer) {
      return;
    }
    if (!searchState.query || searchState.matches.length === 0) {
      clearSearchOverlay();
      return;
    }

    const rects = [];
    editor.getEditorState().read(() => {
      searchState.matches.forEach((match, index) => {
        const range = buildDomRangeFromMatch(match);
        if (!range) {
          return;
        }
        const clientRects = Array.from(range.getClientRects());
        clientRects.forEach((rect) => {
          if (rect.width <= 0 || rect.height <= 0) {
            return;
          }
          rects.push({
            rect,
            isCurrent: index === searchState.index
          });
        });
      });
    });

    clearSearchOverlay();
    if (rects.length === 0) {
      return;
    }

    const overlayRect = searchOverlay.getBoundingClientRect();
    rects.forEach(({ rect, isCurrent }) => {
      const highlight = document.createElement('div');
      highlight.className = 'dr-search-highlight' + (isCurrent ? ' dr-search-highlight-current' : '');
      highlight.style.left = rect.left - overlayRect.left + 'px';
      highlight.style.top = rect.top - overlayRect.top + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
      searchOverlay.appendChild(highlight);
    });
  }

  function scheduleSearchOverlayUpdate() {
    if (searchHighlightScheduled) {
      return;
    }
    searchHighlightScheduled = true;
    requestAnimationFrame(() => {
      searchHighlightScheduled = false;
      updateSearchOverlay();
    });
  }

  function updateSearchMatches(nextQuery, options = { select: true, preserveFocus: false }) {
    const normalized = normalizeSearchQuery(nextQuery);
    if (normalized.length === 0) {
      searchState = {
        query: '',
        matches: [],
        index: 0,
        textSnapshot: ''
      };
      updateSearchUI();
      clearSearchOverlay();
      return;
    }

    let matches = [];
    let textSnapshot = '';
    editor.getEditorState().read(() => {
      const root = $getRoot();
      textSnapshot = root.getTextContent();
      const loweredQuery = normalized.toLowerCase();
      const nodes = root.getAllTextNodes();
      nodes.forEach((node) => {
        const text = node.getTextContent();
        if (!text) {
          return;
        }
        const loweredText = text.toLowerCase();
        let startIndex = 0;
        while (true) {
          const index = loweredText.indexOf(loweredQuery, startIndex);
          if (index === -1) {
            break;
          }
          matches.push({
            key: node.getKey(),
            start: index,
            end: index + normalized.length
          });
          startIndex = index + normalized.length;
        }
      });
    });

    let index = searchState.index;
    if (normalized !== searchState.query) {
      index = 0;
    }
    if (matches.length === 0) {
      index = 0;
    } else if (index >= matches.length) {
      index = 0;
    }
    searchState = {
      query: normalized,
      matches,
      index,
      textSnapshot
    };
    updateSearchUI();
    scheduleSearchOverlayUpdate();
    if (options.select && matches.length > 0) {
      selectSearchMatch(index, { preserveFocus: options.preserveFocus });
    }
  }

  function stepSearchMatch(delta, preserveFocus = false) {
    const total = searchState.matches.length;
    if (total === 0) {
      return;
    }
    searchState.index = (searchState.index + delta + total) % total;
    updateSearchUI();
    scheduleSearchOverlayUpdate();
    selectSearchMatch(searchState.index, { preserveFocus });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      updateSearchMatches(searchInput.value, { select: true, preserveFocus: true });
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          stepSearchMatch(-1, true);
        } else {
          stepSearchMatch(1, true);
        }
      }
      if (event.key === 'Escape') {
        searchInput.value = '';
        updateSearchMatches('', { select: false });
        editor.focus();
      }
    });
  }

  if (searchPrevButton) {
    searchPrevButton.addEventListener('click', () => {
      stepSearchMatch(-1, true);
    });
  }

  if (searchNextButton) {
    searchNextButton.addEventListener('click', () => {
      stepSearchMatch(1, true);
    });
  }

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

  function promptForColor(label, fallback) {
    const response = window.prompt(label + ' (hex or CSS). Leave blank to clear.', fallback);
    if (response === null) {
      return null;
    }
    return response.trim();
  }

  function getTableCellKeyFromDom(domNode) {
    if (!(domNode instanceof Element)) {
      return null;
    }
    const cell = domNode.closest('td, th');
    if (!cell) {
      return null;
    }
    let key = null;
    editor.update(() => {
      const nearest = $getNearestNodeFromDOMNode(cell);
      if (!nearest) {
        return;
      }
      const cellNode = $getTableCellNodeFromLexicalNode(nearest);
      if (cellNode) {
        key = cellNode.getKey();
      }
    }, { discrete: true });
    return key;
  }

  function resolveTableCellFromSelection() {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return null;
    }
    const anchorNode = selection.anchor.getNode();
    return $getTableCellNodeFromLexicalNode(anchorNode);
  }

  function resolveTableCellFromKey(cellKey) {
    if (cellKey) {
      const node = $getNodeByKey(cellKey);
      if ($isTableCellNode(node)) {
        return node;
      }
      if (node) {
        const cell = $getTableCellNodeFromLexicalNode(node);
        if (cell) {
          return cell;
        }
      }
    }
    return resolveTableCellFromSelection();
  }

  function resolveTableContext(cellKey) {
    const cellNode = resolveTableCellFromKey(cellKey);
    if (!cellNode) {
      return null;
    }
    const tableNode = $getTableNodeFromLexicalNodeOrThrow(cellNode);
    const grid = $getElementGridForTableNode(editor, tableNode);
    return {
      cellNode,
      tableNode,
      grid,
      rowIndex: $getTableRowIndexFromTableCellNode(cellNode),
      columnIndex: $getTableColumnIndexFromTableCellNode(cellNode)
    };
  }

  function withTableContext(cellKey, handler) {
    if (shouldBlockEditing()) {
      return;
    }
    editor.update(() => {
      const context = resolveTableContext(cellKey);
      if (!context) {
        setStatus('Place the cursor in a table cell to use table tools.');
        return;
      }
      handler(context);
    });
  }

  function toggleHeaderRow(context) {
    const rowNode = $getTableRowNodeFromTableCellNodeOrThrow(context.cellNode);
    const cells = rowNode.getChildren().filter((node) => $isTableCellNode(node));
    const shouldEnable = cells.some((cell) => !cell.hasHeaderState(TableCellHeaderStates.ROW));
    cells.forEach((cell) => {
      const current = cell.getHeaderStyles();
      const next = shouldEnable ? current | TableCellHeaderStates.ROW : current & ~TableCellHeaderStates.ROW;
      cell.setHeaderStyles(next);
    });
  }

  function toggleHeaderColumn(context) {
    const { tableNode, grid, columnIndex } = context;
    let shouldEnable = false;
    for (let row = 0; row < grid.rows; row += 1) {
      const cell = tableNode.getCellNodeFromCords(columnIndex, row, grid);
      if (cell && !cell.hasHeaderState(TableCellHeaderStates.COLUMN)) {
        shouldEnable = true;
        break;
      }
    }
    for (let row = 0; row < grid.rows; row += 1) {
      const cell = tableNode.getCellNodeFromCords(columnIndex, row, grid);
      if (!cell) {
        continue;
      }
      const current = cell.getHeaderStyles();
      const next = shouldEnable ? current | TableCellHeaderStates.COLUMN : current & ~TableCellHeaderStates.COLUMN;
      cell.setHeaderStyles(next);
    }
  }

  function setCellFillColor(cellKey) {
    const color = promptForColor('Cell fill color', '#000000');
    if (color === null) {
      return;
    }
    const nextColor = color.length === 0 ? null : color;
    withTableContext(cellKey, (context) => {
      context.cellNode.setBackgroundColor(nextColor);
    });
  }

  function setSelectionTextColor() {
    const color = promptForColor('Text color', '#ffffff');
    if (color === null) {
      return;
    }
    const nextColor = color.length === 0 ? null : color;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { color: nextColor });
      }
    });
  }

  function copyHtmlViaSelection(html) {
    if (!html) {
      return false;
    }
    const helper = document.createElement('div');
    helper.innerHTML = html;
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    helper.style.top = '0';
    helper.style.opacity = '0';
    helper.setAttribute('aria-hidden', 'true');
    document.body.appendChild(helper);
    const range = document.createRange();
    range.selectNodeContents(helper);
    const selection = window.getSelection();
    if (!selection) {
      document.body.removeChild(helper);
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (error) {
      console.error(error);
    }
    selection.removeAllRanges();
    document.body.removeChild(helper);
    return success;
  }

  async function copyMarkdownToClipboard() {
    let markdown = '';
    let html = '';
    let text = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(TRANSFORMERS);
      html = $generateHtmlFromNodes(editor, null);
      text = $getRoot().getTextContent();
    });
    if (!markdown.trim()) {
      markdown = text;
    }
    if (!text.trim()) {
      text = markdown;
    }

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const mdBlob = new Blob([markdown], { type: 'text/markdown' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/markdown': mdBlob,
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
        setStatus('Copied to clipboard.');
        return;
      }
      if (copyHtmlViaSelection(html)) {
        setStatus('Copied to clipboard.');
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdown);
        setStatus('Copied to clipboard.');
        return;
      }
    } catch (error) {
      console.error(error);
    }

    vscode.postMessage({ type: 'docright.copyMarkdown', markdown, html, text });
    setStatus('Copying to clipboard...');
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
    table: () => insertTable(),
    copyMarkdown: () => copyMarkdownToClipboard()
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


  const RESIZE_MARGIN = 6;
  const MIN_COLUMN_WIDTH = 60;
  let resizeState = null;
  let resizeFrame = null;
  let resizeWidth = null;

  function isNearCellEdge(cell, clientX) {
    const rect = cell.getBoundingClientRect();
    return Math.abs(clientX - rect.right) <= RESIZE_MARGIN;
  }

  function scheduleColumnResize(cellKey, width) {
    resizeWidth = width;
    if (resizeFrame) {
      return;
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      if (!resizeState || resizeWidth === null) {
        return;
      }
      const nextWidth = resizeWidth;
      editor.update(() => {
        const context = resolveTableContext(resizeState.cellKey);
        if (!context) {
          return;
        }
        const { tableNode, grid, columnIndex } = context;
        for (let row = 0; row < grid.rows; row += 1) {
          const cell = tableNode.getCellNodeFromCords(columnIndex, row, grid);
          if (cell) {
            cell.setWidth(nextWidth);
          }
        }
      });
    });
  }

  function stopColumnResize() {
    resizeState = null;
    resizeWidth = null;
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    if (editorContainer) {
      editorContainer.classList.remove('is-resizing');
    }
    window.removeEventListener('mousemove', onColumnResizeMove);
    window.removeEventListener('mouseup', stopColumnResize);
  }

  function onColumnResizeMove(event) {
    if (!resizeState) {
      return;
    }
    const delta = event.clientX - resizeState.startX;
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(resizeState.startWidth + delta));
    scheduleColumnResize(resizeState.cellKey, nextWidth);
  }

  editorElement.addEventListener('mousemove', (event) => {
    if (!editorContainer || resizeState) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      editorContainer.style.cursor = '';
      return;
    }
    const cell = target.closest('td, th');
    if (!cell) {
      editorContainer.style.cursor = '';
      return;
    }
    editorContainer.style.cursor = isNearCellEdge(cell, event.clientX) ? 'col-resize' : '';
  });

  editorElement.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !editorContainer || shouldBlockEditing()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const cell = target.closest('td, th');
    if (!cell || !isNearCellEdge(cell, event.clientX)) {
      return;
    }
    const cellKey = getTableCellKeyFromDom(cell);
    if (!cellKey) {
      return;
    }
    event.preventDefault();
    resizeState = {
      cellKey,
      startX: event.clientX,
      startWidth: cell.getBoundingClientRect().width
    };
    editorContainer.classList.add('is-resizing');
    window.addEventListener('mousemove', onColumnResizeMove);
    window.addEventListener('mouseup', stopColumnResize);
  });

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  }

  function normalizeScopeState(nextScope) {
    const hasLocked = nextScope && typeof nextScope.locked === 'boolean';
    const locked =
      hasLocked && typeof nextScope.locked === 'boolean'
        ? nextScope.locked
        : Boolean(nextScope && nextScope.mode === 'range' && nextScope.selection);
    const markerId = nextScope && typeof nextScope.markerId === 'string' ? nextScope.markerId : null;
    if (!nextScope || nextScope.mode !== 'range' || !nextScope.selection) {
      return { mode: 'full', selection: null, locked, markerId: null };
    }
    const selection = nextScope.selection;
    if (!selection.anchorKey || !selection.focusKey) {
      return { mode: 'full', selection: null, locked, markerId: null };
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
      },
      locked,
      markerId
    };
  }

  function getRangeEndpoints(selection) {
    const isBackward = selection.isBackward();
    const start = isBackward ? selection.focus : selection.anchor;
    const end = isBackward ? selection.anchor : selection.focus;
    return { start, end };
  }

  function createScopeMarkerId() {
    return `scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function collectScopeMarkers(node, results) {
    if ($isScopeMarkerNode(node)) {
      results.push(node);
      return;
    }
    if (node.getChildren) {
      const children = node.getChildren();
      for (const child of children) {
        collectScopeMarkers(child, results);
      }
    }
  }

  function removeScopeMarkers(markerId) {
    const markers = [];
    collectScopeMarkers($getRoot(), markers);
    markers.forEach((node) => {
      if (!markerId || node.getMarkerId() === markerId) {
        node.remove();
      }
    });
  }

  function findScopeMarkerNodes(markerId) {
    const markers = [];
    collectScopeMarkers($getRoot(), markers);
    let start = null;
    let end = null;
    markers.forEach((node) => {
      if (markerId && node.getMarkerId() !== markerId) {
        return;
      }
      const kind = node.getMarkerKind();
      if (kind === SCOPE_MARKER_KIND_START && !start) {
        start = node;
      }
      if (kind === SCOPE_MARKER_KIND_END && !end) {
        end = node;
      }
    });
    return { start, end };
  }

  function getNodeIndexWithinParent(node) {
    const parent = node.getParent();
    if (!parent) {
      return null;
    }
    let index = -1;
    if (typeof node.getIndexWithinParent === 'function') {
      index = node.getIndexWithinParent();
    }
    if (!Number.isFinite(index) || index < 0) {
      const children = parent.getChildren ? parent.getChildren() : [];
      index = children.indexOf(node);
    }
    if (index < 0) {
      return null;
    }
    return { parent, index };
  }

  function createPointAfterNode(node) {
    const info = getNodeIndexWithinParent(node);
    if (!info) {
      return null;
    }
    return { key: info.parent.getKey(), offset: info.index + 1, type: 'element' };
  }

  function createPointBeforeNode(node) {
    const info = getNodeIndexWithinParent(node);
    if (!info) {
      return null;
    }
    return { key: info.parent.getKey(), offset: info.index, type: 'element' };
  }

  function buildScopeRangeFromMarkers(markerId) {
    if (!markerId) {
      return null;
    }
    const { start, end } = findScopeMarkerNodes(markerId);
    if (!start || !end) {
      return null;
    }
    const startPoint = createPointAfterNode(start);
    const endPoint = createPointBeforeNode(end);
    if (!startPoint || !endPoint) {
      return null;
    }
    const range = $createRangeSelection();
    range.anchor.set(startPoint.key, startPoint.offset, startPoint.type);
    range.focus.set(endPoint.key, endPoint.offset, endPoint.type);
    return range;
  }

  function isPointBeforeOrEqual(a, b) {
    if (typeof a.is === 'function' && a.is(b)) {
      return true;
    }
    return a.isBefore(b);
  }

  function buildScopeRangeFromState(state) {
    if (!state || state.mode !== 'range') {
      return null;
    }
    if (state.markerId) {
      return buildScopeRangeFromMarkers(state.markerId);
    }
    if (!state.selection) {
      return null;
    }
    const selection = state.selection;
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

  function buildScopeRange() {
    return buildScopeRangeFromState(scopeState);
  }

  function isSelectionWithinScope(selection) {
    if (!scopeState.locked || scopeState.mode !== 'range' || !scopeState.selection) {
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
    const previousMarkerId = scopeState.markerId;
    scopeState = normalizeScopeState(nextScope);
    editor.setEditable(!scopeState.locked);
    if (!scopeState.locked || scopeState.mode !== 'range') {
      editor.update(() => {
        removeScopeMarkers();
      });
      clearScopeOverlay();
      return true;
    }
    if (previousMarkerId && previousMarkerId !== scopeState.markerId) {
      editor.update(() => {
        removeScopeMarkers(previousMarkerId);
      });
    }
    let isValid = true;
    editor.getEditorState().read(() => {
      const scopeRange = buildScopeRange();
      if (!scopeRange) {
        isValid = false;
      }
    });
    if (!isValid) {
      scopeState = { mode: 'full', selection: null, locked: false, markerId: null };
      editor.setEditable(true);
      editor.update(() => {
        removeScopeMarkers();
      });
      clearScopeOverlay();
      vscode.postMessage({ type: 'docright.scopeInvalid' });
      return false;
    }
    scheduleScopeOverlayUpdate();
    return true;
  }

  function shouldBlockEditing() {
    if (!scopeState.locked) {
      return false;
    }
    setStatus('Editing locked. Click Unlock to edit.');
    return true;
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

  function buildDomRangeFromMarkers(markerId) {
    if (!markerId || !editorElement) {
      return null;
    }
    const startMarker = editorElement.querySelector(
      `[data-docright-scope-id="${markerId}"][data-docright-scope="${SCOPE_MARKER_KIND_START}"]`
    );
    const endMarker = editorElement.querySelector(
      `[data-docright-scope-id="${markerId}"][data-docright-scope="${SCOPE_MARKER_KIND_END}"]`
    );
    if (!startMarker || !endMarker) {
      return null;
    }
    const range = document.createRange();
    try {
      range.setStartAfter(startMarker);
      range.setEndBefore(endMarker);
    } catch (error) {
      console.error(error);
      return null;
    }
    if (range.collapsed) {
      return null;
    }
    return range;
  }

  function updateScopeOverlay() {
    if (!scopeOverlay || !editorContainer) {
      return;
    }
    if (!scopeState.locked || scopeState.mode !== 'range' || !scopeState.selection) {
      clearScopeOverlay();
      return;
    }
    let rect = null;
    editor.getEditorState().read(() => {
      const scopeRange = scopeState.markerId ? null : buildScopeRange();
      const domRange = scopeState.markerId
        ? buildDomRangeFromMarkers(scopeState.markerId)
        : scopeRange
          ? buildDomRangeFromSelection(scopeRange)
          : null;
      if (!domRange) {
        rect = null;
        return;
      }
      const rects = Array.from(domRange.getClientRects()).filter((item) => item.width > 0 && item.height > 0);
      if (rects.length === 0) {
        rect = null;
        return;
      }
      rect = rects.reduce(
        (acc, item) => ({
          left: Math.min(acc.left, item.left),
          top: Math.min(acc.top, item.top),
          right: Math.max(acc.right, item.right),
          bottom: Math.max(acc.bottom, item.bottom),
          width: 0,
          height: 0
        }),
        {
          left: rects[0].left,
          top: rects[0].top,
          right: rects[0].right,
          bottom: rects[0].bottom,
          width: 0,
          height: 0
        }
      );
      rect.width = rect.right - rect.left;
      rect.height = rect.bottom - rect.top;
    });
    clearScopeOverlay();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const overlayRect = scopeOverlay.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'dr-scope-highlight';
    highlight.style.left = rect.left - overlayRect.left + 'px';
    highlight.style.top = rect.top - overlayRect.top + 'px';
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

  function buildSelectionPayload(selection) {
    if (!$isRangeSelection(selection)) {
      return null;
    }
    return {
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
  }

  function buildRangeSelectionFromPayload(payload) {
    if (!payload) {
      return null;
    }
    const range = $createRangeSelection();
    range.anchor.set(payload.anchorKey, payload.anchorOffset, payload.anchorType || 'text');
    range.focus.set(payload.focusKey, payload.focusOffset, payload.focusType || 'text');
    return range;
  }

  function insertMarkerAtPoint(point, markerNode) {
    if (!point || !markerNode) {
      return false;
    }
    const target = $getNodeByKey(point.key);
    if (!target) {
      return false;
    }
    if (point.type === 'text' && $isTextNode(target)) {
      const textNode = target;
      const size = textNode.getTextContentSize();
      if (point.offset <= 0) {
        textNode.insertBefore(markerNode);
        return true;
      }
      if (point.offset >= size) {
        textNode.insertAfter(markerNode);
        return true;
      }
      const splitNodes = textNode.splitText(point.offset);
      const rightNode = splitNodes[1];
      if (rightNode) {
        rightNode.insertBefore(markerNode);
        return true;
      }
      return false;
    }
    if (point.type === 'element' && typeof target.getChildren === 'function') {
      const children = target.getChildren();
      const offset = Math.max(0, Math.min(point.offset, children.length));
      if (children.length === 0) {
        target.append(markerNode);
        return true;
      }
      if (offset === 0) {
        children[0].insertBefore(markerNode);
        return true;
      }
      if (offset >= children.length) {
        children[children.length - 1].insertAfter(markerNode);
        return true;
      }
      children[offset].insertBefore(markerNode);
      return true;
    }
    return false;
  }

  function insertScopeMarkersForRange(range) {
    if (!range) {
      return null;
    }
    const { start, end } = getRangeEndpoints(range);
    const markerId = createScopeMarkerId();
    const startPoint = { key: start.key, offset: start.offset, type: start.type };
    const endPoint = { key: end.key, offset: end.offset, type: end.type };
    removeScopeMarkers();
    const endInserted = insertMarkerAtPoint(endPoint, $createScopeMarkerNode(markerId, SCOPE_MARKER_KIND_END));
    const startInserted = insertMarkerAtPoint(startPoint, $createScopeMarkerNode(markerId, SCOPE_MARKER_KIND_START));
    if (!endInserted || !startInserted) {
      removeScopeMarkers(markerId);
      return null;
    }
    return markerId;
  }

  function insertScopeMarkersForSelection(payload) {
    const range = buildRangeSelectionFromPayload(payload);
    return insertScopeMarkersForRange(range);
  }

  function isMeaningfulSelection(payload) {
    return Boolean(payload && !payload.isCollapsed && payload.text && payload.text.trim());
  }

  function getSelectionPayload() {
    let payload = null;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      payload = buildSelectionPayload(selection);
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
  let lastScopeSelection = null;
  let contextTableCellKey = null;

  function handleContextMenu(event) {
    if (!contextMenu) {
      return;
    }
    if (!editorElement.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    reportFocus();
    pendingSelection = getSelectionPayload();
    contextTableCellKey = getTableCellKeyFromDom(event.target);
    contextMenu.dataset.table = contextTableCellKey ? 'true' : 'false';
    const isLocked = scopeState.locked === true;
    const inScope = pendingSelection ? pendingSelection.inScope !== false : false;
    const inlineBtn = contextMenu.querySelector('[data-action="inline"]');
    if (inlineBtn) {
      inlineBtn.disabled = !isLocked || !pendingSelection || pendingSelection.overlapsCallout || !inScope;
    }
    const overallBtn = contextMenu.querySelector('[data-action="overall"]');
    if (overallBtn) {
      overallBtn.disabled = !isLocked || !pendingSelection || !inScope;
    }
    const cutBtn = contextMenu.querySelector('[data-action="cut"]');
    if (cutBtn) {
      cutBtn.disabled = isLocked || (scopeState.mode === 'range' && !inScope);
    }
    const pasteBtn = contextMenu.querySelector('[data-action="paste"]');
    if (pasteBtn) {
      pasteBtn.disabled = isLocked || (scopeState.mode === 'range' && !inScope);
    }
    contextMenu.style.display = 'block';
    positionContextMenu(event.clientX, event.clientY);
  }

  document.addEventListener('contextmenu', handleContextMenu, true);

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
      if (action && action.startsWith('table-')) {
        switch (action) {
          case 'table-row-above':
            withTableContext(contextTableCellKey, (context) => {
              $insertTableRow(context.tableNode, context.rowIndex, false, 1, context.grid);
            });
            break;
          case 'table-row-below':
            withTableContext(contextTableCellKey, (context) => {
              $insertTableRow(context.tableNode, context.rowIndex, true, 1, context.grid);
            });
            break;
          case 'table-column-left':
            withTableContext(contextTableCellKey, (context) => {
              $insertTableColumn(context.tableNode, context.columnIndex, false, 1, context.grid);
            });
            break;
          case 'table-column-right':
            withTableContext(contextTableCellKey, (context) => {
              $insertTableColumn(context.tableNode, context.columnIndex, true, 1, context.grid);
            });
            break;
          case 'table-row-delete':
            withTableContext(contextTableCellKey, (context) => {
              if (context.grid.rows <= 1) {
                context.tableNode.remove();
                return;
              }
              $removeTableRowAtIndex(context.tableNode, context.rowIndex);
            });
            break;
          case 'table-column-delete':
            withTableContext(contextTableCellKey, (context) => {
              if (context.grid.columns <= 1) {
                context.tableNode.remove();
                return;
              }
              $deleteTableColumn(context.tableNode, context.columnIndex);
            });
            break;
          case 'table-toggle-header-row':
            withTableContext(contextTableCellKey, (context) => {
              toggleHeaderRow(context);
            });
            break;
          case 'table-toggle-header-column':
            withTableContext(contextTableCellKey, (context) => {
              toggleHeaderColumn(context);
            });
            break;
          case 'table-delete':
            withTableContext(contextTableCellKey, (context) => {
              context.tableNode.remove();
            });
            break;
          case 'table-cell-fill':
            setCellFillColor(contextTableCellKey);
            break;
          case 'table-text-color':
            setSelectionTextColor();
            break;
          default:
            break;
        }
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
      scheduleSearchOverlayUpdate();
    });
  }

  window.addEventListener('resize', () => {
    scheduleScopeOverlayUpdate();
    scheduleSearchOverlayUpdate();
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

  function collectMarkIdsInSelection(selection, ids) {
    const seen = new Set();
    const nodes = selection.getNodes();
    for (const node of nodes) {
      let current = node;
      while (current) {
        if ($isMarkNode(current)) {
          const nodeIds = current.getIDs();
          if (nodeIds && nodeIds.length > 0) {
            const id = nodeIds[0];
            if (!seen.has(id)) {
              seen.add(id);
              ids.push(id);
            }
          }
          break;
        }
        current = current.getParent();
      }
    }
  }

  function buildHtmlWithCallouts(inlineCallouts, scopeOverride, options) {
    let html = '';
    let orderedIds = [];
    let errorMessage = '';
    let usedSelectionPayload = null;
    editor.update(() => {
      orderedIds = [];
      const normalizedScope = scopeOverride ? normalizeScopeState(scopeOverride) : null;
      if (normalizedScope && normalizedScope.mode === 'range' && normalizedScope.selection) {
        let scopeRange = buildScopeRangeFromState(normalizedScope);
        if (!scopeRange && options && options.fallbackToSelection && !normalizedScope.markerId) {
          const currentSelection = $getSelection();
          const currentPayload = buildSelectionPayload(currentSelection);
          let fallbackPayload = isMeaningfulSelection(currentPayload) ? currentPayload : null;
          if (!fallbackPayload && isMeaningfulSelection(lastScopeSelection)) {
            fallbackPayload = lastScopeSelection;
          }
          if (fallbackPayload) {
            scopeRange = buildScopeRangeFromState({ mode: 'range', selection: fallbackPayload });
            if (scopeRange) {
              usedSelectionPayload = fallbackPayload;
            }
          }
        }
        if (!scopeRange) {
          errorMessage = 'Scope selection is no longer valid.';
          return;
        }
        const payload = buildSelectionPayload(scopeRange);
        if (payload) {
          usedSelectionPayload = payload;
        }
        collectMarkIdsInSelection(scopeRange, orderedIds);
        html = $generateHtmlFromNodes(editor, scopeRange);
        return;
      }
      collectMarkIds($getRoot(), orderedIds);
      html = $generateHtmlFromNodes(editor, null);
    });
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('[data-docright-scope]').forEach((node) => node.remove());
    const marks = Array.from(doc.querySelectorAll('mark, .dr-mark'));
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
      while (mark.firstChild) {
        edit.appendChild(mark.firstChild);
      }
      const instruction = instructionMap.get(id);
      if (instruction) {
        const instructionEl = doc.createElement('instruction');
        instructionEl.textContent = instruction;
        edit.appendChild(instructionEl);
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
    return { html: output, scopeSelection: usedSelectionPayload };
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

  function stripSummaryBlock(value) {
    return String(value || '').replace(/<!--DOCRIGHT_SUMMARY_START-->[\s\S]*?<!--DOCRIGHT_SUMMARY_END-->/gi, '');
  }

  function decodeHtmlIfEscaped(value) {
    const text = String(value || '');
    if (!text.includes('&lt;') && !text.includes('&gt;')) {
      return text;
    }
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

function stripCdata(value) {
  const text = String(value || '').trim();
  const match = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (!match) {
    return text;
  }
  return String(match[1] || '').trim();
}

function ensureBlockHtml(value) {
  const text = String(value || '').trim();
  if (!text) {
    return text;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const hasBlock = Boolean(
    doc.body.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, pre, div')
  );
  if (hasBlock) {
    return text;
  }
  const inner = doc.body.innerHTML.trim();
  if (!inner) {
    return text;
  }
  return `<p>${inner}</p>`;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim();
}

function extractHtmlFragment(raw) {
  let cleaned = stripSummaryBlock(raw);
    const bodyMatch = String(cleaned).match(/<llm-body[^>]*>([\s\S]*?)<\/llm-body>/i);
  if (bodyMatch) {
    cleaned = bodyMatch[1];
  }
  cleaned = stripCdata(cleaned);
  cleaned = decodeHtmlIfEscaped(cleaned);
  cleaned = ensureBlockHtml(cleaned);
  return String(cleaned || '').trim();
}

  function unwrapDocRightMarkers(doc) {
    doc.querySelectorAll('llm-edit').forEach((node) => {
      const fragment = doc.createDocumentFragment();
      while (node.firstChild) {
        fragment.appendChild(node.firstChild);
      }
      node.replaceWith(fragment);
    });
    doc.querySelectorAll('instruction').forEach((node) => node.remove());
  }

  function parseIncomingHtml(raw) {
    const cleaned = extractHtmlFragment(raw);
    const parser = new DOMParser();
    const dom = parser.parseFromString(cleaned, 'text/html');
    unwrapDocRightMarkers(dom);
    return { cleaned, dom };
  }

  function postApplyTrace(stage, detail) {
    try {
      vscode.postMessage({ type: 'docright.applyTrace', stage, detail });
    } catch (error) {
      // ignore logging failures
    }
  }

  function postScopeTrace(stage, detail) {
    try {
      vscode.postMessage({ type: 'docright.scopeTrace', stage, detail });
    } catch (error) {
      // ignore logging failures
    }
  }

  function buildRangeSelectionFromDomRange(domRange) {
    if (!domRange) {
      return null;
    }
    const range = $createRangeSelection();
    try {
      range.applyDOMRange(domRange);
      return range;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function applyHtmlToScope(html, options) {
    let applied = true;
    lastApplyResolution = '';
    const requireScope = options && options.requireScope === true;
    const scopeOverride = options && options.scope ? normalizeScopeState(options.scope) : null;
    editor.update(() => {
      const { cleaned, dom } = parseIncomingHtml(html);
      let nodes = [];
      try {
        nodes = $generateNodesFromDOM(editor, dom);
        if (nodes.length === 0) {
          const hasBlock = Boolean(
            dom.body.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, pre, div')
          );
          if (!hasBlock && cleaned.includes('<')) {
            const parser = new DOMParser();
            const wrapped = parser.parseFromString(`<p>${cleaned}</p>`, 'text/html');
            nodes = $generateNodesFromDOM(editor, wrapped);
          }
        }
      } catch (error) {
        nodes = [];
      }
      const fallbackText = (dom.body && dom.body.textContent ? dom.body.textContent : cleaned).trim();
      const safeFallbackText = fallbackText || stripTags(cleaned);
      const activeScope = scopeOverride || scopeState;
      if (activeScope.mode === 'range' && activeScope.selection) {
        const usesMarkers = Boolean(activeScope.markerId);
        lastApplyResolution = usesMarkers ? 'markers' : 'selection';
        const domRange = usesMarkers ? buildDomRangeFromMarkers(activeScope.markerId) : null;
        let scopeRange = usesMarkers ? buildRangeSelectionFromDomRange(domRange) : null;
        if (!scopeRange) {
          scopeRange = buildScopeRangeFromState(activeScope);
        }
        if (scopeRange && $isRangeSelection(scopeRange)) {
          const anchorNode = scopeRange.anchor.getNode();
          const focusNode = scopeRange.focus.getNode();
          const anchorBlock = anchorNode.getTopLevelElementOrThrow();
          const focusBlock = focusNode.getTopLevelElementOrThrow();
          const isSingleBlock = anchorBlock.is(focusBlock);
          const isParagraph =
            typeof anchorBlock.getType === 'function' && anchorBlock.getType() === 'paragraph';
          if (isSingleBlock && isParagraph && nodes.length === 1) {
            const firstNode = nodes[0];
            if (firstNode && typeof firstNode.getType === 'function' && firstNode.getType() === 'paragraph') {
              const inlineNodes = firstNode.getChildren ? firstNode.getChildren() : [];
              if (inlineNodes.length > 0) {
                nodes = inlineNodes;
              }
            }
          }
        }
        if (!scopeRange || scopeRange.isCollapsed()) {
          lastApplyResolution = usesMarkers ? 'markers-missing' : 'selection-missing';
          applied = false;
          return;
        }
        $setSelection(scopeRange);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          applied = false;
          return;
        }
        if (selection.isCollapsed()) {
          lastApplyResolution = usesMarkers ? 'markers-collapsed' : 'selection-collapsed';
          applied = false;
          return;
        }
        postApplyTrace('before-remove', {
          markerId: activeScope.markerId || null,
          selectionLength: selection.getTextContent().length,
          selectionPreview: selection.getTextContent().slice(0, 160),
          anchorType: selection.anchor.type,
          focusType: selection.focus.type,
          anchorOffset: selection.anchor.offset,
          focusOffset: selection.focus.offset,
          domRangeLength: domRange ? domRange.toString().length : null,
          domRangeCollapsed: domRange ? domRange.collapsed : null,
          nodesLength: nodes.length
        });
        selection.removeText();
        const insertionSelection = $getSelection();
        if (!$isRangeSelection(insertionSelection)) {
          applied = false;
          return;
        }
        postApplyTrace('after-remove', {
          markerId: activeScope.markerId || null,
          selectionLength: insertionSelection.getTextContent().length,
          selectionPreview: insertionSelection.getTextContent().slice(0, 160),
          anchorType: insertionSelection.anchor.type,
          focusType: insertionSelection.focus.type,
          anchorOffset: insertionSelection.anchor.offset,
          focusOffset: insertionSelection.focus.offset,
          nodesLength: nodes.length
        });
        let inserted = false;
        if (nodes.length === 0) {
          insertionSelection.insertText(safeFallbackText || '');
          inserted = true;
        } else {
          try {
            insertionSelection.insertNodes(nodes);
            inserted = true;
          } catch (error) {
            inserted = false;
          }
          if (!inserted && safeFallbackText) {
            insertionSelection.insertText(safeFallbackText);
            inserted = true;
          }
        }
        if (!inserted) {
          lastApplyResolution = usesMarkers ? 'markers-insert-failed' : 'selection-insert-failed';
          applied = false;
          return;
        }
      } else if (requireScope) {
        lastApplyResolution = 'scope-required';
        applied = false;
        return;
      } else {
        lastApplyResolution = 'full';
        const root = $getRoot();
        root.clear();
        if (nodes.length === 0) {
          if (safeFallbackText) {
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode(safeFallbackText));
            root.append(paragraph);
          } else {
            root.append($createParagraphNode());
          }
        } else {
          root.append(...nodes);
        }
        root.selectEnd();
      }
    });
    if (applied) {
      scheduleScopeOverlayUpdate();
    }
    return applied;
  }

  let lastSelectionId = null;
  let lastApplyResolution = '';
  editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => {
      let nextId = null;
      let nextScopeSelection = null;
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
        const payload = buildSelectionPayload(selection);
        if (isMeaningfulSelection(payload)) {
          nextScopeSelection = payload;
        }
      });
      if (nextScopeSelection) {
        lastScopeSelection = nextScopeSelection;
        vscode.postMessage({ type: 'docright.selectionPayload', selection: nextScopeSelection });
      }
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
    if (searchState.query) {
      let nextSnapshot = '';
      editorState.read(() => {
        nextSnapshot = $getRoot().getTextContent();
      });
      if (nextSnapshot !== searchState.textSnapshot) {
        updateSearchMatches(searchState.query, { select: false });
      }
    }
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
        {
          let scopeSelection = null;
          let markerId = null;
          let selectionSource = 'none';
          let payloadLength = 0;
          let lastLength = 0;
          let overrideLength = 0;
          let chosenLength = 0;
          let chosenPreview = null;
          let chosenAnchorType = null;
          let chosenFocusType = null;
          let chosenBackward = null;
          let nextScopeState = null;
          editor.update(() => {
            const selection = $getSelection();
            const payload = buildSelectionPayload(selection);
            const hasPayload = isMeaningfulSelection(payload);
            const override = isMeaningfulSelection(message.selection) ? message.selection : null;
            const lastSnapshot = isMeaningfulSelection(lastScopeSelection) ? lastScopeSelection : null;
            payloadLength = payload && payload.text ? payload.text.length : 0;
            overrideLength = override && override.text ? override.text.length : 0;
            lastLength = lastSnapshot && lastSnapshot.text ? lastSnapshot.text.length : 0;
            if (hasPayload) {
              scopeSelection = payload;
              selectionSource = 'current';
            } else if (lastSnapshot) {
              scopeSelection = lastSnapshot;
              selectionSource = 'last';
            } else if (override) {
              scopeSelection = override;
              selectionSource = 'override';
            }
            if (!isMeaningfulSelection(scopeSelection)) {
              return;
            }
            chosenLength = scopeSelection.text ? scopeSelection.text.length : 0;
            chosenPreview = scopeSelection.text ? scopeSelection.text.slice(0, 160) : null;
            chosenAnchorType = scopeSelection.anchorType || null;
            chosenFocusType = scopeSelection.focusType || null;
            chosenBackward = scopeSelection.isBackward;
            if (selectionSource === 'current' && $isRangeSelection(selection)) {
              markerId = insertScopeMarkersForRange(selection);
              return;
            }
            markerId = insertScopeMarkersForSelection(scopeSelection);
            if (markerId) {
              nextScopeState = {
                mode: 'range',
                selection: {
                  anchorKey: scopeSelection.anchorKey,
                  anchorOffset: scopeSelection.anchorOffset,
                  anchorType: scopeSelection.anchorType || 'text',
                  focusKey: scopeSelection.focusKey,
                  focusOffset: scopeSelection.focusOffset,
                  focusType: scopeSelection.focusType || 'text',
                  isBackward: Boolean(scopeSelection.isBackward)
                },
                locked: true,
                markerId
              };
            }
          });
          postScopeTrace('request', {
            selectionSource,
            payloadLength,
            lastLength,
            overrideLength,
            chosenLength,
            chosenPreview,
            chosenAnchorType,
            chosenFocusType,
            chosenBackward,
            markerId
          });
          if (markerId) {
            setStatus('Scope locked (markers).');
            if (nextScopeState) {
              applyScopeState(nextScopeState);
            }
          } else if (scopeSelection) {
            setStatus('Failed to lock scope (markers).');
          }
          vscode.postMessage({
            type: 'docright.scopeSelection',
            selection: scopeSelection,
            markerId
          });
        }
        break;
      case 'docright.clearInlineCallouts':
        clearAllInlineCallouts();
        break;
      case 'docright.applyScopeUpdate':
        {
          const activeScope = message.useActiveScope ? scopeState : message.scope;
          const requiresScope = activeScope && activeScope.mode === 'range';
          if (!message.useActiveScope && message.scope) {
            const scopeValid = applyScopeState(message.scope);
            if (requiresScope && !scopeValid) {
              const errorMessage = 'Scope selection is no longer valid. Reselect scope and try again.';
              setStatus(errorMessage);
              vscode.postMessage({
                type: 'docright.applyScopeError',
                requestId: message.requestId,
                message: errorMessage
              });
              break;
            }
          }
          const applied = applyHtmlToScope(message.html || '', { requireScope: requiresScope, scope: activeScope });
          if (!applied) {
            const detail = lastApplyResolution ? ` (${lastApplyResolution})` : '';
            const errorMessage = `Scope selection is no longer valid${detail}. Reselect scope and try again.`;
            setStatus(errorMessage);
            vscode.postMessage({
              type: 'docright.applyScopeError',
              requestId: message.requestId,
              message: errorMessage
            });
            break;
          }
          if (lastApplyResolution) {
            setStatus(`Applied (${lastApplyResolution}).`);
          } else {
            setStatus('Applied.');
          }
          vscode.postMessage({
            type: 'docright.applyScopeComplete',
            requestId: message.requestId,
            resolution: lastApplyResolution || null
          });
        }
        break;
      case 'docright.export':
        try {
          const activeScope = message.useActiveScope ? scopeState : message.scope;
          const result = buildHtmlWithCallouts(message.inlineCallouts, activeScope, { fallbackToSelection: true });
          if (result.scopeSelection && activeScope && activeScope.mode === 'range' && !activeScope.markerId) {
            vscode.postMessage({ type: 'docright.scopeSelection', selection: result.scopeSelection });
          }
          vscode.postMessage({
            type: 'docright.exportResult',
            requestId: message.requestId,
            html: result.html
          });
        } catch (error) {
          vscode.postMessage({
            type: 'docright.exportError',
            requestId: message.requestId,
            message: error.message || 'Failed to export DocRight HTML.'
          });
        }
        break;
      case 'docright.copyMarkdownResult':
        if (message.success) {
          setStatus('Copied to clipboard.');
        } else {
          setStatus(message.message || 'Failed to copy to clipboard.');
        }
        break;
      default:
        break;
    }
  });

  updateEmptyState();
  updateSearchUI();
  vscode.postMessage({ type: 'docright.ready' });
}
