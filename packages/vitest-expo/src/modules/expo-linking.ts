import { extendPresetMock } from './registry';

/**
 * Completes vitest-native's expo-linking shadow (createURL/parse/useURL only)
 * with the surface expo-router and app code rely on. Mirrors the module mock
 * upstream expo-router/testing-library registers for Jest — but uses the real
 * scheme from app.json when available instead of upstream's 'yourscheme'.
 */
export function applyLinkingMocks(scheme: string | null): void {
  const effectiveScheme = scheme ?? 'yourscheme';
  extendPresetMock('expo-linking', {
    createURL: (path: string) => `${effectiveScheme}://${String(path).replace(/^\//, '')}`,
    resolveScheme: () => effectiveScheme,
    addEventListener: () => ({ remove() {} }),
    getInitialURL: async () => null,
  });
}
