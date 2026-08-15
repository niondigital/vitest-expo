/** Jest baseline: the official jest-expo setup, as documented by Expo. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test-setup.mocks.ts'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.(ts|tsx)'],
  // *.vitest.test.tsx files use vitest-expo APIs (vi, vitest-expo/router).
  testPathIgnorePatterns: ['/node_modules/', '\\.vitest\\.test\\.'],
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/css-stub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
