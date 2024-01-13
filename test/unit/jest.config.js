/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: 'Unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    "<rootDir>/__tests__/**/*.test.ts"
  ],
};

module.exports = config;
