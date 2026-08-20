/**
 * Runtime test setup, injected via the vitestExpo() plugin.
 * Registered after vitest-native's own setup so serializers and registry
 * augmentations added here win.
 */
import { expect, vi } from 'vitest';
import { TurboModuleRegistry } from 'react-native';
import { jestExpoSnapshotSerializer } from './snapshot/serializer';
import { installErrorUtils } from './runtime/error-utils';
import {
  ABSENT_NATIVE_MODULES,
  hardenExpoNativeModuleRegistry,
} from './runtime/native-modules';
import { installNodeResolutionFallback } from './runtime/node-resolution';
import { installRequireActualAliases } from './runtime/require-actual-aliases';
import { applyAppConfig } from './modules/expo-constants';
import { applySymbolsMock } from './modules/expo-symbols';

expect.addSnapshotSerializer(jestExpoSnapshotSerializer);

installErrorUtils();
hardenExpoNativeModuleRegistry();
installRequireActualAliases();
installNodeResolutionFallback();

// Absent-module modeling must cover the TurboModule fallback too:
// requireOptionalNativeModule() falls through registry → NativeModulesProxy →
// TurboModuleRegistry.get(), and vitest-native's turbo stub also fabricates a
// module for any name.
{
  const originalGet = TurboModuleRegistry.get.bind(TurboModuleRegistry);
  (TurboModuleRegistry as any).get = (name: string) =>
    ABSENT_NATIVE_MODULES.has(name) ? null : originalGet(name);
}

applyAppConfig();
applySymbolsMock();

// expo-modules-core ships TypeScript source only (main: src/index.ts) — Node can
// never load it, and Expo packages transformed in-graph require() it synchronously.
// Routing it through the mocker pre-loads it via the async Vite pipeline (where
// vitest-native's globalThis.expo stub lets the real JS run) and satisfies those
// sync requires from the registry — the same boundary jest-expo mocks.
// Metro fills React Native's asset registry at bundle time; under a test runner
// it stays empty, so every metadata lookup by module id fails.
//
// The engine mocks this module too, but mirrors the real one: an empty array, so
// an id resolves to undefined. jest-expo answers any id with fixed metadata
// instead, which is what expo-asset and expo-font's loading paths need when a
// test passes a stand-in module id. Parity with jest-expo wins here, so this
// mock is registered after the engine's (see modules/assets-registry).
vi.mock('@react-native/assets-registry/registry', async () => {
  const { assetsRegistryMock } = await import('./modules/assets-registry');
  return assetsRegistryMock();
});

vi.mock('expo-modules-core', async () => {
  return await vi.importActual('expo-modules-core');
});

