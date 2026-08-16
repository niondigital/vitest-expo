import fs from 'node:fs';

/**
 * Tolerant JSON reader for config files that are JSON in name only —
 * tsconfig.json permits comments and trailing commas, and hand-edited
 * package.json files pick up the same habits.
 */
export function parseJsonc<T = any>(source: string): T {
  return JSON.parse(stripTrailingCommas(stripComments(source)));
}

export function readJsonc<T = any>(file: string): T | null {
  try {
    return parseJsonc<T>(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Indentation of an existing JSON file, so rewrites keep the project's formatting. */
export function detectIndent(source: string): string {
  const match = source.match(/\n([ \t]+)"/);
  return match ? match[1] : '  ';
}

function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < source.length) {
    const ch = source[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function stripTrailingCommas(source: string): string {
  return source.replace(/,(\s*[}\]])/g, '$1');
}
