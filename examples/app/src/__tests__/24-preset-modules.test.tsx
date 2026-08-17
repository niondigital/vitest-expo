/**
 * Conformance: the Expo packages that sit directly on the native boundary —
 * expo-font, expo-asset, expo-splash-screen, expo-status-bar, expo-constants
 * and expo-linking — run their own code in tests, so their documented behavior
 * (loading states, metadata, return values, full export surface) is observable
 * and identical under jest-expo and vitest-expo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Asset, useAssets } from 'expo-asset';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as StatusBarModule from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

describe('expo-font', () => {
  it('exposes the full module surface', () => {
    expect(Object.keys(Font).sort()).toEqual([
      'FontDisplay',
      'getLoadedFonts',
      'isLoaded',
      'isLoading',
      'loadAsync',
      'renderToImageAsync',
      'unloadAllAsync',
      'unloadAsync',
      'useFonts',
    ]);
  });

  it('useFonts reports the loading state before resolving to loaded', async () => {
    const results: [boolean, Error | null][] = [];
    const Screen = () => {
      results.push(Font.useFonts({ HookFont: 1 as never }));
      return <Text>content</Text>;
    };

    expect(Font.isLoaded('HookFont')).toBe(false);
    await render(<Screen />);

    expect(results[0]).toEqual([false, null]);
    expect(results[results.length - 1]).toEqual([true, null]);
    expect(Font.isLoaded('HookFont')).toBe(true);
    expect(Font.isLoading('HookFont')).toBe(false);
  });

  it('loadAsync marks a font as loaded', async () => {
    expect(Font.isLoaded('ImperativeFont')).toBe(false);
    await expect(Font.loadAsync('ImperativeFont', 1 as never)).resolves.toBeUndefined();
    expect(Font.isLoaded('ImperativeFont')).toBe(true);
  });

  it('getLoadedFonts reads the native font list', () => {
    expect(Font.getLoadedFonts()).toEqual([]);
  });
});

describe('expo-asset', () => {
  it('derives metadata from a URI', () => {
    const asset = Asset.fromURI('https://example.com/photo.png');

    expect(asset.type).toBe('png');
    expect(asset.uri).toBe('https://example.com/photo.png');
    expect(asset.hash).toBeNull();
    expect(asset.downloaded).toBe(false);
  });

  it('keeps dimensions of a source object', () => {
    const asset = Asset.fromModule({ uri: 'https://example.com/pic.jpg', width: 120, height: 80 });

    expect(asset.type).toBe('jpg');
    expect(asset.width).toBe(120);
    expect(asset.height).toBe(80);
  });

  it('downloadAsync resolves with the same asset, marked as downloaded', async () => {
    const asset = Asset.fromURI('https://example.com/download.png');
    const downloaded = await asset.downloadAsync();

    expect(downloaded).toBe(asset);
    expect(asset.downloaded).toBe(true);
  });

  it('exposes the useAssets hook', () => {
    expect(typeof useAssets).toBe('function');
  });
});

describe('expo-splash-screen', () => {
  it('exposes the full module surface', () => {
    expect(Object.keys(SplashScreen).sort()).toEqual([
      'hide',
      'hideAsync',
      'preventAutoHideAsync',
      'setOptions',
    ]);
  });

  it('resolves the async control calls', async () => {
    await expect(SplashScreen.preventAutoHideAsync()).resolves.toBeUndefined();
    await expect(SplashScreen.hideAsync()).resolves.toBeUndefined();
  });

  it('hides synchronously without throwing', () => {
    expect(SplashScreen.hide()).toBeUndefined();
  });
});

describe('expo-status-bar', () => {
  it('exposes the native module surface', () => {
    expect(Object.keys(StatusBarModule).sort()).toEqual([
      'StatusBar',
      'setStatusBarHidden',
      'setStatusBarStyle',
    ]);
  });

  it('renders without host output and accepts imperative style changes', async () => {
    await render(<StatusBarModule.StatusBar style="dark" hidden />);

    expect(screen.toJSON()).toBeNull();
    expect(() => StatusBarModule.setStatusBarStyle('light')).not.toThrow();
    expect(() => StatusBarModule.setStatusBarHidden(true)).not.toThrow();
  });
});

describe('expo-constants', () => {
  it('exposes the device constants the platform supplies', () => {
    expect(Constants.sessionId).toEqual(expect.any(String));
    expect(Constants.statusBarHeight).toBe(54);
    expect(Constants.deviceName).toEqual(expect.any(String));
    expect(Constants.systemFonts).toEqual([]);
    expect(Constants.isHeadless).toBe(false);
    expect(Constants.debugMode).toBe(true);
    expect(Constants.appOwnership).toBeNull();
    expect(typeof Constants.getWebViewUserAgentAsync).toBe('function');
  });
});

describe('expo-linking', () => {
  it('exposes the full module surface', () => {
    expect(Object.keys(Linking).sort()).toEqual([
      'addEventListener',
      'canOpenURL',
      'clearInitialURL',
      'collectManifestSchemes',
      'createURL',
      'getInitialURL',
      'getLinkingURL',
      'hasConstantsManifest',
      'hasCustomScheme',
      'openSettings',
      'openURL',
      'parse',
      'parseInitialURLAsync',
      'resolveScheme',
      'sendIntent',
      'useLinkingURL',
      'useURL',
    ]);
  });

  it('reads the initial URL from the native layer', async () => {
    await expect(Linking.getInitialURL()).resolves.toBeNull();
    expect(Linking.getLinkingURL()).toBeNull();
  });
});
