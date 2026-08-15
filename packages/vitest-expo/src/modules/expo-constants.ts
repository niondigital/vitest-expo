import { extendPresetMock } from './registry';

export interface AppConfig {
  name?: string;
  slug?: string;
  scheme?: string | string[];
  [key: string]: unknown;
}

/**
 * Injects the project's real app config (app.json `expo` key, forwarded by the
 * plugin via VITEST_EXPO_APP_CONFIG) into the expo-constants mock.
 *
 * This intentionally exceeds jest-expo: there `Constants.expoConfig` stays
 * empty in tests, which is why `expo-linking`'s createURL/parse throw without
 * hand-written mocks.
 */
export function applyAppConfig(): AppConfig | null {
  const raw = process.env.VITEST_EXPO_APP_CONFIG;
  if (!raw) return null;

  let config: AppConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    return null;
  }

  const scheme = appScheme(config);
  extendPresetMock('expo-constants', {
    expoConfig: config,
    linkingUri: scheme ? `${scheme}://` : '',
    // The preset default is 'storeClient' (= Expo Go), which makes packages
    // apply Expo Go restrictions — expo-notifications even throws on Android.
    // Tests model a real (dev/standalone) build.
    executionEnvironment: 'bare',
    appOwnership: null,
  });
  return config;
}

export function appScheme(config: AppConfig | null): string | null {
  const scheme = config?.scheme;
  if (Array.isArray(scheme)) return scheme[0] ?? null;
  return scheme ?? null;
}
