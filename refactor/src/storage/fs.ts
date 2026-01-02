import * as fs from 'fs';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) {
      return fallback;
    }
    return JSON.parse(trimmed) as T;
  } catch (error) {
    return fallback;
  }
}

export async function writeJsonFile<T>(filePath: string, payload: T): Promise<void> {
  const contents = JSON.stringify(payload, null, 2) + '\n';
  await fs.promises.writeFile(filePath, contents, 'utf8');
}

export async function readTextFile(filePath: string, fallback: string): Promise<string> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return raw.trim();
  } catch (error) {
    return fallback;
  }
}

export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await fs.promises.writeFile(filePath, contents, 'utf8');
}

export async function writeFileIfMissing(filePath: string, contents: string): Promise<void> {
  try {
    await fs.promises.access(filePath);
  } catch (error) {
    await fs.promises.writeFile(filePath, contents, 'utf8');
  }
}

export function ensureTrailingNewline(value: string): string {
  if (value.endsWith('\n')) {
    return value;
  }
  return `${value}\n`;
}
