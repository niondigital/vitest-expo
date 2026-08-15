/**
 * Conformance: the central community libraries a typical Expo app ships —
 * storage, safe area, gesture handler, SVG — work under both runners.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { Text, View } from 'react-native';

function InsetsProbe() {
  const insets = useSafeAreaInsets();
  return <Text>top:{insets.top}</Text>;
}

describe('central community libraries', () => {
  it('async-storage stores and reads values', async () => {
    await AsyncStorage.setItem('key', 'value');
    await expect(AsyncStorage.getItem('key')).resolves.toBe('value');
    await AsyncStorage.removeItem('key');
    await expect(AsyncStorage.getItem('key')).resolves.toBeNull();
  });

  it('safe-area-context provides insets through the provider', async () => {
    await render(
      <SafeAreaProvider>
        <InsetsProbe />
      </SafeAreaProvider>
    );
    expect(screen.getByText(/top:/)).toBeTruthy();
  });

  it('gesture-handler root view renders and exposes state constants', async () => {
    await render(
      <GestureHandlerRootView>
        <View testID="ghroot" />
      </GestureHandlerRootView>
    );
    expect(screen.getByTestId('ghroot')).toBeTruthy();
    expect(typeof State.ACTIVE).not.toBe('undefined');
  });

  it('react-native-svg renders', async () => {
    await render(
      <Svg width={10} height={10} testID="svg">
        <Circle cx={5} cy={5} r={4} />
      </Svg>
    );
    expect(screen.getByTestId('svg')).toBeTruthy();
  });
});
