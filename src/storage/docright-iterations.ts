import * as fs from 'fs';
import * as path from 'path';

import { ensureDir, ensureTrailingNewline } from './fs';
import {
  getDocRightCalloutsPath,
  getDocRightContextsPath,
  getDocRightDocumentPath,
  getDocRightIterationsDir,
  getDocRightLlmDir,
  getDocRightLlmLastRunPath,
  getDocRightLlmSessionPath,
  getDocRightRooResponsePath,
  getDocRightScopePath
} from './docright-paths';
import { type DocRightScopeState } from '../core/scope';

export type DocRightIteration = {
  id: string;
  createdAt: string | null;
  label: string;
};

export type DocRightIterationMetadata = {
  id: string;
  createdAt: string;
  note?: string;
  reason?: string;
  model?: string | null;
  scope?: DocRightScopeState | null;
  parentId?: string | null;
  summaryBullets?: string[];
};

export type DocRightIterationState = {
  headId: string | null;
};

const ITERATION_STATE_FILE = 'state.json';

export async function listDocRightIterations(root: string): Promise<DocRightIteration[]> {
  const iterationsDir = getDocRightIterationsDir(root);
  if (!fs.existsSync(iterationsDir)) {
    return [];
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(iterationsDir, { withFileTypes: true });
  } catch (error) {
    return [];
  }

  const iterations: DocRightIteration[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }

    const metadataPath = path.join(iterationsDir, entry.name, 'metadata.json');
    let createdAt: string | null = null;
    let note = '';
    try {
      if (fs.existsSync(metadataPath)) {
        const raw = await fs.promises.readFile(metadataPath, 'utf8');
        const parsed = JSON.parse(raw);
        createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : null;
        note = typeof parsed.note === 'string' ? parsed.note : '';
      }
    } catch (error) {
      createdAt = null;
    }

    let label = `#${entry.name}`;
    if (createdAt) {
      label += ` - ${createdAt}`;
    }
    if (note) {
      label += ` (${note})`;
    }

    iterations.push({ id: entry.name, createdAt, label });
  }

  iterations.sort((a, b) => b.id.localeCompare(a.id));
  return iterations;
}

export async function loadDocRightIterationState(root: string): Promise<DocRightIterationState> {
  const iterationsDir = getDocRightIterationsDir(root);
  const statePath = path.join(iterationsDir, ITERATION_STATE_FILE);
  if (!fs.existsSync(statePath)) {
    return { headId: null };
  }
  try {
    const raw = await fs.promises.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    const headId = typeof parsed.headId === 'string' ? parsed.headId : null;
    return { headId };
  } catch (error) {
    return { headId: null };
  }
}

export async function saveDocRightIterationState(root: string, state: DocRightIterationState): Promise<void> {
  const iterationsDir = getDocRightIterationsDir(root);
  await ensureDir(iterationsDir);
  const statePath = path.join(iterationsDir, ITERATION_STATE_FILE);
  try {
    await fs.promises.writeFile(
      statePath,
      ensureTrailingNewline(JSON.stringify(state, null, 2)),
      'utf8'
    );
  } catch (error) {
    // Ignore state write failures.
  }
}

export async function loadDocRightIterationMetadata(
  root: string,
  iterationId: string
): Promise<DocRightIterationMetadata | null> {
  const iterationsDir = getDocRightIterationsDir(root);
  const metadataPath = path.join(iterationsDir, iterationId, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    if (!createdAt) {
      return null;
    }
    const summaryBullets = Array.isArray(parsed.summaryBullets)
      ? parsed.summaryBullets.filter((entry: unknown) => typeof entry === 'string')
      : [];
    return {
      id: iterationId,
      createdAt,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      model: typeof parsed.model === 'string' ? parsed.model : null,
      scope: parsed.scope ?? null,
      parentId: typeof parsed.parentId === 'string' ? parsed.parentId : null,
      summaryBullets
    };
  } catch (error) {
    return null;
  }
}

export async function listDocRightIterationMetadata(root: string): Promise<DocRightIterationMetadata[]> {
  const iterationsDir = getDocRightIterationsDir(root);
  if (!fs.existsSync(iterationsDir)) {
    return [];
  }
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(iterationsDir, { withFileTypes: true });
  } catch (error) {
    return [];
  }

  const items: DocRightIterationMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const metadata = await loadDocRightIterationMetadata(root, entry.name);
    if (metadata) {
      items.push(metadata);
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

export async function saveDocRightIteration(
  root: string,
  options: {
    model?: string | null;
    scope?: DocRightScopeState | null;
    note?: string;
    reason?: string;
    parentId?: string | null;
    summaryBullets?: string[];
  } = {}
): Promise<DocRightIteration> {
  const iterationsDir = getDocRightIterationsDir(root);
  await ensureDir(iterationsDir);

  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(iterationsDir, { withFileTypes: true });
  } catch (error) {
    entries = [];
  }

  let maxId = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const value = Number(entry.name);
    if (Number.isFinite(value)) {
      maxId = Math.max(maxId, value);
    }
  }

  const nextId = String(maxId + 1).padStart(4, '0');
  const snapshotDir = path.join(iterationsDir, nextId);
  await ensureDir(snapshotDir);

  const llmSnapshotDir = path.join(snapshotDir, 'llm');
  await ensureDir(llmSnapshotDir);

  const filesToCopy = [
    { from: getDocRightDocumentPath(root), to: path.join(snapshotDir, 'document.lexical.json') },
    { from: getDocRightCalloutsPath(root), to: path.join(snapshotDir, 'callouts.json') },
    { from: getDocRightContextsPath(root), to: path.join(snapshotDir, 'contexts.json') },
    { from: getDocRightScopePath(root), to: path.join(snapshotDir, 'scope.json') },
    { from: getDocRightLlmSessionPath(root), to: path.join(llmSnapshotDir, 'session.json') },
    { from: getDocRightLlmLastRunPath(root), to: path.join(llmSnapshotDir, 'last_run.json') },
    { from: getDocRightRooResponsePath(root), to: path.join(llmSnapshotDir, 'roo_response.html') }
  ];

  for (const entry of filesToCopy) {
    try {
      if (fs.existsSync(entry.from)) {
        await fs.promises.copyFile(entry.from, entry.to);
      }
    } catch (error) {
      // Ignore copy failures; still allow snapshot.
    }
  }

  const createdAt = new Date().toISOString();
  const summaryBullets = Array.isArray(options.summaryBullets)
    ? options.summaryBullets.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0)
    : [];
  const note = options.note || summaryBullets[0] || '';
  const state = await loadDocRightIterationState(root);
  const parentId = options.parentId ?? state.headId ?? null;
  const metadata: DocRightIterationMetadata = {
    id: nextId,
    createdAt,
    note,
    reason: options.reason ?? '',
    model: options.model ?? null,
    scope: options.scope ?? null,
    parentId,
    summaryBullets
  };

  try {
    await fs.promises.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      ensureTrailingNewline(JSON.stringify(metadata, null, 2)),
      'utf8'
    );
  } catch (error) {
    // Ignore metadata write failures.
  }

  await saveDocRightIterationState(root, { headId: nextId });

  let label = `#${nextId} - ${createdAt}`;
  if (metadata.note) {
    label += ` (${metadata.note})`;
  }

  return { id: nextId, createdAt, label };
}

export async function restoreDocRightIteration(root: string, iterationId: string): Promise<void> {
  const iterationsDir = getDocRightIterationsDir(root);
  const snapshotDir = path.join(iterationsDir, iterationId);
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Iteration ${iterationId} not found.`);
  }

  await ensureDir(getDocRightLlmDir(root));

  const filesToRestore = [
    { from: path.join(snapshotDir, 'document.lexical.json'), to: getDocRightDocumentPath(root) },
    { from: path.join(snapshotDir, 'callouts.json'), to: getDocRightCalloutsPath(root) },
    { from: path.join(snapshotDir, 'contexts.json'), to: getDocRightContextsPath(root) },
    { from: path.join(snapshotDir, 'scope.json'), to: getDocRightScopePath(root) },
    { from: path.join(snapshotDir, 'llm', 'session.json'), to: getDocRightLlmSessionPath(root) },
    { from: path.join(snapshotDir, 'llm', 'last_run.json'), to: getDocRightLlmLastRunPath(root) },
    { from: path.join(snapshotDir, 'llm', 'roo_response.html'), to: getDocRightRooResponsePath(root) }
  ];

  for (const entry of filesToRestore) {
    try {
      if (fs.existsSync(entry.from)) {
        await fs.promises.copyFile(entry.from, entry.to);
      }
    } catch (error) {
      // Ignore copy failures; restore best-effort.
    }
  }

  await saveDocRightIterationState(root, { headId: iterationId });
}
