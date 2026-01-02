import * as path from 'path';

import { type DocRightSettings, getSettingsPath, saveSettings } from '../settings/settings';
import {
  getDocRightCalloutsPath,
  getDocRightConfigPath,
  getDocRightContextsPath,
  getDocRightDir,
  getDocRightDocumentPath,
  getDocRightIterationsDir,
  getDocRightLlmDir,
  getDocRightLlmSessionPath,
  getDocRightPromptPath,
  getDocRightPromptsDir,
  getDocRightScopePath
} from '../storage/docright-paths';
import { docRightConfigExists, loadDocRightConfig, saveDocRightConfig } from '../storage/docright-config';
import { ensureDir, ensureTrailingNewline, fileExists, writeFileIfMissing } from '../storage/fs';
import {
  DEFAULT_CALLOUTS_STATE,
  DEFAULT_CONTEXTS_STATE,
  DEFAULT_ITERATION_PREAMBLE,
  DEFAULT_LLM_PREAMBLE,
  DEFAULT_LLM_SESSION,
  DEFAULT_SCOPE_STATE,
  getDefaultLexicalDoc
} from './templates';
import { type DocRightProjectConfig } from './types';

export type InitializeProjectOptions = {
  createdAt?: string;
};

export async function initializeDocRightProject(
  root: string,
  settings: DocRightSettings,
  options: InitializeProjectOptions = {}
): Promise<DocRightProjectConfig> {
  if (await docRightConfigExists(root)) {
    throw new Error('DocRight project already exists in this folder.');
  }

  await ensureDir(getDocRightDir(root));
  await ensureDir(getDocRightPromptsDir(root));
  await ensureDir(getDocRightLlmDir(root));
  await ensureDir(getDocRightIterationsDir(root));

  const createdAt = options.createdAt ?? new Date().toISOString();
  const documentFile = path.basename(getDocRightDocumentPath(root));
  const config: DocRightProjectConfig = {
    version: 1,
    createdAt,
    document: { file: documentFile }
  };
  await saveDocRightConfig(root, config);

  const settingsPath = getSettingsPath(root);
  if (!(await fileExists(settingsPath))) {
    await saveSettings(root, settings);
  }

  const llmPreamblePath = getDocRightPromptPath(root, settings.prompts.llmPreambleFile);
  await writeFileIfMissing(llmPreamblePath, ensureTrailingNewline(DEFAULT_LLM_PREAMBLE));

  const iterationPreamblePath = getDocRightPromptPath(root, settings.prompts.iterationPreambleFile);
  await writeFileIfMissing(iterationPreamblePath, ensureTrailingNewline(DEFAULT_ITERATION_PREAMBLE));

  const docPath = getDocRightDocumentPath(root);
  const docPayload = ensureTrailingNewline(JSON.stringify(getDefaultLexicalDoc(), null, 2));
  await writeFileIfMissing(docPath, docPayload);

  const calloutsPayload = ensureTrailingNewline(JSON.stringify(DEFAULT_CALLOUTS_STATE, null, 2));
  await writeFileIfMissing(getDocRightCalloutsPath(root), calloutsPayload);

  const contextsPayload = ensureTrailingNewline(JSON.stringify(DEFAULT_CONTEXTS_STATE, null, 2));
  await writeFileIfMissing(getDocRightContextsPath(root), contextsPayload);

  const scopePayload = ensureTrailingNewline(JSON.stringify(DEFAULT_SCOPE_STATE, null, 2));
  await writeFileIfMissing(getDocRightScopePath(root), scopePayload);

  const sessionPayload = ensureTrailingNewline(JSON.stringify(DEFAULT_LLM_SESSION, null, 2));
  await writeFileIfMissing(getDocRightLlmSessionPath(root), sessionPayload);

  return config;
}

export async function ensureDocRightProject(
  root: string,
  settings: DocRightSettings,
  options: InitializeProjectOptions = {}
): Promise<DocRightProjectConfig> {
  const configPath = getDocRightConfigPath(root);
  if (await fileExists(configPath)) {
    const config = await loadDocRightConfig(root);
    if (!config) {
      throw new Error('DocRight config exists but could not be parsed.');
    }
    return config;
  }

  return initializeDocRightProject(root, settings, options);
}
