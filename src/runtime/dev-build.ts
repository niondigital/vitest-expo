/**
 * Two things tests should read the way a development build reads them, which
 * the engine (following jest-expo) answers the Expo Go way.
 *
 * Absent modules: some Expo code uses a native module's presence as an
 * environment probe. `isRunningInExpoGo()` is just "does the ExpoGo module
 * exist", and with it truthy expo-notifications skips registration and throws
 * on Android. jest-expo keeps the module present on purpose; here the test
 * environment is a dev build, so the module reads as absent. `EXDevLauncher`
 * is the same kind of probe on the legacy bridge: expo-constants treats its
 * presence as "a development launcher supplied the manifest".
 *
 * Shared objects: expo-modules-core's SharedObject has `release()`, which the
 * `useReleasingSharedObject` hooks (expo-video, expo-audio, expo-image) call on
 * unmount. The engine's stand-in lacks it, so every unmount logged a TypeError.
 */
const ABSENT_NATIVE_MODULES = new Set(['ExpoGo', 'EXDevLauncher']);

export function installDevBuildModel(): void {
  const g = globalThis as any;

  // The engine consults this resolver on the first access of each module, from
  // both the `get` and `has` traps of `globalThis.expo.modules`. Wrapping it
  // here, before any Expo package loads, keeps the engine's own layers intact
  // for everything else.
  const resolver = g.__vitest_native_expo_modules;
  if (resolver && typeof resolver.present === 'function' && !resolver.__vitestExpoAbsent) {
    const present = resolver.present.bind(resolver);
    resolver.present = (name: string) => !ABSENT_NATIVE_MODULES.has(name) && present(name);
    resolver.__vitestExpoAbsent = true;
  }

  const proto = g.expo?.SharedObject?.prototype;
  if (proto && typeof proto.release !== 'function') {
    proto.release = function release() {};
  }
}
