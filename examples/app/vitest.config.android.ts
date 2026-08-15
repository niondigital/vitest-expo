import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { vitestExpo } from 'vitest-expo';

/**
 * Android platform run, analogous to jest-expo/android. Snapshots are excluded:
 * the committed baseline is the iOS render (a platform-specific snapshot dir is
 * the pattern for apps that need both).
 */
export default defineConfig({
  plugins: [vitestExpo({ platform: 'android' })],
  resolve: {
    alias: {
      '@/assets': path.resolve(__dirname, 'assets'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./test-setup.mocks.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['src/__tests__/07-router.test.tsx', 'src/__tests__/02-snapshot.test.tsx'],
  },
});
