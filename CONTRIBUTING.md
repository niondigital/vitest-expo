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

## Releasing

The major version tracks the Expo SDK the release is verified against (`58.x` → SDK 58); minor and patch follow the usual semantics within it.

1. Update `CHANGELOG.md` and the version in `package.json`.
2. Tag the commit `v<version>` and push the tag — the release workflow runs the unit tests and the conformance suites, then publishes to npm with provenance. A prerelease version (`58.0.0-rc.1`) goes to the `next` dist-tag and leaves `latest` on the last stable release.

The workflow authenticates over OIDC: npm has this repository and `release.yml` registered as a trusted publisher, so no npm token exists anywhere. Renaming the workflow file or moving the repository breaks that link and needs the trusted-publisher entry updated on npmjs.com.

Publishing by hand (`npm publish --workspaces=false`) works too, but produces no provenance attestation — the registry only issues those for a publish from a recognized CI.

## License of contributions

The project is MIT-licensed and copyright is held by nion digital GmbH. Contributions are accepted under the same MIT license — opening a pull request means you are fine with your change being distributed that way. There is no CLA to sign.
