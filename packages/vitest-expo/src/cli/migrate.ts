import fs from 'node:fs';
import path from 'node:path';
import { aliasesFromModuleNameMapper, aliasesFromTsconfig, type AliasEntry } from './aliases';
import { checkDependencies, installLine } from './deps';
import { findJestConfig, loadJestSetup } from './detect';
import {
  isJestOnlySetup,
  renderConfig,
  toConfigPath,
  toExcludeGlobs,
  updateScripts,
} from './generate';
import { readJsonc } from './json';
import {
  applyDoMockFix,
  applyEmptyFactoryFix,
  collectSources,
  mockedBareSpecifiers,
  PATTERNS,
  scanFile,
  scanLazyRequires,
  type Finding,
} from './scan';
import { code, color, fail, heading, info, ok, plain, warn } from './ui';

export interface MigrateOptions {
  root: string;
  force: boolean;
  fix: boolean;
  replace: boolean;
  dryRun: boolean;
}

const GUIDE = 'MIGRATION.md';

export function migrate(options: MigrateOptions): number {
  const { root, dryRun } = options;

  console.log(color.bold('\nvitest-expo migrate'));
  console.log(color.dim(`  project: ${root}`));
  if (dryRun) console.log(color.dim('  dry run — nothing will be written'));

  const manual: string[] = [];

  /* -- 1. the Jest setup ------------------------------------------------ */

  heading('Jest setup');
  const configFile = findJestConfig(root);
  if (!configFile) {
    fail('No Jest config found (jest.config.{js,cjs,mjs,ts,json} or a "jest" key in package.json).');
    plain('Run this inside the project that currently uses jest-expo.');
    return 1;
  }

  const jest = loadJestSetup(root, configFile);
  ok(`found ${jest.source}${jest.preset ? ` (preset: ${jest.preset})` : ''}`);
  if (jest.heuristic) {
    warn('Config read statically — computed values are invisible. Review the generated config.');
  }
  if (jest.preset && !jest.preset.startsWith('jest-expo')) {
    warn(`Preset is "${jest.preset}", not jest-expo — the generated config may need more work.`);
  }

  /* -- 2. vitest.config.mts ---------------------------------------------- */
  // .mts loads natively regardless of the project's package.json "type",
  // so the generated config never triggers Vite's CJS-config deprecation.

  heading('vitest.config.mts');

  const tsconfigAliases = aliasesFromTsconfig(root);
  const mapped = aliasesFromModuleNameMapper(root, jest.moduleNameMapper, tsconfigAliases);
  // Vite matches aliases in order, so the most specific pattern has to lead.
  const aliases: AliasEntry[] = [...tsconfigAliases, ...mapped.entries].sort(
    (a, b) => b.find.length - a.find.length
  );

  const setupEntries = [...jest.setupFiles, ...jest.setupFilesAfterEnv];
  const setupFiles: string[] = [];
  for (const entry of setupEntries) {
    if (isJestOnlySetup(entry)) {
      manual.push(`Setup file "${entry}" is Jest-only and was left out of the config.`);
      continue;
    }
    setupFiles.push(toConfigPath(entry));
  }

  const excludes = toExcludeGlobs(jest.testPathIgnorePatterns);

  const configPath = path.join(root, 'vitest.config.mts');
  const contents = renderConfig({ aliases, setupFiles, exclude: excludes.globs });

  const existingConfig = ['vitest.config.mts', 'vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs']
    .map((name) => path.join(root, name))
    .find((candidate) => fs.existsSync(candidate));
  if (existingConfig && !options.force) {
    warn(
      `${path.basename(existingConfig)} exists — left untouched. Re-run with --force to overwrite.`
    );
  } else if (dryRun) {
    info('would write vitest.config.mts');
  } else {
    if (existingConfig && existingConfig !== configPath) {
      // Two config files would be ambiguous — keep the old one visibly aside.
      fs.renameSync(existingConfig, `${existingConfig}.pre-migration.bak`);
      warn(`moved ${path.basename(existingConfig)} to ${path.basename(existingConfig)}.pre-migration.bak`);
    }
    fs.writeFileSync(configPath, contents);
    ok(`wrote vitest.config.mts${options.force ? ' (overwritten)' : ''}`);
  }

  for (const alias of aliases) info(`alias ${alias.origin}`);
  if (setupFiles.length > 0) info(`setupFiles: ${setupFiles.join(', ')}`);
  if (excludes.globs.length > 0) info(`exclude: ${excludes.globs.join(', ')}`);

  for (const skip of mapped.skipped) {
    manual.push(`moduleNameMapper "${skip.pattern}" → "${skip.target}": ${skip.reason}.`);
  }
  for (const skip of excludes.skipped) {
    manual.push(`testPathIgnorePatterns "${skip.pattern}": ${skip.reason}.`);
  }

  /* -- 3. package.json scripts ------------------------------------------ */

  heading('package.json scripts');
  const changes = updateScripts(root, { replace: options.replace, dryRun });
  if (changes.length === 0) {
    info('scripts already point at Vitest');
  } else {
    for (const change of changes) {
      const label = change.from ? `"${change.from}" → "${change.to}"` : `"${change.to}"`;
      if (dryRun) info(`would set ${change.name}: ${label}`);
      else ok(`${change.name}: ${label}`);
    }
    if (options.replace) info('--replace: the Jest script was not kept');
  }

  /* -- 4. dependencies -------------------------------------------------- */

  heading('Dependencies');
  const deps = checkDependencies(root);
  if (deps.missing.length === 0) {
    ok('all required packages are installed');
  } else {
    warn(`missing: ${deps.missing.join(', ')}`);
    code(installLine(deps.missing));
  }
  for (const note of deps.notes) warn(note);
  if (deps.removable.length > 0) {
    info(`removable once the migration is verified: ${deps.removable.join(', ')}`);
    plain(color.dim('(not removed automatically — keep them while both runners are compared)'));
  }

  /* -- 5. tsconfig ------------------------------------------------------ */

  heading('TypeScript');
  const tsconfig = readJsonc<Record<string, any>>(path.join(root, 'tsconfig.json'));
  const types: unknown = tsconfig?.compilerOptions?.types;
  if (Array.isArray(types) && types.includes('vitest-expo/types')) {
    ok('tsconfig already includes vitest-expo/types');
  } else {
    warn('add the test globals and RNTL matcher types to tsconfig.json:');
    code('"types": ["expo/types", "vitest-expo/types"]');
  }

  /* -- 6. pattern scan -------------------------------------------------- */

  heading('Pattern scan');
  const aliasPrefixes = aliasPrefixesFrom(root);
  const sources = collectSources(root, setupEntries.map(toFsPath));
  const findings: Finding[] = [];
  for (const source of sources) findings.push(...scanFile(root, source, aliasPrefixes));
  findings.push(...scanLazyRequires(root, mockedBareSpecifiers(sources)));

  const testCount = sources.filter((source) => !source.setup).length;
  info(`scanned ${testCount} test file(s) and ${sources.length - testCount} setup file(s)`);

  let fixed = 0;
  if (options.fix && !dryRun) {
    const setupFilesWithDoMock = new Set(
      findings.filter((f) => f.pattern === 'do-mock').map((f) => path.join(root, f.file))
    );
    for (const file of setupFilesWithDoMock) fixed += applyDoMockFix(file);
    if (fixed > 0) {
      ok(`--fix: rewrote ${fixed} jest.doMock call(s) to jest.mock`);
      plain(color.dim('review the result — jest.mock is hoisted, so a conditional guard no longer applies'));
    }
    let emptyFixed = 0;
    const filesWithEmptyFactory = new Set(
      findings.filter((f) => f.pattern === 'empty-mock-factory').map((f) => path.join(root, f.file))
    );
    for (const file of filesWithEmptyFactory) emptyFixed += applyEmptyFactoryFix(file);
    if (emptyFixed > 0) ok(`--fix: rewrote ${emptyFixed} empty mock factory(ies) to () => ({})`);
  }

  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (options.fix && !dryRun && finding.pattern === 'do-mock') continue;
    const list = grouped.get(finding.pattern) ?? [];
    list.push(finding);
    grouped.set(finding.pattern, list);
  }

  if (grouped.size === 0 && fixed === 0) {
    ok('no known migration patterns found');
  }

  for (const [id, list] of grouped) {
    const info_ = PATTERNS[id as keyof typeof PATTERNS];
    const marker = info_.severity === 'change' ? color.yellow('!') : color.blue('?');
    console.log(`  ${marker} ${info_.title} (${list.length})`);
    for (const finding of list.slice(0, 10)) {
      plain(color.dim(`${finding.file}:${finding.line}  ${truncate(finding.excerpt, 70)}`));
    }
    if (list.length > 10) plain(color.dim(`… and ${list.length - 10} more`));
    plain(info_.hint);
    plain(color.dim(`${GUIDE}${info_.anchor}`));
  }

  /* -- 7. summary ------------------------------------------------------- */

  heading('Next steps');
  if (deps.missing.length > 0) plain(`1. ${installLine(deps.missing)}`);
  plain(`${deps.missing.length > 0 ? '2' : '1'}. npx vitest run`);
  plain(`${deps.missing.length > 0 ? '3' : '2'}. npx vitest run -u   (snapshots are regenerated once)`);

  if (manual.length > 0) {
    heading('Needs a hand');
    for (const item of manual) warn(item);
  }

  const changeCount = [...grouped.values()].flat().filter(
    (finding) => PATTERNS[finding.pattern].severity === 'change'
  ).length;

  console.log(
    `\n${color.bold('Summary')}: ${aliases.length} alias(es), ${setupFiles.length} setup file(s), ` +
      `${changeCount} pattern(s) to change, ${manual.length} item(s) needing a hand.`
  );
  console.log(color.dim(`Full guide: node_modules/vitest-expo/${GUIDE}`));
  console.log(
    color.dim(
      'AI agent doing this migration? Follow node_modules/vitest-expo/MIGRATION-AGENTS.md (full idiomatic rewrite).\n'
    )
  );

  return 0;
}

/** Alias heads ('@/', '~/') used to spot requireActual calls through an alias. */
function aliasPrefixesFrom(root: string): string[] {
  const tsconfig = readJsonc<Record<string, any>>(path.join(root, 'tsconfig.json'));
  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object') return [];
  return Object.keys(paths)
    .filter((pattern) => pattern.endsWith('/*'))
    .map((pattern) => pattern.slice(0, -1));
}

function toFsPath(entry: string): string {
  return entry.replace(/^<rootDir>\/?/, './');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
