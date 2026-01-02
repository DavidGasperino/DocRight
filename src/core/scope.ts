export type DocRightScopeSelection = {
  anchorKey: string;
  anchorOffset: number;
  anchorType: string;
  focusKey: string;
  focusOffset: number;
  focusType: string;
  isBackward: boolean;
};

export type DocRightScopeState = {
  mode: 'full' | 'range';
  selection: DocRightScopeSelection | null;
};

export function normalizeDocRightScope(data: unknown): DocRightScopeState {
  const normalized: DocRightScopeState = {
    mode: 'full',
    selection: null
  };

  if (data && typeof data === 'object' && (data as { mode?: string }).mode === 'range') {
    normalized.mode = 'range';
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const selection = record && (record.selection || record.range) ? (record.selection || record.range) : null;

  if (normalized.mode === 'range' && selection && typeof selection === 'object') {
    const candidate = selection as Record<string, unknown>;
    const anchorKey = typeof candidate.anchorKey === 'string' ? candidate.anchorKey : '';
    const focusKey = typeof candidate.focusKey === 'string' ? candidate.focusKey : '';

    if (anchorKey && focusKey) {
      normalized.selection = {
        anchorKey,
        anchorOffset: Number.isFinite(candidate.anchorOffset) ? Number(candidate.anchorOffset) : 0,
        anchorType: typeof candidate.anchorType === 'string' ? candidate.anchorType : 'text',
        focusKey,
        focusOffset: Number.isFinite(candidate.focusOffset) ? Number(candidate.focusOffset) : 0,
        focusType: typeof candidate.focusType === 'string' ? candidate.focusType : 'text',
        isBackward: Boolean(candidate.isBackward)
      };
      return normalized;
    }
  }

  normalized.mode = 'full';
  normalized.selection = null;
  return normalized;
}

export function getScopeModeLabel(scope: DocRightScopeState): 'selection' | 'full' {
  return scope.mode === 'range' && scope.selection ? 'selection' : 'full';
}

export function getScopeLocation(scope: DocRightScopeState): string {
  if (scope.mode === 'range' && scope.selection) {
    return 'User-selected range in the document.';
  }
  return 'Full document.';
}
