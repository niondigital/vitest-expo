/**
 * Conformance: the widely-used tier of the Expo SDK imports, renders and
 * exposes its documented surface — under jest-expo and vitest-expo alike.
 * Covers function modules, permission hooks and native view components.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView } from 'expo-camera';
// Note: expo-video is covered in 12-app-config.vitest.test.tsx — importing it
// crashes under jest-expo itself (its mock lacks the native-class convention).
import { Text } from 'react-native';

describe('widely-used Expo SDK packages', () => {
  it('expo-application exposes app metadata surface', () => {
    expect('applicationName' in Application).toBe(true);
    expect(typeof Application.getInstallationTimeAsync).toBe('function');
  });

  it('expo-crypto functions are callable', async () => {
    expect(typeof Crypto.digestStringAsync).toBe('function');
    expect(typeof Crypto.randomUUID).toBe('function');
  });

  it('expo-image-picker exposes launch and permission surface', () => {
    expect(typeof ImagePicker.launchImageLibraryAsync).toBe('function');
    expect(typeof ImagePicker.useMediaLibraryPermissions).toBe('function');
  });

  it('expo-location exposes position and permission surface', () => {
    expect(typeof Location.getCurrentPositionAsync).toBe('function');
    expect(typeof Location.requestForegroundPermissionsAsync).toBe('function');
  });

  it('expo-blur BlurView renders children', async () => {
    await render(
      <BlurView intensity={50}>
        <Text>blurred</Text>
      </BlurView>
    );
    expect(screen.getByText('blurred')).toBeTruthy();
  });

  it('expo-linear-gradient renders children', async () => {
    await render(
      <LinearGradient colors={['#000', '#fff']}>
        <Text>gradient</Text>
      </LinearGradient>
    );
    expect(screen.getByText('gradient')).toBeTruthy();
  });

  it('expo-camera CameraView renders', async () => {
    await render(<CameraView testID="camera" />);
    expect(screen.getByTestId('camera')).toBeTruthy();
  });

});
