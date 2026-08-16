/**
 * Access to vitest-native's preset-mock registry (the objects its shadow
 * modules for expo-* / react-native-* packages read their exports from).
 *
 * This is an internal vitest-native surface — the upstream ask is a public
 * `extendPresetMock()` API. Centralized here so exactly one file breaks if
 * the internals move.
 */
export function extendPresetMock(pkg: string, overrides: Record<string, unknown>): boolean {
  const mocks = (globalThis as any).__vitest_native_preset_mocks;
  const mock = mocks?.[pkg];
  if (!mock) return false;
  Object.assign(mock, overrides);
  if (mock.default && typeof mock.default === 'object') {
    Object.assign(mock.default, overrides);
  }
  return true;
}
