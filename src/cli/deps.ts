import fs from 'node:fs';
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
  // The engine range this package declares as its peer, so the install line
  // never names a release the peer check would then refuse.
  const engineRange = ownPeerRange('vitest-native');
  need('vitest-native', `vitest-native@${engineRange}`);
  const engineVersion = installedVersion(require, 'vitest-native') ?? declared['vitest-native'];
  if (engineVersion && isBelow(engineVersion, engineRange)) {
    notes.push(
      `vitest-native ${engineVersion} is installed, but vitest-expo requires ${engineRange} — upgrade with: npm install -D vitest-native@${engineRange}`
    );
  }
  // Vitest's peer. npm installs it on its own; yarn does not.
  need('vite', 'vite@^8');
  need('@testing-library/react-native');

  // Vitest 5 is required. An older install only surfaces as a package-manager
  // peer warning that is easy to miss — flag it loudly here instead.
  const vitestVersion = installedVersion(require, 'vitest') ?? declared.vitest;
  if (!vitestVersion && !('vitest' in declared)) {
    missing.push('vitest@^5');
  } else {
    const vitestMajor = Number(major(vitestVersion ?? ''));
    if (Number.isFinite(vitestMajor) && vitestMajor < 5) {
      notes.push(
        `vitest ${vitestVersion} is installed, but vitest-expo requires Vitest 5 — upgrade with: npm install -D vitest@^5`
      );
    } else {
      present.push('vitest');
    }
  }

  // The renderer is a peer of @testing-library/react-native, and which package
  // that is depends on its major: 14 moved to the standalone `test-renderer`,
  // 13 and earlier use `react-test-renderer` locked to the React version.
  // npm installs peers automatically, so a wrong entry only surfaces on yarn
  // or a strict pnpm layout — worth getting right here.
  const reactVersion = installedVersion(require, 'react') ?? declared.react;
  const rntlVersion =
    installedVersion(require, '@testing-library/react-native') ??
    declared['@testing-library/react-native'];
  const rntlMajor = Number(major(rntlVersion ?? ''));

  if (Number.isFinite(rntlMajor) && rntlMajor >= 14) {
    const version = installedVersion(require, 'test-renderer') ?? declared['test-renderer'];
    if (version) present.push('test-renderer');
    else missing.push('test-renderer@^1');
  } else {
    const rendererVersion =
      installedVersion(require, 'react-test-renderer') ?? declared['react-test-renderer'];
    if (!rendererVersion) {
      missing.push(reactVersion ? `react-test-renderer@${reactVersion}` : 'react-test-renderer');
    } else {
      present.push('react-test-renderer');
      if (reactVersion && major(reactVersion) !== major(rendererVersion)) {
        notes.push(
          `react-test-renderer ${rendererVersion} does not match react ${reactVersion} — install react-test-renderer@${reactVersion}`
        );
      }
    }
  }

  // The native engine runs the RN Babel pipeline in Node, so both have to be
  // resolvable from the project even though nothing imports them directly.
  need('@react-native/babel-preset');
  // Babel 8 is npm's latest, but @react-native/babel-preset requires 7.
  need('@babel/core', '@babel/core@^7');
  const babelVersion = installedVersion(require, '@babel/core') ?? declared['@babel/core'];
  if (babelVersion && Number(major(babelVersion)) >= 8) {
    notes.push(
      `the project uses @babel/core ${babelVersion}, but the React Native Babel preset requires 7 — install @babel/core@^7`
    );
  }

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

/** A peer range from this package's own manifest ('*' when it cannot be read). */
function ownPeerRange(name: string): string {
  try {
    const own = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return own.peerDependencies?.[name] ?? '*';
  } catch {
    return '*';
  }
}

/** Whether a version (or a declared range's base) is below the floor of a range. */
function isBelow(version: string, range: string): boolean {
  const floor = numeric(range);
  const value = numeric(version);
  if (!floor || !value) return false;
  for (let i = 0; i < 3; i++) {
    if (value[i] !== floor[i]) return value[i] < floor[i];
  }
  return false;
}

function numeric(spec: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(spec);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
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
