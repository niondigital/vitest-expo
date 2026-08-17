import { consoleNoiseFilter } from '../src/runtime/console-noise';

const DUPLICATE = (pkg: string) =>
  `[vitest-native] '${pkg}' resolves to two different files.\n  Node (require) ->  /a/lib/index.js\n  Vite ("module") ->  /a/es/index.js`;

describe('react native deprecation notices', () => {
  it('drops the notices React Native emits from its entry getters', () => {
    const filter = consoleNoiseFilter();
    for (const notice of [
      'SafeAreaView has been deprecated and will be removed in a future release. Please use …',
      'Clipboard has been extracted from react-native core and will be removed …',
      'ProgressBarAndroid has been extracted from react-native core …',
      'InteractionManager has been deprecated and will be removed in a future release …',
      'PushNotificationIOS has been extracted from react-native core …',
    ]) {
      expect(filter(notice, 'stderr')).toBe(false);
    }
  });

  it('keeps everything else React Native warns about', () => {
    const filter = consoleNoiseFilter();
    expect(filter('Warning: componentWillReceiveProps has been renamed', 'stderr')).toBeUndefined();
    expect(filter('An update to TextButton inside a test was not wrapped in act(...)', 'stderr')).toBeUndefined();
  });
});

describe('duplicate resolution diagnostic', () => {
  it('keeps the first report per package and drops the repeats', () => {
    const filter = consoleNoiseFilter();
    expect(filter(DUPLICATE('redux'), 'stderr')).toBeUndefined();
    expect(filter(DUPLICATE('redux'), 'stderr')).toBe(false);
    expect(filter(DUPLICATE('redux'), 'stderr')).toBe(false);
  });

  it('reports every package once', () => {
    const filter = consoleNoiseFilter();
    expect(filter(DUPLICATE('redux'), 'stderr')).toBeUndefined();
    expect(filter(DUPLICATE('redux-persist'), 'stderr')).toBeUndefined();
    expect(filter(DUPLICATE('redux'), 'stderr')).toBe(false);
  });
});

describe('a filter the project configured', () => {
  it('runs first, and its suppression wins', () => {
    const seen: string[] = [];
    const filter = consoleNoiseFilter((log) => {
      seen.push(log);
      return log.includes('quiet') ? false : undefined;
    });

    expect(filter('quiet please', 'stdout')).toBe(false);
    expect(filter('keep me', 'stdout')).toBeUndefined();
    expect(seen).toEqual(['quiet please', 'keep me']);
  });

  it('does not get a say once it has passed a log through', () => {
    const filter = consoleNoiseFilter(() => undefined);
    expect(filter('SafeAreaView has been deprecated and will be removed in a future release', 'stderr')).toBe(false);
  });
});
