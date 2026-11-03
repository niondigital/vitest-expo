import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reactNative } from 'vitest-native';
import {
  jestCompatAliases,
  jestCompatSetup,
  jestMockTransform,
} from 'vitest-native/jest-compat';
import { type Plugin } from 'vite';
import { syntaxCompatPlugin } from './syntax-compat';
import { svgComponentsPlugin } from './svg-components';
import { consoleNoiseFilter, type ConsoleNoiseOptions } from './runtime/console-noise';
import { debug } from './runtime/debug';

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
  reactNative?: Omit<ReactNativeOptions, 'platform' | 'engine'>;
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
   * allowlist — handed to the engine's Node-side transform.
   */
  transformPackages?: string[];
  /**
   * Packages whose duplicate-resolution diagnostic has been reviewed and
   * accepted. Naming a package here silences it for good; every *other*
   * package that starts resolving to two files still gets reported, so an
   * acknowledged list keeps the warning meaningful instead of teaching the
   * team to scroll past it.
   *
   *   vitestExpo({ acknowledgedDuplicates: ['redux', 'ramda'] })
   *
   * Accept a package once you have checked that no test relies on state being
   * shared through it — MIGRATION.md shows the identity check, and the alias
   * that collapses the two copies when it does matter.
   */
  acknowledgedDuplicates?: string[];
  /**
   * Console output to drop, for warnings a library emits that carry no signal
   * in a test run — a render-performance heuristic complaining about the fast
   * re-renders a test does on purpose, for instance. Matched against the start
   * of the message for strings, anywhere in it for regular expressions.
   *
   *   vitestExpo({ silenceWarnings: [/in short periods of time/] })
   *
   * Kept as project configuration on purpose: which third-party noise is
   * irrelevant depends on the app, so it does not belong in a list this
   * package ships.
   */
  silenceWarnings?: (string | RegExp)[];
}

/**
 * Vite plugin preset that makes an Expo app testable under Vitest.
 *
 * Layering: vitest-native carries the React Native core and, since 0.14, the
 * Expo native-module boundary (transform pipeline, platform extensions, library
 * presets, Expo's module data). This plugin adds what sits above that — the
 * app config in the native manifest, the router import mode babel-preset-expo
 * would inline, the jest-expo-style snapshot serializer, the console filters —
 * and inlines vitest-expo itself so its React-importing modules run inside the
 * Vite module graph instead of being externalized to Node.
 */
export function vitestExpo(options: VitestExpoOptions = {}): Plugin[] {
  const platform = options.platform ?? 'ios';
  const jestCompat = options.jestCompat ?? true;
  const noise = {
    acknowledgedDuplicates: options.acknowledgedDuplicates,
    silenceWarnings: options.silenceWarnings,
  };
  const transformPackages = options.transformPackages ?? [];
  const svgComponents = svgComponentsPlugin(process.cwd());

  if (platform === 'web') {
    return webPlugins(jestCompat, noise, svgComponents);
  }

  const rn = reactNative({
    ...options.reactNative,
    platform,
    // Everything vitest-expo layers on (the app config in the native manifest,
    // the router port, the real Expo package JS the engine runs) assumes real
    // React Native — the pure-JS mock engine silently invalidates all of it,
    // so never auto-degrade to it.
    engine: 'native',
    transform: mergeTransform(transformPackages, options.reactNative?.transform),
  });

  const expoPlugin: Plugin = {
    name: 'vitest-expo',
    config(userConfig) {
      const root = userConfig.root ?? process.cwd();
      warnOnSdkMismatch(root);

      // Setup ordering: engine setups (vitest-native's, then ours) must run
      // BEFORE the project's own setup files — real-world setup files import
      // react-native and register mocks at the top level, which only works
      // once the engine is initialized. Plugin-returned arrays are appended
      // AFTER user entries by Vite's config merge, so reorder by mutation:
      // vitest-native's injected setup (already merged at this point, our
      // plugin runs after it) → jest-compat → vitest-expo → user setups.
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
          // Drops output that repeats per test file without saying anything
          // per file (see runtime/console-noise).
          onConsoleLog: consoleNoiseFilter((userConfig as any).test?.onConsoleLog, noise),
          server: {
            deps: {
              // vitest-expo itself imports React and expo-router internals,
              // which only resolve inside the Vite pipeline. Nothing else: the
              // Expo and React Native packages belong to the engine, which
              // loads them through Node and refuses to share them with Vite.
              inline: ['vitest-expo'],
            },
          },
          env: {
            // expo-router resolves routes synchronously in tests (same value
            // renderRouter forces imperatively).
            EXPO_ROUTER_IMPORT_MODE: 'sync',
            // Real app config for Constants.expoConfig (see modules/expo-constants).
            ...appConfigEnv(root),
          },
        },
      };
    },
  };

  return [
    // Before the engine, whose resolver would otherwise register the file as
    // an asset.
    ...(svgComponents ? [svgComponents] : []),
    rn,
    ...(jestCompat ? [jestMockTransform()] : []),
    syntaxCompatPlugin(),
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
function webPlugins(
  jestCompat: boolean,
  noise: ConsoleNoiseOptions,
  svgComponents: Plugin | null
): Plugin[] {
  const webPlugin: Plugin = {
    name: 'vitest-expo:web',
    config(userConfig) {
      const root = userConfig.root ?? process.cwd();
      warnOnSdkMismatch(root);
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
          onConsoleLog: consoleNoiseFilter((userConfig as any).test?.onConsoleLog, noise),
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
            ...appConfigEnv(root, { inlineManifest: true }),
          },
        },
      };
    },
  };

  return [
    ...(svgComponents ? [svgComponents] : []),
    ...(jestCompat ? [jestMockTransform()] : []),
    syntaxCompatPlugin(),
    webPlugin,
  ];
}

/**
 * The engine's transform allowlist takes either a list or an
 * `{ include, exclude }` pair. Ours are additions to whatever the caller
 * passed, so the object form keeps its exclude list and gains our entries in
 * include.
 */
function mergeTransform(
  ours: string[],
  theirs: ReactNativeOptions['transform']
): ReactNativeOptions['transform'] {
  if (!theirs) return ours;
  if (Array.isArray(theirs)) return [...ours, ...theirs];
  return { ...theirs, include: [...ours, ...(theirs.include ?? [])] };
}

/**
 * The package major tracks the Expo SDK it is verified against (58.x is for
 * SDK 58), so a mismatch is worth one line at config time. Not expressed as a
 * peer dependency on expo: that would make the engine classify vitest-expo
 * itself as a React Native package and load it through the Node-side pipeline.
 */
let sdkChecked = false;
function warnOnSdkMismatch(root: string): void {
  if (sdkChecked) return;
  sdkChecked = true;
  try {
    const own = createRequire(import.meta.url)('../package.json').version as string;
    const expo = createRequire(path.join(root, 'package.json'))('expo/package.json').version as string;
    const major = (version: string) => /^(\d+)\./.exec(version)?.[1];
    if (major(own) && major(expo) && major(own) !== major(expo)) {
      console.warn(
        `[vitest-expo] this is vitest-expo ${own} (Expo SDK ${major(own)}), but the project runs Expo ${expo} — ` +
          `install vitest-expo@${major(expo)} for a matching module surface.`
      );
    }
  } catch (error) {
    debug('sdk-check', 'could not compare the Expo SDK version', error);
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
  } catch (error) {
    debug('app-config', 'could not read the app config via @expo/config, falling back to app.json', error);
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
