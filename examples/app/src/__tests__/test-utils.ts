/**
 * Runner shim: exposes the mocking API under one name so the same test
 * files run under Jest (jest-expo) and Vitest (vitest-expo). `jest.*` vs
 * `vi.*` is the only API-level divergence the tests themselves need to
 * bridge — and with jestCompat enabled, even that is optional (the `jest`
 * global exists under both runners); the shim also identifies the runner
 * for the few assertions that differ by design.
 *
 * Note: Jest injects `jest` into module scope (not globalThis), Vitest
 * exposes `vi` on globalThis with globals:true — hence the two lookups.
 */
declare const jest: any;

const g = globalThis as any;

export const mock: {
  fn: (impl?: (...args: any[]) => any) => any;
  useFakeTimers: () => void;
  useRealTimers: () => void;
  advanceTimersByTime: (ms: number) => void;
} = g.vi ?? (typeof jest !== 'undefined' ? jest : undefined);

export const runner: 'vitest' | 'jest' = g.vi ? 'vitest' : 'jest';
