/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: 'Unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    "^.+\\.ts$": [
      'ts-jest',
      { tsconfig: '<rootDir>/../../tsconfig.test.json' }
    ]
  },
  testMatch: [
    "<rootDir>/__tests__/**/*.test.ts"
  ],
};

module.exports = config;
