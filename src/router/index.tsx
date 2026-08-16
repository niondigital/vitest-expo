/**
 * Vitest port of `expo-router/testing-library`.
 *
 * expo-router's own testing library is hard-coupled to Jest: its module scope
 * registers Jest module mocks (reanimated, gesture-handler, expo-linking) and
 * `renderRouter` drives Jest fake timers. Under vitest-native the
 * library mocks are already provided by presets, so this port only needs the
 * runner-agnostic pieces (mock-config/context-stubs are reused straight from
 * expo-router) plus `vi`-based timer handling and vitest matchers.
 */
import React from 'react';
import { vi, expect } from 'vitest';
import * as rntl from '@testing-library/react-native';
// Runner-agnostic internals reused from expo-router (no `exports` field, deep
// imports are stable within a pinned minor).
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { router } from 'expo-router/build/imperative-api';
import {
  getMockConfig,
  getMockContext,
  type MockContextConfig,
} from 'expo-router/build/testing-library/mock-config';

export { getMockConfig, getMockContext };
export type { MockContextConfig };


// Re-export the full RNTL surface like expo-router/testing-library does, so
// tests can import everything from one place.
export * from '@testing-library/react-native';
export const screen: typeof rntl.screen = new Proxy({} as typeof rntl.screen, {
  get: (_target, prop) => (rntl.screen as any)[prop],
});

export type RenderRouterOptions = Parameters<typeof rntl.render>[1] & {
  initialUrl?: string;
  linking?: Record<string, unknown>;
};

type RenderResult = Awaited<ReturnType<typeof rntl.render>>;

export interface RouterRenderResult extends RenderResult {
  getPathname(): string;
  getPathnameWithParams(): string;
  getSegments(): string[];
  getSearchParams(): Record<string, string | string[]>;
  getRouterState(): unknown;
}

const routerInfoHelpers = {
  getPathname(): string {
    return store.getRouteInfo().pathname;
  },
  getSegments(): string[] {
    return store.getRouteInfo().segments;
  },
  getSearchParams(): Record<string, string | string[]> {
    return store.getRouteInfo().params;
  },
  getPathnameWithParams(): string {
    return store.getRouteInfo().pathnameWithParams;
  },
  getRouterState(): unknown {
    return store.state;
  },
};

export async function renderRouter(
  context: MockContextConfig = './app',
  { initialUrl = '/', linking, ...options }: RenderRouterOptions = {}
): Promise<RouterRenderResult> {
  // Upstream forces fake timers so React Navigation's async state settles
  // deterministically (expo/expo#46864). shouldAdvanceTime keeps RNTL's
  // internal waitFor/findBy* helpers working under the faked clock.
  const systemTime = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(systemTime);

  const mockContext = getMockContext(context);

  // Force the render to be synchronous.
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';

  const result = await rntl.render(
    <ExpoRoot context={mockContext} location={initialUrl} linking={linking as never} />,
    options
  );

  return Object.assign(result, routerInfoHelpers);
}

// Unlike upstream (sync, pre-RNTL-14) these helpers are async: RNTL 14's act()
// returns a promise that must be awaited before asserting.
export const testRouter = {
  /** Navigate to the provided pathname and assert the pathname. */
  async navigate(path: string) {
    await rntl.act(() => router.navigate(path));
    expect(routerInfoHelpers.getPathnameWithParams()).toBe(path);
  },
  /** Push the provided pathname and assert the pathname. */
  async push(path: string) {
    await rntl.act(() => router.push(path));
    expect(routerInfoHelpers.getPathnameWithParams()).toBe(path);
  },
  /** Replace with the provided pathname and assert the pathname. */
  async replace(path: string) {
    await rntl.act(() => router.replace(path));
    expect(routerInfoHelpers.getPathnameWithParams()).toBe(path);
  },
  /** Go back in history and assert the new pathname. */
  async back(path?: string) {
    expect(router.canGoBack()).toBe(true);
    await rntl.act(() => router.back());
    if (path) {
      expect(routerInfoHelpers.getPathnameWithParams()).toBe(path);
    }
  },
  canGoBack(): boolean {
    return router.canGoBack();
  },
  /** Update the current route query params and assert the new pathname. */
  async setParams(params: Record<string, string>, path?: string) {
    await rntl.act(() => router.setParams(params));
    if (path) {
      expect(routerInfoHelpers.getPathnameWithParams()).toBe(path);
    }
  },
  async dismissAll() {
    await rntl.act(() => router.dismissAll());
  },
};

/** Matchers ported from expo-router/testing-library/expect. */
interface RouterScreen {
  getPathname(): string;
  getPathnameWithParams(): string;
  getSegments(): string[];
  getSearchParams(): Record<string, string | string[]>;
  getRouterState(): unknown;
}

expect.extend({
  toHavePathname(received: RouterScreen, expected: string) {
    const actual = received.getPathname();
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `Expected pathname${this.isNot ? ' not' : ''} to be ${this.utils.printExpected(expected)}, received ${this.utils.printReceived(actual)}`,
    };
  },
  toHavePathnameWithParams(received: RouterScreen, expected: string) {
    const actual = received.getPathnameWithParams();
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `Expected pathname with params${this.isNot ? ' not' : ''} to be ${this.utils.printExpected(expected)}, received ${this.utils.printReceived(actual)}`,
    };
  },
  toHaveSegments(received: RouterScreen, expected: string[]) {
    const actual = received.getSegments();
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `Expected segments${this.isNot ? ' not' : ''} to be ${this.utils.printExpected(expected)}, received ${this.utils.printReceived(actual)}`,
    };
  },
  toHaveSearchParams(received: RouterScreen, expected: Record<string, string | string[]>) {
    const actual = received.getSearchParams();
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `Expected search params${this.isNot ? ' not' : ''} to be ${this.utils.printExpected(expected)}, received ${this.utils.printReceived(actual)}`,
    };
  },
  toHaveRouterState(received: RouterScreen, expected: unknown) {
    const actual = received.getRouterState();
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `Expected router state${this.isNot ? ' not' : ''} to equal expected state`,
    };
  },
});

declare module 'vitest' {
  interface Assertion<T> {
    toHavePathname(expected: string): T;
    toHavePathnameWithParams(expected: string): T;
    toHaveSegments(expected: string[]): T;
    toHaveSearchParams(expected: Record<string, string | string[]>): T;
    toHaveRouterState(expected: unknown): T;
  }
}
