import { readJsonFile, writeJsonFile } from './fs';
import { getDocRightCalloutsPath } from './docright-paths';

export type DocRightInlineCallout = {
  id: string;
  instruction: string;
  text: string;
};

export type DocRightOverallCallout = {
  id: string;
  instruction: string;
};

export type DocRightCalloutsState = {
  inline: DocRightInlineCallout[];
  overall: DocRightOverallCallout[];
  selectedInlineId: string | null;
  selectedOverallId: string | null;
};

const defaultState: DocRightCalloutsState = {
  inline: [],
  overall: [],
  selectedInlineId: null,
  selectedOverallId: null
};

export async function loadDocRightCallouts(root: string): Promise<DocRightCalloutsState> {
  const calloutsPath = getDocRightCalloutsPath(root);
  const data = await readJsonFile<unknown>(calloutsPath, defaultState);
  return normalizeDocRightCallouts(data);
}

export async function saveDocRightCallouts(root: string, state: DocRightCalloutsState): Promise<void> {
  const calloutsPath = getDocRightCalloutsPath(root);
  const normalized = normalizeDocRightCallouts(state);
  await writeJsonFile(calloutsPath, {
    inline: normalized.inline,
    overall: normalized.overall
  });
}

export function normalizeDocRightCallouts(state: unknown): DocRightCalloutsState {
  const record = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  const inlineRaw = Array.isArray(record.inline) ? record.inline : [];
  const overallRaw = Array.isArray(record.overall) ? record.overall : [];

  const inline = inlineRaw
    .map((item) => normalizeInlineCallout(item))
    .filter((item): item is DocRightInlineCallout => item !== null);
  const overall = overallRaw
    .map((item) => normalizeOverallCallout(item))
    .filter((item): item is DocRightOverallCallout => item !== null);

  const selectedInlineId = asOptionalString(record.selectedInlineId);
  const selectedOverallId = asOptionalString(record.selectedOverallId);

  return {
    inline,
    overall,
    selectedInlineId: inline.some((item) => item.id === selectedInlineId) ? selectedInlineId : null,
    selectedOverallId: overall.some((item) => item.id === selectedOverallId) ? selectedOverallId : null
  };
}

function normalizeInlineCallout(value: unknown): DocRightInlineCallout | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = asOptionalString(record.id);
  if (!id) {
    return null;
  }
  const instruction = asOptionalString(record.instruction) ?? '';
  const text = typeof record.text === 'string' ? record.text : '';
  return { id, instruction, text };
}

function normalizeOverallCallout(value: unknown): DocRightOverallCallout | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = asOptionalString(record.id);
  if (!id) {
    return null;
  }
  const instruction = asOptionalString(record.instruction) ?? '';
  return { id, instruction };
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
