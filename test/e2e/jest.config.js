/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: "E2E",
  preset: "ts-jest",
  runner: "vscode",
  rootDir: ".",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../../tsconfig.test.json" }],
  },
  modulePathIgnorePatterns: ["<rootDir>/../../.vscode-test"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "@common": "<rootDir>/../../common",
  },
};

module.exports = config;
