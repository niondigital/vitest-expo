import fs from 'node:fs';
import path from 'node:path';
import { aliasesFromTsconfig } from './aliases';
import { checkDependencies, installLine } from './deps';
import { renderConfig } from './generate';
import { readJsonc, detectIndent } from './json';
import { code, fail, heading, info, ok, plain, warn } from './ui';

export interface InitOptions {
  root: string;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Sets up Vitest in an Expo app that has no test runner yet: writes the config,
 * adds the test script and the TypeScript types entry, and prints the one
 * install command that is left. The counterpart of `migrate`, which derives all
 * of that from an existing Jest setup.
 */
export function init(options: InitOptions): number {
  const { root } = options;
  const dryRun = options.dryRun ?? false;

  heading('vitest-expo init');
  info(`project: ${root}`);
  if (dryRun) info('dry run — nothing will be written');

  const pkg = readJsonc<Record<string, any>>(path.join(root, 'package.json'));
  if (!pkg) {
    fail('no package.json here — run this in an Expo project (or pass --cwd)');
    return 1;
  }
  const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (!('expo' in declared)) {
    warn('this project does not declare expo — continuing anyway');
  }
  if (fs.existsSync(path.join(root, 'jest.config.js')) || pkg.jest) {
    warn('a Jest setup is present — `npx vitest-expo migrate` carries it over instead');
  }

  /* -- config ------------------------------------------------------------ */

  heading('vitest.config.mts');
  const configPath = path.join(root, 'vitest.config.mts');
  const existing = ['vitest.config.mts', 'vitest.config.ts', 'vitest.config.js']
    .map((name) => path.join(root, name))
    .find((file) => fs.existsSync(file));

  if (existing && !options.force) {
    warn(`${path.basename(existing)} already exists — leaving it alone (--force to overwrite)`);
  } else {
    const aliases = aliasesFromTsconfig(root);
    const contents = renderConfig({ aliases, setupFiles: [], exclude: [] });
    if (dryRun) {
      info('would write vitest.config.mts');
    } else {
      fs.writeFileSync(configPath, contents);
      ok('wrote vitest.config.mts');
    }
    for (const alias of aliases) info(`alias ${alias.origin}`);
  }

  /* -- test script ------------------------------------------------------- */

  heading('package.json scripts');
  if (typeof pkg.scripts?.test === 'string' && pkg.scripts.test !== 'vitest run') {
    warn(`"test" already runs: ${pkg.scripts.test} — left unchanged`);
  } else if (pkg.scripts?.test === 'vitest run') {
    info('test script already runs Vitest');
  } else if (dryRun) {
    info('would set test: "vitest run"');
  } else {
    writeScript(path.join(root, 'package.json'), 'test', 'vitest run');
    ok('test: "vitest run"');
  }

  /* -- TypeScript -------------------------------------------------------- */

  heading('TypeScript');
  const tsconfigPath = path.join(root, 'tsconfig.json');
  const tsconfig = readJsonc<Record<string, any>>(tsconfigPath);
  const types: unknown = tsconfig?.compilerOptions?.types;
  if (!tsconfig) {
    info('no tsconfig.json — skipping');
  } else if (Array.isArray(types) && types.includes('vitest-expo/types')) {
    ok('tsconfig already includes vitest-expo/types');
  } else {
    warn('add the test globals and RNTL matcher types to tsconfig.json:');
    code('"types": ["expo/types", "vitest-expo/types"]');
  }

  /* -- dependencies ------------------------------------------------------ */

  heading('Dependencies');
  const deps = checkDependencies(root);
  if (deps.missing.length > 0) {
    warn(`missing: ${deps.missing.join(', ')}`);
    code(installLine(deps.missing));
  } else {
    ok('all required packages are installed');
  }
  for (const note of deps.notes) warn(note);

  heading('Next steps');
  const steps = [
    ...(deps.missing.length > 0 ? [installLine(deps.missing)] : []),
    'write a test under src/ (or wherever your app keeps them)',
    'npx vitest',
  ];
  steps.forEach((step, index) => code(`${index + 1}. ${step}`));
  plain();

  return 0;
}

/** Adds a script to package.json without disturbing the rest of the file. */
function writeScript(file: string, name: string, value: string): void {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  parsed.scripts = { ...parsed.scripts, [name]: value };
  const indent = detectIndent(raw);
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, indent)}\n`);
}
