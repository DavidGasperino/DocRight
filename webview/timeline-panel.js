const vscode = acquireVsCodeApi();
const listEl = document.getElementById('timeline-list');
const emptyEl = document.getElementById('timeline-empty');

let state = { items: [] };

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'timelineState') {
    return;
  }
  state = message;
  render();
});

function render() {
  if (!listEl || !emptyEl) {
    return;
  }
  listEl.innerHTML = '';

  if (!state.items || state.items.length === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  listEl.hidden = false;
  emptyEl.hidden = true;

  state.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'timeline-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timeline-button';
    button.addEventListener('click', () => {
      vscode.postMessage({ type: 'showDetails', id: item.id });
    });

    const label = document.createElement('div');
    label.className = 'timeline-label';
    label.textContent = `${item.prefix || ''}#${item.id}`;
    button.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'timeline-meta';
    const metaParts = [];
    if (item.isHead) {
      metaParts.push('HEAD');
    }
    if (item.reason) {
      metaParts.push(item.reason);
    }
    if (item.createdAt) {
      metaParts.push(item.createdAt);
    }
    meta.textContent = metaParts.join(' | ');
    button.appendChild(meta);

    row.appendChild(button);

    const tooltip = buildTooltip(item);
    row.appendChild(tooltip);

    listEl.appendChild(row);
  });
}

function buildTooltip(item) {
  const tooltip = document.createElement('div');
  tooltip.className = 'timeline-tooltip';

  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = `Iteration #${item.id}`;
  tooltip.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'tooltip-meta';
  if (item.isHead) {
    const head = document.createElement('div');
    head.textContent = 'Current head';
    meta.appendChild(head);
  }
  if (item.createdAt) {
    const created = document.createElement('div');
    created.textContent = `Created: ${item.createdAt}`;
    meta.appendChild(created);
  }
  if (item.parentId) {
    const parent = document.createElement('div');
    parent.textContent = `Parent: #${item.parentId}`;
    meta.appendChild(parent);
  }
  if (item.reason) {
    const reason = document.createElement('div');
    reason.textContent = `Reason: ${item.reason}`;
    meta.appendChild(reason);
  }
  if (meta.childElementCount > 0) {
    tooltip.appendChild(meta);
  }

  const summary = document.createElement('div');
  summary.className = 'tooltip-summary';
  summary.textContent = 'Summary';
  if (item.summaryBullets && item.summaryBullets.length > 0) {
    const list = document.createElement('ul');
    item.summaryBullets.forEach((bullet) => {
      const li = document.createElement('li');
      li.textContent = bullet;
      list.appendChild(li);
    });
    summary.appendChild(list);
  } else {
    const empty = document.createElement('div');
    empty.textContent = 'No summary recorded.';
    summary.appendChild(empty);
  }
  tooltip.appendChild(summary);

  return tooltip;
}
