/**
 * Project-level mock wall (the pattern real apps use for their special
 * libraries): a user setup file registering stateful fakes with jest.mock,
 * loaded ALONGSIDE vitest-expo's injected setup. Registered here for every
 * test file of the suite — 18-setup-mock-wall.test.tsx proves it works under
 * both runners. (The `jest` global is declared in test-globals.d.ts — an
 * in-file declare would break babel-plugin-jest-hoist's factory validation.)
 */
// Library-documented Jest setup that jest-expo does not ship (gesture-handler's
// jestSetup, safe-area-context's official mock). Only needed on the Jest side —
// vitest-expo's built-in presets cover both. doMock stays unhoisted, so the
// guard actually applies.
const isVitest = typeof (globalThis as any).vi !== 'undefined';
if (!isVitest) {
  require('react-native-gesture-handler/jestSetup');
  jest.doMock('react-native-safe-area-context', () =>
    require('react-native-safe-area-context/jest/mock').default
  );
}

// async-storage ships an official mock and documents wiring it up exactly like
// this — required under jest-expo (NativeModule is null otherwise); under
// vitest-expo it simply overrides the built-in stateful preset.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-notifications', () => {
  const scheduled: Array<Record<string, unknown>> = [];
  return {
    scheduleNotificationAsync: jest.fn(async (request: Record<string, unknown>) => {
      scheduled.push(request);
      return `id-${scheduled.length}`;
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled]),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      scheduled.length = 0;
    }),
    setNotificationHandler: jest.fn(),
  };
});
