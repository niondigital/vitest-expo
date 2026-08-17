# Contributing

## Setup

```bash
npm ci
npm run build
```

## Testing

Two layers. Unit tests cover the logic that has no React Native in it — the migrate CLI, the syntax-compat transform, the snapshot serializer:

```bash
npm test          # vitest run, at the repository root
npx tsc --noEmit
```

The conformance gate is `examples/app`: an Expo app whose suite runs identically under jest-expo and vitest-expo, on iOS and Android. Every change must keep all three runs green:

```bash
npm run test:vitest --workspace app          # Vitest, iOS
npm run test:vitest:android --workspace app  # Vitest, Android
npm run test:jest --workspace app            # jest-expo reference
npm run typecheck --workspace app
```

When a change affects behavior jest-expo also has, add a conformance test that runs under both runners (see `examples/app/src/__tests__`). Behavior that deliberately differs from jest-expo goes into a `*.vitest.test.tsx` file with a comment explaining the difference.

A change to what the package *ships* — its exports, dependencies or peers — is not covered by either layer, because the conformance app links the library from the working tree. Verify those against a real install:

```bash
npm pack --workspaces=false --pack-destination /tmp
node scripts/verify-install-layout.mjs npm /tmp     # also: pnpm, yarn, bun
```

After bumping jest-expo, regenerate the vendored module specs; CI fails otherwise:

```bash
npm run import-jest-expo-mocks
npm run check-spec-drift
```

## Releasing

The major version tracks the Expo SDK the release is verified against (`57.x` → SDK 57); minor and patch follow the usual semantics within it.

1. Update `CHANGELOG.md` and the version in `package.json`.
2. Tag the commit `v<version>` and push the tag — the release workflow runs the unit tests, the spec-drift gate and the conformance suites, then publishes to npm with provenance.

Publishing by hand (`npm publish --workspaces=false`) works too; `prepublishOnly` builds first.
