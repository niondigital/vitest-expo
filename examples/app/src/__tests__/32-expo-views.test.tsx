/**
 * Conformance: Expo SDK view components resolve their native view managers
 * (`requireNativeViewManager`) and render as host components — with children
 * and props intact — identically under both runners.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView } from 'expo-camera';
import { Image } from 'expo-image';

describe('expo view components', () => {
	it('renders BlurView with its children', async () => {
		await render(
			<BlurView intensity={40} tint="dark">
				<Text>blurred content</Text>
			</BlurView>
		);
		expect(screen.getByText('blurred content')).toBeOnTheScreen();
	});

	it('renders LinearGradient with its children', async () => {
		await render(
			<LinearGradient colors={['#000', '#fff']} testID="gradient">
				<Text>gradient content</Text>
			</LinearGradient>
		);
		expect(screen.getByText('gradient content')).toBeOnTheScreen();
		expect(screen.getByTestId('gradient')).toBeOnTheScreen();
	});

	it('renders CameraView', async () => {
		await render(<CameraView testID="camera" facing="back" />);
		expect(screen.getByTestId('camera')).toBeOnTheScreen();
	});

	it('renders expo-image with accessibility props', async () => {
		await render(
			<Image testID="hero" source={{ uri: 'https://example.com/pic.png' }} accessibilityLabel="hero" />
		);
		expect(screen.getByTestId('hero')).toBeOnTheScreen();
	});
});
