import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reactNative } from 'vitest-native';
import {
  jestCompatAliases,
  jestCompatSetup,
  jestMockTransform,
} from 'vitest-native/jest-compat';
import { transformWithEsbuild, type Plugin } from 'vite';
import { syntaxCompatPlugin } from './syntax-compat';

type ReactNativeOptions = NonNullable<Parameters<typeof reactNative>[0]>;

export interface VitestExpoOptions {
  /**
   * Platform the test run simulates, analogous to jest-expo/ios, /android and
   * /web. Drives platform-extension resolution (.ios.tsx / .web.tsx),
   * Platform.OS and the EXPO_OS environment variable that babel-preset-expo
   * would inline in an app build. 'web' runs react-native-web in jsdom — no
   * native engine involved.
   */
  platform?: 'ios' | 'android' | 'web';
  /** Escape hatch: options forwarded verbatim to vitest-native's reactNative() plugin. */
  reactNative?: Omit<ReactNativeOptions, 'platform'>;
  /**
   * Jest compatibility layer (default: true). Hoists `jest.mock(...)` calls,
   * provides a `jest` global backed by `vi`, and shims Jest-only modules —
   * so suites written for jest-expo run without a syntax migration.
   */
  jestCompat?: boolean;
  /**
   * node_modules packages that ship untranspiled JSX/Flow in .js files but are
   * not auto-detected (e.g. they declare react-native only as a peer
   * dependency). The equivalent of extending Jest's transformIgnorePatterns
   * allowlist — applied on both module graphs.
   */
  transformPackages?: string[];
}

/**
 * Vite plugin preset that makes an Expo app testable under Vitest.
 *
 * Layering: vitest-native carries the React Native core (transform pipeline,
 * native-module boundary, platform extensions, library presets). This plugin adds
 * the Expo layer on top — environment parity with babel-preset-expo, the
 * vitest-expo runtime setup (jest-expo-style snapshot serializer), and inlining
 * of vitest-expo itself so its React/RN-importing modules run inside the Vite
 * module graph instead of being externalized to Node.
 */
export function vitestExpo(options: VitestExpoOptions = {}): Plugin[] {
  const platform = options.platform ?? 'ios';
  const jestCompat = options.jestCompat ?? true;
  const transformPackages = options.transformPackages ?? [];

  if (platform === 'web') {
    return webPlugins(jestCompat);
  }

  const rn = reactNative({
    // Everything vitest-expo layers on (globalThis.expo, real Expo package JS,
    // the native-module registry) assumes real React Native — the pure-JS mock
    // engine silently invalidates all of it, so never auto-degrade to it.
    engine: 'native',
    ...options.reactNative,
    platform,
    // Metro treats .xml as an asset (Android vector drawables — expo-router
    // ships arrow_right.xml etc.); vitest-native's default list lacks it.
    assetExts: ['.xml', ...(options.reactNative?.assetExts ?? [])],
    transform: [...transformPackages, ...(options.reactNative?.transform ?? [])],
  });

  // Vite-graph counterpart of the `transform` allowlist: packages shipping
  // JSX in .js would fail Vite's import analysis.
  const jsxInJsPlugin: Plugin = {
    name: 'vitest-expo:jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      if (transformPackages.length === 0 || !id.endsWith('.js')) return null;
      if (!transformPackages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) return null;
      return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
    },
  };

  const expoPlugin: Plugin = {
    name: 'vitest-expo',
    config(userConfig) {
      const root = userConfig.root ?? process.cwd();

      // Setup ordering: engine setups (vitest-native's, then ours) must run
      // BEFORE the project's own setup files — real-world setup files import
      // react-native and register mocks at the top level, which only works
      // once the engine is initialized. Plugin-returned arrays are appended
      // AFTER user entries by Vite's config merge, so reorder by mutation:
      // vitest-native's injected setup (already merged at this point, our
      // plugin runs after it) → jest-compat → vitest-expo → user setups.
      // The engine expands inline entries to their transitive dependency
      // closure and feeds the result to its Node-side RN transform (merged into
      // test.env before this hook runs). Inlining 'expo' pulls its CLI/build
      // tooling (@expo/cli → metro → @babel/runtime …) into that list, and
      // RN-transforming plain-JS tooling breaks. Keep only packages that are
      // actually React Native territory.
      const mergedEnv = (userConfig as any).test?.env;
      if (mergedEnv?.VITEST_NATIVE_TRANSFORM) {
        try {
          const list: string[] = JSON.parse(mergedEnv.VITEST_NATIVE_TRANSFORM);
          mergedEnv.VITEST_NATIVE_TRANSFORM = JSON.stringify(
            list.filter((pkg) => isReactNativeTerritory(pkg, root, transformPackages))
          );
        } catch {
          // leave the engine's value untouched when it isn't parseable
        }
      }

      const existing = normalizeSetupFiles((userConfig as any).test?.setupFiles);
      const engine = existing.filter((f) => f.includes('vitest-native'));
      const project = existing.filter((f) => !f.includes('vitest-native'));
      (userConfig as any).test = {
        ...(userConfig as any).test,
        setupFiles: [
          ...engine,
          ...(jestCompat ? [jestCompatSetup] : []),
          'vitest-expo/setup',
          ...project,
        ],
      };

      return {
        ...(jestCompat ? { resolve: { alias: jestCompatAliases() } } : {}),
        test: {
          server: {
            deps: {
              // vitest-expo itself imports expo-router internals, which import
              // react-native — that only resolves inside the Vite pipeline.
              // Kept deliberately minimal: the engine expands inline entries to
              // their transitive dependency closure, and a broad entry (like
              // 'expo') drags build tooling into the RN transform set.
              inline: [
                'vitest-expo',
                'expo-router',
                'expo-modules-core',
                'expo',
                'expo-asset',
                'expo-image',
                'expo-symbols',
              ],
              // transformPackages run through the engine's Node-side Babel
              // pipeline (JSX/Flow handled there); keeping them external stops
              // Vite from pulling their CJS `require('react-native')` graph in.
              external: transformPackages,
            },
          },
          env: {
            // babel-preset-expo inlines process.env.EXPO_OS at app build time;
            // in tests the transform runs without it, so provide it at runtime.
            EXPO_OS: platform,
            // expo-router resolves routes synchronously in tests (same value
            // renderRouter forces imperatively).
            EXPO_ROUTER_IMPORT_MODE: 'sync',
            // Also inlined by babel-preset-expo's expo-router plugin. The two
            // router-root variables it derives from it (EXPO_ROUTER_APP_ROOT,
            // EXPO_ROUTER_ABS_APP_ROOT) stay unset — the transform skips them
            // under NODE_ENV=test as well.
            EXPO_PROJECT_ROOT: root,
            // Real app config for Constants.expoConfig (see modules/expo-constants).
            ...appConfigEnv(root),
          },
        },
      };
    },
    configResolved(config) {
      // jest-compat's requireActual resolves through Node and knows nothing
      // about Vite aliases, while `jest.requireActual('@/…')` is a common
      // pattern in real suites. Hand the resolved alias table to the runtime
      // (setup.ts wraps requireActual with it); workers inherit process.env.
      const serialized = (config.resolve?.alias ?? [])
        .map((entry: { find: string | RegExp; replacement: string }) => {
          if (typeof entry.replacement !== 'string') return null;
          if (typeof entry.find === 'string') {
            return { find: entry.find, replacement: entry.replacement };
          }
          if (entry.find instanceof RegExp) {
            return {
              regex: entry.find.source,
              flags: entry.find.flags,
              replacement: entry.replacement,
            };
          }
          return null;
        })
        .filter(Boolean);
      process.env.VITEST_EXPO_ALIASES = JSON.stringify(serialized);
    },
  };

  return [
    rn,
    ...(jestCompat ? [jestMockTransform()] : []),
    syntaxCompatPlugin(),
    jsxInJsPlugin,
    expoPlugin,
  ].flat();
}

export type VitestExpoPlatform = NonNullable<VitestExpoOptions['platform']>;

export interface VitestExpoProjectsOptions extends Omit<VitestExpoOptions, 'platform'> {
  /** Platforms to run, one Vitest project each. Default: ios + android. */
  platforms?: VitestExpoPlatform[];
}

/**
 * All platforms in one run, analogous to jest-expo/universal: returns one
 * inline Vitest project per platform, each named after it.
 *
 *   export default defineConfig({
 *     test: { projects: vitestExpoProjects({ platforms: ['ios', 'android'] }) },
 *   });
 *
 * Per-project overrides (includes, snapshot paths, …) can be layered by
 * mapping over the result, or by using vitestExpo({ platform }) directly in
 * separate config files instead.
 */
export function vitestExpoProjects(options: VitestExpoProjectsOptions = {}) {
  const { platforms = ['ios', 'android'], ...shared } = options;
  return platforms.map((platform) => ({
    plugins: vitestExpo({ ...shared, platform }),
    test: { name: platform },
  }));
}

/**
 * The web platform, analogous to jest-expo/web: react-native-web in jsdom.
 * There is no native boundary on web — Expo packages resolve their .web
 * variants (plain JS) — so the native engine and module layer stay out
 * entirely; what remains is aliasing, web-first extension resolution and a
 * small runtime setup.
 */
function webPlugins(jestCompat: boolean): Plugin[] {
  const webPlugin: Plugin = {
    name: 'vitest-expo:web',
    config(userConfig) {
      const root = userConfig.root ?? process.cwd();
      const existing = normalizeSetupFiles((userConfig as any).test?.setupFiles);
      (userConfig as any).test = {
        ...(userConfig as any).test,
        setupFiles: [
          ...(jestCompat ? [jestCompatSetup] : []),
          'vitest-expo/setup-web',
          ...existing,
        ],
      };
      return {
        resolve: {
          alias: [
            { find: /^react-native$/, replacement: 'react-native-web' },
            ...(jestCompat
              ? Object.entries(jestCompatAliases()).map(([find, replacement]) => ({
                  find,
                  replacement,
                }))
              : []),
          ],
          // Metro's web resolution order: platform extension first.
          extensions: [
            '.web.tsx',
            '.web.ts',
            '.web.jsx',
            '.web.js',
            '.tsx',
            '.ts',
            '.jsx',
            '.js',
            '.mjs',
            '.json',
          ],
        },
        test: {
          environment: 'jsdom',
          server: {
            deps: {
              // Externalized packages require('react-native') through Node,
              // bypassing the react-native-web alias — keep the RN ecosystem
              // in the Vite graph so the alias applies everywhere.
              inline: [/react-native/, /@react-native/, /@testing-library/, /expo/, /@expo/],
            },
          },
          env: {
            EXPO_OS: 'web',
            EXPO_ROUTER_IMPORT_MODE: 'sync',
            EXPO_PROJECT_ROOT: root,
            ...appConfigEnv(root, { inlineManifest: true }),
          },
        },
      };
    },
  };

  return [...(jestCompat ? [jestMockTransform()] : []), syntaxCompatPlugin(), webPlugin];
}

/**
 * Whether a package belongs to the React Native transform set: RN/Expo by
 * name, explicitly requested, or declaring react-native / expo-modules-core
 * as a (peer) dependency.
 */
function isReactNativeTerritory(pkg: string, root: string, requested: string[]): boolean {
  if (requested.includes(pkg)) return true;
  if (pkg === 'react-native' || pkg.startsWith('react-native-')) return true;
  if (pkg === 'expo' || pkg.startsWith('expo-') || pkg === 'vitest-expo') return true;
  if (pkg.startsWith('@react-native/') || pkg.startsWith('@react-native-')) return true;
  if (pkg.startsWith('@react-navigation/')) return true;
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const manifest = require(`${pkg}/package.json`);
    const declared = { ...manifest.dependencies, ...manifest.peerDependencies };
    return 'react-native' in declared || 'expo-modules-core' in declared || 'expo' in declared;
  } catch {
    return false;
  }
}

function normalizeSetupFiles(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Reads the project's Expo config so tests see the real manifest
 * (Constants.expoConfig, URL scheme for expo-linking). Prefers @expo/config
 * (handles app.config.js/ts, plugins, dynamic values) when the project has it
 * — every Expo app does via the expo package — and falls back to reading
 * app.json directly.
 */
function appConfigEnv(
  root: string,
  options: { inlineManifest?: boolean } = {}
): Record<string, string> {
  const config = readViaExpoConfig(root) ?? readAppJson(root);
  if (!config) return {};
  const serialized = JSON.stringify(config);
  return {
    VITEST_EXPO_APP_CONFIG: serialized,
    // On web, expo-constants reads the manifest straight from
    // process.env.APP_MANIFEST — the value babel-preset-expo's inline-manifest
    // plugin substitutes at build time (web and RSC only, never native).
    ...(options.inlineManifest ? { APP_MANIFEST: serialized } : {}),
  };
}

function readViaExpoConfig(root: string): Record<string, unknown> | null {
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const { getConfig } = require('@expo/config');
    const { exp } = getConfig(root, { skipSDKVersionRequirement: true });
    return exp ?? null;
  } catch {
    return null;
  }
}

function readAppJson(root: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.expo) return parsed.expo;
  } catch {
    // No readable app config — tests fall back to the preset's default manifest.
  }
  return null;
}
