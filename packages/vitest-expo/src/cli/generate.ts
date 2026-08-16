import fs from 'node:fs';
import path from 'node:path';
import type { AliasEntry } from './aliases';
import { detectIndent, parseJsonc } from './json';

export interface ConfigInput {
  aliases: AliasEntry[];
  setupFiles: string[];
  exclude: string[];
}

/**
 * Emits the vitest.config.ts a jest-expo project needs: the plugin preset,
 * Jest's globals, and whatever the Jest config carried that has a direct
 * equivalent.
 */
export function renderConfig(input: ConfigInput): string {
  const { aliases, setupFiles, exclude } = input;
  const needsPath = aliases.length > 0;
  const needsDefaultExclude = exclude.length > 0;

  const lines: string[] = [];
  if (needsPath) lines.push("import path from 'node:path';");
  lines.push(
    needsDefaultExclude
      ? "import { defaultExclude, defineConfig } from 'vitest/config';"
      : "import { defineConfig } from 'vitest/config';"
  );
  lines.push("import { vitestExpo } from 'vitest-expo';", '');
  lines.push('export default defineConfig({');
  lines.push('  // iOS by default; add a second config with { platform: \'android\' | \'web\' }');
  lines.push('  // for the other platforms.');
  lines.push('  plugins: [vitestExpo()],');

  if (needsPath) {
    lines.push('  resolve: {');
    lines.push('    // Order matters: the longest prefix has to match first.');
    lines.push('    alias: [');
    for (const alias of aliases) {
      lines.push(`      // ${comment(alias.origin)}`);
      lines.push(`      { find: ${regexLiteral(alias.find)}, replacement: ${alias.replacement} },`);
    }
    lines.push('    ],');
    lines.push('  },');
  }

  lines.push('  test: {');
  lines.push('    globals: true,');
  if (setupFiles.length > 0) {
    lines.push(`    setupFiles: [${setupFiles.map(literal).join(', ')}],`);
  }
  if (exclude.length > 0) {
    lines.push('    // Carried over from testPathIgnorePatterns; the defaults stay in place.');
    lines.push(`    exclude: [...defaultExclude, ${exclude.map(literal).join(', ')}],`);
  }
  lines.push('  },');
  lines.push('});');

  return `${lines.join('\n')}\n`;
}

/**
 * Jest setup paths (<rootDir>-prefixed or bare) become config-relative paths,
 * which is what Vitest resolves setupFiles against.
 */
export function toConfigPath(entry: string): string {
  if (entry.startsWith('<rootDir>')) {
    return `./${entry.slice('<rootDir>'.length).replace(/^\/+/, '')}`;
  }
  // Relative, absolute, and bare specifiers (a setup shipped by a package)
  // all mean the same thing to Vitest as they do to Jest.
  return entry;
}

/**
 * Setup entries that exist only to make Jest behave. They have no counterpart
 * here and would fail to resolve or to run, so they are dropped and reported.
 */
export function isJestOnlySetup(entry: string): boolean {
  return (
    entry.includes('jest-expo/src/preset') ||
    entry.includes('@testing-library/jest-native') ||
    entry.includes('jest-native/extend-expect') ||
    /^jest-expo\//.test(entry)
  );
}

export interface ExcludeResult {
  globs: string[];
  skipped: Array<{ pattern: string; reason: string }>;
}

/**
 * `testPathIgnorePatterns` are regexes matched against absolute paths;
 * `test.exclude` takes globs. Path-shaped entries convert, regex-shaped ones
 * are reported so they can be rewritten deliberately.
 */
export function toExcludeGlobs(patterns: string[]): ExcludeResult {
  const globs: string[] = [];
  const skipped: ExcludeResult['skipped'] = [];

  for (const pattern of patterns) {
    const bare = pattern.replace(/^<rootDir>\/?/, '').replace(/^\/+/, '');
    if (/^node_modules\/?$/.test(bare)) continue; // already excluded by default

    if (/[\\()|?+[\]^$*{}]/.test(bare)) {
      skipped.push({ pattern, reason: 'regular expression — rewrite as a glob' });
      continue;
    }

    if (bare.endsWith('/')) globs.push(`**/${bare}**`);
    else if (bare.includes('/')) globs.push(`**/${bare}**`);
    else globs.push(`**/*${bare}*`);
  }

  return { globs, skipped };
}

export interface ScriptChange {
  name: string;
  from?: string;
  to: string;
}

/**
 * Points `test` at Vitest while keeping the Jest run available under
 * `test:jest`, so a migration can be verified against both runners.
 */
export function updateScripts(
  root: string,
  options: { replace: boolean; dryRun: boolean }
): ScriptChange[] {
  const file = path.join(root, 'package.json');
  const source = fs.readFileSync(file, 'utf8');
  const pkg = parseJsonc<Record<string, any>>(source);
  const scripts: Record<string, string> = { ...(pkg.scripts ?? {}) };
  const changes: ScriptChange[] = [];

  const previous = scripts.test;
  const usesJest = typeof previous === 'string' && /\bjest\b/.test(previous);
  // A TZ pin in the old script is a test-suite requirement (snapshots of
  // formatted dates), not a Jest detail — it has to survive.
  const envPrefix = previous ? (/^((?:\w+=\S+\s+)+)/.exec(previous)?.[1] ?? '') : '';
  const next = `${envPrefix}vitest run`;

  if (previous !== next) {
    changes.push({ name: 'test', from: previous, to: next });
    if (usesJest && !options.replace && !scripts['test:jest']) {
      changes.push({ name: 'test:jest', to: previous! });
      scripts['test:jest'] = previous!;
    }
    scripts.test = next;
  }

  if (changes.length > 0 && !options.dryRun) {
    pkg.scripts = scripts;
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, detectIndent(source))}\n`);
  }

  return changes;
}

/* ------------------------------------------------------------------ *
 * Emitting values into generated code
 *
 * Every value that originates in the project (paths, patterns, globs) is
 * emitted through JSON.stringify. Only expressions this module builds itself
 * — regex literals, path.resolve(...) calls — are written raw.
 * ------------------------------------------------------------------ */

function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * A regex literal cannot span lines, and its delimiter has to be escaped.
 * Patterns that do not fit fall back to the constructor form, where the
 * pattern is an ordinary escaped string.
 */
function regexLiteral(source: string): string {
  if (/[\n\r\u2028\u2029]/.test(source)) return `new RegExp(${JSON.stringify(source)})`;
  return `/${source.replace(/(?<!\\)\//g, '\\/')}/`;
}

/** Keeps a project-derived label on one line so it cannot escape the comment. */
function comment(text: string): string {
  return text.replace(/[\r\n\u2028\u2029]+/g, ' ');
}
