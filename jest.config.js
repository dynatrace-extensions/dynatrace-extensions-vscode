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
  ],
};

module.exports = config;
