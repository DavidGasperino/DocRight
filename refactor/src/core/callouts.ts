export type OffsetItem = {
  startOffset: number;
  endOffset: number;
};

export type TextChange = {
  rangeOffset: number;
  rangeLength: number;
  text: string;
};

export function buildSnippet(text: string): string {
  const squashed = text.replace(/\s+/g, ' ').trim();
  if (!squashed) {
    return '(empty selection)';
  }
  if (squashed.length > 40) {
    return `${squashed.slice(0, 37)}...`;
  }
  return squashed;
}

export function findOverlap<T extends OffsetItem>(items: T[], startOffset: number, endOffset: number): T | undefined {
  return items.find((item) => startOffset < item.endOffset && endOffset > item.startOffset);
}

export function applyOffsetChanges<T extends OffsetItem>(items: T[], changes: TextChange[]): boolean {
  if (changes.length === 0) {
    return false;
  }

  const sorted = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
  let updated = false;

  for (const change of sorted) {
    const changeStart = change.rangeOffset;
    const changeEnd = change.rangeOffset + change.rangeLength;
    const delta = change.text.length - change.rangeLength;

    for (const item of items) {
      if (item.endOffset <= changeStart) {
        continue;
      }

      if (item.startOffset >= changeEnd) {
        item.startOffset += delta;
        item.endOffset += delta;
        updated = true;
        continue;
      }

      item.endOffset += delta;
      if (changeStart < item.startOffset) {
        item.startOffset = changeStart;
      }
      if (item.endOffset < item.startOffset) {
        item.endOffset = item.startOffset;
      }
      updated = true;
    }
  }

  const filtered = items.filter((item) => item.endOffset > item.startOffset);
  if (filtered.length !== items.length) {
    items.length = 0;
    items.push(...filtered);
    updated = true;
  }

  return updated;
}
