/**
 * The `jest` global exists under both runners: natively under jest-expo, and
 * via vitest-expo's jestCompat layer under Vitest. Declared here (not inside
 * test files) because an in-file `declare const jest` becomes a local binding
 * for babel-plugin-jest-hoist and breaks jest.mock factory validation.
 */
declare const jest: any;
