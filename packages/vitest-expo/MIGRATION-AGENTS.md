# Migrating from jest-expo — instructions for AI coding agents

This guide is for an AI agent performing the migration autonomously. It differs from [MIGRATION.md](./MIGRATION.md) in one important way: a human migrating incrementally can lean on the Jest compatibility layer and keep `jest.*` calls forever. **You must not.** Rewrite the suite so every test reads as if it had been written for vitest-expo from day one — no `jest` identifier anywhere, idiomatic Vitest APIs throughout.

The compatibility layer is still your friend *during* the migration: it lets you reach a green baseline before rewriting, so every subsequent change is verified against passing tests.

## Procedure

Work in this order. Never proceed to the next phase with a red suite.

### Phase 1 — mechanical migration (compat mode)

1. Run `npx vitest-expo migrate --fix`. It writes `vitest.config.mts`, rewires the `test` script, applies the safe rewrites and prints a report.
2. Install exactly what the report's install line says.
3. Apply the tsconfig hint (`"types": ["expo/types", "vitest-expo/types"]`) and remove `"jest"`/`@types/jest` from `compilerOptions.types` if present.
4. Run the suite. Fix the patterns the report flagged (each links to a MIGRATION.md section). Regenerate snapshots exactly once (`vitest run -u`) when snapshot mismatches are the only remaining failure class — review the diff before accepting.
5. **Gate:** the full suite is green and the pass counts match the old Jest run. Record both counts.

### Phase 2 — idiomatic rewrite (file by file)

Rewrite one test/setup file at a time and re-run that file before moving on. Apply this table exhaustively — after the rewrite, the string `jest` must not appear anywhere in test code, setup files, or `__mocks__` files (except inside comments quoting history, which you should also remove):

| Old (Jest) | New (vitest-expo) |
|---|---|
| `jest.mock(path, factory)` | `vi.mock(path, factory)` |
| `jest.mock(path, () => ({ ...jest.requireActual(path), x }))` | `vi.mock(path, async (importOriginal) => ({ ...(await importOriginal()), x }))` |
| `jest.mock(path)` (automock / `__mocks__`) | `vi.mock(path)` |
| `jest.requireActual(path)` outside a factory | `await vi.importActual(path)` (make the enclosing scope async) |
| `jest.requireMock(path)` | import the mocked module directly |
| `jest.fn()` / `jest.fn(impl)` | `vi.fn()` / `vi.fn(impl)` |
| `jest.fn().mockImplementation(() => …)` used with `new` | `vi.fn(function (this: T) { … })` — constructable |
| `jest.spyOn(obj, m)` | `vi.spyOn(obj, m)` |
| `jest.useFakeTimers()` / `useRealTimers` / `advanceTimersByTime` / `runAllTimers` / `setSystemTime` | same names on `vi.*` |
| `jest.clearAllMocks` / `resetAllMocks` / `restoreAllMocks` | same names on `vi.*` |
| `jest.doMock` | `vi.mock` when it should apply suite-wide (setup files); `vi.doMock` only for the rare deliberately-unhoisted case |
| `(fn as jest.Mock)` | `vi.mocked(fn)` |
| `jest.Mock` / `jest.Mocked<T>` / `jest.SpyInstance` types | `Mock` / `Mocked<T>` / `MockInstance` from `'vitest'` |
| `(useColorScheme as jest.Mock).mockReturnValue(x)` | `setColorScheme(x)` from `'vitest-native/helpers'` |
| `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))` | delete — the built-in preset covers reanimated; fill gaps with `extendPresetMock` from `'vitest-expo/helpers'` |
| `Platform.OS = 'android'` | delete; platform is config-level (`vitestExpo({ platform })`, one config or one project per platform) |
| library-documented Jest setup (e.g. `require('react-native-gesture-handler/jestSetup')`, async-storage/safe-area jest mocks) | delete when a built-in preset covers the library (gesture-handler, safe-area, async-storage, reanimated, screens, navigation do); otherwise keep the mock but express it as `vi.mock` |

Rules while rewriting:

- **Never weaken an assertion** to make a test pass. If behavior genuinely differs, stop and record it as a finding instead of papering over it.
- Preserve test names, structure and intent; this is a mechanical style migration, not a refactor.
- `__mocks__` files: convert dynamically computed CJS exports (`module.exports = new Proxy(…)`, `Object.defineProperty(module.exports, …)`) to static named exports — named ESM imports cannot see dynamic ones.
- Setup files register suite-wide mocks with `vi.mock` at top level; stateful fakes keep their state inside the factory.

### Phase 3 — prove that no Jest remains

1. Set `jestCompat: false` in every `vitestExpo(...)` call in the config(s). This removes the `jest` global, the mock-call transform and the Jest shims.
2. Run the FULL suite (all platform configs). **It must be green.** Any failure here means a `jest.*` usage survived — fix it and re-run. This gate is the point of the whole exercise: green without the compatibility layer proves the suite is native vitest-expo.
3. Decide the final config state: leave `jestCompat: false` in place (recommended — it prevents regressions to Jest idioms) unless the project owner wants the default back.

### Phase 4 — cleanup

- Remove Jest artifacts: `jest.config.*`, jest keys in package.json, `babel-jest`/`jest`/`jest-expo`/`@types/jest`/`ts-jest` from devDependencies, jest-only setup files, `test:jest` scripts.
- Remove any `.pre-migration.bak` config once the owner has seen it.
- Final verification: full suite on every configured platform, plus the project's typecheck/lint commands.
- Summarize for the owner: pass counts before/after, every file rewritten, every behavioral finding, and the one-time snapshot regeneration.

## Acceptance checklist

- [ ] Suite green with pass counts matching the Jest baseline
- [ ] `grep -r "jest" --include="*.test.*" --include="*.spec.*"` over test code, setup and `__mocks__` files returns nothing meaningful
- [ ] Full suite green with `jestCompat: false`
- [ ] Snapshots regenerated exactly once and reviewed
- [ ] Jest dependencies and configs removed
- [ ] Typecheck and lint pass
