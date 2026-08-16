/** Web reference: the official jest-expo/web preset (react-native-web + jsdom). */
module.exports = {
	preset: 'jest-expo/web',
	testMatch: [
		'<rootDir>/src/__tests__/06-platform.test.ts',
		'<rootDir>/src/__tests__/21-web-platform.test.tsx'
	],
	moduleNameMapper: {
		'\\.(css)$': '<rootDir>/css-stub.js',
		'^@/(.*)$': '<rootDir>/src/$1'
	}
};
