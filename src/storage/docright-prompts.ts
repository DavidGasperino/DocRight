import { readTextFile, writeTextFile, ensureDir } from './fs';
import { getDocRightPromptsDir, getDocRightPromptPath } from './docright-paths';

export async function readDocRightPrompt(root: string, name: string, fallback: string): Promise<string> {
  const promptPath = getDocRightPromptPath(root, name);
  return readTextFile(promptPath, fallback);
}

export async function writeDocRightPrompt(root: string, name: string, contents: string): Promise<void> {
  await ensureDir(getDocRightPromptsDir(root));
  const promptPath = getDocRightPromptPath(root, name);
  await writeTextFile(promptPath, contents);
}
