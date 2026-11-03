import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

export default defineConfig({
  plugins: [vitestExpo()],
  resolve: {
    alias: {
      '@/assets': path.resolve(import.meta.dirname, 'assets'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // Errors React reports through console.error on a passing test are the
    // kind of regression this suite exists to catch; keep them visible.
    silent: false,
    setupFiles: ['./test-setup.mocks.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    // 07 exercises expo-router's own jest-only testing-library (documented gap);
    // 10-*.vitest.test.tsx covers the same scenarios via vitest-expo/router.
    exclude: ['src/__tests__/21-web-platform.test.tsx', 'src/__tests__/07-router.test.tsx'],
    // Keep Vitest snapshots separate from Jest's so formats can be diffed.
    resolveSnapshotPath: (testPath, snapExtension) =>
      path.join(path.dirname(testPath), '__vitest_snapshots__', path.basename(testPath) + snapExtension),
  },
});
