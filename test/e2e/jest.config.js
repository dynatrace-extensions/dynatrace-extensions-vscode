/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: "E2E",
  preset: "ts-jest",
  runner: "vscode",
  modulePathIgnorePatterns: [
    "<rootDir>/../../.vscode-test"
  ],
  transform: {
    "^.+\\.ts$": [
      'ts-jest',
      { tsconfig: '<rootDir>/../../tsconfig.test.json' }
    ]
  },
  testMatch: [
    "<rootDir>/*.test.ts",
  ],
}

module.exports = config
