/**
 * React Native's InitializeCore installs global.ErrorUtils on device; Jest's
 * react-native preset stubs it. `expo`'s Expo.fx reads it at import time, so
 * provide the same guard-through stub.
 */
export function installErrorUtils(): void {
  const g = globalThis as any;
  if (g.ErrorUtils) return;

  let globalHandler: ((error: unknown, isFatal?: boolean) => void) | null = null;
  g.ErrorUtils = {
    setGlobalHandler(handler: typeof globalHandler) {
      globalHandler = handler;
    },
    getGlobalHandler() {
      return globalHandler;
    },
    reportError(error: unknown) {
      globalHandler?.(error, false);
    },
    reportFatalError(error: unknown) {
      globalHandler?.(error, true);
    },
    applyWithGuard(fn: (...args: unknown[]) => unknown, context?: unknown, args?: unknown[]) {
      return fn.apply(context, args ?? []);
    },
    applyWithGuardIfNeeded(fn: (...args: unknown[]) => unknown, context?: unknown, args?: unknown[]) {
      return fn.apply(context, args ?? []);
    },
    inGuard() {
      return false;
    },
    guard(fn: (...args: unknown[]) => unknown) {
      return fn;
    },
  };
}
