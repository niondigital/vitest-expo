import type { ModuleSpec } from './expo-module-specs';

/**
 * Data overlay on top of the vendored jest-expo module specs — same format,
 * extended by one field: `returns`, the JSON value a mocked function should
 * return (resolve to, for functionType 'promise'). jest-expo's own format can
 * replace a property via `mock:` but cannot express a function's return
 * value, which is exactly what these fixes need.
 *
 * Everything here is a candidate for an upstream jest-expo PR: each entry
 * exists because the spec default (resolve/return undefined) breaks the
 * documented API contract of the package's own JS.
 *
 * A mock shipped by the package itself takes precedence over this overlay —
 * the package author's description of its own native module is always the
 * better source (see runtime/package-native-mocks).
 */
export const MODULE_SPEC_OVERRIDES: Record<string, ModuleSpec> = {
  // Optional observability module: expo-image reads
  // `getIntegrations()['expo-image']` at import time.
  ExpoObserve: {
    getIntegrations: { type: 'function', returns: {} },
  },

  // The package JS maps over this result — with jest-expo's undefined it
  // rejects even under Jest (which is why real apps hand-mock the package).
  ExpoNotificationScheduler: {
    getAllScheduledNotificationsAsync: {
      type: 'function',
      functionType: 'promise',
      returns: [],
    },
  },

  // Sync native getters consumed structurally by app code — deterministic
  // en-US defaults.
  ExpoLocalization: {
    getLocales: {
      type: 'function',
      returns: [
        {
          languageTag: 'en-US',
          languageCode: 'en',
          languageRegionCode: 'US',
          regionCode: 'US',
          currencyCode: 'USD',
          currencySymbol: '$',
          decimalSeparator: '.',
          digitGroupingSeparator: ',',
          textDirection: 'ltr',
          measurementSystem: 'us',
          temperatureUnit: 'fahrenheit',
          languageCurrencyCode: 'USD',
          languageCurrencySymbol: '$',
        },
      ],
    },
    getCalendars: {
      type: 'function',
      returns: [{ calendar: 'gregory', timeZone: 'UTC', uses24hourClock: false, firstWeekday: 1 }],
    },
  },
};
