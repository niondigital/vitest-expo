import path from 'node:path';
import { createRequire } from 'node:module';
import { readJsonc } from './json';

export interface DependencyReport {
  /** Packages to add, ready for the install line. */
  missing: string[];
  present: string[];
  notes: string[];
  /** jest packages that become removable once the migration is done. */
  removable: string[];
}

const JEST_PACKAGES = [
  'jest',
  'jest-expo',
  'babel-jest',
  'jest-environment-jsdom',
  '@types/jest',
  'ts-jest',
];

export function checkDependencies(root: string): DependencyReport {
  const pkg = readJsonc<Record<string, any>>(path.join(root, 'package.json')) ?? {};
  const declared: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const require = createRequire(path.join(root, 'package.json'));

  const missing: string[] = [];
  const present: string[] = [];
  const notes: string[] = [];

  const need = (name: string, spec = name) => {
    if (name in declared || resolves(require, name)) present.push(name);
    else missing.push(spec);
  };

  need('vitest-expo');
  need('vitest');
  need('vitest-native');
  need('@testing-library/react-native');

  // react-test-renderer is RNTL's renderer and is version-locked to React.
  const reactVersion = installedVersion(require, 'react') ?? declared.react;
  const rendererVersion = installedVersion(require, 'react-test-renderer');
  if (!rendererVersion && !('react-test-renderer' in declared)) {
    missing.push(reactVersion ? `react-test-renderer@${reactVersion}` : 'react-test-renderer');
  } else {
    present.push('react-test-renderer');
    if (reactVersion && rendererVersion && major(reactVersion) !== major(rendererVersion)) {
      notes.push(
        `react-test-renderer ${rendererVersion} does not match react ${reactVersion} — install react-test-renderer@${reactVersion}`
      );
    }
  }

  // The native engine runs the RN Babel pipeline in Node, so both have to be
  // resolvable from the project even though nothing imports them directly.
  need('@react-native/babel-preset');
  need('@babel/core');

  return {
    missing,
    present,
    notes,
    removable: JEST_PACKAGES.filter((name) => name in declared),
  };
}

export function installLine(missing: string[]): string {
  return `npm install -D ${missing.join(' ')}`;
}

function resolves(require: NodeRequire, name: string): boolean {
  try {
    require.resolve(`${name}/package.json`);
    return true;
  } catch {
    try {
      require.resolve(name);
      return true;
    } catch {
      return false;
    }
  }
}

function installedVersion(require: NodeRequire, name: string): string | null {
  try {
    return require(`${name}/package.json`).version ?? null;
  } catch {
    return null;
  }
}

function major(version: string): string {
  const match = /(\d+)\./.exec(version);
  return match ? match[1] : version;
}
