import * as vscode from 'vscode';

export async function promptSummaryBullets(title: string): Promise<string[] | null> {
  const input = await vscode.window.showInputBox({
    title,
    prompt: 'Enter summary bullets (separate with new lines or ";").',
    placeHolder: 'e.g. clarify thesis; tighten intro; remove redundant paragraph'
  });
  if (input === undefined) {
    return null;
  }
  return parseSummaryBullets(input);
}

export function parseSummaryBullets(raw: string): string[] {
  return String(raw || '')
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/^[-*]\s*/, '').trim())
    .filter((entry) => entry.length > 0);
}
