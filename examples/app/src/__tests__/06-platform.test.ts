import { Platform } from 'react-native';
import { platformLabel } from '../utils/platform-label';

describe('platform extension resolution (Metro semantics)', () => {
  it('resolves the platform-specific module matching Platform.OS', () => {
    // Documents which platform the runner resolves to; the assertion is
    // that module resolution and Platform.OS agree.
    expect(['ios', 'android', 'web', 'default']).toContain(platformLabel);
    if (platformLabel !== 'default') {
      expect(Platform.OS).toBe(platformLabel);
    }
    // babel-preset-expo inlines EXPO_OS in app builds; the test runner provides
    // it per platform — module resolution, Platform.OS and env must all agree.
    expect(Platform.OS).toBe(process.env.EXPO_OS);
  });
});
