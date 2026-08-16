/**
 * Hardening of vitest-native's `globalThis.expo.modules` native-module registry.
 *
 * vitest-native serves a permissive stub for ANY module name whose fabricated
 * methods return `undefined`. Two Expo conventions break under that:
 *
 *  1. `*Async` native methods return Promises on device. Import-time side
 *     effects chain on them (e.g. expo-notifications'
 *     `ServerRegistrationModule.getRegistrationInfoAsync().then(...)`), so a
 *     fabricated method must resolve (to null — jest-expo's default) instead
 *     of returning undefined.
 *  2. Some modules need well-typed non-Async surfaces (e.g. expo-image reads
 *     `ExpoObserve.getIntegrations()['expo-image']`).
 *
 * We wrap the registry: explicit properties (spies, preset stubs' own state)
 * pass through untouched. Fabricated lookups are served from data specs —
 * vitest-expo's overlay (module-spec-overrides.ts) → jest-expo's vendored
 * module specs (expo-module-specs.ts) — materialized with the same semantics
 * as jest-expo's setup.js but as vi.fn mocks. Generic conventions
 * (`*Async` → Promise, PascalCase → native class) are the last resort for
 * modules no spec knows.
 */
import { vi } from 'vitest';
import { EXPO_MODULE_SPECS, type ModulePropertySpec } from './expo-module-specs';
import { MODULE_SPEC_OVERRIDES } from './module-spec-overrides';

/**
 * Native modules that must read as ABSENT in tests. vitest-native's registry
 * claims every module exists (`has` is always true), but some Expo code uses
 * module presence as an environment probe: `isRunningInExpoGo()` is just
 * "does the ExpoGo native module exist" — and with it truthy, expo-notifications
 * throws on Android. Tests model a dev/standalone build, not Expo Go.
 */
export const ABSENT_NATIVE_MODULES = new Set(['ExpoGo']);

function specFor(moduleName: string, prop: string): ModulePropertySpec | undefined {
  return MODULE_SPEC_OVERRIDES[moduleName]?.[prop] ?? EXPO_MODULE_SPECS[moduleName]?.[prop];
}

export function hardenExpoNativeModuleRegistry(): void {
  const g = globalThis as any;
  const original = g.expo?.modules;
  // The registry proxy answers EVERY property access with a stub, so the
  // installed-marker must live outside of it.
  if (!original || g.__vitest_expo_registry_hardened) return;
  g.__vitest_expo_registry_hardened = true;

  const wrapperCache = new Map<PropertyKey, unknown>();
  const classCache = new Map<string, unknown>();
  const specMockCache = new Map<string, unknown>();

  // jest-expo's mock() semantics (setup.js) plus the `returns` extension,
  // materialized as vi.fn mocks and memoized per module+property so identities
  // are stable and spy-able.
  const materializeSpec = (property: ModulePropertySpec): unknown => {
    if (property.mock !== undefined) return property.mock;
    switch (property.type) {
      case 'function':
        return property.functionType === 'promise'
          ? vi.fn(async () => property.returns)
          : vi.fn(() => property.returns);
      case 'number':
        return 1;
      case 'string':
        return 'mock';
      case 'array':
        return [];
      case 'mock': {
        const result: Record<string, Record<string, unknown>> = {};
        for (const [group, props] of Object.entries(property.mockDefinition ?? {})) {
          result[group] = Object.fromEntries(
            Object.entries(props).map(([k, p]) => [k, materializeSpec(p)])
          );
        }
        return result;
      }
      default:
        return {};
    }
  };

  const specMock = (moduleName: string, prop: string, property: ModulePropertySpec): unknown => {
    const key = `${moduleName}.${prop}`;
    if (!specMockCache.has(key)) {
      specMockCache.set(key, materializeSpec(property));
    }
    return specMockCache.get(key);
  };

  // Expo native classes (SharedObjects like FileSystemFile) are subclassed by
  // package JS (`class File extends ExpoFileSystem.FileSystemFile`); a plain
  // function stub breaks `extends`. Serve a memoized class on SharedObject's
  // prototype chain so EventEmitter methods and instanceof keep working.
  const fabricatedClass = (moduleName: string, prop: string) => {
    const key = `${moduleName}.${prop}`;
    if (!classCache.has(key)) {
      const Base = (g.expo?.SharedObject ?? class {}) as new () => object;
      classCache.set(key, class FabricatedNativeClass extends Base {});
    }
    return classCache.get(key);
  };

  const wrapModuleStub = (name: PropertyKey, stub: any) =>
    new Proxy(stub, {
      get(target, prop) {
        // `prop in target` only sees explicitly-set properties — vitest-native's
        // stub proxy has no `has` trap, so fabricated methods are invisible here.
        if (!(prop in target) && typeof prop === 'string' && typeof name === 'string') {
          const property = specFor(name, prop);
          if (property) return specMock(name, prop, property);
          if (prop.endsWith('Async')) return () => Promise.resolve(undefined);
          if (/^[A-Z]/.test(prop)) return fabricatedClass(name, prop);
        }
        return target[prop];
      },
    });

  g.expo.modules = new Proxy(original, {
    get(target, prop) {
      if (typeof prop === 'string' && ABSENT_NATIVE_MODULES.has(prop)) return undefined;
      if (!wrapperCache.has(prop)) {
        const stub = target[prop];
        wrapperCache.set(
          prop,
          stub && (typeof stub === 'object' || typeof stub === 'function')
            ? wrapModuleStub(prop, stub)
            : stub
        );
      }
      return wrapperCache.get(prop);
    },
    has: (target, prop) => {
      if (typeof prop === 'string' && ABSENT_NATIVE_MODULES.has(prop)) return false;
      return prop in target || Reflect.has(target, prop);
    },
  });
}
