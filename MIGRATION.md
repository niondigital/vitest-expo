# Migrating from jest-expo

> **AI agent performing this migration?** Follow [MIGRATION-AGENTS.md](./MIGRATION-AGENTS.md) instead: it prescribes a full idiomatic rewrite (no `jest.*` left behind), verified by running the suite with the compatibility layer disabled.

vitest-expo is built so that a jest-expo suite keeps running as it is written. The Jest API stays available (`jest.mock`, `jest.fn`, `jest.requireActual`, `jest.spyOn`, fake timers), mock factories are hoisted the way `babel-plugin-jest-hoist` hoists them, and the React Native runtime under the test is real. What changes is the configuration and a short list of patterns that depend on Jest internals.

Plan on two steps: get the config across (mostly automated), then work through the handful of patterns below.

## Quick path

```bash
npx vitest-expo migrate
```

Run this in the project root, next to `package.json`. It reads the Jest config, writes `vitest.config.mts`, points the `test` script at Vitest while keeping the Jest run as `test:jest`, and prints a report of everything it could not translate.

```bash
npm install -D vitest-expo vitest vitest-native @testing-library/react-native test-renderer
npm test
```

The renderer package depends on the React Native Testing Library major: 14 uses the standalone `test-renderer`, 13 uses `react-test-renderer` at the project's React version. The migrate command prints the exact install line for the project, including `@react-native/babel-preset` and `@babel/core` when they are missing — the native engine runs the React Native Babel pipeline in Node and needs both resolvable.

Add the types once, so `describe`/`it`/`expect` and the React Native Testing Library matchers resolve:

```json
{ "compilerOptions": { "types": ["expo/types", "vitest-expo/types"] } }
```

### What the command does

| | |
|---|---|
| `vitest.config.mts` | written from the Jest config (`.mts` so the config is ESM regardless of the project's package type): plugin preset, `globals: true`, `setupFiles` (`setupFiles` + `setupFilesAfterEnv`, in that order), `resolve.alias` from tsconfig `paths` and translatable `moduleNameMapper` entries, `test.exclude` from path-shaped `testPathIgnorePatterns` |
| `package.json` | `test` becomes `vitest run` (an environment prefix such as `TZ=UTC` is kept); the previous command moves to `test:jest` |
| everything else | reported, not changed |

Existing files are never overwritten: re-run with `--force` to replace a `vitest.config.mts`, `--replace` to drop the `test:jest` script, `--dry-run` to see the report without writing, `--fix` to apply the one safe rewrite (`jest.doMock` → `jest.mock` in setup files). Jest devDependencies are listed as removable but never removed — keep them until both runners agree.

Config files that cannot be read without executing them (TypeScript, ESM, or computed values) are read statically instead. The command says so when that happens; check the generated config in that case.

## What carries over unchanged

None of this needs an edit:

- **`jest.mock` walls in setup files**, including stateful fakes. A setup file that registers mocks for the whole suite works the same way here, closures and all.
- **`jest.requireActual` partial mocks**, including specifiers that go through a tsconfig path alias (`jest.requireActual('@/lib/config')`). The plugin hands its resolved alias table to the runtime, and extensionless TypeScript imports resolve Metro-style.
- **`__mocks__` directories** next to the mocked module, applied through an explicit `jest.mock('pkg')` call.
- **Automocks** — `jest.mock('pkg')` without a factory.
- **Spies**: `jest.spyOn` on objects, on prototypes, and on module namespace objects.
- **Fake timers**, `jest.setSystemTime`, `jest.advanceTimersByTime`, and the async variants.
- **`it.each` / `describe.each`**, both the array form and the tagged-template form.
- **React Native Testing Library** on iOS and Android: `render`, `screen`, `fireEvent`, `userEvent`, `waitFor`, and the `toBeOnTheScreen` matcher family.

One difference worth knowing before reading the list below: Jest applies a root `__mocks__` directory for a node_modules package automatically, without any call. Vitest does not — see [Root `__mocks__` for node_modules packages](#root-__mocks__-for-node_modules-packages).

## Patterns that need a hand

### The reanimated mock

Jest suites commonly register the mock that react-native-reanimated ships. It is written against Jest internals and is redundant here — reanimated is covered by a built-in preset.

```ts
// before
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// after — delete it
```

If the preset misses something a specific app relies on, extend it instead of replacing it:

```ts
import { extendPresetMock } from 'vitest-expo/helpers';

extendPresetMock('react-native-reanimated', {
  interpolateColor: (value, input, output) => output[0],
});
```

### `jest.doMock` → `jest.mock`

`doMock` is deliberately *not* hoisted: it registers a mock at the point where the statement runs. In a setup file, that point is after the module registry has already handed out the real module to anything the setup itself imported, so the mock silently misses. `jest.mock` is hoisted to the top of the file and applies to every importer.

```ts
// before
jest.doMock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

// after
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
```

`npx vitest-expo migrate --fix` applies this rewrite. Review the result where the call sits inside a conditional: hoisting lifts it out of the branch, so the mock now always applies. A mock that has to stay conditional belongs in a separate config or setup file per condition.

Inside a *test* file, `jest.doMock` keeps its Jest meaning and does not need to change.

### `jest.requireMock` → module import

`requireMock` returns a fresh instance from the mock registry rather than the live object the factory produced, so assertions against it see call counts of zero. Import the mocked module instead — inside a test, that import *is* the mock.

```ts
// before
const sdk = jest.requireMock('some-sdk');
expect(sdk.connect).toHaveBeenCalled();

// after
import * as sdk from 'some-sdk';
expect(sdk.connect).toHaveBeenCalled();
```

For a default export, `import sdk from 'some-sdk'` works the same way.

### Class mocks need `function` implementations

An arrow function has no `[[Construct]]` slot, so `new` on it throws. Jest's automock machinery papered over this in some paths; here the value is used as written. Any mock that is constructed with `new` needs a function expression (or a class).

```ts
// before
jest.mock('some-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({ connect: jest.fn() })),
}));

// after
jest.mock('some-sdk', () => ({
  Client: jest.fn().mockImplementation(function (this: any) {
    this.connect = jest.fn();
  }),
}));
```

Returning an object from a `function` implementation also works — the returned object wins over `this`:

```ts
Client: jest.fn().mockImplementation(function () {
  return { connect: jest.fn() };
}),
```

The migrate command reports every arrow `mockImplementation` inside a mock factory as a *check*, not an error: most of them are plain functions and are fine as they are.

### Partial mocks of app modules

`jest.requireActual` loads a module through Node, outside the test module graph. For a package that is a leaf, that is fine. For an app module with a deep import graph — one that pulls in components, which pull in React Native, which pull in native modules — it means loading a second copy of that graph through a different resolver. Use Vitest's `importOriginal`, which loads the original through the same graph the test uses.

```ts
// before
jest.mock('@/lib/config', () => ({
  ...jest.requireActual('@/lib/config'),
  apiUrl: 'https://example.test',
}));

// after
vi.mock('@/lib/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config')>()),
  apiUrl: 'https://example.test',
}));
```

This is a recommendation, not a requirement: alias-specifier `requireActual` resolves correctly, and for small modules it stays the shorter form.

### `Platform.OS` assignment

Under Jest, `Platform.OS` is a writable property on a plain object, so suites assign to it to test platform branches. Here the platform is decided when the test environment is built: it drives platform-extension resolution (`.ios.tsx` / `.android.tsx`), the `EXPO_OS` environment value, and which native module implementations load. A mid-test assignment cannot change any of that retroactively.

```ts
// before
it('uses the android layout', () => {
  Platform.OS = 'android';
  expect(getLayout()).toBe('android');
});

// after — one config per platform, and the test asserts what this run renders
// vitest.config.android.ts
export default defineConfig({
  plugins: [vitestExpo({ platform: 'android' })],
});
```

Where a branch is pure logic and does not touch rendering or native modules, mocking the module that reads the platform is the smaller change:

```ts
vi.mock('@/lib/platform-flags', () => ({ isAndroid: true }));
```

See [Platform configs](#platform-configs) for wiring the second run.

### Automocked `useColorScheme`

`useColorScheme` is backed by the real `Appearance` module here, so casting the hook to a mock has nothing to cast. Set the scheme instead — it changes what the module reports, which is what the component actually reads.

```ts
// before
(useColorScheme as jest.Mock).mockReturnValue('dark');

// after
import { setColorScheme } from 'vitest-native/helpers';

setColorScheme('dark');
```

`vitest-native/helpers` carries the same shape of control for other ambient state: `setDimensions`, `setInsets`, `setPlatform`, `mockNativeModule`, `resetAllMocks`.

### Root `__mocks__` for node_modules packages

Jest applies a root-level `__mocks__/some-package.ts` automatically, with no call anywhere. Vitest requires the mock to be requested. Add one call — in a setup file if the mock is meant for the whole suite:

```ts
// test-setup.ts
jest.mock('some-package'); // picks up __mocks__/some-package.ts
```

`__mocks__` directories next to a *local* module already need an explicit call under Jest, so those carry over unchanged.

### Lazy require of a mocked package

Mocks intercept the import graph. When app code loads a package with a runtime `require()` inside a function — a common guard around native modules that would crash at static-import time —

```ts
function getBackend() {
  const { AppleLLM } = require('@some/native-wrapper'); // loaded at call time
  return AppleLLM;
}
```

a `vi.mock('@some/native-wrapper', …)` in the test does not apply to that call: the real module loads. Options, in order of preference:

1. **Mock the wrapper module** (`vi.mock('@/services/backend', …)`) instead of the package it guards — tests usually care about the wrapper's behavior anyway.
2. Refactor the guard to a static import in a platform-specific file (`backend.ios.ts` / `backend.android.ts`), which restores static analyzability.

`npx vitest-expo migrate` cross-checks mocked packages against runtime `require()` calls in app code and flags the affected call sites.

### Mock factories must return an object

Jest tolerates a factory that returns nothing — a common idiom for side-effect-only mocks:

```ts
jest.mock('expo-sqlite/localStorage/install', () => {});   // Jest: fine, Vitest: throws
```

Vitest requires the factory to return the module's exports. Return an empty object instead:

```ts
jest.mock('expo-sqlite/localStorage/install', () => ({}));
```

`npx vitest-expo migrate --fix` rewrites this pattern automatically.

### Dynamic CJS exports in mock files

A `__mocks__` file that computes its exports at property-access time works under Jest's runtime `require`, but named ESM imports resolve exports statically and see `undefined`:

```js
// __mocks__/@expo/vector-icons.js — works under Jest, breaks named imports under Vitest
module.exports = new Proxy({}, { get: () => MockIcon });
```

Export the names the app actually imports statically as well (the Proxy can stay as a default for anything else):

```js
const mock = new Proxy({ Ionicons: MockIcon, MaterialIcons: MockIcon }, { get: (t, k) => t[k] ?? MockIcon });
module.exports = mock;
module.exports.Ionicons = MockIcon;
module.exports.MaterialIcons = MockIcon;
```

`npx vitest-expo migrate` flags this pattern in `__mocks__` files.

### Async render

`@testing-library/react-native` 14 made `render`, `fireEvent` and `act` async (this comes with the library, not the runner — a Jest suite upgrading to RNTL 14 faces the same change). The failure mode is confusing: destructuring an un-awaited `render()` yields undefined queries (`getByText is not a function`).

```tsx
// before (RNTL <= 13)
const { getByText } = render(<Greeting />);

// after (RNTL >= 14)
await render(<Greeting />);
expect(screen.getByText('Hello')).toBeOnTheScreen();
```

One trap comes with the awaits: a loop callback. `forEach` and `map` drop the promise an async callback returns, so the awaited render — and every assertion after it — runs detached, after the test has already ended. The test then passes without asserting anything, and Vitest reports an unhandled rejection instead:

```tsx
// wrong: the assertions run after the test, against an unmounted tree
modes.forEach(async (mode) => {
  await render(<Gauge mode={mode} />);
  expect(screen.getByTestId('gauge')).toBeOnTheScreen();
});

// right
for (const mode of modes) {
  await render(<Gauge mode={mode} />);
  expect(screen.getByTestId('gauge')).toBeOnTheScreen();
}
```

Suites staying on RNTL 13 are unaffected — both majors are supported. Note the renderer package differs between them: RNTL 14 peers on the standalone `test-renderer`, RNTL 13 on `react-test-renderer` at the project's React version. npm installs that peer on its own; yarn and strict pnpm layouts need it declared.

### Path aliases in babel.config.js

App code is transformed by Vite, so Babel plugins from the project's `babel.config.js` do not run. The one plugin that silently changes module resolution is `babel-plugin-module-resolver` — mirror its aliases in the Vitest config instead:

```ts
// babel.config.js had: alias: { '@components': './src/components' }
export default defineConfig({
  plugins: [vitestExpo()],
  resolve: {
    alias: [{ find: /^@components\//, replacement: '/src/components/' }],
  },
});
```

Projects that keep the same aliases in `tsconfig.json` `paths` (most do, for the editor) are already covered — the migrate command derives `resolve.alias` from there.

Babel-only *syntax* needs no config: `export default from` re-exports and Flow-annotated `.js` files (with an `@flow` pragma) transform out of the box. Legacy decorators work once `experimentalDecorators` is set in `tsconfig.json` — which decorator-using projects already have for type-checking.

## Snapshots

Existing jest-expo snapshots need one regeneration:

```bash
npx vitest run -u
```

Review the diff once, commit it, and treat it as the new baseline.

The format differs on purpose, in two ways:

- **The tree is the real host tree.** Components resolve to the host elements React Native actually renders, rather than to a shallow stand-in. What appears in a snapshot is what the app would mount.
- **The serializer is curated.** Host names are mapped to their familiar form (`RCTView` → `View`), styles are flattened into a single object, and function props, resolved defaults, and `undefined` noise are dropped.

The result is a snapshot that fails when rendering changes and stays quiet when an internal default moves — which is the property a snapshot is for. The trade-off is the one-time regeneration; byte-identical output to jest-expo was not a goal.

Keeping both baselines side by side during a migration is useful. Point Vitest at its own directory so the two never overwrite each other:

```ts
test: {
  resolveSnapshotPath: (testPath, snapExtension) =>
    path.join(path.dirname(testPath), '__vitest_snapshots__', path.basename(testPath) + snapExtension),
}
```

## Platform configs

iOS is the default. Other platforms are separate config files, the way `jest-expo/android` and `jest-expo/web` are separate presets.

```ts
// vitest.config.android.ts
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo({ platform: 'android' })],
  test: { globals: true },
});
```

```ts
// vitest.config.web.ts — react-native-web in jsdom, no native engine involved
export default defineConfig({
  plugins: [vitestExpo({ platform: 'web' })],
  test: { globals: true },
});
```

```json
{
  "scripts": {
    "test": "vitest run",
    "test:android": "vitest run --config vitest.config.android.ts",
    "test:web": "vitest run --config vitest.config.web.ts"
  }
}
```

Two things to plan for on web:

- **React Native Testing Library is not usable there.** Its text-in-`<Text>` invariant fires against DOM host elements. This is a property of the library, not of the runner — `jest-expo/web` fails the same way. Render web tests with the standalone renderer, or use React Testing Library against the DOM.
- **Snapshots differ from the native ones**, because the host elements are DOM elements. Give the web run its own snapshot directory via `resolveSnapshotPath`.

`jsdom` and `react-native-web` have to be installed for the web platform.

Suites that only make sense on one platform are excluded per config, the same way `testPathIgnorePatterns` narrowed a Jest run:

```ts
test: {
  include: ['src/**/*.test.{ts,tsx}'],
  exclude: [...defaultExclude, '**/*.native.test.tsx'],
}
```

## Escape hatches for project-specific libraries

The built-in coverage is the modern Expo stack: the `expo-*` SDK, expo-router, and the React Native libraries the underlying presets ship. Everything else — BLE, maps, analytics, payment SDKs, whatever a specific app depends on — is project territory, and there are four ways to handle it, from broadest to narrowest.

**1. A `jest.mock` wall in a setup file.** The broadest hatch, and the one most jest-expo suites already use. Stateful fakes are fine:

```ts
// vitest.config.ts → test: { setupFiles: ['./test-setup.mocks.ts'] }
jest.mock('some-analytics-sdk', () => {
  const events: string[] = [];
  return {
    track: jest.fn((event: string) => events.push(event)),
    getEvents: () => events,
  };
});
```

**2. `extendPresetMock`** — for a package that already has a built-in preset mock, when one function is missing or needs different behavior for a specific app. It merges into the preset instead of replacing it:

```ts
import { extendPresetMock } from 'vitest-expo/helpers';

extendPresetMock('react-native-reanimated', { interpolateColor: () => 'transparent' });
```

**3. `mockNativeModule`** — for a single native module below the JavaScript layer, when the JavaScript wrapper should stay real. This is the hatch for Expo SDK packages: they run their own code over a mocked native boundary, so replacing the module below them keeps their real behavior:

```ts
import { mockNativeModule } from 'vitest-native/helpers';

mockNativeModule('ExpoSomeModule', { getValueAsync: async () => 'value' });
```

**4. `transformPackages`** — not a mock at all, but the fix for a package that ships untranspiled JSX or Flow in `.js` files and is not auto-detected (typically because it declares `react-native` only as a peer dependency). It is the equivalent of adding an entry to Jest's `transformIgnorePatterns` allowlist:

```ts
plugins: [vitestExpo({ transformPackages: ['react-native-some-library'] })],
```

Reach for the narrowest one that works: a preset extension survives a library upgrade better than a hand-written module mock, and a native-module mock keeps the library's own JavaScript under test.

### Output that looks like a failure

**`Your Vite config uses features that are unsupported by configLoader: 'native'`** — an Expo app's `package.json` has no `"type": "module"`, so Node reads `vitest.config.ts` as CommonJS while the file uses `import`/`export default`. Name the config `vitest.config.mts` and it is unambiguous. Two consequences: use `import.meta.dirname` instead of `__dirname`, and add `"**/*.mts"` to `include` in `tsconfig.json` if the config should be type-checked. `vitest-expo init` and `migrate` write `.mts` for this reason.

**React Native deprecation notices** (`SafeAreaView has been deprecated`, `Clipboard has been extracted`, …) are suppressed. React Native exposes those names as getters that warn when read, and building a module namespace for `react-native` reads all of them — so they fired once per test file while saying nothing about the app. jest-expo never shows them, and neither does this.

**`'<package>' resolves to two different files`** — Node's `require` and Vite picked different entry files for the same package, so it exists twice with separate module-level state. This one is real, and it is reported once per package instead of once per test file.

Whether it matters depends on the package: two copies of a pure function library are harmless, two copies of something holding state — a store, a registry, a client singleton — are not, and the failure is silent (a value written through one copy reads back unset through the other). It appears when a React Native package that the engine loads through Node depends on the same package your app imports through Vite.

To collapse the two copies into one, point Vite at the file Node resolved — the second line of the message says which:

```ts
// vitest.config.mts
resolve: {
  alias: [
    { find: /^redux$/, replacement: path.join(import.meta.dirname, 'node_modules/redux/dist/cjs/redux.cjs') },
  ],
},
```

Verify with an identity check in a scratch test (`createRequire(import.meta.url)('redux').createStore === createStore`). Note that the engine keeps reporting the package afterwards — its check compares Node against Vite's field order and does not account for the alias — so trust the identity check, not the message. Pinning a file inside a package is brittle across upgrades, so it is worth doing for packages whose state your tests actually cross, not pre-emptively.

**`An update to <Component> inside a test was not wrapped in act(...)`** — a `render()` whose result is used without `await`. Since `@testing-library/react-native` 14 the render is async, so the commit lands outside `act`. Watch for render helpers: a helper that does `return render(...)` hands the promise on, and every caller needs the `await` too.

## When something fails only under Vitest

A short checklist before digging deeper:

- **`Cannot find module` for a relative import inside a package** — the package likely ships untranspiled source; add it to `transformPackages`.
- **A mock does not apply** — check that the call is `jest.mock` / `vi.mock` and not `doMock`, and that a root `__mocks__` directory has an explicit call.
- **`X is not a constructor`** — an arrow `mockImplementation` used with `new`; see [Class mocks need `function` implementations](#class-mocks-need-function-implementations).
- **A test passes alone and fails in the suite** — state left in a module-level mock; `resetAllMocks` from `vitest-native/helpers` in a `beforeEach` resets the ambient state (platform, dimensions, color scheme) along with the mocks.
- **Platform-dependent assertions fail** — the run is iOS unless a config says otherwise.
- **Warnings about a package resolving "to two different files"** — a dependency exists as both CJS and ESM builds (common in MSW's dependency tree). Harmless while the suite is green; if a library's module-level state seems split, pin the resolution with a `resolve.alias` to one build.

Running both runners side by side (`npm test` and `npm run test:jest`) while migrating makes it obvious whether a failure is a migration artifact or a test that was passing for the wrong reason.
