import React from 'react';
import { render } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';

describe('expo modules covered by both runners', () => {
  it('expo-constants exposes a manifest/config object', () => {
    expect(Constants).toBeTruthy();
    expect(typeof Constants.executionEnvironment).toBe('string');
  });

  it('expo-linking module loads with expected surface', () => {
    // Note: createURL() AND parse() both need the expo-constants manifest,
    // which not even jest-expo provides in tests — so both runners can only
    // assert the module surface here. (Finding: jest-expo gap.)
    expect(typeof Linking.createURL).toBe('function');
    expect(typeof Linking.parse).toBe('function');
  });

  it('expo-font isLoaded is callable', () => {
    expect(typeof Font.isLoaded).toBe('function');
    expect(() => Font.isLoaded('SpaceMono')).not.toThrow();
  });

  it('expo-status-bar renders', async () => {
    await expect(render(<StatusBar style="auto" />)).resolves.toBeTruthy();
  });
});
