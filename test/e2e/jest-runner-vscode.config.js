const path = require('path');

/** @type {import('jest-runner-vscode').RunnerOptions} */
const config = {
  version: "1.71.0",
  launchArgs: ["--new-window"],
  extensionDevelopmentPath: path.resolve(__dirname, "..", ".."),
};

module.exports = config;
