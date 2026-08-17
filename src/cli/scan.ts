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
  | 'color-scheme-mock'
  | 'dynamic-cjs-mock'
  | 'empty-mock-factory'
  | 'lazy-require-mocked'
  | 'sync-render-destructure'
  | 'async-loop-callback';

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
  'empty-mock-factory': {
    title: 'mock factory returning nothing',
    hint: 'Vitest requires the factory to return an object — use () => ({}) for side-effect-only mocks.',
    anchor: '#mock-factories-must-return-an-object',
    severity: 'change',
  },
  'lazy-require-mocked': {
    title: 'mocked package loaded via runtime require() in app code',
    hint: 'A require() inside a function bypasses the mock — the real module loads. Mock the wrapper module instead, or refactor to a static import.',
    anchor: '#lazy-require-of-a-mocked-package',
    severity: 'check',
  },
  'sync-render-destructure': {
    title: 'render() result used without await',
    hint: 'render() is async since @testing-library/react-native 14. Destructured queries come off the promise and are undefined; a result used directly renders outside act, which React reports as an unwrapped update. Use `await render(...)` and the `screen` queries — including inside render helpers.',
    anchor: '#async-render',
    severity: 'check',
  },
  'async-loop-callback': {
    title: 'async callback passed to forEach/map',
    hint: 'forEach ignores the promise an async callback returns, so awaited renders and the assertions after them run detached — after the test has ended. Use a for-of loop.',
    anchor: '#async-render',
    severity: 'change',
  },
  'dynamic-cjs-mock': {
    title: 'dynamically computed CJS exports in a __mocks__ file',
    hint: 'Named ESM imports cannot see Proxy/defineProperty exports — export the needed names statically as well.',
    anchor: '#dynamic-cjs-exports-in-mock-files',
    severity: 'change',
  },
};

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.expo', 'ios', 'android']);

export interface SourceFile {
  file: string;
  /** Setup files are scanned for patterns that only misbehave outside a test file. */
  setup: boolean;
  /** Files under a __mocks__ directory — scanned for CJS-export pitfalls. */
  mocks?: boolean;
}

/** All bare-package specifiers mocked anywhere in the suite. */
export function mockedBareSpecifiers(sources: SourceFile[]): Set<string> {
  const specifiers = new Set<string>();
  for (const { file } of sources) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const call = /\b(?:jest|vi)\.mock\(\s*['"]((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w./-]+)?)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(source))) {
      if (!match[1].startsWith('.')) specifiers.add(match[1]);
    }
  }
  return specifiers;
}

/**
 * App source files that load a mocked package via a runtime require() — the
 * mock only intercepts the import graph, so such a call loads the real module.
 */
export function scanLazyRequires(root: string, mocked: Set<string>): Finding[] {
  if (mocked.size === 0) return [];
  const files: string[] = [];
  walkSource(root, files);
  const findings: Finding[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const pkg of mocked) {
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const call = new RegExp(`\\brequire\\(\\s*['"]${escaped}['"]`, 'g');
      let match: RegExpExecArray | null;
      while ((match = call.exec(source))) {
        const line = lineOf(source, match.index);
        findings.push({
          pattern: 'lazy-require-mocked',
          file: path.relative(root, file) || file,
          line,
          excerpt: (source.split('\n')[line - 1] ?? '').trim(),
        });
      }
    }
  }
  return findings;
}

const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;

function walkSource(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name === '__mocks__' || entry.name === '__tests__') continue;
      walkSource(full, out);
    } else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Test and __mocks__ files anywhere under the project, plus the setup files carried over. */
export function collectSources(root: string, setupFiles: string[]): SourceFile[] {
  const found: SourceFile[] = [];
  walk(root, false, found);
  const sources = [...found];
  for (const setup of setupFiles) {
    const file = path.resolve(root, setup);
    if (!fs.existsSync(file)) continue;
    const existing = sources.find((source) => source.file === file);
    if (existing) existing.setup = true;
    else sources.push({ file, setup: true });
  }
  return sources;
}

function walk(dir: string, inMocks: boolean, out: SourceFile[]): void {
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
      walk(full, inMocks || entry.name === '__mocks__', out);
    } else if (entry.isFile()) {
      if (TEST_FILE.test(entry.name)) out.push({ file: full, setup: false, mocks: inMocks });
      else if (inMocks && /\.(ts|tsx|js|jsx|cjs)$/.test(entry.name)) {
        out.push({ file: full, setup: false, mocks: true });
      }
    }
  }
}

export function scanFile(root: string, source_: SourceFile, aliasPrefixes: string[]): Finding[] {
  const { file, setup, mocks } = source_;
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

  // __mocks__ files: exports computed at property-access time (Proxy,
  // defineProperty on module.exports) work under Jest's runtime require but
  // are invisible to static named-export analysis — named ESM imports of the
  // mocked module then resolve to undefined.
  if (mocks) {
    matchAll(
      source,
      /module\.exports\s*=\s*new\s+Proxy\s*\(|Object\.defineProperty\s*\(\s*module\.exports/g,
      (index) => add('dynamic-cjs-mock', index)
    );
  }

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
  // Jest tolerates a factory that returns undefined; Vitest rejects it.
  matchAll(source, /\b(?:jest|vi)\.mock\(\s*['\"][^'\"]+['\"]\s*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/g, (index) =>
    add('empty-mock-factory', index)
  );
  // A render() result used without await breaks under async render (RNTL >= 14):
  // destructured queries come off the promise and are undefined, and a result
  // used directly commits its render outside act — which React reports as
  // "An update to X inside a test was not wrapped in act(...)".
  matchAll(
    source,
    /(?<!await\s)(?:const|let|var)\s*(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*render\s*\(/g,
    (index) => add('sync-render-destructure', index)
  );
  // The same call wrapped in a helper: the helper hands the promise on, so the
  // await has to be added at both ends.
  matchAll(source, /(?<!await\s)return\s+render\s*\(/g, (index) =>
    add('sync-render-destructure', index)
  );
  // An async callback handed to forEach/map: the promise is dropped, so an
  // awaited render inside it — and every assertion after that await — runs
  // after the test has already finished.
  matchAll(source, /\.(?:forEach|map)\(\s*async\b/g, (index) => add('async-loop-callback', index));
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

/** Rewrites `() => {}` mock factories to `() => ({})` — same semantics, valid under Vitest. */
export function applyEmptyFactoryFix(file: string): number {
  const source = fs.readFileSync(file, 'utf8');
  let count = 0;
  const fixed = source.replace(
    /\b((?:jest|vi)\.mock\(\s*['"][^'"]+['"]\s*,\s*\(\)\s*=>\s*)\{\s*\}(\s*\))/g,
    (_all, head, tail) => {
      count += 1;
      return `${head}({})${tail}`;
    }
  );
  if (count > 0) fs.writeFileSync(file, fixed);
  return count;
}

/** Rewrites jest.doMock to jest.mock. */
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
