/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  verbose: true,
  projects: ["<rootDir>/test/unit/jest.config.js", "<rootDir>/test/e2e/jest.config.js"],
  collectCoverage: true,
  // Only collect coverage from files that have dedicated unit tests. Add a file
  // here as tests are written for it, to keep the report meaningful rather than
  // flooding it with untested legacy modules.
  collectCoverageFrom: [
    "src/codeLens/platformUaLens.ts",
    "src/codeLens/utils/dqlUtils.ts",
    "src/commandPalette/convertTopology.ts",
    "src/commandPalette/python/pythonConversion.ts",
    "src/dynatrace-api/dynatrace.ts",
    "src/dynatrace-api/errors.ts",
    "src/dynatrace-api/rateLimitHandler.ts",
    "src/dynatrace-api/sdk/credentialVaultAdapter.ts",
    "src/dynatrace-api/sdk/settingsAdapter.ts",
    "src/dynatrace-api/sdk/stubs.ts",
    "src/statusBar/simulator.ts",
    "src/treeViews/commands/environments.ts",
    "src/treeViews/tenantsTreeView.ts",
    "src/treeViews/workspacesTreeView.ts",
    "src/utils/caching.ts",
    "src/utils/cryptography.ts",
    "src/utils/diagnostics.ts",
    "src/utils/extensionParsing.ts",
    "src/utils/fileSystem.ts",
    "src/utils/general.ts",
    "src/utils/logging.ts",
    "src/utils/openPipelineSchemaTranslation.ts",
    "src/utils/screenConversion.ts",
    "src/utils/simulator.ts",
  ],
  moduleNameMapper: {
    "@common": "<rootDir>/common",
  },
};

module.exports = config;
