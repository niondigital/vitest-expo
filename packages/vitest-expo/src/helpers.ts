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
export { extendPresetMock } from './modules/registry';
