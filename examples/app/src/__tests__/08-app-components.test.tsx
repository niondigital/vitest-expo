import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/**
 * Real components from the SDK 57 default template — exercises theme hooks,
 * path aliases (@/), and template idioms rather than synthetic fixtures.
 */
describe('real template components', () => {
  it('ThemedText renders with theme colors', async () => {
    await render(<ThemedText type="title">Welcome</ThemedText>);
    expect(screen.getByText('Welcome')).toBeTruthy();
  });

  it('ThemedView wraps children', async () => {
    await render(
      <ThemedView testID="tv">
        <ThemedText>child</ThemedText>
      </ThemedView>
    );
    expect(screen.getByTestId('tv')).toBeTruthy();
  });
});
