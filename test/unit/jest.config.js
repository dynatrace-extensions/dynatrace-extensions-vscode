/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: 'Unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    "<rootDir>/*.test.ts"
  ],
};

module.exports = config;
