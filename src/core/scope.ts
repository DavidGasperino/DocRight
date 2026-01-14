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
  locked: boolean;
  markerId: string | null;
};

export function normalizeDocRightScope(data: unknown): DocRightScopeState {
  const normalized: DocRightScopeState = {
    mode: 'full',
    selection: null,
    locked: false,
    markerId: null
  };

  if (data && typeof data === 'object' && (data as { mode?: string }).mode === 'range') {
    normalized.mode = 'range';
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const rawLocked = record ? record.locked : null;
  const hasLocked = typeof rawLocked === 'boolean';
  const selection = record && (record.selection || record.range) ? (record.selection || record.range) : null;
  const markerId = record && typeof record.markerId === 'string' ? record.markerId : null;

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
      normalized.locked = hasLocked ? rawLocked : true;
      normalized.markerId = markerId;
      return normalized;
    }
  }

  normalized.mode = 'full';
  normalized.selection = null;
  normalized.locked = hasLocked ? rawLocked : false;
  normalized.markerId = null;
  return normalized;
}

export function getScopeModeLabel(scope: DocRightScopeState): 'selection' | 'full' | 'unlocked' {
  if (!scope.locked) {
    return 'unlocked';
  }
  return scope.mode === 'range' && scope.selection ? 'selection' : 'full';
}

export function getScopeLocation(scope: DocRightScopeState): string {
  if (!scope.locked) {
    return 'No scope locked (editing enabled).';
  }
  if (scope.mode === 'range' && scope.selection) {
    return 'User-selected range in the document.';
  }
  return 'Full document.';
}
