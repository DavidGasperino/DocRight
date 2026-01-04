export const DOC_RIGHT_SUMMARY_START = '<!--DOCRIGHT_SUMMARY_START-->';
export const DOC_RIGHT_SUMMARY_END = '<!--DOCRIGHT_SUMMARY_END-->';

export type DocRightSummaryExtraction = {
  cleaned: string;
  bullets: string[];
  hadSummary: boolean;
};

export function extractDocRightSummary(raw: string): DocRightSummaryExtraction {
  const text = String(raw || '');
  const pattern = new RegExp(
    `${escapeRegExp(DOC_RIGHT_SUMMARY_START)}([\\s\\S]*?)${escapeRegExp(DOC_RIGHT_SUMMARY_END)}`,
    'i'
  );
  const match = text.match(pattern);
  if (!match) {
    return { cleaned: text.trim(), bullets: [], hadSummary: false };
  }

  const summaryBody = match[1] ?? '';
  const bullets = summaryBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);

  const cleaned = text.replace(pattern, '').trim();
  return { cleaned, bullets, hadSummary: true };
}

export function buildDocRightSummaryInstructions(): string[] {
  return [
    'After the HTML, append a summary block in this exact format:',
    DOC_RIGHT_SUMMARY_START,
    '- bullet 1',
    '- bullet 2',
    DOC_RIGHT_SUMMARY_END,
    'Use 2-5 concise bullets and keep the summary outside the HTML output.'
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
