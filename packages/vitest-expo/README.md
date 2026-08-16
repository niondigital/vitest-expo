# vitest-expo

Test Expo apps with Vitest — the jest-expo experience on a modern runner.

vitest-expo layers the Expo-specific pieces on top of [vitest-native](https://github.com/danfry1/vitest-native), which carries the React Native core (real RN under Node, transform pipeline, library presets). One plugin call replaces the jest-expo preset:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo()], // or vitestExpo({ platform: 'android' })
  test: { globals: true },
});
```

```tsx
// __tests__/routes.test.tsx — expo-router testing, Jest-only upstream, works here
import { renderRouter, screen, testRouter } from 'vitest-expo/router';

it('navigates', async () => {
  const result = await renderRouter(
    { index: () => <Home />, about: () => <About /> },
    { initialUrl: '/' }
  );
  await testRouter.navigate('/about');
  expect(result).toHavePathname('/about');
});
```

## Status

**0.1.0 — beta.** Validated against Expo SDK 57 / RN 0.86 / RNTL 13–14 / Vitest 4 on iOS and Android — via a conformance suite that runs identically under jest-expo and vitest-expo ([`examples/app`](../../examples/app)), and against a production Expo app (54 suites, ~500 tests, Redux/react-navigation/BLE/maps stack). Web runs react-native-web in jsdom, mirroring `jest-expo/web`.

## Install

```bash
npm install -D vitest-expo vitest vitest-native @testing-library/react-native react-test-renderer
```

`react-test-renderer` must match your React version (Expo SDK 57: `react-test-renderer@19.2.3`).

## What the plugin does

- wraps `reactNative()` from vitest-native (platform selection, RN core, library presets) and pins the **native engine** — everything the Expo layer provides assumes real React Native, so it never silently degrades to the pure-JS mock engine
- **Jest compatibility on by default** (`jestCompat: true`): `jest.mock(...)` calls are hoisted, a `jest` global backed by `vi` is provided, Jest-only modules are shimmed — suites written for jest-expo run without a syntax migration. Verified: factory mocks, `requireActual` partial mocks (including tsconfig-path aliases like `@/…`, expanded from the project's resolve aliases with Metro-style extensionless-TS resolution), `__mocks__` dirs, automocks, prototype/namespace spies
- **Node-side resolution hardening** for TS-source packages (Expo ships them): extensionless relative imports resolve Metro-style, `.ts` files under node_modules transpile on demand, type-only imports that survived compilation resolve to an empty module, and the Babel toolchain itself is shielded from the RN transform
- `transformPackages: ['pkg']` — the `transformIgnorePatterns`-allowlist equivalent for packages shipping untranspiled JSX that auto-detection misses (react-native declared only as a peer dependency)
- **real app config in tests**: `Constants.expoConfig` is read via `@expo/config` (app.config.js/ts, plugins) with an app.json fallback, so `Linking.createURL()` uses your real scheme — jest-expo leaves the manifest empty
- sets `EXPO_OS` / `EXPO_ROUTER_IMPORT_MODE` env parity (babel-preset-expo would inline these in an app build)
- inlines the Expo packages that ship TS-only/untranspiled source (`expo-modules-core`, `expo-router`, `expo`, `expo-asset`, `expo-image`, `expo-symbols`) into the Vite graph
- registers `.xml` as an asset extension (Android vector drawables, matching Metro)
- injects the runtime setup: curated snapshot serializer, `ErrorUtils` stub, and the Expo native-module layer

## The Expo native-module layer

Driven by **data specs, not hand-written rules**:

1. vitest-expo's spec overlay (`module-spec-overrides.ts`, same format plus a `returns` extension — every entry is an upstream-PR candidate for jest-expo)
2. **jest-expo's vendored module specs** (`expo-module-specs.ts`, 72 modules imported via `npm run import-jest-expo-mocks`, materialized as vi.fn mocks with jest-expo's exact semantics)
3. generic Expo conventions as last resort: `*Async` methods resolve, PascalCase properties are native classes on `SharedObject`
4. absent-module modeling: probes like `isRunningInExpoGo()` read as **false** — tests model a dev/standalone build, not Expo Go (`executionEnvironment: 'bare'`)

## Mocking your own libraries

vitest-expo's core covers the common modern Expo stack (the `expo-*` SDK, expo-router, and the RN libraries vitest-native's presets ship). Everything project-specific — BLE, maps, analytics, state libraries, whatever — is project territory, with three escape hatches (all conformance-tested):

1. **`jest.mock` / `vi.mock`** in a test file, or in a project setup file for a suite-wide "mock wall" (stateful fakes included):

   ```ts
   // vitest.config.ts → test: { setupFiles: ['./test-setup.mocks.ts'] }
   jest.mock('react-native-some-sdk', () => {
     const events: string[] = [];
     return { track: jest.fn((e: string) => events.push(e)), getEvents: () => events };
   });
   ```

2. **`extendPresetMock(pkg, overrides)`** for packages vitest-native already shadows via preset (expo-constants, expo-linking, reanimated, …)
3. **`mockNativeModule(name, impl)`** (from `vitest-native/helpers`) for individual native modules

## TypeScript

```json
{ "compilerOptions": { "types": ["expo/types", "vitest-expo/types"] } }
```

`vitest-expo/types` bundles the Vitest globals (`describe`/`it`/`expect` for `globals: true`) and the RNTL matcher augmentation (`toBeOnTheScreen`, …) that RNTL only declares for Jest. This is also what makes IDEs resolve test files.

## Platforms

iOS is the default. For Android and Web, use additional configs (analogous to `jest-expo/android` and `jest-expo/web`):

```ts
// vitest.config.android.ts
export default defineConfig({
  plugins: [vitestExpo({ platform: 'android' })],
});

// vitest.config.web.ts — react-native-web in jsdom, no native engine involved
export default defineConfig({
  plugins: [vitestExpo({ platform: 'web' })],
});
```

Platform extensions (`.ios.tsx` / `.android.tsx` / `.native.tsx` / `.web.tsx`) resolve Metro-style in app code and node_modules. The web platform aliases `react-native` to `react-native-web` in both module worlds and needs `jsdom` (and `react-native-web`) installed.

## Modules

- `vitest-expo` — the Vite/Vitest plugin preset
- `vitest-expo/router` — port of `expo-router/testing-library` (upstream is Jest-only: it registers Jest module mocks at import time). Provides `renderRouter`, `testRouter`, `getMockContext` (reused from expo-router), and the `toHavePathname` matcher family. Note: `testRouter` methods are async here (RNTL 14 `act` is async)
- `vitest-expo/snapshot-serializer` — curated host-tree serializer, auto-registered by the plugin. Maps host names (`RCTView` → `View`), flattens styles, drops function props / resolved defaults / undefined noise. Deliberately *not* byte-identical to jest-expo — it keeps what is meaningful in a snapshot. Existing jest-expo snapshots need one regeneration on migration
- `vitest-expo/setup` — the runtime setup (injected automatically by the plugin)
- `vitest-expo/helpers` — runtime helpers for test/setup files (`extendPresetMock` to augment a built-in library preset mock per project)

## Known limitations

- On web, `@testing-library/react-native` is not usable — its text-in-`<Text>` invariant fires on DOM hosts. That is runner-independent (`jest-expo/web` fails identically); render web tests via `react-test-renderer` or use React Testing Library
- `vitest-expo/router` uses deep imports into `expo-router/build/*` (no `exports` field there); verified per Expo SDK — currently SDK 57
- Jest auto-applies root `__mocks__` for node_modules packages without a call; Vitest needs the explicit `vi.mock('pkg')` / `jest.mock('pkg')`
- Class mocks constructed with `new` need a `function` implementation (`jest.fn().mockImplementation(function () { … })`) — arrow implementations are not constructable
- `jest.requireMock` does not return the live factory instance; import the mocked module instead
- Partial mocks of app modules with a deep import graph are best written as `vi.mock(path, async (importOriginal) => …)` — `jest.requireActual` on an app module loads it (and its imports) through Node instead of the test module graph

## Development

Monorepo: `packages/vitest-expo` (this package) and `examples/app` (Expo SDK 57 app whose test suite runs under jest-expo AND vitest-expo — the conformance gate, see CI).

```bash
npm ci
npm run build --workspace vitest-expo
npm run test --workspace app   # vitest iOS + Android + jest-expo reference
```

## License

MIT
