import React, { useState } from 'react';
import { Text, Pressable, TextInput, View } from 'react-native';
import { render, screen, fireEvent, userEvent } from '@testing-library/react-native';
import { mock } from './test-utils';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <Pressable accessibilityRole="button" onPress={() => setCount((c) => c + 1)}>
      <Text>Count: {count}</Text>
    </Pressable>
  );
}

describe('interaction testing', () => {
  it('fireEvent.press triggers handler', async () => {
    const onPress = mock.fn();
    await render(
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>Press me</Text>
      </Pressable>
    );
    await fireEvent.press(screen.getByText('Press me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('press updates state', async () => {
    await render(<Counter />);
    await fireEvent.press(screen.getByText('Count: 0'));
    expect(screen.getByText('Count: 1')).toBeTruthy();
  });

  it('userEvent types into TextInput', async () => {
    const onChangeText = mock.fn();
    await render(
      <View>
        <TextInput placeholder="Name" onChangeText={onChangeText} />
      </View>
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Name'), 'abc');
    expect(onChangeText).toHaveBeenCalled();
  });
});
