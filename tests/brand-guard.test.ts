import { it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const banned = /YRIA|Grupo YR|hospitalar/i;

async function sourceFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(path)));
    else if (/\.(tsx?|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

it('rejects the reference brand and hospital wording in the product UI', async () => {
  const files = (
    await Promise.all(
      ['apps/web/src', 'packages/ui/src'].map((folder) => sourceFiles(join(root, folder))),
    )
  ).flat();
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) expect(await readFile(file, 'utf8'), file).not.toMatch(banned);
});
