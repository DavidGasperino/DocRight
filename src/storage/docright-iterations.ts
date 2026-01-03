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
};

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

export async function saveDocRightIteration(
  root: string,
  options: {
    model?: string | null;
    scope?: DocRightScopeState | null;
    note?: string;
    reason?: string;
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
    { from: getDocRightLlmLastRunPath(root), to: path.join(llmSnapshotDir, 'last_run.json') }
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
  const metadata: DocRightIterationMetadata = {
    id: nextId,
    createdAt,
    note: options.note ?? '',
    reason: options.reason ?? '',
    model: options.model ?? null,
    scope: options.scope ?? null
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
    { from: path.join(snapshotDir, 'llm', 'last_run.json'), to: getDocRightLlmLastRunPath(root) }
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
}
