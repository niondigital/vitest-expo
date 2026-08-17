/**
 * Native-module mocks that Expo packages ship for test runners.
 *
 * A package can place a file named after a native module in its `mocks/`
 * directory (`expo-localization/mocks/ExpoLocalization.ts`); it is the package
 * author's own account of how that native module behaves without a device —
 * real locale data, real return shapes — and it tracks the package version
 * instead of a snapshot of it. Where such a mock exists it therefore takes
 * precedence over generated stubs; anything it leaves out still falls back to
 * the generic module layer.
 *
 * The files are TypeScript sources authored for Jest, so they may reference the
 * `jest` global. Loading them supplies a minimal, correctly-scoped stand-in:
 * `fn` records calls like any other mock, and `requireActual` resolves relative
 * to the mock file (the mocks import sibling sources of their own package).
 */
import { createRequire } from 'node:module';
import { vi } from 'vitest';

type NativeMock = Record<string, unknown>;

let mockPaths: Record<string, string> | null = null;
const loaded = new Map<string, NativeMock | null>();

function paths(): Record<string, string> {
  if (!mockPaths) {
    try {
      mockPaths = JSON.parse(process.env.VITEST_EXPO_PACKAGE_MOCKS ?? '{}');
    } catch {
      mockPaths = {};
    }
  }
  return mockPaths ?? {};
}

/** Mirrors how the Expo Jest preset materializes a package mock. */
function materialize(moduleExports: NativeMock): NativeMock {
  const result: NativeMock = {};
  for (const [key, value] of Object.entries(moduleExports)) {
    if (key === 'default' || key === '__esModule') continue;
    // Classes are copied as-is: wrapping them would break the prototype chain
    // that package JS extends.
    const isClass =
      typeof value === 'function' && Object.getOwnPropertyNames((value as any).prototype ?? {}).length > 1;
    result[key] =
      typeof value === 'function' && !isClass ? vi.fn(value as (...args: unknown[]) => unknown) : value;
  }
  return result;
}

function withJestGlobal<T>(mockPath: string, load: () => T): T {
  const g = globalThis as any;
  const previous = g.jest;
  const requireFromMock = createRequire(mockPath);
  g.jest = {
    ...previous,
    fn: (implementation?: (...args: unknown[]) => unknown) => vi.fn(implementation as any),
    requireActual: (request: string) => requireFromMock(request),
  };
  try {
    return load();
  } finally {
    if (previous === undefined) delete g.jest;
    else g.jest = previous;
  }
}

/**
 * The mock a package ships for `moduleName`, or null when there is none (or it
 * cannot be loaded — a mock written against a different runner must never fail
 * the run; the generic module layer serves that module instead).
 */
export function packageNativeMock(moduleName: string): NativeMock | null {
  if (loaded.has(moduleName)) return loaded.get(moduleName) ?? null;

  const mockPath = paths()[moduleName];
  let result: NativeMock | null = null;
  if (mockPath) {
    try {
      const required = withJestGlobal(mockPath, () => createRequire(mockPath)(mockPath));
      const moduleExports = (required?.default && required.__esModule ? required : required) as NativeMock;
      result = materialize(moduleExports);
    } catch {
      result = null;
    }
  }
  loaded.set(moduleName, result);
  return result;
}
