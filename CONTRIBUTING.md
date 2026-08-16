# Contributing

## Setup

```bash
npm ci
npm run build
```

## Testing

The conformance gate is `examples/app`: an Expo app whose suite runs identically under jest-expo and vitest-expo, on iOS and Android. Every change must keep all three runs green:

```bash
npm run test:vitest --workspace app          # Vitest, iOS
npm run test:vitest:android --workspace app  # Vitest, Android
npm run test:jest --workspace app            # jest-expo reference
npm run typecheck --workspace app
```

When a change affects behavior jest-expo also has, add a conformance test that runs under both runners (see `examples/app/src/__tests__`). Behavior that deliberately differs from jest-expo goes into a `*.vitest.test.tsx` file with a comment explaining the difference.

## Releasing

`npm publish` from the repository root (prepublishOnly builds). Versioning follows the supported Expo SDK.
