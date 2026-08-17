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
	it('renders VideoView with a player from useVideoPlayer', async () => {
		const Screen = () => {
			const player = useVideoPlayer('https://example.com/clip.mp4');
			return <VideoView testID="video" player={player} />;
		};
		await render(<Screen />);
		expect(screen.getByTestId('video')).toBeOnTheScreen();
	});
});
