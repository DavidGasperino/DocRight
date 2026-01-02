import * as fs from 'fs';

import { getDocRightDocumentPath } from './docright-paths';
import { ensureTrailingNewline, writeTextFile } from './fs';
import { getDefaultLexicalDoc } from '../project/templates';

export async function loadDocRightDocument(root: string): Promise<string> {
  const docPath = getDocRightDocumentPath(root);
  try {
    const raw = await fs.promises.readFile(docPath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) {
      return writeFallback(docPath);
    }
    JSON.parse(trimmed);
    return trimmed;
  } catch (error) {
    return writeFallback(docPath);
  }
}

export async function saveDocRightDocument(root: string, stateJson: string): Promise<void> {
  const docPath = getDocRightDocumentPath(root);
  await writeTextFile(docPath, ensureTrailingNewline(stateJson));
}

async function writeFallback(docPath: string): Promise<string> {
  const fallback = JSON.stringify(getDefaultLexicalDoc(), null, 2);
  const payload = ensureTrailingNewline(fallback);
  try {
    await writeTextFile(docPath, payload);
  } catch (error) {
    // Ignore write failures; fallback still returned.
  }
  return fallback;
}
