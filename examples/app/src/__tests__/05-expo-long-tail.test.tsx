import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import * as Device from 'expo-device';
import * as WebBrowser from 'expo-web-browser';

/**
 * Modules jest-expo mocks out of the box but which are NOT in
 * vitest-native's expo preset. Expected divergence zone.
 */
describe('expo long-tail modules (jest-expo covers, vitest-native preset does not)', () => {
  it('expo-image <Image> renders', async () => {
    await render(<Image testID="img" source={{ uri: 'https://example.com/x.png' }} />);
    expect(screen.getByTestId('img')).toBeTruthy();
  });

  it('expo-device exposes device info', () => {
    expect(Device).toBeTruthy();
    expect('osName' in Device).toBe(true);
  });

  it('expo-web-browser functions are callable', () => {
    expect(typeof WebBrowser.openBrowserAsync).toBe('function');
  });
});
