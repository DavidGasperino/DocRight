import { escapeXml, wrapCdata } from './xml-helpers';

export type InlineCallout = {
  startOffset: number;
  endOffset: number;
  instruction: string;
};

export type OverallCallout = {
  instruction: string;
};

export type ContextItem = {
  name: string;
  description?: string;
  path: string;
};

export function buildCalloutsXml(
  text: string,
  items: InlineCallout[],
  overallItems: OverallCallout[] = [],
  contextItems: ContextItem[] = []
): string {
  const sorted = [...items].sort((a, b) => a.startOffset - b.startOffset);
  let output = '<llm-document>\n';

  const appendText = (value: string) => {
    if (!value) {
      return;
    }
    output += value;
  };

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

  let cursor = 0;

  sorted.forEach((item, index) => {
    if (item.startOffset < cursor) {
      throw new Error('Overlapping instructions detected.');
    }

    const inlineNumber = index + 1;

    appendText(escapeXml(text.slice(cursor, item.startOffset)));
    appendLine(`<llm-edit id="${inlineNumber}">`);
    appendCdataTag('  ', 'instruction', item.instruction);
    appendText(escapeXml(text.slice(item.startOffset, item.endOffset)));
    appendLine('</llm-edit>');

    cursor = item.endOffset;
  });

  appendText(escapeXml(text.slice(cursor)));

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
