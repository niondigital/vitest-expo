/**
 * expo-video under vitest-expo. Deliberately NOT a conformance test: importing
 * expo-video crashes under jest-expo (its module spec lacks the VideoPlayer
 * class the package patches at import time), so this documents behavior
 * vitest-expo provides beyond the reference runner.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

describe('expo-video', () => {
	it('renders VideoView with a player from useVideoPlayer, and releases it on unmount', async () => {
		const Screen = () => {
			const player = useVideoPlayer('https://example.com/clip.mp4');
			return <VideoView testID="video" player={player} />;
		};
		// React reports an error thrown by an unmount cleanup through
		// console.error instead of rethrowing it, so the unmount is checked
		// through that channel: the hook releases the shared object.
		const errors: unknown[] = [];
		const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
			errors.push(args[0]);
		});
		try {
			const rendered = await render(<Screen />);
			expect(screen.getByTestId('video')).toBeOnTheScreen();
			await rendered.unmount();
		} finally {
			spy.mockRestore();
		}
		expect(errors).toEqual([]);
	});
});
