module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|expo-.*|@expo|@expo/.*|@react-navigation|@react-navigation/.*|nativewind|react-native-gesture-handler|react-native-reanimated|react-native-safe-area-context|react-native-screens|react-native-worklets)/)',
  ],
};
