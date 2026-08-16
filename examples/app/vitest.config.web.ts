import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

/**
 * Web platform run, analogous to jest-expo/web: react-native-web in jsdom.
 * Scope: component and logic tests. Native-boundary suites (expo native
 * modules, expo-router native navigation) are out of scope on web.
 */
export default defineConfig({
	plugins: [vitestExpo({ platform: 'web' })],
	resolve: {
		alias: [
			{ find: /^@\/assets\//, replacement: `${path.resolve(__dirname, 'assets')}/` },
			{ find: /^@\//, replacement: `${path.resolve(__dirname, 'src')}/` }
		]
	},
	test: {
		globals: true,
		setupFiles: ['./test-setup.mocks.ts'],
		
		include: ['src/__tests__/06-platform.test.ts', 'src/__tests__/21-web-platform.test.tsx'],
		// Web snapshots render DOM host elements — separate baseline.
		resolveSnapshotPath: (testPath, snapExtension) =>
			path.join(path.dirname(testPath), '__vitest_snapshots_web__', path.basename(testPath) + snapExtension)
	}
});
