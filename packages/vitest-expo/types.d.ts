/**
 * One-stop type surface for vitest-expo consumers.
 *
 * Add to tsconfig.json:
 *   { "compilerOptions": { "types": ["vitest-expo/types"] } }
 *
 * Provides the Vitest globals (describe/it/expect with globals: true) and the
 * RNTL matcher augmentation (toBeOnTheScreen, toHaveStyle, …) that RNTL itself
 * only declares for Jest.
 */
/// <reference types="vitest/globals" />
/// <reference types="vitest-native/rntl-matchers" />
