/**
 * Runtime test setup for the web platform (injected via vitestExpo({ platform:
 * 'web' })). Web tests run react-native-web in jsdom — no native boundary, so
 * none of the native-module layer applies. What's left mirrors jest-expo's
 * web setup plus the curated snapshot serializer.
 */
import Module from 'node:module';
import path from 'node:path';
import { expect } from 'vitest';
import { jestExpoSnapshotSerializer } from './snapshot/serializer';

expect.addSnapshotSerializer(jestExpoSnapshotSerializer);

// The react-native → react-native-web mapping must hold in BOTH module worlds.
// The Vite alias covers the test graph; externalized packages (RNTL and
// friends) require('react-native') through Node — rewrite it there too,
// mirroring jest-expo/web's moduleNameMapper `^react-native$`.
{
  const g = globalThis as any;
  if (!g.__vitest_expo_web_resolution) {
    g.__vitest_expo_web_resolution = true;
    const original = (Module as any)._resolveFilename;
    (Module as any)._resolveFilename = function (
      this: unknown,
      request: string,
      ...rest: unknown[]
    ) {
      return original.call(this, request === 'react-native' ? 'react-native-web' : request, ...rest);
    };

    // The jest-compat setup gives `View.prototype` React Native's native
    // methods, reading them from the native component registry through Node.
    // There is no native view on web, and that registry is Flow source no
    // engine compiles here, so Node cannot even parse it. An empty registry is
    // what the web has: the setup then finds no methods and leaves View as
    // react-native-web defines it.
    // Resolved the way the jest-compat setup resolves it (from the engine's
    // install), and from the project, in case the two find different copies.
    const own = Module.createRequire(import.meta.url);
    const bases: string[] = [process.cwd()];
    try {
      bases.unshift(path.dirname(own.resolve('vitest-native')));
    } catch {
      // No engine installed: jest-compat is not either.
    }
    for (const base of bases) {
      try {
        const registry = own.resolve('react-native/Libraries/NativeComponent/NativeComponentRegistry', {
          paths: [base],
        });
        if ((Module as any)._cache[registry]) continue;
        const empty = new Module(registry);
        empty.filename = registry;
        empty.loaded = true;
        (Module as any)._cache[registry] = empty;
      } catch {
        // react-native not reachable from there: nothing there will load it.
      }
    }
  }
}

const g = globalThis as any;

// react-native-web reads __DEV__ (bundlers inline it).
if (typeof g.__DEV__ === 'undefined') g.__DEV__ = true;

// react-native-web probes ShadowRoot, which jsdom doesn't provide.
if (typeof g.ShadowRoot === 'undefined') g.ShadowRoot = function ShadowRoot() {};
