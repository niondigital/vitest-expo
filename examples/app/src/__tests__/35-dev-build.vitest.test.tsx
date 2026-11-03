/**
 * Tests read the environment as a development build, not as Expo Go. jest-expo
 * keeps the ExpoGo module present on purpose, which is why this is a
 * vitest-only test: `isRunningInExpoGo()` is "does the ExpoGo module exist",
 * and expo-notifications branches on it.
 */
import { isRunningInExpoGo } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';

describe('development build', () => {
	it('is not Expo Go', () => {
		expect(isRunningInExpoGo()).toBe(false);
		expect(requireOptionalNativeModule('ExpoGo')).toBeNull();
	});

	it('still has every other module', () => {
		expect(requireOptionalNativeModule('ExpoFontLoader')).not.toBeNull();
		expect(Constants.appOwnership).toBeNull();
	});
});
