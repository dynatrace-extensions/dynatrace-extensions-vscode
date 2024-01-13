import * as fs from "fs";
import * as path from "path";
import mock = require("mock-fs");
import * as vscode from "vscode";
import { ExtensionWorkspace } from "../../../../src/interfaces/treeViewData";
import {
  createValidFileName,
  initGlobalStorage,
  initWorkspaceStorage,
  registerWorkspace,
  removeOldestFiles,
} from "../../../../src/utils/fileSystem";
import { MockExtensionContext, MockUri } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

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

      expect(fs.existsSync(globalStoragePath)).toBe(true);
      expect(fs.existsSync(logsPath)).toBe(true);
      expectedFiles.forEach(file => {
        expect(fs.existsSync(file.path)).toBe(true);
      });
    });

    it("should create content with default values", () => {
      initGlobalStorage(mockContext);

      expectedFiles.forEach(file => {
        expect(fs.readFileSync(file.path).toString()).toBe(file.default);
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
        expect(fs.readFileSync(file.path).toString()).toBe(expectedValue);
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

    expect(fs.existsSync("mock/f1")).toBe(false);
    expect(fs.existsSync("mock/f2")).toBe(false);
    expect(fs.existsSync("mock/f3")).toBe(true);
  });

  it("should not remove files within limit", () => {
    removeOldestFiles("mock", 3);

    expect(fs.existsSync("mock/f1")).toBe(true);
    expect(fs.existsSync("mock/f2")).toBe(true);
    expect(fs.existsSync("mock/f3")).toBe(true);
  });

  it("should not remove any files if a negative count given", () => {
    removeOldestFiles("mock", -2);

    expect(fs.existsSync("mock/f1")).toBe(true);
    expect(fs.existsSync("mock/f2")).toBe(true);
    expect(fs.existsSync("mock/f3")).toBe(true);
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

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("shouldn't do anything if no path provided", () => {
      const mockMkDirSync = jest.spyOn(fs, "mkdirSync");
      initWorkspaceStorage(mockContext);

      expect(mockMkDirSync).not.toHaveBeenCalled();
      expect(fs.readdirSync("mock").length).toBe(0);
    });
  });

  describe("When workspace is open", () => {
    beforeEach(() => {
      mockContext = new MockExtensionContext(undefined, "mock/workspace");
    });

    describe("If path doesn't exist", () => {
      it("should create directories", () => {
        initWorkspaceStorage(mockContext);

        expect(fs.existsSync("mock/workspace")).toBe(true);
      });
    });

    describe("If path already exists", () => {
      beforeEach(() => {
        mock({ mock: { workspace: { f1: "AAA" } } });
      });
      it("should leave content as is", () => {
        initWorkspaceStorage(mockContext);

        expect(fs.existsSync("mock/workspace/f1")).toBe(true);
        expect(fs.readFileSync("mock/workspace/f1").toString()).toBe("AAA");
      });
    });
  });
});

describe("Filesystem Utils - registerWorkspace", () => {
  let mockContext: vscode.ExtensionContext;
  const mockGlobalStoragePath = "mock/globalStorage";
  const mockWorkspaceStoragePath = "mock/workspaceStorage";
  const mockWorkspacesJsonPath = path.join(mockGlobalStoragePath, "extensionWorkspaces.json");
  const mockWorkspaceFolders: vscode.WorkspaceFolder[] = [
    {
      index: 0,
      name: "MockWorkspace",
      uri: new MockUri("mock/my-workspace"),
    },
  ];

  beforeAll(() => {
    mockContext = new MockExtensionContext(mockGlobalStoragePath, mockWorkspaceStoragePath);
  });
  beforeEach(() => {
    mock({
      mock: {
        "globalStorage": {
          "extensionWorkspaces.json": "[]",
        },
        "workspaceStorage": {},
        "my-workspace": {},
      },
    });
    jest.spyOn(vscode.workspace, "name", "get").mockReturnValue("MockWorkspace");
    jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    mock.restore();
  });

  it("should add a new workspace to the list", async () => {
    await registerWorkspace(mockContext);
    const actualWorkspaces = JSON.parse(
      fs.readFileSync(mockWorkspacesJsonPath).toString(),
    ) as ExtensionWorkspace[];

    expect(actualWorkspaces).toHaveLength(1);
    expect(actualWorkspaces[0].name).toBe("MockWorkspace");
    expect(actualWorkspaces[0].folder).toBe("mock/my-workspace");
    expect(actualWorkspaces[0].id).toBe("mock");
  });
});
