import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { ensureDir } from '../storage/fs';

type TabSnapshot = {
  label: string;
  inputType: string;
  isPreview: boolean;
  isPinned: boolean;
  resource: string | null;
};

type TabGroupSnapshot = {
  index: number;
  viewColumn: number | null;
  isActive: boolean;
  tabs: TabSnapshot[];
};

export function captureTabGroups(): TabGroupSnapshot[] {
  const groups = vscode.window.tabGroups;
  if (!groups) {
    return [];
  }
  return groups.all.map((group, index) => {
    const tabs = group.tabs.map((tab) => {
      const input = tab.input as unknown;
      const inputType =
        typeof input === 'object' && input && (input as { constructor?: { name?: string } }).constructor?.name
          ? (input as { constructor: { name: string } }).constructor.name
          : typeof input;
      let resource: string | null = null;
      if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
        resource = input.uri.fsPath;
      } else if (input instanceof vscode.TabInputWebview) {
        resource = input.viewType;
      } else if (input instanceof vscode.TabInputNotebook) {
        resource = input.uri.fsPath;
      }
      return {
        label: tab.label,
        inputType,
        isPreview: tab.isPreview,
        isPinned: tab.isPinned,
        resource
      };
    });
    return {
      index,
      viewColumn: group.viewColumn ?? null,
      isActive: group === groups.activeTabGroup,
      tabs
    };
  });
}

export async function appendDiagnosticsLog(
  root: string,
  event: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (!root) {
    return;
  }
  const logDir = path.join(root, '.docright', 'logs');
  const logPath = path.join(logDir, 'ui-debug.log');
  const line = `[${new Date().toISOString()}] ${event}${data ? ` ${safeStringify(data)}` : ''}`;
  try {
    await ensureDir(logDir);
    await fs.promises.appendFile(logPath, `${line}\n`, 'utf8');
  } catch (error) {
    // swallow logging errors to avoid impacting the extension
  }
}

export function isRooResponsePath(filePath: string): boolean {
  const suffix = path.join('.docright', 'llm', 'roo_response.html');
  return path.normalize(filePath).endsWith(suffix);
}

export function getDocRightRootFromResponsePath(filePath: string): string | null {
  if (!isRooResponsePath(filePath)) {
    return null;
  }
  return path.resolve(filePath, '..', '..', '..');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}
