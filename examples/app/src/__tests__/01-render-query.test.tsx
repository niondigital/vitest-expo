import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: 'bold' },
});

function Greeting({ name }: { name: string }) {
  return (
    <View testID="greeting">
      <Text style={styles.title}>Hello, {name}</Text>
    </View>
  );
}

describe('basic render & queries', () => {
  it('renders and finds text', async () => {
    await render(<Greeting name="World" />);
    expect(screen.getByText('Hello, World')).toBeTruthy();
  });

  it('finds by testID and asserts on-screen', async () => {
    await render(<Greeting name="World" />);
    expect(screen.getByTestId('greeting')).toBeOnTheScreen();
  });

  it('supports toHaveStyle matcher', async () => {
    await render(<Greeting name="World" />);
    expect(screen.getByText('Hello, World')).toHaveStyle({ fontSize: 18 });
  });
});
