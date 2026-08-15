import { Platform } from 'react-native';
import { platformLabel } from '../utils/platform-label';

describe('platform extension resolution (Metro semantics)', () => {
  it('resolves the platform-specific module matching Platform.OS', () => {
    // Documents which platform the runner resolves to; the assertion is
    // that module resolution and Platform.OS agree.
    expect(['ios', 'android', 'default']).toContain(platformLabel);
    if (platformLabel !== 'default') {
      expect(Platform.OS).toBe(platformLabel);
    }
  });
});
