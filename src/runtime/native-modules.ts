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
 * pass through untouched. Everything else is answered from data, in order:
 *
 *   1. the mock the package itself ships (package-native-mocks.ts) — authored
 *      against the installed version, so it is the most current description,
 *   2. vitest-expo's overlay (module-spec-overrides.ts),
 *   3. the vendored module specs (expo-module-specs.ts), including the
 *      per-module constants and method lists they carry.
 *
 * Generic conventions (`*Async` → Promise, PascalCase → native class) are the
 * last resort for modules no data describes.
 */
import { vi } from 'vitest';
import { EXPO_MODULE_SPECS, type ModulePropertySpec } from './expo-module-specs';
import { MODULE_SPEC_OVERRIDES } from './module-spec-overrides';
import { packageNativeMock } from './package-native-mocks';

/**
 * Native modules that must read as ABSENT in tests. vitest-native's registry
 * claims every module exists (`has` is always true), but some Expo code uses
 * module presence as an environment probe: `isRunningInExpoGo()` is just
 * "does the ExpoGo native module exist" — and with it truthy, expo-notifications
 * throws on Android. Tests model a dev/standalone build, not Expo Go.
 *
 * `EXDevLauncher` is the same kind of probe on the legacy bridge: expo-constants
 * treats its presence as "a development launcher supplied the manifest" and
 * parses `NativeModules.EXDevLauncher.manifestString` as JSON. The module ships
 * only in development clients — no Expo mock data describes it — so it reads as
 * absent here, and the manifest comes from the app config instead.
 */
export const ABSENT_NATIVE_MODULES = new Set(['ExpoGo', 'EXDevLauncher']);

/**
 * Per-Expo-module data carried inside the `NativeUnimoduleProxy` spec: the
 * constants each module exports (`modulesConstants`) and the names of its
 * native methods (`exportedMethods`). Both describe the SAME module surface
 * the modern registry (`globalThis.expo.modules.<Name>`) serves — jest-expo
 * materializes them into `NativeModulesProxy` and then hands that object to
 * `requireNativeModule()`, so this is the data behind every Expo module's
 * mocked native layer, not just the legacy proxy's.
 */
const PROXY_SPEC = EXPO_MODULE_SPECS.NativeUnimoduleProxy;

const MODULE_CONSTANT_SPECS = (PROXY_SPEC?.modulesConstants?.mockDefinition ?? {}) as Record<
  string,
  Record<string, ModulePropertySpec>
>;

const MODULE_METHOD_NAMES: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(
    (PROXY_SPEC?.exportedMethods?.mock ?? {}) as Record<string, { name?: string }[]>
  ).map(([moduleName, methods]) => [
    moduleName,
    new Set((methods ?? []).map((method) => method?.name).filter((n): n is string => !!n)),
  ])
);

/** Native methods resolve on device; jest-expo mocks them as resolved promises. */
const NATIVE_METHOD_SPEC: ModulePropertySpec = { type: 'function', functionType: 'promise' };

/** Every property name the specs describe for a module, in jest-expo's order. */
function specPropertyNames(moduleName: PropertyKey): string[] {
  if (typeof moduleName !== 'string') return [];
  return [
    ...new Set([
      ...Object.keys(EXPO_MODULE_SPECS[moduleName] ?? {}),
      ...Object.keys(MODULE_CONSTANT_SPECS[moduleName] ?? {}),
      ...(MODULE_METHOD_NAMES[moduleName] ?? []),
      ...Object.keys(MODULE_SPEC_OVERRIDES[moduleName] ?? {}),
    ]),
  ];
}

/** Whether any data source describes this module's surface. */
function isDescribed(moduleName: string): boolean {
  return (
    moduleName in MODULE_SPEC_OVERRIDES ||
    moduleName in EXPO_MODULE_SPECS ||
    moduleName in MODULE_CONSTANT_SPECS ||
    moduleName in MODULE_METHOD_NAMES ||
    packageNativeMock(moduleName) !== null
  );
}

function specFor(moduleName: string, prop: string): ModulePropertySpec | undefined {
  const known =
    MODULE_SPEC_OVERRIDES[moduleName]?.[prop] ??
    EXPO_MODULE_SPECS[moduleName]?.[prop] ??
    MODULE_CONSTANT_SPECS[moduleName]?.[prop];
  if (known) return known;
  return MODULE_METHOD_NAMES[moduleName]?.has(prop) ? NATIVE_METHOD_SPEC : undefined;
}

/**
 * The legacy bridge (`NativeModules.<Name>`) is a second registry with its own
 * fabricating stub, and it answers to a different lookup than the modern one:
 * an explicit module mock wins, but a missing module still reads as a stub
 * whose every property is a callable. Absent-by-design modules therefore get an
 * empty mock here — present, but without the properties whose mere existence
 * would be read as "this environment supplies the value".
 */
function modelAbsentLegacyBridgeModules(): void {
  const g = globalThis as any;
  const mocks = (g.__vitest_native_module_mocks ??= {});
  for (const name of ABSENT_NATIVE_MODULES) {
    if (!(name in mocks)) mocks[name] = {};
  }
}

export function hardenExpoNativeModuleRegistry(): void {
  const g = globalThis as any;
  modelAbsentLegacyBridgeModules();
  const original = g.expo?.modules;
  // The registry proxy answers EVERY property access with a stub, so the
  // installed-marker must live outside of it.
  if (!original || g.__vitest_expo_registry_hardened) return;
  g.__vitest_expo_registry_hardened = true;

  // The engine's SharedObject stub carries the EventEmitter surface but not
  // the native lifecycle: `release()` exists on every real shared object, and
  // hooks like expo-video's useReleasingSharedObject call it in cleanup.
  const sharedObjectProto = g.expo?.SharedObject?.prototype;
  if (sharedObjectProto && typeof sharedObjectProto.release !== 'function') {
    sharedObjectProto.release = function release() {};
  }

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
          const shipped = packageNativeMock(name);
          if (shipped && prop in shipped) return shipped[prop];
          const property = specFor(name, prop);
          if (property) return specMock(name, prop, property);
          if (prop.endsWith('Async')) return () => Promise.resolve(undefined);
          if (/^[A-Z]/.test(prop)) return fabricatedClass(name, prop);
          // A described module has a known surface: everything outside it is a
          // property the platform does not supply either, and package JS reads
          // exactly that difference (`appOwnership ?? null`). Fabricating a
          // callable here would answer "yes" to every such question.
          if (isDescribed(name)) return undefined;
        }
        return target[prop];
      },
      // Spec-described properties must ENUMERATE, not just answer reads: package
      // JS copies native modules wholesale (`const { name, ...rest } = Module`)
      // and everything invisible to Object.keys is silently lost. This is what
      // makes a data-described module behave like the plain object Jest builds.
      ownKeys: (target) => [
        ...new Set([
          // Internal bookkeeping of the underlying stub (leading underscore) is
          // not part of the module's surface and must not leak into copies.
          ...Reflect.ownKeys(target).filter(
            (key) =>
              typeof key !== 'string' ||
              !key.startsWith('_') ||
              // A non-configurable key cannot be hidden without breaking the
              // proxy invariants.
              Reflect.getOwnPropertyDescriptor(target, key)?.configurable === false
          ),
          ...Object.keys(packageNativeMock(String(name)) ?? {}),
          ...specPropertyNames(name),
        ]),
      ],
      getOwnPropertyDescriptor(target, prop) {
        const own = Reflect.getOwnPropertyDescriptor(target, prop);
        if (own) return own;
        if (typeof prop !== 'string' || typeof name !== 'string') return undefined;
        const shipped = packageNativeMock(name);
        const property = specFor(name, prop);
        if (!property && !(shipped && prop in shipped)) return undefined;
        return {
          value: shipped && prop in shipped ? shipped[prop] : specMock(name, prop, property!),
          enumerable: true,
          configurable: true,
          writable: true,
        };
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
