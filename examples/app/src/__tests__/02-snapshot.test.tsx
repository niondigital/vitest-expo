import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { render, screen } from '@testing-library/react-native';

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 8 },
  label: { fontSize: 14, color: '#333' },
});

function Card() {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.label}>Snapshot me</Text>
      <Pressable accessibilityRole="button">
        <Text>Tap</Text>
      </Pressable>
    </View>
  );
}

describe('snapshot testing', () => {
  it('matches component tree snapshot', async () => {
    await render(<Card />);
    expect(screen.toJSON()).toMatchSnapshot();
  });
});
