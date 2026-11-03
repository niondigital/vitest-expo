# vitest-expo

## 58.0.0

Expo SDK 58, and a package that is half the size because the engine underneath now carries what this layer used to.

- Verified against Expo SDK 58, as the major says. The engine underneath supports SDK 57 as well, but this package's router port and example app follow one SDK at a time; `vitest-expo@57` stays the release for SDK 57.
- Requires vitest-native 0.14, Vitest 5 and Node 22.13 or newer (Node 24 from 24.3). Vitest 4 and Node 20 are no longer supported: the engine's matcher types are written against Vitest 5, and Node 20 reached end of life.
- The Expo native-module layer moved into the engine. vitest-native 0.14 carries Expo's module data per SDK, serves the mocks packages ship themselves, models uninstalled modules as absent, registers assets the way Metro does, resolves `jest.requireActual` through the project's aliases and compiles TypeScript-source packages on its own. The vendored module specs, the spec overlay, the stub proxies, the asset-registry stand-in, the expo-symbols shadow, the Node resolution fallbacks and the `vitest-expo/esm-loader` entry are gone with it, as are the `import-jest-expo-mocks` and `check-spec-drift` scripts. What this package adds on top is unchanged: the app config in `Constants.expoConfig`, `vitest-expo/router`, the snapshot serializer, the web platform, the console filters and the CLI.
- Assets are registered ids, as in an app built with Metro. A test that handed `Font.loadAsync()` or `useFonts()` a made-up numeric id gets the error a device would give; a bundled `require('./font.ttf')` or a `{ uri }` source loads.
- `vitest-expo/router` follows expo-router 58, which keeps the current route in `navigationRef` instead of the former `router-store`. Its matchers are typed with Vitest 5's assertion generics.
- `EXPO_PROJECT_ROOT` is no longer set in the test environment; jest-expo does not set it either. It is a build-time input of babel-preset-expo.
- `vitest-expo migrate` and `init` ask for Vitest 5, for `vite` (Vitest 5 declares it as a peer: npm installs it on its own, yarn does not), and for the vitest-native range this package declares, so the install line never names a release the peer check would refuse.
- Vitest 5 hides the console output of passing tests by default (`silent: 'passed-only'`). The console filters apply to whatever is shown; `silent: false` shows everything, as Vitest 4 did.
- Example app and jest-expo reference on SDK 58: React Native 0.88, React 19.3, expo-router 58, Jest 30.

## 57.1.0

Quieter output, two options to keep it that way, and the engine's own fixes taken over.

- A green run reads like one. React Native's five moved/deprecated notices are gone — its entry exposes them as getters that warn when read, and building a module namespace reads every export, so they fired once per test file while saying nothing about the app. jest-expo never shows them either. The engine's duplicate-resolution report is kept for the first file that hits a package and dropped afterwards, instead of repeating per file. On a 54-file suite that is 5542 lines of output down to 502.
- `acknowledgedDuplicates` lists packages whose duplicate resolution you have reviewed. They stay quiet, while any *other* package that starts resolving twice is still reported — a baseline, not a mute switch.
- `silenceWarnings` drops project-specific noise by prefix or pattern, for library warnings that carry no signal in a test run. Both filter through Vitest's `onConsoleLog`; a handler of your own keeps working and runs first.
- `extendPresetMock` is re-exported from the engine, which ships it since 0.13 — same import path, one implementation less here.
- Requires vitest-native 0.13. Three fixes this package carried downstream now live upstream (the expo-linking preset surface, the `*Async`/PascalCase stub conventions, `extendPresetMock`), and the engine's `transform` option accepts an `{ include, exclude }` pair, which the plugin merges into instead of spreading.
- The migrate command flags an `async` callback handed to `forEach` or `map`: the promise is dropped, so an awaited render and the assertions after it run once the test has already ended — a test that passes without asserting anything.
- Expo 57.0.14, expo-router 57.0.14, Vitest 4.1.11.
- Configs are named `.mts` throughout, which is what the CLI writes: an Expo app is not `"type": "module"`, so Node reads a `.ts` config as CommonJS while it is written as ESM.
- Documentation: an option reference with an example per option (`OPTIONS.md`, shipped with the package), and a migration-guide section for output that makes a green run look broken. jsdom 30 requires Node 22 or newer, which matters for web tests on Node 20.

## 57.0.0

The version now tracks the Expo SDK it is verified against, the way jest-expo does it: `vitest-expo@57` is for SDK 57. Nothing about the API changed with the renumbering.

- Expo SDK view components (`requireNativeViewManager`) render as host components: BlurView, LinearGradient, CameraView and expo-image are covered by the conformance suite, and shared objects carry the `release()` the native lifecycle provides — which also makes expo-video usable.
- Expo packages that sit directly on the native boundary — expo-font, expo-asset, expo-splash-screen, expo-status-bar, expo-constants, expo-linking — run their own JavaScript instead of a stand-in module: font loading states, asset metadata, splash-screen semantics and the complete export surface behave as documented.
- Native modules are described by more of the vendored data (per-module constants and method lists) and by the mocks Expo packages ship themselves (`<package>/mocks/<NativeModule>`), so a module's mocked surface tracks the installed package version.
- Native modules enumerate their properties, so package code that copies a module (`const { name, ...rest } = Module`) sees the same shape as on a device, and properties the data does not describe read as absent instead of as a callable.
- The app config reaches `Constants` through the native manifest, which is also what `Linking.createURL()` resolves the scheme from.
- Babel-only syntax in app code is accepted: `export default from` re-exports, Flow-annotated `.js` files carrying an `@flow` pragma, and legacy decorators (with `experimentalDecorators` in tsconfig).
- `npx vitest-expo init` sets Vitest up in a project that has no test runner yet — the counterpart of `migrate`.
- `migrate` asks for the renderer package the installed React Native Testing Library actually needs (`test-renderer` on RNTL 14, `react-test-renderer` on 13), pins `@babel/core` to 7, flags `render()` results used without `await`, and points out `babel-plugin-module-resolver` aliases that belong in `resolve.alias`.
- The plugin warns when the project's Expo SDK major differs from the package major.
- `DEBUG=vitest-expo` reports what the optional fallbacks skipped and why.

## 0.1.0 — never published

Renumbered to 57.0.0 before the first public release; everything below is part of it.

- `vitestExpo()` plugin preset: wraps vitest-native's `reactNative()`, adds Expo env parity (`EXPO_OS`, router import mode), inlines TS-only Expo packages, injects the runtime setup.
- Real app config in tests: `Constants.expoConfig` is read via `@expo/config` (app.config.js/ts) with an app.json fallback — `Linking.createURL()` works with the real scheme.
- `vitest-expo/router`: port of `expo-router/testing-library` (`renderRouter`, `testRouter`, `toHavePathname` matcher family) — upstream is Jest-only.
- Curated snapshot serializer: public component names, flattened styles, no function/undefined/default-prop noise.
- Expo native-module layer driven by data specs vendored from jest-expo (72 modules) plus a reviewed overlay (`returns` extension); generic conventions (`*Async` → Promise, PascalCase → native class) as fallback; absent-module modeling (`ExpoGo`) so tests read as a dev build, not Expo Go.
- Jest compatibility on by default: `jest.mock` hoisting, `jest` global, `requireActual`, `__mocks__` directories, automocks, prototype/namespace spies.
- Platforms: iOS (default), Android and Web — per config or all at once via `vitestExpoProjects()` (one Vitest project per platform, analogous to jest-expo/universal). `platform: 'web'` runs react-native-web in jsdom with Metro-style `.web.*` resolution and the react-native alias applied in both module worlds — no native engine involved, mirroring `jest-expo/web`.
- TypeScript one-liner: `"types": ["expo/types", "vitest-expo/types"]`.
- Node-side resolution hardening for TS-source packages: Metro-style extensionless resolution, on-demand `.ts` transpilation under node_modules, empty modules for compiled-away type-only imports, Babel-toolchain shielding.
- `jest.requireActual` understands the project's resolve aliases (tsconfig paths).
- `transformPackages` option for untranspiled-JSX packages that auto-detection misses.
- `vitest-expo/helpers` with `extendPresetMock` for per-project preset augmentation.
- Snapshot serializer renders element props as compact JSX, replaces React fiber internals with stable placeholders and caps print depth.
