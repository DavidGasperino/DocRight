import { normalizeDocRightScope, type DocRightScopeState } from '../core/scope';
import { readJsonFile, writeJsonFile } from './fs';
import { getDocRightScopePath } from './docright-paths';

export async function loadDocRightScope(root: string): Promise<DocRightScopeState> {
  const scopePath = getDocRightScopePath(root);
  const raw = await readJsonFile<unknown>(scopePath, null);
  return normalizeDocRightScope(raw);
}

export async function saveDocRightScope(root: string, scope: DocRightScopeState): Promise<void> {
  const scopePath = getDocRightScopePath(root);
  const normalized = normalizeDocRightScope(scope);
  await writeJsonFile(scopePath, normalized);
}
