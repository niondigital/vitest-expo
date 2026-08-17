import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the library's own logic — the parts with no React Native in
 * them: the migrate CLI, the syntax-compat transform, the snapshot serializer.
 * Runtime behavior is covered by the conformance suite in examples/app, which
 * runs under both test runners.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
