import { getDocRightConfigPath } from './docright-paths';
import { fileExists, readJsonFile, writeJsonFile } from './fs';
import { type DocRightProjectConfig } from '../project/types';

export async function docRightConfigExists(root: string): Promise<boolean> {
  return fileExists(getDocRightConfigPath(root));
}

export async function loadDocRightConfig(root: string): Promise<DocRightProjectConfig | null> {
  const configPath = getDocRightConfigPath(root);
  if (!(await fileExists(configPath))) {
    return null;
  }
  return readJsonFile<DocRightProjectConfig | null>(configPath, null);
}

export async function saveDocRightConfig(root: string, config: DocRightProjectConfig): Promise<void> {
  const configPath = getDocRightConfigPath(root);
  await writeJsonFile(configPath, config);
}
