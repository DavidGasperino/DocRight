import { getScopeLocation, getScopeModeLabel, type DocRightScopeState } from './scope';

export type DocRightPromptParts = {
  llmPreamble?: string;
  iterationPreambleTemplate?: string;
  scope: DocRightScopeState;
  xml: string;
};

export function renderIterationPreamble(template: string, scope: DocRightScopeState): string {
  if (!template || !template.trim()) {
    return '';
  }
  const scopeMode = getScopeModeLabel(scope);
  const scopeLocation = getScopeLocation(scope);
  return template
    .replace(/{{scope_mode}}/g, scopeMode)
    .replace(/{{scope_location}}/g, scopeLocation);
}

export function buildDocRightPrompt(parts: DocRightPromptParts): string {
  const llmPreamble = (parts.llmPreamble || '').trim();
  const iterationTemplate = parts.iterationPreambleTemplate || '';
  const iterationPreamble = renderIterationPreamble(iterationTemplate, parts.scope).trim();
  const xml = (parts.xml || '').trim();

  const sections = [llmPreamble, iterationPreamble, xml].filter((section) => section.length > 0);
  return sections.join('\n\n');
}
