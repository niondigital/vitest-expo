import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { vitestExpoProjects } from 'vitest-expo';

/**
 * All native platforms in one run, analogous to jest-expo/universal.
 * A representative subset proves per-project platform resolution; the full
 * per-platform runs live in the dedicated configs.
 */
const alias = [
	{ find: /^@\/assets\//, replacement: `${path.resolve(__dirname, 'assets')}/` },
	{ find: /^@\//, replacement: `${path.resolve(__dirname, 'src')}/` }
];

export default defineConfig({
	test: {
		projects: vitestExpoProjects({ platforms: ['ios', 'android'] }).map((project) => ({
			...project,
			resolve: { alias },
			test: {
				...project.test,
				globals: true,
				setupFiles: ['./test-setup.mocks.ts'],
				include: [
					'src/__tests__/01-render-query.test.tsx',
					'src/__tests__/06-platform.test.ts'
				]
			}
		}))
	}
});
