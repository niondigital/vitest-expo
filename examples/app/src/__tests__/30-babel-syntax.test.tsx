/**
 * Babel-only syntax in app code: Flow-annotated .js and the
 * `export default from` proposal — accepted by babel-preset-expo, so the
 * replacement pipeline has to accept them identically.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import reexportedDefault, { formatDefault, formatCount, FlowBadge } from '@/utils/reexports';

describe('flow-annotated .js', () => {
	it('strips annotations and runs the module', () => {
		expect(formatCount('apples', 3)).toEqual({ label: 'apples', value: 3 });
		expect(formatDefault(7)).toEqual({ label: 'count', value: 7 });
	});

	it('renders JSX from a flow .js file', async () => {
		await render(<FlowBadge label="apples" value={3} />);
		expect(screen.getByText('apples: 3')).toBeTruthy();
	});
});

describe('export default from', () => {
	it('re-exports the default binding under both forms', () => {
		expect(reexportedDefault).toBe(formatDefault);
		expect(reexportedDefault(2)).toEqual({ label: 'count', value: 2 });
	});
});
