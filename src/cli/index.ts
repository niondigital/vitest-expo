#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { init } from './init';
import { migrate } from './migrate';
import { color } from './ui';

const USAGE = `
${color.bold('vitest-expo')} — test Expo apps with Vitest

Usage
  npx vitest-expo init [options]       set Vitest up in an Expo app
  npx vitest-expo migrate [options]    carry an existing jest-expo setup over

init writes a vitest.config.mts, adds the test script and prints the install
line. migrate derives all of that from the project's Jest config and reports
the patterns that need a hand. Existing files are never overwritten unless
asked for.

Options
  --force        overwrite an existing vitest.config.mts
  --fix          apply the safe auto-fixes (jest.doMock -> jest.mock in setup files)
  --replace      do not keep the Jest run as the "test:jest" script
  --dry-run      report only; write nothing
  --cwd <dir>    project directory (default: the working directory)
  -h, --help     show this help
  -v, --version  print the package version
`;

interface Args {
  command?: string;
  force: boolean;
  fix: boolean;
  replace: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
  cwd: string;
  unknown: string[];
}

function parse(argv: string[]): Args {
  const args: Args = {
    force: false,
    fix: false,
    replace: false,
    dryRun: false,
    help: false,
    version: false,
    cwd: process.cwd(),
    unknown: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--force':
        args.force = true;
        break;
      case '--fix':
        args.fix = true;
        break;
      case '--replace':
        args.replace = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--cwd':
        args.cwd = path.resolve(argv[++i] ?? '.');
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      default:
        if (arg.startsWith('-')) args.unknown.push(arg);
        else if (!args.command) args.command = arg;
        else args.unknown.push(arg);
    }
  }

  return args;
}

function main(): number {
  const args = parse(process.argv.slice(2));

  if (args.version) {
    console.log(version());
    return 0;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (args.unknown.length > 0) {
    console.error(`Unknown argument(s): ${args.unknown.join(', ')}`);
    console.log(USAGE);
    return 1;
  }

  if (!args.command) {
    console.log(USAGE);
    return 1;
  }

  if (args.command === 'init') {
    return init({ root: args.cwd, force: args.force, dryRun: args.dryRun });
  }

  if (args.command !== 'migrate') {
    console.error(`Unknown command: ${args.command}`);
    console.log(USAGE);
    return 1;
  }

  return migrate({
    root: args.cwd,
    force: args.force,
    fix: args.fix,
    replace: args.replace,
    dryRun: args.dryRun,
  });
}

/** dist/cli/index.js → the package manifest two levels up. */
function version(): string {
  try {
    const manifest = new URL('../../package.json', import.meta.url);
    return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

process.exitCode = main();
