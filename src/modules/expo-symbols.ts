import React from 'react';

/**
 * Module shadow for expo-symbols. Its android entry imports a JSON file that
 * vitest-native's Node-side ESM loader currently rejects (missing `type: json`
 * import attribute — upstream issue), and expo-router's android native-tabs
 * path hard-requires the package. Registering a mock in the preset registry
 * short-circuits that require the same way vitest-native's own presets do.
 */
export function applySymbolsMock(): void {
  const mocks = (globalThis as any).__vitest_native_preset_mocks;
  if (!mocks || 'expo-symbols' in mocks) return;

  const SymbolView = (props: Record<string, unknown>) =>
    React.createElement('SymbolView', props);
  const exports = {
    SymbolView,
    unstable_getMaterialSymbolSourceAsync: async () => null,
  };
  mocks['expo-symbols'] = { ...exports, default: exports };
}
