/**
 * Runtime helpers for test and setup files.
 *
 * extendPresetMock: merge overrides into a built-in library preset mock —
 * e.g. to fill a gap in the reanimated preset for one project:
 *
 *   import { extendPresetMock } from 'vitest-expo/helpers';
 *   extendPresetMock('react-native-reanimated', {
 *     interpolateColor: (v, i, o) => o[0],
 *   });
 */
// The engine ships this since 0.13 (it was our upstream ask); re-exported so
// consumers keep one import path for the Expo layer's helpers.
export { extendPresetMock } from 'vitest-native/helpers';
