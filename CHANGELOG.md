# vitest-expo

## Unreleased

- Requires vitest-native 0.13: three fixes this package carried downstream now live upstream (the expo-linking preset surface, the `*Async`/PascalCase stub conventions, `extendPresetMock`), and the engine's `transform` option accepts an `{ include, exclude }` pair, which the plugin now merges into instead of spreading.
- Expo 57.0.14, expo-router 57.0.14, Vitest 4.1.11.
- Documented that jsdom 30 requires Node 22 or newer, which matters for web tests on Node 20.

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
