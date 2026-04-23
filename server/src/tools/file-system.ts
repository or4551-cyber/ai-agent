import * as fs from 'fs/promises';
import * as path from 'path';

export async function readFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
}

export async function writeFile(filePath: string, content: string): Promise<string> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return `File written: ${filePath} (${content.length} chars)`;
}

export async function editFile(
  filePath: string,
  oldString: string,
  newString: string
): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  if (!content.includes(oldString)) {
    throw new Error(`String not found in file: "${oldString.substring(0, 100)}..."`);
  }
  const newContent = content.replace(oldString, newString);
  await fs.writeFile(filePath, newContent, 'utf-8');
  return `File edited: ${filePath} — replaced ${oldString.length} chars with ${newString.length} chars`;
}

export async function deleteFile(filePath: string, recursive = false): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    await fs.rm(filePath, { recursive });
    return `Directory deleted: ${filePath}`;
  } else {
    await fs.unlink(filePath);
    return `File deleted: ${filePath}`;
  }
}

export async function listDirectory(dirPath: string): Promise<string> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      const type = entry.isDirectory() ? '📁' : '📄';
      const size = entry.isFile()
        ? formatSize(stat.size)
        : `${(await fs.readdir(fullPath)).length} items`;
      results.push(`${type} ${entry.name} (${size})`);
    } catch {
      results.push(`❓ ${entry.name} (inaccessible)`);
    }
  }

  return results.join('\n') || '(empty directory)';
}

export async function searchFiles(
  dirPath: string,
  query: string,
  filePattern?: string
): Promise<string> {
  const results: string[] = [];
  await searchRecursive(dirPath, query, filePattern, results, 0);
  return results.length > 0
    ? results.slice(0, 50).join('\n') + (results.length > 50 ? `\n... and ${results.length - 50} more` : '')
    : 'No matches found.';
}

async function searchRecursive(
  dirPath: string,
  query: string,
  filePattern: string | undefined,
  results: string[],
  depth: number
): Promise<void> {
  if (depth > 10 || results.length >= 100) return;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await searchRecursive(fullPath, query, filePattern, results, depth + 1);
      } else if (entry.isFile()) {
        if (filePattern && !matchGlob(entry.name, filePattern)) continue;
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // skip binary files
        }
      }
    }
  } catch {
    // skip inaccessible directories
  }
}

function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return regex.test(filename);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
