# vitest-expo

**Test your Expo app with Vitest.** A drop-in replacement for jest-expo — iOS, Android and Web, verified against a production app and a conformance suite that runs every test under both runners.

```bash
npx vitest-expo migrate   # inside your jest-expo project
```

That's the migration. It reads your Jest config, writes the Vitest one, rewires your scripts and tells you the handful of things it can't do for you. Your existing tests — `jest.mock` walls, `requireActual` partial mocks, `__mocks__` directories, spies, fake timers — keep working as written.

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

Then write tests the way you already do:

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

## Why

- **Watch mode that feels instant.** Single-file re-runs and cold starts are faster than jest-expo; cold runs take less than half the CPU (relevant in CI containers). Full warm runs are on par.
- **Your tests hit real React Native.** jest-expo replaces core components and modules with stubs; here the same JavaScript runs that ships in your app — only the native boundary is mocked.
- **`Constants.expoConfig` is your real app config.** Read from app.json / app.config.ts, so code that depends on your scheme, name or extra values behaves like production. Under jest-expo the manifest is empty.
- **expo-router screens are testable.** Upstream's `expo-router/testing-library` is Jest-only; `vitest-expo/router` provides it for Vitest:

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

- **No config archaeology.** No `transformIgnorePatterns` allowlists, no custom resolvers to force ESM packages into CJS, no per-library mock files for the Expo SDK — the Expo module layer ships with the preset.
- **One runner across web and native.** The same Vitest you use everywhere else, including `platform: 'web'` (react-native-web in jsdom, like `jest-expo/web`).

## Migrating from jest-expo

```bash
npx vitest-expo migrate        # analyze + generate config + report
npx vitest-expo migrate --fix  # also apply the safe auto-fixes
```

The CLI derives a `vitest.config.ts` from your Jest config (setup files, tsconfig-path and `moduleNameMapper` aliases, ignore patterns), points the `test` script at Vitest, prints the exact install line for anything missing, and scans the suite for the few patterns that need a hand — each covered with before/after examples in the **[migration guide](./MIGRATION.md)**. Snapshots are regenerated once (`vitest run -u`).

## Mocking

Everything project-specific stays project territory, with the mechanisms you know:

```ts
// a stateful mock wall in your setup file — exactly like under jest-expo
jest.mock('react-native-some-sdk', () => {
  const events: string[] = [];
  return { track: jest.fn((e: string) => events.push(e)), getEvents: () => events };
});
```

- `jest.mock` / `vi.mock` in tests or setup files (factories, `requireActual` partials — tsconfig aliases included, `__mocks__` dirs, automocks)
- `extendPresetMock(pkg, overrides)` from `vitest-expo/helpers` to tweak a built-in library preset (expo-constants, reanimated, …)
- `mockNativeModule(name, impl)` from `vitest-native/helpers` for a single native module
- `transformPackages: ['pkg']` for libraries shipping untranspiled JSX

## Platforms

iOS is the default. Android and Web are one config each:

```ts
// vitest.config.android.ts
export default defineConfig({ plugins: [vitestExpo({ platform: 'android' })] });

// vitest.config.web.ts — react-native-web in jsdom
export default defineConfig({ plugins: [vitestExpo({ platform: 'web' })] });
```

Platform extensions (`.ios.tsx` / `.android.tsx` / `.native.tsx` / `.web.tsx`) resolve Metro-style everywhere, node_modules included.

## TypeScript

```json
{ "compilerOptions": { "types": ["expo/types", "vitest-expo/types"] } }
```

One entry covers the Vitest globals and the RNTL matchers (`toBeOnTheScreen`, …).

## Status

Beta. Validated against Expo SDK 57 / RN 0.86 / RNTL 13–14 / Vitest 4 — via a conformance suite that runs identically under jest-expo and vitest-expo on iOS, Android and Web ([`examples/app`](../../examples/app)), and against a production Expo app (54 suites, ~500 tests: Redux, React Navigation, BLE, maps). Built on [vitest-native](https://github.com/danfry1/vitest-native), which carries the React Native core.

<details>
<summary><strong>How it works</strong></summary>

vitest-expo layers the Expo pieces on top of vitest-native (real React Native under Node, transform pipeline, library presets):

- pins the **native engine** — everything the Expo layer provides assumes real React Native, so it never silently degrades to a pure-JS mock
- **Jest compatibility on by default**: `jest.mock(...)` calls are hoisted, a `jest` global backed by `vi` is provided, `jest.requireActual` understands your resolve aliases with Metro-style extensionless-TS resolution
- **Node-side resolution hardening** for TS-source Expo packages: extensionless relative imports resolve Metro-style, `.ts` under node_modules transpiles on demand, type-only imports that survived compilation resolve to an empty module
- the **Expo native-module layer** is driven by data specs, not hand-written rules: a reviewed overlay → module specs vendored from jest-expo (72 modules, materialized as vi.fn mocks with jest-expo's exact semantics) → generic Expo conventions (`*Async` methods resolve, PascalCase properties are native classes). Absence is modeled too: probes like `isRunningInExpoGo()` read false — tests behave like a dev build
- injects the runtime setup: curated snapshot serializer, `ErrorUtils` stub, real app config into `Constants.expoConfig`

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

</details>

## Development

Monorepo: `packages/vitest-expo` (this package) and `examples/app` (the conformance suite — every change must keep the jest-expo reference runs green too, see [CONTRIBUTING](../../CONTRIBUTING.md)).

## License

MIT
