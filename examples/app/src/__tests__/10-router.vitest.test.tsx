import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { Link } from 'expo-router';
import { renderRouter, screen, testRouter } from 'vitest-expo/router';

/**
 * The vitest-expo port of expo-router/testing-library — same scenarios as
 * 07-router.test.tsx (which only runs under jest-expo).
 */
describe('vitest-expo/router', () => {
  it('renders a route and exposes router info', async () => {
    const result = await renderRouter(
      {
        index: () => <Text>Home Screen</Text>,
        about: () => <Text>About Screen</Text>,
      },
      { initialUrl: '/' }
    );
    expect(await screen.findByText('Home Screen')).toBeOnTheScreen();
    expect(result.getPathname()).toBe('/');
    expect(result).toHavePathname('/');
  });

  it('navigates imperatively via testRouter', async () => {
    await renderRouter(
      {
        index: () => <Text>Home Screen</Text>,
        about: () => <Text>About Screen</Text>,
      },
      { initialUrl: '/' }
    );
    await testRouter.navigate('/about');
    expect(await screen.findByText('About Screen')).toBeOnTheScreen();
  });

  it('navigates via <Link> press', async () => {
    const result = await renderRouter(
      {
        index: () => (
          <Link href="/about">
            <Text>Go to about</Text>
          </Link>
        ),
        about: () => <Text>About Screen</Text>,
      },
      { initialUrl: '/' }
    );
    await fireEvent.press(screen.getByText('Go to about'));
    expect(await screen.findByText('About Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/about');
  });
});
