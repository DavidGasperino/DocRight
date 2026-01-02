import * as fs from 'fs';
import * as path from 'path';

export type ColumnLayout = {
  editor: number;
  callouts: number;
  llm: number;
  roo: number;
};

export type DocRightSettings = {
  llm: {
    defaultModel: string;
    promptChunkSize: number;
    baseUrl: string;
  };
  roo: {
    defaultMode: string;
    extensionIds: string[];
  };
  ui: {
    autosaveDelayMs: number;
    columns: ColumnLayout;
  };
  iterations: {
    autoSave: boolean;
  };
  prompts: {
    llmPreambleFile: string;
    iterationPreambleFile: string;
  };
  diagnostics: {
    debugLogging: boolean;
  };
};

export const defaultSettings: DocRightSettings = {
  llm: {
    defaultModel: 'gpt-4o-mini',
    promptChunkSize: 8000,
    baseUrl: 'https://api.openai.com/v1'
  },
  roo: {
    defaultMode: 'ask',
    extensionIds: [
      'RooVeterinaryInc.roo-cline',
      'rooveterinaryinc.roo-cline',
      'RooVeterinaryInc.roo-code',
      'rooveterinaryinc.roo-code'
    ]
  },
  ui: {
    autosaveDelayMs: 250,
    columns: {
      editor: 1,
      callouts: 2,
      llm: 3,
      roo: 4
    }
  },
  iterations: {
    autoSave: true
  },
  prompts: {
    llmPreambleFile: 'llm_preamble.txt',
    iterationPreambleFile: 'iteration_preamble.txt'
  },
  diagnostics: {
    debugLogging: true
  }
};

export function getSettingsPath(root: string): string {
  return path.join(root, '.docright', 'settings.json');
}

export async function loadSettings(root: string): Promise<DocRightSettings> {
  const settingsPath = getSettingsPath(root);
  const fileData = await readJson(settingsPath);
  return normalizeSettings(fileData);
}

export async function ensureSettingsFile(root: string): Promise<DocRightSettings> {
  const settingsPath = getSettingsPath(root);
  if (!(await fileExists(settingsPath))) {
    const normalized = normalizeSettings(null);
    await saveSettings(root, normalized);
    return normalized;
  }
  return loadSettings(root);
}

export async function saveSettings(root: string, settings: DocRightSettings): Promise<void> {
  const settingsPath = getSettingsPath(root);
  await ensureDir(path.dirname(settingsPath));
  const normalized = normalizeSettings(settings);
  const payload = JSON.stringify(normalized, null, 2) + '\n';
  await fs.promises.writeFile(settingsPath, payload, 'utf8');
}

export function normalizeSettings(input: unknown): DocRightSettings {
  const value = input && typeof input === 'object' ? (input as Partial<DocRightSettings>) : {};
  const llm = (value.llm ?? {}) as Partial<DocRightSettings['llm']>;
  const roo = (value.roo ?? {}) as Partial<DocRightSettings['roo']>;
  const ui = (value.ui ?? {}) as Partial<DocRightSettings['ui']>;
  const iterations = (value.iterations ?? {}) as Partial<DocRightSettings['iterations']>;
  const prompts = (value.prompts ?? {}) as Partial<DocRightSettings['prompts']>;
  const diagnostics = (value.diagnostics ?? {}) as Partial<DocRightSettings['diagnostics']>;

  const columns = (ui.columns ?? {}) as Partial<ColumnLayout>;

  return {
    llm: {
      defaultModel: asString(llm.defaultModel, defaultSettings.llm.defaultModel),
      promptChunkSize: asPositiveNumber(llm.promptChunkSize, defaultSettings.llm.promptChunkSize),
      baseUrl: asString(llm.baseUrl, defaultSettings.llm.baseUrl)
    },
    roo: {
      defaultMode: asString(roo.defaultMode, defaultSettings.roo.defaultMode),
      extensionIds: asStringArray(roo.extensionIds, defaultSettings.roo.extensionIds)
    },
    ui: {
      autosaveDelayMs: asPositiveNumber(ui.autosaveDelayMs, defaultSettings.ui.autosaveDelayMs),
      columns: {
        editor: asPositiveNumber(columns.editor, defaultSettings.ui.columns.editor),
        callouts: asPositiveNumber(columns.callouts, defaultSettings.ui.columns.callouts),
        llm: asPositiveNumber(columns.llm, defaultSettings.ui.columns.llm),
        roo: asPositiveNumber(columns.roo, defaultSettings.ui.columns.roo)
      }
    },
    iterations: {
      autoSave: asBoolean(iterations.autoSave, defaultSettings.iterations.autoSave)
    },
    prompts: {
      llmPreambleFile: asString(prompts.llmPreambleFile, defaultSettings.prompts.llmPreambleFile),
      iterationPreambleFile: asString(prompts.iterationPreambleFile, defaultSettings.prompts.iterationPreambleFile)
    },
    diagnostics: {
      debugLogging: asBoolean(diagnostics.debugLogging, defaultSettings.diagnostics.debugLogging)
    }
  };
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}
