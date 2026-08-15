import Module, { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expandAlias, isFile } from './require-actual-aliases';

/**
 * Fallback for Node-side resolution of extensionless relative imports in
 * TypeScript-source packages (Expo ships those — e.g. expo/src/winter does
 * `require('./TextDecoder')` for a file named TextDecoder.ts). Metro resolves
 * these; Node's resolver stops at .js. Only consulted when the underlying
 * resolver (including vitest-native's patches) has already failed.
 */
const SUFFIXES = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

export function installNodeResolutionFallback(): void {
  const g = globalThis as any;
  if (g.__vitest_expo_resolution_fallback) return;
  g.__vitest_expo_resolution_fallback = true;

  // ESM side (runs in Node's loader thread): extensionless and type-only
  // relative imports in published packages.
  try {
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const loaderPath = require.resolve('vitest-expo/esm-loader');
    (Module as any).register?.(pathToFileURL(loaderPath).href);
  } catch {
    // Loader registration is best-effort; the CJS fallbacks below still apply.
  }

  const original = (Module as any)._resolveFilename;
  (Module as any)._resolveFilename = function (
    this: unknown,
    request: string,
    parent: { filename?: string } | undefined,
    ...rest: unknown[]
  ) {
    try {
      return original.call(this, request, parent, ...rest);
    } catch (error) {
      if (request.startsWith('.') && parent?.filename && !path.extname(request)) {
        const base = path.resolve(path.dirname(parent.filename), request);
        for (const suffix of SUFFIXES) {
          if (isFile(base + suffix)) return base + suffix;
        }
      }
      // Aliased specifiers appear transitively in Node-loaded app code
      // (a requireActual'd module importing '@/…' itself).
      const expanded = expandAlias(request);
      if (expanded !== request) {
        if (isFile(expanded)) return expanded;
        for (const suffix of SUFFIXES) {
          if (isFile(expanded + suffix)) return expanded + suffix;
        }
      }
      throw error;
    }
  };

  // The Babel toolchain itself must never run through the RN transform: with
  // nested installs (node_modules/@react-native/babel-preset/node_modules/…)
  // its own dependencies match the engine's react-native path detection and
  // the transformer recurses into itself. Compile toolchain files plain.
  const TOOLCHAIN = /[\\/]node_modules[\\/]@react-native[\\/]babel-preset[\\/]node_modules[\\/]/;
  const currentJs = (Module as any)._extensions['.js'];
  (Module as any)._extensions['.js'] = function (
    this: unknown,
    module: { _compile(code: string, filename: string): void },
    filename: string
  ) {
    if (TOOLCHAIN.test(filename)) {
      return module._compile(fs.readFileSync(filename, 'utf8'), filename);
    }
    return currentJs.call(this, module, filename);
  };

  // Loading counterpart: Node's built-in type stripping refuses .ts files
  // under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). When the
  // active handler (Node's, or an engine one scoped to detected packages)
  // throws, transpile with esbuild — Metro semantics for TS-source packages.
  const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
  const extensions = (Module as any)._extensions;
  for (const ext of ['.ts', '.tsx'] as const) {
    const previous = extensions[ext];
    extensions[ext] = function (
      this: unknown,
      module: { _compile(code: string, filename: string): void },
      filename: string
    ) {
      if (typeof previous === 'function') {
        try {
          return previous.call(this, module, filename);
        } catch {
          // fall through to the esbuild path below
        }
      }
      const { transformSync } = projectRequire('esbuild');
      const source = fs.readFileSync(filename, 'utf8');
      const { code } = transformSync(source, {
        loader: ext === '.tsx' ? 'tsx' : 'ts',
        format: 'cjs',
        target: 'node20',
      });
      module._compile(code, filename);
    };
  }
}
