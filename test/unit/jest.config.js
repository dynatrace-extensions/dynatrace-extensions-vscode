/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  displayName: "Unit",
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "../..",
  transform: {
    "^.+\\.[jt]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  transformIgnorePatterns: ["node_modules/(?!@dynatrace-sdk|@dynatrace-internal)"],
  modulePathIgnorePatterns: ["<rootDir>/.vscode-test"],
  testMatch: ["<rootDir>/test/unit/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "@common": "<rootDir>/common",
  },
};

module.exports = config;
