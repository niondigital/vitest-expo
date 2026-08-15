import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
// Importing expo-video crashes under jest-expo (its mock lacks the
// native-class convention) — under vitest-expo it just works.
import { VideoView } from 'expo-video';

/**
 * vitest-expo injects the real app.json manifest into expo-constants — a
 * deliberate improvement over jest-expo, where Constants.expoConfig stays a
 * placeholder and expo-linking's createURL throws without hand-written mocks.
 * (vitest-only: under jest-expo these assertions fail by design.)
 */
describe('app config manifest injection', () => {
  it('Constants.expoConfig reflects app.json', () => {
    expect(Constants.expoConfig?.name).toBe('app');
    expect(Constants.expoConfig?.slug).toBe('app');
    expect(Constants.expoConfig?.scheme).toBe('app');
  });

  it('expo-linking createURL uses the real scheme', () => {
    expect(Linking.createURL('path/to/thing')).toBe('app://path/to/thing');
  });

  it('scheduled notifications resolve to a list (rejects under jest-expo)', async () => {
    await expect(Notifications.getAllScheduledNotificationsAsync()).resolves.toEqual([]);
  });

  it('expo-video imports and renders (crashes at import under jest-expo)', async () => {
    await render(React.createElement(VideoView, { testID: 'video' }));
    expect(screen.getByTestId('video')).toBeTruthy();
  });
});
