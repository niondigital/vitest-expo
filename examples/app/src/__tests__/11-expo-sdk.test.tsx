import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { runner } from './test-utils';

/**
 * Core Expo SDK modules beyond the default template — the surface a typical
 * app touches (locale, notifications, haptics, storage, clipboard, files).
 * jest-expo covers these through its module mocks; vitest-expo must match.
 */
describe('core expo SDK modules', () => {
  it('expo-localization exposes locale data', () => {
    expect(typeof Localization.getLocales).toBe('function');
    const locales = Localization.getLocales();
    expect(Array.isArray(locales)).toBe(true);
  });

  it('expo-notifications exposes scheduling surface', () => {
    expect(typeof Notifications.scheduleNotificationAsync).toBe('function');
    expect(typeof Notifications.getAllScheduledNotificationsAsync).toBe('function');
    expect(typeof Notifications.setNotificationHandler).toBe('function');
  });

  it('expo-haptics functions are callable', async () => {
    expect(typeof Haptics.impactAsync).toBe('function');
    await expect(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).resolves.toBeUndefined();
  });

  it('expo-secure-store surface exists', () => {
    expect(typeof SecureStore.getItemAsync).toBe('function');
    expect(typeof SecureStore.setItemAsync).toBe('function');
  });

  it('expo-clipboard surface exists', () => {
    expect(typeof Clipboard.getStringAsync).toBe('function');
    expect(typeof Clipboard.setStringAsync).toBe('function');
  });

  it('expo-file-system exposes the SDK 57 File/Paths API', () => {
    expect(File).toBeTruthy();
    expect(Paths).toBeTruthy();
  });

  it('async native methods resolve like jest-expo mocks', async () => {
    await expect(SecureStore.getItemAsync('some-key')).resolves.toBeFalsy();
    // Note: Notifications.getAllScheduledNotificationsAsync() REJECTS under
    // jest-expo (mock resolves undefined, package JS maps over it) — covered
    // as a vitest-expo improvement in 12-app-config.vitest.test.tsx.
  });

  it('KNOWN DELTA: root __mocks__ auto-apply for node_modules packages', async () => {
    // __mocks__/expo-clipboard.ts exists at the project root (for 14-mock-dirs).
    // Jest applies node_modules __mocks__ AUTOMATICALLY, without a jest.mock
    // call; Vitest only applies them on an explicit vi.mock call. Migration
    // guide: add the explicit call (portable under both runners, see 14).
    const clipboard = await Clipboard.getStringAsync();
    if (runner === 'jest') {
      expect(clipboard).toBe('clipboard from root __mocks__');
    } else {
      expect(clipboard).toBeFalsy();
    }
  });
});
