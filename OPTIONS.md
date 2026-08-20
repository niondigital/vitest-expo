# Options

`vitestExpo()` runs without any. Everything below is for a specific situation — the option exists because a real project needed it, and the examples are the shapes those projects had.

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo({ platform: 'android' })],
  test: { globals: true },
});
```

## platform

`'ios'` (default) · `'android'` · `'web'`

Which platform the run simulates: platform extensions (`.ios.tsx`, `.android.tsx`, `.web.tsx`), `Platform.OS`, and the `EXPO_OS` value an app build would have inlined. One config file per platform, or all of them in one run — see [Platforms](./README.md#platforms).

## jestCompat

`boolean`, default `true`

The Jest compatibility layer: `jest.mock` calls are hoisted, a `jest` global backed by `vi` is provided, `jest.requireActual` resolves your path aliases. A suite arriving from jest-expo runs unchanged with it.

Turn it off once the suite is written for Vitest. It is the honest end state — nothing silently depends on the layer any more — and the errors it surfaces are worth fixing (mock factories returning a bare value instead of a module, `require()` inside a factory):

```ts
vitestExpo({ jestCompat: false })
```

## transformPackages

`string[]`, default `[]`

node_modules packages that ship untranspiled JSX or Flow in `.js` files, which Vite's import analysis rejects. Packages that declare `react-native` as a dependency are detected automatically; the ones that need this are usually those declaring it only as a *peer* dependency, so nothing marks them as React Native code.

The symptom is a parse error pointing into node_modules, on a file that is plainly JSX:

```
Failed to parse source for import analysis because the content contains invalid JS syntax.
node_modules/react-native-flash-message/src/FlashMessage.js
```

```ts
vitestExpo({ transformPackages: ['react-native-flash-message'] })
```

This is the equivalent of adding a package to Jest's `transformIgnorePatterns` allowlist, and it applies on both module graphs.

## acknowledgedDuplicates

`string[]`, default `[]`

Packages whose duplicate-resolution diagnostic you have reviewed and accepted.

The engine reports a package that Node and Vite resolve to different files, because it then exists twice with separate module-level state — a store written through one copy reads back unset through the other. It is a real hazard, and it is reported once per package per run.

Some of those you will look at and accept: a pure-function library has nothing to share, and a package only one side ever loads is inert. Naming it here silences it for good, while any *other* package that starts resolving twice is still reported. That is the point — a warning nobody reads any more protects nothing:

```ts
vitestExpo({
  // Reviewed: loaded on the Node side by a React Native package as well, and
  // no test depends on state being shared through them.
  acknowledgedDuplicates: ['redux', 'redux-persist', 'ramda'],
})
```

Before accepting one, check whether it matters. The message names both files; an identity check tells you whether the copies are really separate:

```ts
import { createRequire } from 'node:module';
import { createStore } from 'redux';

console.log(createRequire(import.meta.url)('redux').createStore === createStore); // false → two copies
```

If your tests do cross that boundary, collapse the copies instead: point Vite at the file Node resolved (the second line of the message says which).

## silenceWarnings

`(string | RegExp)[]`, default `[]`

Library warnings that carry no signal in a test run. Strings match from the start of the message, patterns anywhere in it.

The case this exists for: a render-performance heuristic. `react-native-render-html` measures the time between prop updates and warns about "costly rerenders" — a production concern that a test cycling through themes and orientations in one go trips every single time:

```ts
vitestExpo({ silenceWarnings: [/in short periods of time/] })
```

Nothing beyond React Native's own artifacts is silenced by default, because which third-party noise is irrelevant depends on the app.

Both this and `acknowledgedDuplicates` filter through Vitest's [`onConsoleLog`](https://vitest.dev/config/onconsolelog) hook. They are a shortcut for two known cases, not a replacement for it: a handler of your own keeps working, runs first, and its `false` wins.

## reactNative

Options forwarded verbatim to [vitest-native](https://github.com/danfry1/vitest-native)'s `reactNative()` plugin, which carries the React Native layer underneath this one. The escape hatch for anything that layer exposes and this one does not surface — extra asset extensions, its library presets, the hot runtime:

```ts
vitestExpo({
  reactNative: {
    // Metro treats .lottie as an asset; the engine's default list does not.
    assetExts: ['.lottie'],
  },
})
```

`platform` is set from the option above and cannot be passed here.

## vitestExpoProjects()

Not an option but the multi-platform shortcut: one Vitest project per platform in a single run, the way `jest-expo/universal` does it.

```ts
import { vitestExpoProjects } from 'vitest-expo';

export default defineConfig({
  test: { projects: vitestExpoProjects({ platforms: ['ios', 'android'] }) },
});
```

It takes the same options as `vitestExpo()` apart from `platform`, and applies them to every project.
