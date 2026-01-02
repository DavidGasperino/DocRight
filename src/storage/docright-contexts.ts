import { readJsonFile, writeJsonFile } from './fs';
import { getDocRightContextsPath } from './docright-paths';

export type DocRightContextItem = {
  id: string;
  name: string;
  description?: string;
  path: string;
};

export type DocRightContextsState = {
  items: DocRightContextItem[];
};

const defaultState: DocRightContextsState = {
  items: []
};

export async function loadDocRightContexts(root: string): Promise<DocRightContextsState> {
  const contextsPath = getDocRightContextsPath(root);
  const data = await readJsonFile<DocRightContextsState>(contextsPath, defaultState);
  const items = Array.isArray(data.items) ? data.items : [];
  return { items };
}

export async function saveDocRightContexts(root: string, state: DocRightContextsState): Promise<void> {
  const contextsPath = getDocRightContextsPath(root);
  const payload: DocRightContextsState = { items: Array.isArray(state.items) ? state.items : [] };
  await writeJsonFile(contextsPath, payload);
}
