export type PromptChunks = {
  total: number;
  chunks: string[];
};

export function buildPromptChunks(text: string, chunkSize: number): PromptChunks {
  const safeText = String(text ?? '');
  const size = Number(chunkSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('chunkSize must be a positive number.');
  }

  if (safeText.length === 0) {
    return { total: 1, chunks: [''] };
  }

  const total = Math.max(1, Math.ceil(safeText.length / size));
  const chunks: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const start = i * size;
    const end = start + size;
    chunks.push(safeText.slice(start, end));
  }

  return { total, chunks };
}
