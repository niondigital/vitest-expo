/**
 * Conformance: compile-time semantics.
 *
 * Under jest-expo the code below is transformed by babel-preset-expo (caller
 * `metro`, platform ios/android), which inlines a set of build-time values and
 * downlevels modern syntax for Hermes. Under vitest-expo it is transformed by
 * Vite (esbuild, target esnext) with no Expo Babel pass at all, and the same
 * values are provided at runtime instead.
 *
 * Every assertion here is a semantic that app code can legitimately observe, so
 * the file passing under both runners is the parity proof. The full feature
 * table, including the differences that are deliberately not papered over, is
 * in internal/babel-parity-audit.md.
 */
import { Platform } from 'react-native';

// `export * as ns from` is proposal syntax that babel-preset-expo transforms
// explicitly (it must run after the TypeScript pass). Vite/esbuild treat it as
// standard ES2020. Declared at module level so both pipelines have to parse it.
export * as testUtils from './test-utils';

describe('environment inlining', () => {
  it('exposes EXPO_OS as the platform under test', () => {
    expect(process.env.EXPO_OS).toBe(Platform.OS);
    expect(['ios', 'android']).toContain(process.env.EXPO_OS);
  });

  it('takes the branch a platform-conditional guard selects', () => {
    // The shape of platform-gated app code: babel-preset-expo folds this to a
    // constant, our pipeline evaluates it at runtime — same outcome either way.
    let taken: string;
    if (process.env.EXPO_OS === 'ios') {
      taken = 'ios';
    } else if (process.env.EXPO_OS === 'android') {
      taken = 'android';
    } else {
      taken = 'unknown';
    }
    expect(taken).toBe(Platform.OS);
  });

  it('reports NODE_ENV as test', () => {
    // babel-preset-expo only inlines NODE_ENV in production builds, so both
    // runners read the real value here.
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('resolves expo-router import mode to sync', () => {
    expect(process.env.EXPO_ROUTER_IMPORT_MODE).toBe('sync');
  });

  it('exposes the project root and leaves the router-root variables unset', () => {
    expect(process.env.EXPO_PROJECT_ROOT).toBeTruthy();
    expect(process.env.EXPO_PROJECT_ROOT?.replace(/\\/g, '/')).toMatch(/\/examples\/app$/);
    // The router-root transform is skipped under NODE_ENV=test — expo-router's
    // testing utilities supply the route map instead.
    expect(process.env.EXPO_ROUTER_APP_ROOT).toBeUndefined();
    expect(process.env.EXPO_ROUTER_ABS_APP_ROOT).toBeUndefined();
  });

  it('leaves the base URL unset in tests', () => {
    expect(process.env.EXPO_BASE_URL).toBeUndefined();
  });

  it('treats the server flag as falsy on a client build', () => {
    // jest-expo inlines a literal `false` here, vitest-expo leaves it unset.
    // Truthiness — the way app code actually uses it — agrees.
    expect(process.env.EXPO_SERVER).toBeFalsy();
  });

  it('reads EXPO_PUBLIC_ variables from the environment at runtime', () => {
    // In a development/test transform babel-preset-expo rewrites these reads to
    // `expo/virtual/env`, which re-exports process.env — so both runners end up
    // reading the same live object.
    process.env.EXPO_PUBLIC_PARITY_PROBE = 'from-process-env';
    expect(process.env.EXPO_PUBLIC_PARITY_PROBE).toBe('from-process-env');
    delete process.env.EXPO_PUBLIC_PARITY_PROBE;
  });
});

describe('global definitions', () => {
  it('defines __DEV__ as true', () => {
    expect(typeof __DEV__).toBe('boolean');
    expect(__DEV__).toBe(true);
  });

  it('exposes __DEV__ as a global, not only as an inlined literal', () => {
    // babel-preset-expo only substitutes __DEV__ in production; in tests it
    // stays a real global under both runners, so indirect reads work.
    expect((globalThis as Record<string, unknown>).__DEV__).toBe(true);
  });

  it('runs in a native-like global scope', () => {
    // `typeof window` is only folded for server bundles, so both runners see
    // the runtime globals a React Native test environment sets up.
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('undefined');
  });
});

describe('Platform folding', () => {
  it('evaluates Platform.select at runtime', () => {
    // The Platform.select minifier is production-only; in tests the real
    // runtime implementation must answer.
    expect(Platform.select({ ios: 'i', android: 'a', default: 'd' })).toBe(
      Platform.OS === 'ios' ? 'i' : 'a'
    );
    expect(Platform.select({ native: 'n', default: 'd' })).toBe('n');
  });

  it('keeps Platform.OS readable through an indirect reference', () => {
    // Only a production build replaces `Platform.OS` with a string literal; an
    // aliased read has to work identically in both pipelines.
    const platformModule = Platform;
    expect(platformModule.OS).toBe(process.env.EXPO_OS);
  });
});

describe('syntax downleveling', () => {
  it('spreads objects by value, not by descriptor', () => {
    // babel-preset-expo deliberately overrides the React Native preset's object
    // spread configuration so getters are evaluated rather than re-installed.
    let reads = 0;
    const source = {
      get answer() {
        reads += 1;
        return 42;
      },
    };
    const spread = { ...source };
    expect(spread.answer).toBe(42);
    expect(Object.getOwnPropertyDescriptor(spread, 'answer')?.get).toBeUndefined();
    expect(reads).toBe(1);
  });

  it('supports class static blocks, private methods and class fields', () => {
    class Counter {
      static created: string[] = [];
      static {
        Counter.created.push('static-block');
      }
      #value = 0;
      #bump() {
        this.#value += 1;
        return this.#value;
      }
      get next() {
        return this.#bump();
      }
    }
    const counter = new Counter();
    expect(Counter.created).toEqual(['static-block']);
    expect(counter.next).toBe(1);
    expect(counter.next).toBe(2);
  });

  it('supports async generators and for-await', async () => {
    async function* numbers() {
      yield 1;
      yield 2;
    }
    const collected: number[] = [];
    for await (const value of numbers()) collected.push(value);
    expect(collected).toEqual([1, 2]);
  });

  it('supports optional chaining, nullish coalescing and logical assignment', () => {
    const value: { nested?: { deep?: string } } = {};
    expect(value.nested?.deep).toBeUndefined();
    expect(value.nested?.deep ?? 'fallback').toBe('fallback');
    const target: { count?: number } = {};
    target.count ??= 7;
    target.count ||= 9;
    expect(target.count).toBe(7);
  });

  it('keeps block scoping per iteration', () => {
    // Downleveled by the Hermes profile under jest-expo, native under Vite.
    const fns: (() => number)[] = [];
    for (let i = 0; i < 3; i++) fns.push(() => i);
    expect(fns.map((fn) => fn())).toEqual([0, 1, 2]);
  });
});
