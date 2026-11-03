import { vi } from 'vitest';

/**
 * Return values for native-module methods that Expo's own module data cannot
 * express. jest-expo's table marks a method as "resolves" or "returns" and
 * nothing more, so these resolve `undefined`; where the package's JavaScript
 * then reads the result (`(await …).map`), the documented API contract breaks
 * under jest-expo too, and apps mock the whole package to get around it. The
 * value is set on the engine's module stub, one layer below the package, so
 * the package's real code runs over it.
 */
const MODULE_VALUES: Record<string, Record<string, unknown>> = {
  ExpoNotificationScheduler: {
    getAllScheduledNotificationsAsync: [],
  },
};

export function applyModuleValues(): void {
  const modules = (globalThis as any).expo?.modules;
  if (!modules) return;
  for (const [name, members] of Object.entries(MODULE_VALUES)) {
    const module = modules[name];
    if (!module) continue;
    for (const [member, value] of Object.entries(members)) {
      // A fresh copy per call: a test that mutates the result must not see
      // its change in the next call.
      module[member] = vi.fn(async () => structuredClone(value));
    }
  }
}
