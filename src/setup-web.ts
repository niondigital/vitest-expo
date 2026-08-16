/**
 * Runtime test setup for the web platform (injected via vitestExpo({ platform:
 * 'web' })). Web tests run react-native-web in jsdom — no native boundary, so
 * none of the native-module layer applies. What's left mirrors jest-expo's
 * web setup plus the curated snapshot serializer.
 */
import Module from 'node:module';
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
  }
}

const g = globalThis as any;

// react-native-web reads __DEV__ (bundlers inline it).
if (typeof g.__DEV__ === 'undefined') g.__DEV__ = true;

// react-native-web probes ShadowRoot, which jsdom doesn't provide.
if (typeof g.ShadowRoot === 'undefined') g.ShadowRoot = function ShadowRoot() {};
