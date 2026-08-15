# vitest-expo (monorepo)

Test Expo apps with Vitest — the jest-expo experience on a modern runner.

**→ Package docs: [`packages/vitest-expo`](packages/vitest-expo/README.md)**

## Layout

| Path | What |
|---|---|
| [`packages/vitest-expo`](packages/vitest-expo) | The published package: plugin preset, `vitest-expo/router`, snapshot serializer, Expo native-module layer |
| [`examples/app`](examples/app) | Expo SDK 57 app whose test suite runs identically under **jest-expo and vitest-expo** — the conformance gate (CI runs iOS, Android and the jest-expo reference) |

## Development

```bash
npm ci
npm run build --workspace vitest-expo
npm run test --workspace app   # vitest iOS + Android + jest-expo reference
```

## Status & credits

Beta (0.1.0), validated against Expo SDK 57 / RN 0.86 / RNTL 14 / Vitest 4. Built on [vitest-native](https://github.com/danfry1/vitest-native) (React Native core under Vitest). The native-module mock specs are vendored from [jest-expo](https://github.com/expo/expo/tree/main/packages/jest-expo) (MIT, Expo).

MIT © Sebastian Weyrauch
