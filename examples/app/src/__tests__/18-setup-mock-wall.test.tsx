/**
 * Conformance: a PROJECT-level setup file (test-setup.mocks.ts)
 * registers a stateful fake for a library via jest.mock — the "mock wall"
 * pattern real jest-expo apps use for their special libraries. vitest-expo's
 * core deliberately only covers the common Expo stack; everything else is
 * project territory, and this proves that territory works.
 */
import * as Notifications from 'expo-notifications';

describe('project-level setup mock wall (both runners)', () => {
  it('serves the stateful fake from the user setup file', async () => {
    await expect(Notifications.getAllScheduledNotificationsAsync()).resolves.toEqual([]);

    const id = await Notifications.scheduleNotificationAsync({
      content: { title: 'Reminder' },
      trigger: null,
    } as never);
    expect(id).toBe('id-1');

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    expect(scheduled).toHaveLength(1);
    expect((scheduled[0] as any).content.title).toBe('Reminder');

    await Notifications.cancelAllScheduledNotificationsAsync();
    await expect(Notifications.getAllScheduledNotificationsAsync()).resolves.toEqual([]);
  });

  it('fake functions carry mock state', () => {
    expect((Notifications.setNotificationHandler as any).mock).toBeTruthy();
  });
});
