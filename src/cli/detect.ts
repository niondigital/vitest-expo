import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readJsonc } from './json';

export interface JestSetup {
  /** Config location relative to the project root, or 'package.json ("jest")'. */
  source: string;
  preset?: string;
  setupFiles: string[];
  setupFilesAfterEnv: string[];
  moduleNameMapper: Record<string, string>;
  testPathIgnorePatterns: string[];
  /**
   * True when the values were read statically instead of evaluated. Config
   * files written in TypeScript, ESM, or with computed values cannot be
   * require()d from here, so the CLI falls back to reading literals — which
   * only sees what is spelled out in the file.
   */
  heuristic: boolean;
}

const CONFIG_CANDIDATES = [
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.ts',
  'jest.config.json',
];

export function findJestConfig(root: string): string | null {
  for (const candidate of CONFIG_CANDIDATES) {
    const file = path.join(root, candidate);
    if (fs.existsSync(file)) return file;
  }
  const pkg = readJsonc<Record<string, any>>(path.join(root, 'package.json'));
  return pkg && pkg.jest ? path.join(root, 'package.json') : null;
}

export function loadJestSetup(root: string, configFile: string): JestSetup {
  const rel = path.relative(root, configFile) || path.basename(configFile);

  if (path.basename(configFile) === 'package.json') {
    const pkg = readJsonc<Record<string, any>>(configFile);
    return normalize({ source: 'package.json ("jest")', heuristic: false }, pkg?.jest ?? {});
  }

  if (configFile.endsWith('.json')) {
    return normalize({ source: rel, heuristic: false }, readJsonc(configFile) ?? {});
  }

  const evaluated = tryRequire(root, configFile);
  if (evaluated) return normalize({ source: rel, heuristic: false }, evaluated);

  const source = fs.readFileSync(configFile, 'utf8');
  return normalize({ source: rel, heuristic: true }, extractStatically(source));
}

/**
 * Evaluating a config executes project code, so it stays opt-in-by-success:
 * anything that throws, is async, or is a factory falls through to the static
 * reader rather than being forced to run.
 */
function tryRequire(root: string, configFile: string): Record<string, any> | null {
  if (configFile.endsWith('.ts') || configFile.endsWith('.mjs')) return null;
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const loaded = require(configFile);
    const value = loaded?.default ?? loaded;
    if (value && typeof value === 'object' && typeof value.then !== 'function') return value;
    return null;
  } catch {
    return null;
  }
}

function normalize(
  meta: { source: string; heuristic: boolean },
  raw: Record<string, any>
): JestSetup {
  return {
    ...meta,
    preset: typeof raw.preset === 'string' ? raw.preset : undefined,
    setupFiles: stringList(raw.setupFiles),
    setupFilesAfterEnv: stringList(raw.setupFilesAfterEnv),
    moduleNameMapper: stringRecord(raw.moduleNameMapper),
    testPathIgnorePatterns: stringList(raw.testPathIgnorePatterns),
  };
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // Array-valued mappers (multiple candidates per key) have no single alias
    // equivalent — keep the first so the report can still name it.
    if (typeof entry === 'string') out[key] = entry;
    else if (Array.isArray(entry) && typeof entry[0] === 'string') out[key] = entry[0];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Static reader
 *
 * Only literal values are recovered: quoted strings in arrays, and
 * string-to-string pairs in objects. Anything computed is invisible here and
 * is surfaced to the user as "read statically" so the generated config gets
 * reviewed rather than trusted.
 * ------------------------------------------------------------------ */

function extractStatically(source: string): Record<string, any> {
  return {
    preset: literalString(source, 'preset'),
    setupFiles: literalArray(source, 'setupFiles'),
    setupFilesAfterEnv: literalArray(source, 'setupFilesAfterEnv'),
    moduleNameMapper: literalObject(source, 'moduleNameMapper'),
    testPathIgnorePatterns: literalArray(source, 'testPathIgnorePatterns'),
  };
}

function keyIndex(source: string, key: string): number {
  const match = new RegExp(`(^|[{,\\s])["']?${key}["']?\\s*:`, 'm').exec(source);
  return match ? match.index + match[0].length : -1;
}

function literalString(source: string, key: string): string | undefined {
  const at = keyIndex(source, key);
  if (at < 0) return undefined;
  const match = /^\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(source.slice(at));
  return match ? unescapeLiteral(match[2]) : undefined;
}

function literalArray(source: string, key: string): string[] {
  const block = balancedSlice(source, keyIndex(source, key), '[', ']');
  return block ? quotedStrings(block) : [];
}

function literalObject(source: string, key: string): Record<string, string> {
  const block = balancedSlice(source, keyIndex(source, key), '{', '}');
  if (!block) return {};
  const out: Record<string, string> = {};
  const pair = /(['"`])((?:\\.|(?!\1).)*)\1\s*:\s*(['"`])((?:\\.|(?!\3).)*)\3/g;
  let match: RegExpExecArray | null;
  while ((match = pair.exec(block))) out[unescapeLiteral(match[2])] = unescapeLiteral(match[4]);
  return out;
}

function quotedStrings(block: string): string[] {
  const out: string[] = [];
  const pattern = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block))) out.push(unescapeLiteral(match[2]));
  return out;
}

/**
 * Reads a bracketed literal starting at `from`, tracking quotes so that
 * brackets inside strings (common in regex-keyed mappers) do not end it early.
 */
function balancedSlice(source: string, from: number, open: string, close: string): string | null {
  if (from < 0) return null;
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== open) return null;
  const start = i;
  let depth = 0;
  let quote = '';
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Turns the characters between the quotes into the value the config would have
 * at runtime, so statically read entries match require()d ones: a mapper key
 * written as '\\.(css)$' is the regex source `\.(css)$`.
 */
function unescapeLiteral(raw: string): string {
  const jsonReady = raw.replace(/\\(['`])/g, '$1').replace(/(^|[^\\])"/g, '$1\\"');
  try {
    return JSON.parse(`"${jsonReady}"`);
  } catch {
    return raw;
  }
}
