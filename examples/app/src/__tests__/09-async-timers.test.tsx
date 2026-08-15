import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { mock } from './test-utils';

function DelayedGreeting() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, []);
  return <Text>{ready ? 'Ready' : 'Loading'}</Text>;
}

describe('async utilities and fake timers', () => {
  it('waitFor resolves with real timers', async () => {
    await render(<DelayedGreeting />);
    expect(screen.getByText('Loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy(), { timeout: 2000 });
  });

  it('fake timers advance the component', async () => {
    mock.useFakeTimers();
    try {
      await render(<DelayedGreeting />);
      expect(screen.getByText('Loading')).toBeTruthy();
      await act(() => {
        mock.advanceTimersByTime(600);
      });
      expect(screen.getByText('Ready')).toBeTruthy();
    } finally {
      mock.useRealTimers();
    }
  });
});
