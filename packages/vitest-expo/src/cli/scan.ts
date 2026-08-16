import fs from 'node:fs';
import path from 'node:path';

export interface Finding {
  pattern: PatternId;
  file: string;
  line: number;
  excerpt: string;
}

export type PatternId =
  | 'reanimated-mock'
  | 'do-mock'
  | 'require-mock'
  | 'arrow-mock-implementation'
  | 'require-actual-alias'
  | 'platform-os-assignment'
  | 'color-scheme-mock';

export interface PatternInfo {
  title: string;
  hint: string;
  /** MIGRATION.md anchor the hint refers to. */
  anchor: string;
  severity: 'change' | 'check';
}

export const PATTERNS: Record<PatternId, PatternInfo> = {
  'reanimated-mock': {
    title: 'react-native-reanimated mock',
    hint: 'Remove the mock — the built-in reanimated preset covers it, and the upstream mock is Jest-only.',
    anchor: '#the-reanimated-mock',
    severity: 'change',
  },
  'do-mock': {
    title: 'jest.doMock in a setup file',
    hint: 'Use jest.mock — doMock is not hoisted and misses modules the setup already imported.',
    anchor: '#jestdomock--jestmock',
    severity: 'change',
  },
  'require-mock': {
    title: 'jest.requireMock',
    hint: 'Import the mocked module instead — requireMock does not return the live factory instance.',
    anchor: '#jestrequiremock--module-import',
    severity: 'change',
  },
  'arrow-mock-implementation': {
    title: 'arrow mockImplementation inside a jest.mock factory',
    hint: 'If the value is constructed with `new`, pass a function expression — arrows are not constructable.',
    anchor: '#class-mocks-need-function-implementations',
    severity: 'check',
  },
  'require-actual-alias': {
    title: 'jest.requireActual through a path alias',
    hint: 'Works as-is. For app modules with a deep import graph, prefer vi.mock(path, async (importOriginal) => …).',
    anchor: '#partial-mocks-of-app-modules',
    severity: 'check',
  },
  'platform-os-assignment': {
    title: 'Platform.OS assignment',
    hint: 'The platform is a config-time decision: vitestExpo({ platform }) with one config per platform.',
    anchor: '#platformos-assignment',
    severity: 'change',
  },
  'color-scheme-mock': {
    title: 'mocked useColorScheme',
    hint: "Use setColorScheme() from 'vitest-native/helpers' — the hook is backed by the real Appearance module.",
    anchor: '#automocked-usecolorscheme',
    severity: 'change',
  },
};

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.expo', 'ios', 'android']);

export interface SourceFile {
  file: string;
  /** Setup files are scanned for patterns that only misbehave outside a test file. */
  setup: boolean;
}

/** Test files anywhere under the project, plus the setup files carried over. */
export function collectSources(root: string, setupFiles: string[]): SourceFile[] {
  const found: string[] = [];
  walk(root, root, found);
  const sources: SourceFile[] = found.map((file) => ({ file, setup: false }));
  for (const setup of setupFiles) {
    const file = path.resolve(root, setup);
    if (!fs.existsSync(file)) continue;
    const existing = sources.find((source) => source.file === file);
    if (existing) existing.setup = true;
    else sources.push({ file, setup: true });
  }
  return sources;
}

function walk(dir: string, root: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, root, out);
    } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

export function scanFile(root: string, source_: SourceFile, aliasPrefixes: string[]): Finding[] {
  const { file, setup } = source_;
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rel = path.relative(root, file) || file;
  const lines = source.split('\n');
  const findings: Finding[] = [];
  const add = (pattern: PatternId, index: number) => {
    const line = lineOf(source, index);
    findings.push({ pattern, file: rel, line, excerpt: (lines[line - 1] ?? '').trim() });
  };

  // The upstream mock is required under jest-expo and redundant (and broken)
  // here, so it is matched as a whole call rather than by module name.
  matchAll(
    source,
    /jest\.mock\(\s*['"]react-native-reanimated['"][\s\S]{0,300}?react-native-reanimated\/mock/g,
    (index) => add('reanimated-mock', index)
  );

  // Only reported for setup files: there, a mock registered after the module
  // was already imported never takes effect. Inside a test file, doMock is a
  // deliberate un-hoisted registration and keeps working.
  if (setup) matchAll(source, /\bjest\.doMock\s*\(/g, (index) => add('do-mock', index));
  matchAll(source, /\bjest\.requireMock\s*\(/g, (index) => add('require-mock', index));
  matchAll(source, /\bPlatform\.OS\s*=(?!=)/g, (index) => add('platform-os-assignment', index));

  matchAll(
    source,
    /useColorScheme\s+as\s+(jest|vi)\.Mock|useColorScheme[^\n]{0,40}\.mockReturnValue/g,
    (index) => add('color-scheme-mock', index)
  );

  for (const prefix of aliasPrefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matchAll(source, new RegExp(`requireActual\\(\\s*['"]${escaped}`, 'g'), (index) =>
      add('require-actual-alias', index)
    );
  }

  for (const factory of mockFactories(source)) {
    matchAll(factory.body, /mockImplementation\(\s*(async\s*)?\([^)]*\)\s*=>/g, (index) =>
      add('arrow-mock-implementation', factory.start + index)
    );
  }

  return findings;
}

/** Rewrites jest.doMock to jest.mock. The only auto-fix the CLI applies. */
export function applyDoMockFix(file: string): number {
  const source = fs.readFileSync(file, 'utf8');
  let count = 0;
  const fixed = source.replace(/\bjest\.doMock\s*\(/g, () => {
    count += 1;
    return 'jest.mock(';
  });
  if (count > 0) fs.writeFileSync(file, fixed);
  return count;
}

/** Bodies of `jest.mock(...)` / `vi.mock(...)` calls, with their offsets. */
function mockFactories(source: string): Array<{ start: number; body: string }> {
  const out: Array<{ start: number; body: string }> = [];
  const opener = /\b(jest|vi)\.mock\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    const start = match.index + match[0].length - 1;
    const body = balanced(source, start);
    if (body) {
      out.push({ start, body });
      opener.lastIndex = start + body.length;
    }
  }
  return out;
}

function balanced(source: string, from: number): string | null {
  let depth = 0;
  let quote = '';
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  return null;
}

function matchAll(source: string, pattern: RegExp, onMatch: (index: number) => void): void {
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(source))) {
    onMatch(match.index);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}
