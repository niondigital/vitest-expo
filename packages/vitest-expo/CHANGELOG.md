# vitest-expo

## 0.1.0

Initial release.

- `vitestExpo()` plugin preset: wraps vitest-native's `reactNative()`, adds Expo env parity (`EXPO_OS`, router import mode), inlines TS-only Expo packages, injects the runtime setup.
- Real app config in tests: `Constants.expoConfig` is read via `@expo/config` (app.config.js/ts) with an app.json fallback — `Linking.createURL()` works with the real scheme.
- `vitest-expo/router`: port of `expo-router/testing-library` (`renderRouter`, `testRouter`, `toHavePathname` matcher family) — upstream is Jest-only.
- Curated snapshot serializer: public component names, flattened styles, no function/undefined/default-prop noise.
- Expo native-module layer driven by data specs vendored from jest-expo (72 modules) plus a reviewed overlay (`returns` extension); generic conventions (`*Async` → Promise, PascalCase → native class) as fallback; absent-module modeling (`ExpoGo`) so tests read as a dev build, not Expo Go.
- Jest compatibility on by default: `jest.mock` hoisting, `jest` global, `requireActual`, `__mocks__` directories, automocks, prototype/namespace spies.
- Platforms: iOS (default) and Android via `vitestExpo({ platform: 'android' })`.
- TypeScript one-liner: `"types": ["expo/types", "vitest-expo/types"]`.
- Node-side resolution hardening for TS-source packages: Metro-style extensionless resolution, on-demand `.ts` transpilation under node_modules, empty modules for compiled-away type-only imports, Babel-toolchain shielding.
- `jest.requireActual` understands the project's resolve aliases (tsconfig paths).
- `transformPackages` option for untranspiled-JSX packages that auto-detection misses.
- `vitest-expo/helpers` with `extendPresetMock` for per-project preset augmentation.
- Snapshot serializer renders element props as compact JSX, replaces React fiber internals with stable placeholders and caps print depth.
