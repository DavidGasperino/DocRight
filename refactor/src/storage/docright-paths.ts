import * as path from 'path';

export function getDocRightDir(root: string): string {
  return path.join(root, '.docright');
}

export function getDocRightConfigPath(root: string): string {
  return path.join(getDocRightDir(root), 'docright.json');
}

export function getDocRightPromptsDir(root: string): string {
  return path.join(getDocRightDir(root), 'prompts');
}

export function getDocRightPromptPath(root: string, name: string): string {
  return path.join(getDocRightPromptsDir(root), name);
}

export function getDocRightLlmDir(root: string): string {
  return path.join(getDocRightDir(root), 'llm');
}

export function getDocRightLlmSessionPath(root: string): string {
  return path.join(getDocRightLlmDir(root), 'session.json');
}

export function getDocRightLlmLastRunPath(root: string): string {
  return path.join(getDocRightLlmDir(root), 'last_run.json');
}

export function getDocRightRooResponsePath(root: string): string {
  return path.join(getDocRightLlmDir(root), 'roo_response.html');
}

export function getDocRightIterationsDir(root: string): string {
  return path.join(getDocRightDir(root), 'iterations');
}

export function getDocRightDocumentPath(root: string): string {
  return path.join(root, 'document.lexical.json');
}

export function getDocRightCalloutsPath(root: string): string {
  return path.join(root, 'callouts.json');
}

export function getDocRightContextsPath(root: string): string {
  return path.join(root, 'contexts.json');
}

export function getDocRightScopePath(root: string): string {
  return path.join(root, 'scope.json');
}
