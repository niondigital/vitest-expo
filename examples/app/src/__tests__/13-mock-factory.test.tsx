/**
 * Conformance: module factory mocks in Jest syntax, running unchanged under
 * jest-expo AND vitest-expo (jestCompat hoists jest.mock → vi.mock).
 * Patterns taken from real-world jest-expo suites.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import * as Device from 'expo-device';
import { Image } from 'expo-image';
import { GreetingService, formatGreeting, GREETING_PREFIX } from '@/services/greeting-service';


// Factory mock of a local module, partial via requireActual (keep GREETING_PREFIX).
jest.mock('@/services/greeting-service', () => {
  // Aliased specifiers work in requireActual: vitest-expo expands the
  // project's resolve aliases (and Metro-style extensionless TS) before
  // delegating to Node resolution.
  const actual = jest.requireActual('@/services/greeting-service');
  return {
    ...actual,
    formatGreeting: jest.fn(() => 'mocked greeting'),
    // KNOWN DELTA: an arrow-function mockImplementation is not constructable
    // under vi/tinyspy (`new mock()` throws), while Jest wraps it. A `function`
    // implementation is the portable form for class mocks.
    GreetingService: jest.fn().mockImplementation(function (this: any) {
      this.greet = jest.fn(() => 'mocked greet');
    }),
  };
});

// Factory mock of an Expo package (real JS otherwise).
jest.mock('expo-device', () => ({
  osName: 'MockOS',
  isDevice: false,
}));

// Component-library mock → RN primitive with marker testID (a common pattern
// in real suites). Everything the factory needs is required inside it (jest hoisting rule).
jest.mock('expo-image', () => {
  const MockReact = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    Image: (props: Record<string, unknown>) =>
      MockReact.createElement(View, { ...props, testID: 'mocked-expo-image' }),
  };
});

describe('module factory mocks (jest syntax, both runners)', () => {
  it('partial-mocks a local module via requireActual spread', () => {
    expect(formatGreeting('x')).toBe('mocked greeting');
    expect(GREETING_PREFIX).toBe('Hello');
    expect(new GreetingService().greet('x')).toBe('mocked greet');
  });

  it('factory-mocks an expo package', () => {
    expect(Device.osName).toBe('MockOS');
    expect(Device.isDevice).toBe(false);
  });

  it('replaces a component library with a marker component', async () => {
    await render(<Image source={{ uri: 'https://example.com/x.png' }} />);
    expect(screen.getByTestId('mocked-expo-image')).toBeTruthy();
  });
});
