import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A throwaway project directory, seeded with the given files. */
export function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-expo-test-'));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
