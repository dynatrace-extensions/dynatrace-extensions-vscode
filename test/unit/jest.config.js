/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: 'Unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  transform: {
    "^.+\\.ts$": [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.test.json' }
    ]
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.vscode-test"
  ],
  testMatch: [
    "<rootDir>/test/unit/__tests__/**/*.test.ts"
  ],
};

module.exports = config;
