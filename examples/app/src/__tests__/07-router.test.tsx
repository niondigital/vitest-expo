import React from 'react';
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

/**
 * expo-router's official testing API (ships with expo-router, documented
 * for jest-expo). Expected to be a hard gap under Vitest.
 */
describe('expo-router testing-library', () => {
  it('renders a route and navigates state', async () => {
    const result = renderRouter(
      {
        index: () => <Text>Home Screen</Text>,
        about: () => <Text>About Screen</Text>,
      },
      { initialUrl: '/' }
    );
    await result;
    expect(await screen.findByText('Home Screen')).toBeOnTheScreen();
    expect(result.getPathname()).toBe('/');
  });
});
