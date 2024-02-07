/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  verbose: true,
  projects: [
    '<rootDir>/test/unit/jest.config.js',
    '<rootDir>/test/e2e/jest.config.js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/utils/fileSystem.ts',
    'src/utils/caching.ts',
    'src/utils/cryptography.ts',
    'src/utils/code.ts',
    'src/utils/extensionParsing.ts',
  ],
};

module.exports = config;
