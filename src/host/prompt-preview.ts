import { buildDocRightPrompt } from '../core/prompt';
import { buildDocRightXml } from '../core/docright-xml';
import { loadDocRightScope } from '../storage/docright-scope';
import { loadDocRightContexts } from '../storage/docright-contexts';
import { loadDocRightCallouts } from '../storage/docright-callouts';
import { readDocRightPrompt } from '../storage/docright-prompts';
import { type DocRightSettings } from '../settings/settings';

export type PromptPreviewOptions = {
  html?: string;
};

export async function buildPromptPreview(
  root: string,
  settings: DocRightSettings,
  options: PromptPreviewOptions = {}
): Promise<string> {
  const scope = await loadDocRightScope(root);
  const contexts = await loadDocRightContexts(root);
  const callouts = await loadDocRightCallouts(root);

  const llmPreamble = await readDocRightPrompt(root, settings.prompts.llmPreambleFile, '');
  const iterationTemplate = await readDocRightPrompt(root, settings.prompts.iterationPreambleFile, '');

  const html = options.html ?? '';
  const xml = buildDocRightXml(
    html,
    callouts.overall.map((item) => ({ instruction: item.instruction })),
    contexts.items.map((item) => ({
      name: item.name,
      description: item.description,
      path: item.path
    }))
  );

  return buildDocRightPrompt({
    llmPreamble,
    iterationPreambleTemplate: iterationTemplate,
    scope,
    xml
  });
}
