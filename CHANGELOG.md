# vitest-expo

## 58.1.0

vitest-native 0.15 underneath, a higher Node floor with it, and Jest's root `__mocks__` applied the way Jest applies them.

- Requires vitest-native 0.15 and Node 22.22.3 or newer within Node 22, 24.12 or newer within Node 24, or Node 26 or newer. The engine refuses other releases at startup (`UNSUPPORTED_NODE`) and names the one to install; Node 23 and 25 are not supported. A CI image or an `.nvmrc` pinned to an older 22 or 24 release needs updating; `actions/setup-node` with `node-version: 22` or `24` picks a current release of the line. Avoid Node 24.13.0, which can crash a run at startup; the engine's `doctor` warns about it.
- A manual mock of an installed package in a root `__mocks__` folder now applies without a `jest.mock` call, in every test file, for imports and `require()` alike, as under jest-expo. A suite that already calls `jest.mock('pkg')` for such a file keeps working, and the call can stay. A root mock that nothing called used to leave the real package running; it now applies, so a test that depended on the real package needs `jest.unmock('pkg')`. A package a built-in preset covers keeps its preset, and the run says that its manual mock is not applied. With `jestCompat: false` nothing is applied on its own: request the mock with `vi.mock('pkg')`.
- The web platform's setup runs before the engine's Jest setup. That setup now requires `react-native` through Node to give `View.prototype` the native methods, and on web, which has no engine, that loaded React Native's Flow source and failed every file with `SyntaxError: Unexpected token 'typeof'`. With the web setup first, `react-native` is react-native-web there too, and the native component registry reads as empty, as it is on web.
- Flow in app code is the engine's on iOS and Android: it compiles project source that needs Babel with the project's own Babel config. The web platform, which has no engine, keeps stripping Flow from `.js` files with an `@flow` pragma. The `export default from` rewrite stays on every platform, since the engine does not compile that syntax, and so does the `@oxc-project/runtime` dependency, which Vite's decorator lowering imports its helpers from.
- `release()` on Expo shared objects comes from the engine; the copy here is gone. The development-build model (the ExpoGo module reads as absent) is unchanged.
- React Native's moved and deprecated notices are no longer filtered. The engine reads `react-native`'s exports as a test uses them instead of all at once, so the notices stopped firing once per test file; one that appears now points at code that reads the deprecated name, as it does under jest-expo. The duplicate-resolution report is still kept to its first occurrence per package.
- `transformPackages` is for packages that ship Metro-only source, Flow typically. One whose only problem is JSX in `.js` files needs no entry: the engine compiles such a file when Vite's parser rejects it, and names the package and the fix when it cannot.
- Everything else vitest-native 0.15 changes applies as its changelog describes. Most of it needs no action; under the native engine, Gesture Handler and FlashList now run their own Jest setup, and Reanimated 4.7 or newer is its own test mock.

## 58.0.0

Expo SDK 58, and a package that is half the size because the engine underneath now carries what this layer used to. Requires the stable vitest-native 0.14.

- Verified against Expo SDK 58, as the major says. The engine underneath supports SDK 57 as well, but this package's router port and example app follow one SDK at a time; `vitest-expo@57` stays the release for SDK 57.
- Requires vitest-native 0.14, Vitest 5 and Node 22.13 or newer (Node 24 from 24.3). Vitest 4 and Node 20 are no longer supported: the engine's matcher types are written against Vitest 5, and Node 20 reached end of life.
- The Expo native-module layer moved into the engine. vitest-native 0.14 carries Expo's module data per SDK, serves the mocks packages ship themselves, models uninstalled modules as absent, registers assets the way Metro does, resolves `jest.requireActual` through the project's aliases and compiles TypeScript-source packages on its own. The vendored module specs, the spec overlay, the stub proxies, the asset-registry stand-in, the expo-symbols shadow, the Node resolution fallbacks and the `vitest-expo/esm-loader` entry are gone with it, as are the `import-jest-expo-mocks` and `check-spec-drift` scripts. What this package adds on top is unchanged: the app config in `Constants.expoConfig`, the development-build model (the ExpoGo module reads as absent, so `isRunningInExpoGo()` is false where jest-expo and the engine say true), `release()` on shared objects for the `useReleasingSharedObject` hooks, `vitest-expo/router`, the snapshot serializer, the web platform, the console filters and the CLI.
- SVG files import as components in a project on react-native-svg-transformer: a host element named after the file, as the `.svg` mocks such projects carry for Jest render. With the engine registering `.svg` as an asset, the import was a number that React refused to render.
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
