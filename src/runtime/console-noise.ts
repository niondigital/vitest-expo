/**
 * Output that repeats once per test file without carrying per-file
 * information. Both cases below come from a module registry that is rebuilt for
 * every test file: a once-per-session guard inside the emitting module is once
 * per *file* here, so a 50-file suite prints the same paragraph 50 times.
 *
 * Filtering has to happen in the main process — with test isolation, anything a
 * setup file remembers is forgotten again with the next file — which is what
 * Vitest's onConsoleLog hook is: it sees every intercepted log and can drop it.
 */

/**
 * React Native's entry module exposes moved and deprecated names as getters
 * that warn when read: ProgressBarAndroid, SafeAreaView, Clipboard,
 * InteractionManager, PushNotificationIOS. Building a module namespace for
 * `react-native` reads every export, so importing anything from it triggers all
 * five at once.
 *
 * Under jest-expo none of this appears — everything stays CommonJS there, so no
 * namespace is ever materialized. The notices say nothing about the app under
 * test, and are dropped to keep the two runners' output comparable. Everything
 * else React Native warns about passes through.
 */
const REACT_NATIVE_NOTICES = [
  'ProgressBarAndroid has been extracted from react-native core',
  'SafeAreaView has been deprecated and will be removed in a future release',
  'Clipboard has been extracted from react-native core',
  'InteractionManager has been deprecated and will be removed in a future release',
  'PushNotificationIOS has been extracted from react-native core',
];

/**
 * The engine reports a package whose Node and Vite resolutions disagree. That is
 * worth reading — the package can end up loaded twice with unshared module
 * state — but it describes the install, not the test file, so it is kept for the
 * first file that hits it and dropped afterwards.
 */
const DUPLICATE_RESOLUTION = /^\[vitest-native\] '([^']+)' resolves to two different files/;

export type ConsoleLogFilter = (log: string, type: 'stdout' | 'stderr') => boolean | void;

export interface ConsoleNoiseOptions {
  /** Packages whose duplicate resolution has been reviewed — never reported again. */
  acknowledgedDuplicates?: string[];
  /** Project-specific noise: matched by prefix for strings, anywhere for patterns. */
  silenceWarnings?: (string | RegExp)[];
}

/**
 * Builds the onConsoleLog handler, chaining a handler the project may already
 * have configured: an explicit `false` from the project still wins.
 */
export function consoleNoiseFilter(
  existing?: ConsoleLogFilter,
  options: ConsoleNoiseOptions = {}
): ConsoleLogFilter {
  const reportedDuplicates = new Set<string>();
  const acknowledged = new Set(options.acknowledgedDuplicates ?? []);
  const silenced = options.silenceWarnings ?? [];

  return (log, type) => {
    if (existing) {
      const verdict = existing(log, type);
      if (verdict === false) return false;
    }

    if (REACT_NATIVE_NOTICES.some((notice) => log.startsWith(notice))) return false;

    if (
      silenced.some((pattern) =>
        typeof pattern === 'string' ? log.startsWith(pattern) : pattern.test(log)
      )
    ) {
      return false;
    }

    const duplicate = DUPLICATE_RESOLUTION.exec(log);
    if (duplicate) {
      // Acknowledged packages stay quiet; anything new still gets its one report,
      // which is what keeps the diagnostic worth reading.
      if (acknowledged.has(duplicate[1])) return false;
      if (reportedDuplicates.has(duplicate[1])) return false;
      reportedDuplicates.add(duplicate[1]);
    }

    return undefined;
  };
}
