/**
 * SVG files as components, the way react-native-svg-transformer makes them in
 * the app. Vitest-only: a jest-expo project maps `.svg` to a hand-written mock
 * through moduleNameMapper, and this suite's Jest config has none.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Aliased from '@/assets/icons/sample.svg';
import Relative from '../../assets/icons/sample.svg';

describe('svg components', () => {
	it('renders an aliased .svg import as a host element named after the file', async () => {
		await render(<Aliased testID="icon" width={10} />);
		const icon = screen.getByTestId('icon');
		expect(icon.type).toBe('sample.svg');
		expect(icon.props.width).toBe(10);
	});

	it('resolves a relative import the same way', () => {
		expect(Relative).toBe('sample.svg');
	});
});
