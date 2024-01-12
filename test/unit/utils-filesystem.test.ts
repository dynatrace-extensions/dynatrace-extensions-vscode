import { existsSync, readdirSync, readFileSync } from "fs";
import * as path from "path";
import mock = require("mock-fs");
import * as vscode from "vscode";
import {
  createValidFileName,
  initGlobalStorage,
  initWorkspaceStorage,
  removeOldestFiles,
} from "../../src/utils/fileSystem";
import { MockExtensionContext } from "./mocks/vscode";

jest.mock("../../src/utils/logging");

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

describe("Filesystem Utils - removeOldestFiles", () => {
  beforeEach(() => {
    mock({
      mock: {
        f1: mock.file({ content: "A", mtime: new Date(1) }),
        f2: mock.file({ content: "A", mtime: new Date(2) }),
        f3: mock.file({ content: "A", mtime: new Date(3) }),
      },
    });
  });

  afterAll(() => {
    mock.restore();
  });

  it("should remove extra files by age and count", () => {
    removeOldestFiles("mock", 1);

    expect(existsSync("mock/f1")).toBe(false);
    expect(existsSync("mock/f2")).toBe(false);
    expect(existsSync("mock/f3")).toBe(true);
  });

  it("should not remove files within limit", () => {
    removeOldestFiles("mock", 3);

    expect(existsSync("mock/f1")).toBe(true);
    expect(existsSync("mock/f2")).toBe(true);
    expect(existsSync("mock/f3")).toBe(true);
  });

  it("should not remove any files if a negative count given", () => {
    removeOldestFiles("mock", -2);

    expect(existsSync("mock/f1")).toBe(true);
    expect(existsSync("mock/f2")).toBe(true);
    expect(existsSync("mock/f3")).toBe(true);
  });
});

describe("Filesystem Utils - initWorkspaceStorage", () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mock({ mock: {} });
  });

  afterAll(() => {
    mock.restore();
  });

  describe("When no workspace is open", () => {
    beforeEach(() => {
      mockContext = new MockExtensionContext(undefined, undefined);
    });

    it("shouldn't do anything if no path provided", () => {
      initWorkspaceStorage(mockContext);

      expect(readdirSync("mock").length).toBe(0);
    });
  });

  describe("When workspace is open", () => {
    beforeEach(() => {
      mockContext = new MockExtensionContext(undefined, "mock/workspace");
    });

    describe("If path doesn't exist", () => {
      it("should create directories", () => {
        initWorkspaceStorage(mockContext);

        expect(existsSync("mock/workspace")).toBe(true);
      });
    });

    describe("If path already exists", () => {
      beforeEach(() => {
        mock({ mock: { workspace: { f1: "AAA" } } });
      });
      it("should leave content as is", () => {
        initWorkspaceStorage(mockContext);

        expect(existsSync("mock/workspace/f1")).toBe(true);
        expect(readFileSync("mock/workspace/f1").toString()).toBe("AAA");
      });
    });
  });
});
