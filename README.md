# vitest-expo

**Test your Expo app with Vitest** — iOS, Android and Web. Real React Native, the testing-library API you know, no test-config maintenance.

## Quick start

```bash
npm install -D vitest-expo vitest vitest-native @testing-library/react-native react-test-renderer
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo()],
  test: { globals: true },
});
```

Then write tests the way you'd expect:

```tsx
import { render, screen, userEvent } from '@testing-library/react-native';
import { OrderButton } from '../order-button';

test('confirms an order', async () => {
  const user = userEvent.setup();
  await render(<OrderButton />);

  await user.press(screen.getByRole('button', { name: 'Order now' }));

  expect(screen.getByText('Thanks for your order!')).toBeOnTheScreen();
  expect(screen.toJSON()).toMatchSnapshot();
});
```

Snapshots come out clean — public component names, effective styles, no internal noise:

```
<View accessibilityRole="summary" style={{"borderRadius": 8, "padding": 12}}>
  <Text style={{"color": "#333", "fontSize": 14}}>
    Thanks for your order!
  </Text>
</View>
```

## Coming from jest-expo?

```bash
npx vitest-expo migrate
```

The CLI derives your Vitest config from the existing Jest config, rewires the scripts and reports the few patterns that need a hand. Existing suites keep working as written — `jest.mock`, spies, fake timers and `__mocks__` directories included. Details in the **[migration guide](./MIGRATION.md)** — and if an AI agent does the migrating, hand it **[MIGRATION-AGENTS.md](./MIGRATION-AGENTS.md)** for a full idiomatic rewrite.

## Why

- **One runner for your whole stack.** The same Vitest you use on web and backend — instant watch mode, native ESM and TypeScript, the Vite ecosystem.
- **Tests run your app's real JavaScript.** The same React Native code that ships in the app executes in your tests; only the native boundary is mocked.
- **The Expo SDK works out of the box.** Module mocks are generated from data specs — no per-library setup files, no transform allowlists to maintain.
- **Navigation is testable.** `vitest-expo/router` renders your expo-router screens and drives real navigation (see below).

## Mocking

Project-specific libraries are mocked the standard Vitest way — in a test file or a setup file:

```ts
// test-setup.mocks.ts — a stateful fake, shared by the whole suite
vi.mock('react-native-some-sdk', () => {
  const events: string[] = [];
  return { track: vi.fn((e: string) => events.push(e)), getEvents: () => events };
});
```

```ts
// in a single test file — partial mock, everything else stays real
vi.mock('@/services/orders', async (importOriginal) => ({
  ...(await importOriginal()),
  submitOrder: vi.fn(async () => ({ status: 'ok' })),
}));
```

For finer control:

- `extendPresetMock(pkg, overrides)` from `vitest-expo/helpers` tweaks a built-in library preset (expo-constants, reanimated, …)
- `mockNativeModule(name, impl)` from `vitest-native/helpers` stubs a single native module
- `transformPackages: ['pkg']` handles libraries shipping untranspiled JSX

## Testing navigation

Screens defined with expo-router render through `vitest-expo/router`, and assertions target behavior:

```tsx
import { renderRouter, screen } from 'vitest-expo/router';
import { fireEvent } from '@testing-library/react-native';

test('navigates from home to details', async () => {
  await renderRouter(
    { index: HomeScreen /* renders a <Link href="/details"> */, details: DetailsScreen },
    { initialUrl: '/' }
  );

  await fireEvent.press(screen.getByText('Show details'));

  expect(await screen.findByText('Details')).toBeOnTheScreen();
});
```

Layouts, route groups, dynamic routes with `useLocalSearchParams` and the imperative `testRouter` API are covered too.

## Platforms

iOS is the default. Android and Web are one config each:

```ts
// vitest.config.android.ts
export default defineConfig({ plugins: [vitestExpo({ platform: 'android' })] });

// vitest.config.web.ts — react-native-web in jsdom
export default defineConfig({ plugins: [vitestExpo({ platform: 'web' })] });
```

Or several platforms in one run:

```ts
import { vitestExpoProjects } from 'vitest-expo';

export default defineConfig({
  test: { projects: vitestExpoProjects({ platforms: ['ios', 'android'] }) },
});
```

Platform extensions (`.ios.tsx` / `.android.tsx` / `.native.tsx` / `.web.tsx`) resolve Metro-style everywhere, node_modules included.

## TypeScript

```json
{ "compilerOptions": { "types": ["expo/types", "vitest-expo/types"] } }
```

One entry covers the Vitest globals and the RNTL matchers (`toBeOnTheScreen`, …).

## Status

Beta. Validated against Expo SDK 57 / RN 0.86 / RNTL 13–14 / Vitest 4 — via a conformance suite that runs identically under jest-expo and vitest-expo on iOS, Android and Web ([`examples/app`](./examples/app)), and against a production Expo app (54 suites, ~500 tests). Built on [vitest-native](https://github.com/danfry1/vitest-native), which carries the React Native core.

<details>
<summary><strong>How it works</strong></summary>

vitest-expo layers the Expo pieces on top of vitest-native (real React Native under Node, transform pipeline, library presets):

- pins the **native engine** — everything the Expo layer provides assumes real React Native, so it never silently degrades to a pure-JS mock
- **Jest compatibility on by default**: `jest.mock(...)` calls are hoisted, a `jest` global backed by `vi` is provided, `jest.requireActual` understands your resolve aliases with Metro-style extensionless-TS resolution
- **Node-side resolution hardening** for TS-source Expo packages: extensionless relative imports resolve Metro-style, `.ts` under node_modules transpiles on demand, type-only imports that survived compilation resolve to an empty module
- the **Expo native-module layer** is driven by data specs, not hand-written rules: a reviewed overlay → module specs vendored from jest-expo (72 modules, materialized as vi.fn mocks with jest-expo's exact semantics) → generic Expo conventions (`*Async` methods resolve, PascalCase properties are native classes). Absence is modeled too: probes like `isRunningInExpoGo()` read false — tests behave like a dev build
- real app config is injected into `Constants.expoConfig` (from app.json / app.config.ts), and the runtime setup ships a curated snapshot serializer and an `ErrorUtils` stub
- performance across seven measured real-world suites: cold starts faster everywhere (up to a third, at less than half the CPU), warm full runs faster on six of seven (up to 4x) -- only a very wide suite on a many-core machine ran its warm full pass faster under jest-expo

Package entry points: `vitest-expo` (the plugin) · `vitest-expo/router` · `vitest-expo/helpers` · `vitest-expo/snapshot-serializer` · `vitest-expo/types` · the `vitest-expo` CLI (`migrate`).

</details>

<details>
<summary><strong>Known limitations</strong></summary>

- On web, `@testing-library/react-native` is not usable — its text-in-`<Text>` invariant fires on DOM hosts. That is runner-independent (`jest-expo/web` fails identically); render web tests via `react-test-renderer` or React Testing Library
- `vitest-expo/router` uses deep imports into `expo-router/build/*` (no `exports` field there); verified per Expo SDK — currently SDK 57
- Jest auto-applies root `__mocks__` for node_modules packages without a call; Vitest needs the explicit `jest.mock('pkg')`
- Class mocks constructed with `new` need a `function` implementation — arrow implementations are not constructable
- `jest.requireMock` does not return the live factory instance; import the mocked module instead
- Partial mocks of app modules with a deep import graph are best written as `vi.mock(path, async (importOriginal) => …)`
- Existing jest-expo snapshots need one regeneration (deliberate: the serializer renders the real host tree in a curated format)
- App code is transformed by Vite, not by `babel-preset-expo`. Babel-only syntax still works — `export default from`, Flow-annotated `.js` (with an `@flow` pragma), legacy decorators (with `experimentalDecorators` in tsconfig) — but plugins from the project's `babel.config.js` do not apply; path aliases belong in `resolve.alias`
- Yarn Plug'n'Play is not supported — the React Native toolchain resolves through a real `node_modules` tree; use `nodeLinker: node-modules` (npm, pnpm and bun layouts all work)
- `import.meta` is standard ESM meta under Vite, not Expo's import-meta registry
- `'use dom'` modules run as ordinary React components; they are not rewritten into WebView proxies
- App modules stay ESM in the test graph instead of being converted to CommonJS

</details>

## Development

The library lives at the repository root; [`examples/app`](./examples/app) is the conformance suite — an Expo app whose tests run identically under jest-expo and vitest-expo, on iOS, Android and Web. Every change must keep all reference runs green (see [CONTRIBUTING](./CONTRIBUTING.md)).

## License

MIT
