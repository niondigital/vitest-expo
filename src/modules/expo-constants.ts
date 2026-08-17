export interface AppConfig {
  name?: string;
  slug?: string;
  scheme?: string | string[];
  [key: string]: unknown;
}

/**
 * Publishes the project's real app config (app.json / app.config.js, forwarded
 * by the plugin via VITEST_EXPO_APP_CONFIG) on the mocked `ExponentConstants`
 * native module — the same property the platform fills on device.
 *
 * expo-constants' own JavaScript derives everything from there
 * (`Constants.manifest`, `.expoConfig`, `.expoGoConfig`, `.easConfig`), and
 * packages reading the manifest — expo-linking's scheme resolution above all —
 * work without a hand-written module mock. Injecting data one layer below the
 * package is what keeps the package's real behavior intact.
 *
 * This intentionally exceeds Jest's Expo preset, where the manifest stays
 * empty and `Linking.createURL()` therefore throws.
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

  const constants = (globalThis as any).expo?.modules?.ExponentConstants;
  if (constants) {
    constants.manifest = config;
    // Supplied by the platform on a device, and read by expo-linking when the
    // app has no custom scheme.
    const scheme = appScheme(config);
    constants.linkingUri = scheme ? `${scheme}://` : '';
  }
  return config;
}

export function appScheme(config: AppConfig | null): string | null {
  const scheme = config?.scheme;
  if (Array.isArray(scheme)) return scheme[0] ?? null;
  return scheme ?? null;
}
