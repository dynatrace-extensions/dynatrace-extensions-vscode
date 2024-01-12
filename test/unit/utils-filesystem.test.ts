import { existsSync, readFileSync } from "fs";
import * as path from "path";
import mock = require("mock-fs");
import * as vscode from "vscode";
import { createValidFileName, initGlobalStorage } from "../../src/utils/fileSystem";
import { MockExtensionContext } from "./mocks/vscode";

describe("Filesystem Utils - createUniqueFileName", () => {
  const expectedRegex = /[a-zA-Z0-9]+([-_./][a-zA-Z0-9]+)*/;

  test.each([
    "! This is a very !!!important!!! alert !",
    "This is a very important alert",
    "This 😀 is a very important alert 😀",
  ])("should return a valid filename from %s", (title: string) => {
    expect(createValidFileName(title)).toMatch(expectedRegex);
  });
});

describe("Filesystem Utils - initGlobalStorage", () => {
  let mockContext: vscode.ExtensionContext;
  const globalStoragePath = "mock/globalStorage";
  const logsPath = path.join(globalStoragePath, "logs");
  const expectedFiles = [
    { path: path.join(globalStoragePath, "extensionWorkspaces.json"), default: "[]" },
    { path: path.join(globalStoragePath, "dynatraceEnvironments.json"), default: "[]" },
    { path: path.join(globalStoragePath, "idToken.txt"), default: "1234" },
    { path: path.join(globalStoragePath, "summaries.json"), default: "[]" },
    { path: path.join(globalStoragePath, "targets.json"), default: "[]" },
  ];

  beforeAll(() => {
    mockContext = new MockExtensionContext(globalStoragePath);
  });

  describe("On first time usage", () => {
    beforeEach(() => {
      mock({ mock: {} });
    });

    it("should create folders and files", () => {
      initGlobalStorage(mockContext);

      expect(existsSync(globalStoragePath)).toBe(true);
      expect(existsSync(logsPath)).toBe(true);
      expectedFiles.forEach(file => {
        expect(existsSync(file.path)).toBe(true);
      });
    });

    it("should create content with default values", () => {
      initGlobalStorage(mockContext);

      expectedFiles.forEach(file => {
        expect(readFileSync(file.path).toString()).toBe(file.default);
      });
    });
  });

  describe("On subsequent usage", () => {
    const expectedValue = "ABCD1234";

    beforeEach(() => {
      mock({
        mock: {
          globalStorage: {
            "extensionWorkspaces.json": expectedValue,
            "dynatraceEnvironments.json": expectedValue,
            "idToken.txt": expectedValue,
            "summaries.json": expectedValue,
            "targets.json": expectedValue,
            "logs": {},
          },
        },
      });
    });

    it("should preserve existing content", () => {
      initGlobalStorage(mockContext);

      expectedFiles.forEach(file => {
        expect(readFileSync(file.path).toString()).toBe(expectedValue);
      });
    });
  });

  afterAll(() => {
    mock.restore();
  });
});
