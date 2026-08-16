/**
 * Conformance (web platform only): react-native-web in jsdom, identical under
 * jest-expo/web and vitest-expo's web platform. Testing-library note: RNTL is
 * not usable against react-native-web (its text-in-Text invariant fires on DOM
 * hosts — under BOTH runners), so web tests render via react-test-renderer.
 */
import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { platformLabel } from '../utils/platform-label';

const styles = StyleSheet.create({
	box: { padding: 8 },
	label: { fontWeight: 'bold' }
});

describe('web platform', () => {
	it('Platform.OS is web and .web platform extensions resolve', () => {
		expect(Platform.OS).toBe('web');
		expect(platformLabel).toBe('web');
	});

	it('runs in a DOM environment', () => {
		expect(typeof document).toBe('object');
		expect(typeof window.addEventListener).toBe('function');
	});

	it('renders react-native-web components', () => {
		let tree!: renderer.ReactTestRenderer;
		act(() => {
			tree = renderer.create(
				<View style={styles.box}>
					<Text style={styles.label}>hello web</Text>
				</View>
			);
		});
		const json = tree.toJSON();
		expect(JSON.stringify(json)).toContain('hello web');
		expect(json).toMatchSnapshot();
		act(() => tree.unmount());
	});
});
