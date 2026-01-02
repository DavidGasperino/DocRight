import { escapeXml, wrapCdata } from './xml-helpers';

export type DocRightOverallCallout = {
  instruction: string;
};

export type DocRightContextItem = {
  name: string;
  description?: string;
  path: string;
};

export function buildDocRightXml(
  html: string,
  overallItems: DocRightOverallCallout[] = [],
  contextItems: DocRightContextItem[] = []
): string {
  let output = '<llm-document>\n';

  const appendLine = (value: string) => {
    if (output.length > 0 && !output.endsWith('\n')) {
      output += '\n';
    }
    output += value + '\n';
  };

  const appendCdataTag = (indent: string, tag: string, value: string) => {
    appendLine(`${indent}<${tag}>`);
    appendLine(`${indent}  ${wrapCdata(value)}`);
    appendLine(`${indent}</${tag}>`);
  };

  if (overallItems.length > 0) {
    appendLine('<llm-overall>');
    overallItems.forEach((item, index) => {
      const overallNumber = index + 1;
      appendLine(`  <llm-callout id="overall-${overallNumber}">`);
      appendCdataTag('    ', 'instruction', item.instruction);
      appendLine('  </llm-callout>');
    });
    appendLine('</llm-overall>');
  }

  const safeHtml = wrapCdata(html || '');
  appendLine('<llm-body>');
  appendLine(`  ${safeHtml}`);
  appendLine('</llm-body>');

  if (contextItems.length > 0) {
    appendLine('<context>');
    contextItems.forEach((item, index) => {
      const contextNumber = index + 1;
      appendLine(`  <context-document id="context-${contextNumber}">`);
      appendCdataTag('    ', 'reference', '<' + item.name + '>');
      appendLine(`    <name>${escapeXml(item.name)}</name>`);
      appendLine(`    <description>${escapeXml(item.description || '')}</description>`);
      appendLine(`    <path>${escapeXml(item.path)}</path>`);
      appendLine('  </context-document>');
    });
    appendLine('</context>');
  }

  appendLine('</llm-document>');

  return output;
}
