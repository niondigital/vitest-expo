import React from 'react';
import { Text } from 'react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { getMockConfig, renderRouter, screen, testRouter } from 'vitest-expo/router';

/**
 * Breadth conformance for the vitest-expo port of expo-router/testing-library:
 * layouts, route groups, dynamic routes, the imperative `testRouter` surface,
 * `+not-found`, the custom matchers and `getMockConfig`.
 *
 * Every `testRouter` method is async here (RNTL 14's `act` returns a promise),
 * which is the one intentional deviation from the upstream sync API.
 */
describe('vitest-expo/router — layouts', () => {
  it('renders the active screen inside a Stack layout', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        details: () => <Text>Details Screen</Text>,
      },
      { initialUrl: '/' }
    );

    expect(await screen.findByText('Home Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/');

    await testRouter.push('/details');
    expect(await screen.findByText('Details Screen')).toBeOnTheScreen();
    // The layout stays mounted across the navigation, so the previous screen is
    // kept in the stack rather than being torn down.
    expect(testRouter.canGoBack()).toBe(true);
  });

  it('renders nested layouts', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        'settings/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
        'settings/index': () => <Text>Settings Screen</Text>,
        'settings/profile': () => <Text>Profile Screen</Text>,
      },
      { initialUrl: '/settings' }
    );

    expect(await screen.findByText('Settings Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/settings');

    await testRouter.push('/settings/profile');
    expect(await screen.findByText('Profile Screen')).toBeOnTheScreen();
    expect(result).toHaveSegments(['settings', 'profile']);
  });

  it('exposes the React Navigation state', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        one: () => <Text>One Screen</Text>,
      },
      { initialUrl: '/' }
    );

    await testRouter.push('/one');
    const state = result.getRouterState() as { routes: { name: string }[] };
    // The root slot wraps every route tree produced from a route map.
    expect(state.routes.map((route) => route.name)).toContain('__root');
    expect(result).toHaveRouterState(state);
    expect(result).not.toHaveRouterState({ routes: [] });
  });
});

describe('vitest-expo/router — route groups', () => {
  it('omits the group segment from the pathname', async () => {
    const result = await renderRouter(
      {
        '(app)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
        '(app)/index': () => <Text>Group Home</Text>,
        '(app)/details': () => <Text>Group Details</Text>,
      },
      { initialUrl: '/' }
    );

    expect(await screen.findByText('Group Home')).toBeOnTheScreen();
    expect(result.getPathname()).toBe('/');
    expect(result.getPathname()).not.toContain('(app)');

    await testRouter.push('/details');
    expect(await screen.findByText('Group Details')).toBeOnTheScreen();
    expect(result).toHavePathname('/details');
    // Segments keep the group — only the URL hides it.
    expect(result).toHaveSegments(['(app)', 'details']);
  });
});

describe('vitest-expo/router — dynamic routes', () => {
  it('exposes route params via useLocalSearchParams and getSearchParams', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        'user/[id]': function UserScreen() {
          const { id } = useLocalSearchParams<{ id: string }>();
          return <Text>{`User ${id}`}</Text>;
        },
      },
      { initialUrl: '/' }
    );

    await testRouter.push('/user/123');
    expect(await screen.findByText('User 123')).toBeOnTheScreen();
    expect(result.getSearchParams()).toEqual({ id: '123' });
    expect(result).toHaveSearchParams({ id: '123' });
    expect(result).toHaveSegments(['user', '[id]']);
    expect(result).toHavePathnameWithParams('/user/123');
  });

  it('resolves a dynamic route inside a group from a <Link>', async () => {
    const result = await renderRouter(
      {
        '(app)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
        '(app)/index': () => (
          <Link href="/user/42">
            <Text>Open user</Text>
          </Link>
        ),
        '(app)/user/[id]': function UserScreen() {
          const { id } = useLocalSearchParams<{ id: string }>();
          return <Text>{`User ${id}`}</Text>;
        },
      },
      { initialUrl: '/' }
    );

    await screen.findByText('Open user');
    await testRouter.navigate('/user/42');
    expect(await screen.findByText('User 42')).toBeOnTheScreen();
    expect(result).toHavePathname('/user/42');
    expect(result).toHaveSearchParams({ id: '42' });
  });
});

describe('vitest-expo/router — testRouter', () => {
  it('models the back stack across push / back / replace', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        one: () => <Text>One Screen</Text>,
        two: () => <Text>Two Screen</Text>,
      },
      { initialUrl: '/' }
    );

    expect(testRouter.canGoBack()).toBe(false);

    await testRouter.push('/one');
    expect(testRouter.canGoBack()).toBe(true);

    await testRouter.push('/two');
    expect(await screen.findByText('Two Screen')).toBeOnTheScreen();

    await testRouter.back('/one');
    expect(await screen.findByText('One Screen')).toBeOnTheScreen();

    // `replace` swaps the current entry, so the stack depth is unchanged and
    // going back lands on the root rather than on `/one`.
    await testRouter.replace('/two');
    expect(await screen.findByText('Two Screen')).toBeOnTheScreen();

    await testRouter.back('/');
    expect(await screen.findByText('Home Screen')).toBeOnTheScreen();
    expect(testRouter.canGoBack()).toBe(false);
    expect(result).toHavePathname('/');
  });

  it('updates query params via setParams', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        'user/[id]': function UserScreen() {
          const { id } = useLocalSearchParams<{ id: string }>();
          return <Text>{`User ${id}`}</Text>;
        },
      },
      { initialUrl: '/' }
    );

    await testRouter.push('/user/123');
    await testRouter.setParams({ id: '456' }, '/user/456');
    expect(await screen.findByText('User 456')).toBeOnTheScreen();
    expect(result).toHaveSearchParams({ id: '456' });
    expect(result).toHavePathnameWithParams('/user/456');
  });

  it('unwinds the stack with dismissAll', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        one: () => <Text>One Screen</Text>,
        two: () => <Text>Two Screen</Text>,
      },
      { initialUrl: '/' }
    );

    await testRouter.push('/one');
    await testRouter.push('/two');
    expect(testRouter.canGoBack()).toBe(true);

    await testRouter.dismissAll();
    expect(await screen.findByText('Home Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/');
    expect(testRouter.canGoBack()).toBe(false);
  });

  it('drives the RNTL `screen` proxy, which carries the router helpers', async () => {
    await renderRouter(
      {
        index: () => <Text>Home Screen</Text>,
        about: () => <Text>About Screen</Text>,
      },
      { initialUrl: '/' }
    );

    // RNTL's `screen` is the render result itself, so `renderRouter` augments
    // it with the router helpers the matchers read from.
    expect(screen).toHavePathname('/');
    await testRouter.navigate('/about');
    expect(screen).toHavePathname('/about');
  });
});

describe('vitest-expo/router — +not-found', () => {
  it('renders the +not-found route for an unmatched URL', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        '+not-found': () => <Text>Not Found Screen</Text>,
      },
      { initialUrl: '/' }
    );

    await testRouter.navigate('/does-not-exist');
    expect(await screen.findByText('Not Found Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/does-not-exist');
  });

  it('renders the +not-found route as the initial URL', async () => {
    const result = await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: () => <Text>Home Screen</Text>,
        '+not-found': () => <Text>Not Found Screen</Text>,
      },
      { initialUrl: '/missing/deeply/nested' }
    );

    expect(await screen.findByText('Not Found Screen')).toBeOnTheScreen();
    expect(result).toHavePathname('/missing/deeply/nested');
  });
});

describe('vitest-expo/router — getMockConfig', () => {
  it('builds a React Navigation linking config from a route map', () => {
    const config = getMockConfig({
      _layout: () => null,
      index: () => null,
      about: () => null,
      'user/[id]': () => null,
    });

    const screens = config.screens as Record<string, any>;
    // Routes live under expo-router's internal root slot.
    const root = screens.__root;
    expect(root).toBeDefined();
    expect(root.path).toBe('');
    expect(Object.keys(root.screens)).toEqual(
      expect.arrayContaining(['index', 'about', 'user/[id]'])
    );
    // Dynamic segments are translated to React Navigation's `:param` syntax.
    expect(root.screens['user/[id]']).toBe('user/:id');
    // The generated sitemap and not-found routes are added alongside the slot.
    expect(screens).toHaveProperty('+not-found');
    expect(screens).toHaveProperty('_sitemap');
  });
});
