/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { glob } from "glob";
import * as vscode from "vscode";
import * as extension from "../../../../src/extension";
import {
  LocalExecutionSummary,
  RemoteExecutionSummary,
  RemoteTarget,
} from "../../../../src/interfaces/simulator";
import { DynatraceTenantDto, ExtensionWorkspaceDto } from "../../../../src/interfaces/treeViews";
import {
  cleanUpSimulatorLogs,
  createUniqueFileName,
  createValidFileName,
  deleteSimulatorTarget,
  findWorkspace,
  getAllTenants,
  getAllWorkspaces,
  getExtensionFilePath,
  getExtensionWorkspaceDir,
  getSimulatorSummaries,
  getSimulatorTargets,
  getSnmpDirPath,
  getSnmpMibFiles,
  initializeGlobalStorage,
  initWorkspaceStorage,
  readExtensionManifest,
  registerSimulatorSummary,
  registerSimulatorTarget,
  registerSimulatorTargets,
  registerTenant,
  registerWorkspace,
  removeOldestFiles,
  removeTenant,
  removeWorkspace,
  resolveRealPath,
  uploadComponentCert,
  writeGititnore,
} from "../../../../src/utils/fileSystem";
import { MockExtensionContext, MockUri, MockWorkspaceConfiguration } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

const mockGlobalStoragePath = path.join("mock", "globalStorage");
const mockWorkspaceStoragePath = path.join("mock", "workspaceStorage");
const mockWorkspacePath = path.join("mock", "my-workspace");
const mockWorkspacesJsonPath = path.join(mockGlobalStoragePath, "extensionWorkspaces.json");
const mockEnvironmentsJsonPath = path.join(mockGlobalStoragePath, "dynatraceEnvironments.json");
const mockSimulatorTargetsJsonPath = path.join(mockGlobalStoragePath, "targets.json");
const mockSummaryJsonPath = path.join(mockGlobalStoragePath, "summaries.json");
const mockManifestPath = path.join(mockWorkspacePath, "extension", "extension.yaml");
const mockWorkspaceFolders = [
  { index: 0, name: "MockWorkspace", uri: new MockUri(mockWorkspacePath) },
];
const mockExtensionWorkspacesEntries: ExtensionWorkspaceDto[] = [
  { name: "MockWorkspace", id: "mock", folder: "file://mock/my-workspace" },
  { name: "OtherWorkspace", id: "other", folder: "file://mock/other-workspace" },
];
const mockDynatraceEnvironmentsEntries: DynatraceTenantDto[] = [
  {
    id: "abc12345",
    url: "https://abc12345.com",
    apiUrl: "C",
    token: "D",
    current: true,
    label: "Mock-1",
  },
  {
    id: "xyz98765",
    url: "https://a/e/xyz98765",
    apiUrl: "Y",
    token: "Z",
    current: false,
    label: "Mock-2",
  },
];
const mockSummariesEntries: (LocalExecutionSummary | RemoteExecutionSummary)[] = [
  {
    location: "LOCAL",
    duration: 1,
    logPath: "mock/logs/1234.log",
    startTime: new Date(1),
    success: true,
    workspace: "mock",
  },
  {
    location: "REMOTE",
    duration: 2,
    logPath: "123.log",
    startTime: new Date(2),
    success: false,
    workspace: "mock",
    target: "mockTarget",
  },
];
const mockSimulatorTargetEntries: RemoteTarget[] = [
  {
    address: "A",
    name: "B",
    eecType: "ACTIVEGATE",
    osType: "LINUX",
    username: "C",
    privateKey: "D",
  },
  {
    address: "X",
    name: "Y",
    eecType: "ONEAGENT",
    osType: "WINDOWS",
    username: "Z",
    privateKey: "A",
  },
];

describe("Filesystem Utils", () => {
  describe("createValidFileName", () => {
    const expectedRegex = /[a-zA-Z0-9]+([-_./][a-zA-Z0-9]+)*/;

    test.each([
      "! This is a very !!!important!!! alert !",
      "This is a very important alert",
      "This 😀 is a very important alert 😀",
    ])('should create a valid filename from "%s"', (title: string) => {
      const actual = createValidFileName(title);

      expect(actual).toMatch(expectedRegex);
    });
  });

  describe("initGlobalStorage", () => {
    const logsPath = path.join(mockGlobalStoragePath, "logs");
    const expectedFiles = [
      { path: mockWorkspacesJsonPath, default: "[]" },
      { path: mockEnvironmentsJsonPath, default: "[]" },
      { path: path.join(mockGlobalStoragePath, "idToken.txt"), default: "1234" },
      { path: mockSimulatorTargetsJsonPath, default: "[]" },
      { path: mockSummaryJsonPath, default: "[]" },
    ];

    beforeAll(() => {
      jest
        .spyOn(extension, "getActivationContext")
        .mockReturnValue(new MockExtensionContext(mockGlobalStoragePath));
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it("should create folders and files on new init", () => {
      mockFs.existsSync.mockReturnValue(false);
      initializeGlobalStorage();

      expect(mockFs.mkdirSync).toHaveBeenNthCalledWith(1, mockGlobalStoragePath, {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenNthCalledWith(2, logsPath, { recursive: true });
      expectedFiles.forEach((file, i) => {
        expect(mockFs.writeFileSync).toHaveBeenNthCalledWith(i + 1, file.path, file.default);
      });
    });

    it("should preserve content if already initialized", () => {
      mockFs.existsSync.mockReturnValue(true);

      initializeGlobalStorage();

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("removeOldestFiles", () => {
    beforeEach(() => {
      // @ts-expect-error
      mockFs.readdirSync.mockReturnValue(["f1", "f2", "f3"]);
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        const stats = new fs.Stats();
        switch (p) {
          case path.join("mock", "f1"):
            stats.mtime = new Date(1);
            return stats;
          case path.join("mock", "f2"):
            stats.mtime = new Date(2);
            return stats;
          case path.join("mock", "f3"):
            stats.mtime = new Date(3);
            return stats;
          default:
            stats.mtime = new Date(0);
            return stats;
        }
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it("should remove extra files by age and count", () => {
      removeOldestFiles("mock", 1);

      expect(mockFs.rmSync).toHaveBeenNthCalledWith(1, path.join("mock", "f3"));
      expect(mockFs.rmSync).toHaveBeenNthCalledWith(2, path.join("mock", "f2"));
    });

    it("should not remove files within limit", () => {
      removeOldestFiles("mock", 3);

      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it("should not remove any files if a negative count given", () => {
      removeOldestFiles("mock", -2);

      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });
  });

  describe("initWorkspaceStorage", () => {
    let getActivationContextSpy: jest.SpyInstance;

    beforeAll(() => {
      getActivationContextSpy = jest.spyOn(extension, "getActivationContext");
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("shouldn't do anything if no workspace is open", () => {
      getActivationContextSpy.mockReturnValue(new MockExtensionContext(undefined, undefined));

      initWorkspaceStorage();

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it("should create directories if workspace path doesn't exist", () => {
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(undefined, mockWorkspaceStoragePath),
      );

      initWorkspaceStorage();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockWorkspaceStoragePath, { recursive: true });
    });

    it("should preserve content if workspace path already exists", () => {
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(undefined, mockWorkspaceStoragePath),
      );
      mockFs.existsSync.mockReturnValue(true);

      initWorkspaceStorage();

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockWorkspaceStoragePath);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe("registerWorkspace", () => {
    let getActivationContextSpy: jest.SpyInstance;
    let executeCommandSpy: jest.SpyInstance;

    beforeAll(() => {
      getActivationContextSpy = jest.spyOn(extension, "getActivationContext");
    });

    beforeEach(() => {
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(mockGlobalStoragePath, mockWorkspaceStoragePath),
      );
      jest.spyOn(vscode.workspace, "name", "get").mockReturnValue("MockWorkspace");
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
      executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.resetAllMocks();
    });

    it("should bail early if no storage URI available", async () => {
      getActivationContextSpy.mockReturnValue(new MockExtensionContext(undefined, undefined));

      await registerWorkspace();

      expect(executeCommandSpy).not.toHaveBeenCalled();
    });

    it("should add a new workspace to the list", async () => {
      const emptyWorkspaceJson = "[]";
      const expectedWorkspaceJson = JSON.stringify([
        { name: "MockWorkspace", id: "mock", folder: mockWorkspacePath },
      ]);
      mockExistsSync([mockWorkspacesJsonPath, mockWorkspaceStoragePath]);
      mockReadFileSync([[mockWorkspacesJsonPath, emptyWorkspaceJson]]);

      await registerWorkspace();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockWorkspacesJsonPath,
        expectedWorkspaceJson,
      );
      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numWorkspaces",
        1,
      );
    });

    it("should preserve other existing workspaces", async () => {
      const otherWorkspaceJson = JSON.stringify([
        { name: "OtherWorkspace", folder: "mock/other-workspace", id: "other" },
      ]);
      const expectedWorkspaceJson = JSON.stringify([
        { name: "OtherWorkspace", folder: "mock/other-workspace", id: "other" },
        { name: "MockWorkspace", id: "mock", folder: mockWorkspacePath },
      ]);
      mockExistsSync([mockWorkspacesJsonPath, mockWorkspaceStoragePath]);
      mockReadFileSync([[mockWorkspacesJsonPath, otherWorkspaceJson]]);

      await registerWorkspace();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockWorkspacesJsonPath,
        expectedWorkspaceJson,
      );
      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numWorkspaces",
        2,
      );
    });

    it("should update details if workspace exists", async () => {
      const twoWorkspaceJson = JSON.stringify([
        { name: "MockOldWorkspace", folder: "mock/my-old-workspace", id: "mock" },
        { name: "OtherWorkspace", folder: "mock/other-workspace", id: "other" },
      ]);
      const expectedWorkspaceJson = JSON.stringify([
        { name: "MockWorkspace", id: "mock", folder: mockWorkspacePath },
        { name: "OtherWorkspace", folder: "mock/other-workspace", id: "other" },
      ]);
      mockExistsSync([mockWorkspacesJsonPath, mockWorkspaceStoragePath]);
      mockReadFileSync([[mockWorkspacesJsonPath, twoWorkspaceJson]]);

      await registerWorkspace();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockWorkspacesJsonPath,
        expectedWorkspaceJson,
      );

      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numWorkspaces",
        2,
      );
    });
  });

  describe("getAllWorkspaces", () => {
    beforeAll(() => {
      setupContextWithStorage();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test.each([
      { case: "zero", expected: [] },
      { case: "single", expected: mockExtensionWorkspacesEntries.slice(0, 1) },
      { case: "multiple", expected: mockExtensionWorkspacesEntries },
    ])("$case entries should return expected value", ({ expected }) => {
      mockExistsSync([mockWorkspacesJsonPath]);
      mockReadFileSync([[mockWorkspacesJsonPath, JSON.stringify(expected)]]);

      jest.spyOn(vscode.Uri, "parse").mockImplementation((val: string) => new MockUri(val));

      const actual = getAllWorkspaces();

      expect(actual.length).toBe(expected.length);
      actual.forEach((actualWorkspace, i) => {
        const expectedWorkspace = expected[i];

        expect(actualWorkspace).toEqual(expectedWorkspace);
      });
    });
  });

  describe("findWorkspace", () => {
    const expected = mockExtensionWorkspacesEntries[0];

    beforeEach(() => {
      mockExistsSync([mockWorkspacesJsonPath]);
      mockReadFileSync([[mockWorkspacesJsonPath, JSON.stringify([expected])]]);
      jest.spyOn(vscode.Uri, "parse").mockImplementation((val: string) => new MockUri(val));
      setupContextWithStorage();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it("should find workspace by name", () => {
      const actual = findWorkspace(expected.name);

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
    });

    it("should find workspace by id", () => {
      const actual = findWorkspace(undefined, "mock");

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
    });

    it("should return undefined if no workspaces exist", () => {
      mockReadFileSync([[mockWorkspacesJsonPath, "[]"]]);

      const actual = findWorkspace("notExisting");

      expect(actual).toBeUndefined();
    });

    it("should return undefinedd list if no workspace found", () => {
      const actual = findWorkspace("notExisting");

      expect(actual).toBeUndefined();
    });
  });

  describe("getAllTenants", () => {
    beforeAll(() => {
      setupContextWithStorage();
    });

    beforeEach(() => {
      mockExistsSync([mockGlobalStoragePath]);
    });

    afterEach(() => {
      mockFs.existsSync.mockReset();
      mockFs.readFileSync.mockReset();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    test.each([
      { case: "zero", expected: [] },
      { case: "single", expected: mockDynatraceEnvironmentsEntries.slice(0, 1) },
      { case: "multiple", expected: mockDynatraceEnvironmentsEntries },
    ])("$case entries should return expected value", ({ expected }) => {
      mockExistsSync([mockEnvironmentsJsonPath]);
      mockReadFileSync([[mockEnvironmentsJsonPath, JSON.stringify(expected)]]);

      const actual = getAllTenants();

      actual.forEach((actualTenant, i) => {
        const expectedTenant = expected[i];
        expect(actualTenant).toEqual(expectedTenant);
      });
    });

    it("should throw error if file doesn't exist", () => {
      expect(() => {
        getAllTenants();
      }).toThrow();
    });
  });

  describe("registerTenant", () => {
    beforeAll(() => {
      setupContextWithStorage();
    });

    beforeEach(() => {
      mockExistsSync([mockEnvironmentsJsonPath]);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    afterAll(() => {
      jest.resetAllMocks();
    });

    it("should update the numEnvironments context variable", async () => {
      mockReadFileSync([[mockEnvironmentsJsonPath, "[]"]]);
      const executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");

      await registerTenant("https://a/e/X", "", "");

      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numEnvironments",
        1,
      );
    });

    it("should add a new tenant to the list", async () => {
      mockReadFileSync([[mockEnvironmentsJsonPath, "[]"]]);
      const { url, apiUrl, token, current, label } = mockDynatraceEnvironmentsEntries[0];
      const expectedTenantsJson = JSON.stringify([mockDynatraceEnvironmentsEntries[0]]);

      await registerTenant(url, apiUrl, token, label, current);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        expectedTenantsJson,
      );
    });

    it("should preserve existing tenants", async () => {
      const existingWorkspace = mockDynatraceEnvironmentsEntries[0];
      const expectedTenantsJson = JSON.stringify([
        existingWorkspace,
        { id: "X", url: "https://a/e/X", apiUrl: "", token: "", current: false, label: "X" },
      ]);
      mockReadFileSync([[mockEnvironmentsJsonPath, JSON.stringify([existingWorkspace])]]);

      await registerTenant("https://a/e/X", "", "");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        expectedTenantsJson,
      );
    });

    it("should update details if tenant re-registers", async () => {
      const expected = {
        id: "abc12345",
        url: "https://abc12345.com",
        apiUrl: "",
        token: "",
        current: false,
        label: "",
      };
      mockReadFileSync([
        [mockEnvironmentsJsonPath, JSON.stringify(mockDynatraceEnvironmentsEntries)],
      ]);

      await registerTenant(expected.url, expected.apiUrl, expected.token, expected.label);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        JSON.stringify([expected, mockDynatraceEnvironmentsEntries[1]]),
      );
    });

    it("should disconnect other tenants when adding a current tenant", async () => {
      const existingWorkspace = mockDynatraceEnvironmentsEntries[0];
      mockReadFileSync([[mockEnvironmentsJsonPath, JSON.stringify([existingWorkspace])]]);

      await registerTenant("https://a/e/X", "", "", "", true);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        JSON.stringify([
          { ...existingWorkspace, current: false },
          { id: "X", url: "https://a/e/X", apiUrl: "", token: "", current: true, label: "" },
        ]),
      );
    });

    it("should throw if json file doesn't exist", async () => {
      mockReadFileSync([]);
      await expect(registerTenant("https://a/e/X", "", "", "", true)).rejects.toThrow();
    });
  });

  describe("removeTenant", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([[mockEnvironmentsJsonPath, "[]"]]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("updates the numEnvironments context variable", async () => {
      const executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");

      await removeTenant("A");

      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numEnvironments",
        0,
      );
    });

    it("throws if json file doesn't exist", async () => {
      mockReadFileSync([]);

      await expect(removeTenant("A")).rejects.toThrow();
    });

    it("removes a tenant from the list", async () => {
      const expectedTenant = mockDynatraceEnvironmentsEntries[1];
      mockReadFileSync([
        [mockEnvironmentsJsonPath, JSON.stringify(mockDynatraceEnvironmentsEntries)],
      ]);

      await removeTenant("abc12345");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        JSON.stringify([expectedTenant]),
      );
    });

    it("it leaves the list unchanged if empty", async () => {
      mockReadFileSync([[mockEnvironmentsJsonPath, "[]"]]);

      await removeTenant("abc12345");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockEnvironmentsJsonPath, "[]");
    });

    it("it leaves the list unchanged if tenant doesn't exist", async () => {
      mockReadFileSync([
        [mockEnvironmentsJsonPath, JSON.stringify(mockDynatraceEnvironmentsEntries)],
      ]);

      await removeTenant("X");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockEnvironmentsJsonPath,
        JSON.stringify(mockDynatraceEnvironmentsEntries),
      );
    });
  });

  describe("removeWorkspace", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([[mockWorkspacesJsonPath, "[]"]]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("updates the numWorkspaces context variable", async () => {
      const executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");

      await removeWorkspace("A");

      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numWorkspaces",
        0,
      );
    });

    it("throws if json file doesn't exist", async () => {
      mockReadFileSync([]);

      await expect(removeWorkspace("A")).rejects.toThrow();
    });

    it("removes a workspace from the list", async () => {
      const expectedWorkspace = mockExtensionWorkspacesEntries[1];
      mockReadFileSync([[mockWorkspacesJsonPath, JSON.stringify(mockExtensionWorkspacesEntries)]]);

      await removeWorkspace("mock");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockWorkspacesJsonPath,
        JSON.stringify([expectedWorkspace]),
      );
    });

    it("it leaves the list unchanged if empty", async () => {
      await removeWorkspace("mock");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockWorkspacesJsonPath, "[]");
    });

    it("it leaves the list unchanged if workspace doesn't exist", async () => {
      mockReadFileSync([[mockWorkspacesJsonPath, JSON.stringify(mockExtensionWorkspacesEntries)]]);

      await removeWorkspace("X");

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockWorkspacesJsonPath,
        JSON.stringify(mockExtensionWorkspacesEntries),
      );
    });
  });

  describe("registerSimulatorSummary", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([[mockSummaryJsonPath, "[]"]]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("adds a summary to the list", () => {
      const expected = mockSummariesEntries[0];

      registerSimulatorSummary(expected);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockSummaryJsonPath,
        JSON.stringify([expected]),
      );
    });

    it("throws error if json file doesn't exist", () => {
      mockReadFileSync([]);

      expect(() => {
        registerSimulatorSummary(mockSummariesEntries[0]);
      }).toThrow();
    });

    it("preserves existing summaries", () => {
      const existingSummary = mockSummariesEntries[0];
      mockReadFileSync([[mockSummaryJsonPath, JSON.stringify([existingSummary])]]);

      registerSimulatorSummary(mockSummariesEntries[1]);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockSummaryJsonPath,
        JSON.stringify(mockSummariesEntries),
      );
    });
  });

  describe("getSimulatorSummaries", () => {
    beforeEach(() => {
      setupContextWithStorage();
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    test.each([
      { case: "zero", expectedSummaries: [] },
      { case: "single", expectedSummaries: mockSummariesEntries.slice(0, 1) },
      { case: "multiple", expectedSummaries: mockSummariesEntries },
    ])("$case entries should return expected value", ({ expectedSummaries }) => {
      mockReadFileSync([[mockSummaryJsonPath, JSON.stringify(expectedSummaries)]]);

      const actualSummaries = getSimulatorSummaries();

      expect(actualSummaries.length).toBe(expectedSummaries.length);
      actualSummaries.forEach((actual, i) => {
        const expected = expectedSummaries[i];
        expect(actual).toEqual(expected);
      });
    });

    it("throws error if json file doesn't exist", () => {
      mockReadFileSync([]);

      expect(() => {
        getSimulatorSummaries();
      }).toThrow();
    });
  });

  describe("cleanUpSimulatorLogs", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([[mockSummaryJsonPath, JSON.stringify(mockSummariesEntries)]]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    test.each([{ settingValue: undefined }, { settingValue: -1 }])(
      "should not do anything if setting is $settingValue",
      ({ settingValue }) => {
        jest
          .spyOn(vscode.workspace, "getConfiguration")
          .mockReturnValue(new MockWorkspaceConfiguration({ maximumLogFiles: settingValue }));

        cleanUpSimulatorLogs();

        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      },
    );

    test.each([
      { case: "all", settingsValue: 0, expected: "[]" },
      { case: "one", settingsValue: 1, expected: JSON.stringify([mockSummariesEntries[1]]) },
      { case: "zero", settingsValue: 2, expected: JSON.stringify(mockSummariesEntries) },
    ])("should remove $case entries", ({ settingsValue, expected }) => {
      jest
        .spyOn(vscode.workspace, "getConfiguration")
        .mockReturnValue(new MockWorkspaceConfiguration({ maximumLogFiles: settingsValue }));

      cleanUpSimulatorLogs();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSummaryJsonPath, expected);
    });

    it("should catch errors from deleting files", () => {
      mockFs.rmSync.mockImplementation(() => {
        throw new Error("Mock Error");
      });
      jest
        .spyOn(vscode.workspace, "getConfiguration")
        .mockReturnValue(new MockWorkspaceConfiguration({ maximumLogFiles: 0 }));

      expect(() => {
        cleanUpSimulatorLogs();
      }).not.toThrow();
    });
  });

  describe("registerSimulatorTargets", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([[mockSimulatorTargetsJsonPath, "[]"]]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("replaces the list of targets", () => {
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      registerSimulatorTargets(mockSimulatorTargetEntries);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSimulatorTargetsJsonPath, expected);
    });
  });

  describe("registerSimulatorTarget", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([
        [mockSimulatorTargetsJsonPath, JSON.stringify([mockSimulatorTargetEntries[0]])],
      ]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("should add a target to the list", () => {
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      registerSimulatorTarget(mockSimulatorTargetEntries[1]);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSimulatorTargetsJsonPath, expected);
    });

    it("should update details if target re-registers", () => {
      const newTargetDetails = { ...mockSimulatorTargetEntries[0], address: "NEWVALUE" };
      const expected = JSON.stringify([newTargetDetails]);

      registerSimulatorTarget(newTargetDetails);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSimulatorTargetsJsonPath, expected);
    });
  });

  describe("deleteSimulatorTarget", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([
        [mockSimulatorTargetsJsonPath, JSON.stringify(mockSimulatorTargetEntries)],
      ]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("removes a target from the list", () => {
      const expected = JSON.stringify([mockSimulatorTargetEntries[1]]);

      deleteSimulatorTarget(mockSimulatorTargetEntries[0]);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSimulatorTargetsJsonPath, expected);
    });

    it("throws if the file doesn't exist", () => {
      mockReadFileSync([]);

      expect(() => {
        deleteSimulatorTarget(mockSimulatorTargetEntries[0]);
      }).toThrow();
    });

    it("leaves the list unchanged if target name doesn't exist", () => {
      const targetToDelete = { ...mockSimulatorTargetEntries[0], name: "MOCK" };
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      deleteSimulatorTarget(targetToDelete);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(mockSimulatorTargetsJsonPath, expected);
    });
  });

  describe("getSimulatorTargets", () => {
    beforeEach(() => {
      setupContextWithStorage();
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    test.each([
      { case: "zero", expectedTargets: [] },
      { case: "one", expectedTargets: mockSimulatorTargetEntries.slice(0, 1) },
      { case: "multiple", expectedTargets: mockSimulatorTargetEntries },
    ])("returns expected value for $case entries", ({ expectedTargets }) => {
      mockReadFileSync([[mockSimulatorTargetsJsonPath, JSON.stringify(expectedTargets)]]);

      const actualTargets = getSimulatorTargets();

      actualTargets.forEach((actual, i) => {
        const expected = expectedTargets[i];
        expect(actual).toEqual(expected);
      });
    });

    it("throws if the file doesn't exist", () => {
      mockReadFileSync([]);

      expect(() => {
        getSimulatorTargets();
      }).toThrow();
    });
  });

  describe("uploadComponentCert", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mockReadFileSync([
        [path.join("mock", "certificate"), "AAA"],
        [path.join("mock", "certificate.pem"), "AAA"],
      ]);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    test.each([
      { component: "OneAgent", fileExt: true, expectedFile: "certificate_mock-workspace.pem" },
      { component: "ActiveGate", fileExt: false, expectedFile: "certificate_mock-workspace" },
    ])(
      "writes $expectedFile file to the $component location",
      ({ component, fileExt, expectedFile }) => {
        const certFile = fileExt ? "certificate.pem" : "certificate";
        const typedComponentParam = component as "OneAgent" | "ActiveGate";
        const certPath = getCertPath(typedComponentParam);

        uploadComponentCert(path.join("mock", certFile), typedComponentParam);

        expect(mockFs.writeFileSync).toHaveBeenCalledWith(path.join(certPath, expectedFile), "AAA");
      },
    );

    test.each(["OneAgent", "ActiveGate"])("doesn't overwrite existing files on %s", component => {
      const typedComponentParam = component as "OneAgent" | "ActiveGate";
      const certPath = getCertPath(typedComponentParam);
      mockReadFileSync([
        [path.join(certPath, "certificate_mock-workspace"), "AAA"],
        [path.join("mock", "certificate"), "AAA"],
      ]);

      uploadComponentCert(path.join("mock", "certificate"), typedComponentParam);

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("readExtensionManifest", () => {
    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("returns manifest content", () => {
      const expected = "AAA";
      mockReadFileSync([[mockManifestPath, expected]]);

      const actual = readExtensionManifest();

      expect(actual).toBe(expected);
    });

    it("it returns empty string in case of issues", () => {
      const expected = "";
      mockReadFileSync([]);

      const actual = readExtensionManifest();

      expect(actual).toBe(expected);
    });
  });

  describe("getExtensionFilePath", () => {
    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("finds the path in workspace root", () => {
      const expectedPath = path.join("extension", "extension.yaml");
      const globSpy = jest.spyOn(glob, "sync").mockReturnValue([expectedPath]);

      const actual = getExtensionFilePath();

      expect(globSpy).toHaveBeenCalledTimes(1);
      expect(globSpy).toHaveBeenNthCalledWith(1, "extension/extension.yaml", {
        cwd: mockWorkspacePath,
      });
      expect(actual).toBe(mockManifestPath);
    });

    it("find the path one level under workspace root", () => {
      const expectedPath = path.join("src", "extension", "extension.yaml");
      const globSpy = jest.spyOn(glob, "sync").mockImplementation((p: string) => {
        if (p === "extension/extension.yaml") {
          return [];
        }
        return [expectedPath];
      });

      const actual = getExtensionFilePath();

      expect(globSpy).toHaveBeenCalledTimes(2);
      expect(globSpy).toHaveBeenNthCalledWith(1, "extension/extension.yaml", {
        cwd: mockWorkspacePath,
      });
      expect(globSpy).toHaveBeenNthCalledWith(2, "*/extension/extension.yaml", {
        cwd: mockWorkspacePath,
      });
      expect(actual).toBe(path.join(mockWorkspacePath, "src", "extension", "extension.yaml"));
    });

    it("returns undefined if not found", () => {
      jest.spyOn(glob, "sync").mockReturnValue([]);
      const actual = getExtensionFilePath();

      expect(actual).toBeUndefined();
    });
  });

  describe("getExtensionWorkspaceDir", () => {
    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("returns undefined if no workspace open", () => {
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBeUndefined();
    });

    it("returns undefined if directory not found", () => {
      mockFs.readdirSync.mockReturnValue([]);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBeUndefined();
    });

    it("finds directory in workspace root", () => {
      //@ts-expect-error
      mockFs.readdirSync.mockReturnValue(["extension"]);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBe(path.join("mock", "my-workspace", "extension"));
    });

    it("finds directory one level under workspace root", () => {
      const rootPath = path.join("mock", "my-workspace");
      //@ts-expect-error
      mockFs.readdirSync.mockImplementation((p: fs.PathLike) => {
        if (p.toString() === rootPath) {
          return ["src"];
        }
        if (p.toString() === path.join(rootPath, "src")) {
          return ["extension"];
        }
        return [];
      });
      mockFs.statSync.mockImplementation((p: fs.PathLike) => {
        if (
          [path.join(rootPath, "src"), path.join(rootPath, "src", "extension")].includes(
            p.toString(),
          )
        ) {
          return { isDirectory: () => true } as fs.Stats;
        }
        return { isDirectory: () => false } as fs.Stats;
      });

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBe(path.join("mock", "my-workspace", "src", "extension"));
    });
  });

  describe("resolveRealPath", () => {
    beforeAll(() => {
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterAll(() => {
      jest.resetAllMocks();
    });

    test.each([
      { input: "abspath", expected: path.resolve("abspath") },
      { input: `~${path.sep}homepath`, expected: path.resolve(os.homedir(), "homepath") },
      { input: `.${path.sep}relpath`, expected: path.resolve(mockWorkspacePath, ".", "relpath") },
      { input: `..${path.sep}relpath`, expected: path.resolve(mockWorkspacePath, "..", "relpath") },
    ])('resolves "$input" to "$expected"', ({ input, expected }) => {
      const actual = resolveRealPath(input);

      expect(actual).toBe(expected);
    });

    it("path is unresolved if workspace folder doesn't exist", () => {
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
      const expected = "./relpath";

      const actual = resolveRealPath("./relpath");

      expect(actual).toBe(expected);
      jest.resetAllMocks();
    });
  });

  describe("createUniqueFileName", () => {
    beforeAll(() => {
      mockFs.readdirSync.mockReturnValue([]);
    });

    it("creates unique filename", () => {
      const expected = "x-001-file.json";

      const actual = createUniqueFileName("mock", "x", "file");

      expect(actual).toBe(expected);
    });
  });

  describe("writeGititnore", () => {
    let findFilesSpy: jest.SpyInstance;
    const gitignorePath = path.join("mock", "my-workspace", ".gitignore");

    beforeEach(() => {
      findFilesSpy = jest.spyOn(vscode.workspace, "findFiles");
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it("writes new gitignore file with base content", async () => {
      findFilesSpy.mockReturnValue([]);
      const actualFs = jest.requireActual<typeof fs>("fs");
      const expectedContent = actualFs
        .readFileSync(
          path.resolve(__dirname, "..", "..", "test_data", "workspace_files", "base_gitignore"),
        )
        .toString();
      mockExistsSync([path.join("mock", "my-workspace")]);

      await writeGititnore();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(gitignorePath, expectedContent);
    });

    it("doesn't create a file if no workspace open", async () => {
      findFilesSpy.mockReturnValue([]);
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

      await writeGititnore();

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("getSnmpDirPath", () => {
    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
      mockReadFileSync([[mockManifestPath, "AAA"]]);
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it("resolves a directory above the manifest path", () => {
      const expected = path.resolve(mockManifestPath, "..", "snmp");

      const actual = getSnmpDirPath();

      expect(actual).toBe(expected);
    });

    it("returns undefined if no extension manifest", () => {
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

      const actual = getSnmpDirPath();

      expect(actual).toBeUndefined();
    });
  });

  describe("getSnmpMibFiles", () => {
    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it("returns an empty array if no mib files found", () => {
      const actual = getSnmpMibFiles();

      expect(actual).toHaveLength(0);
    });

    it("returns an array of mib files", () => {
      mockFs.existsSync.mockReturnValue(true);
      //@ts-expect-error
      mockFs.readdirSync.mockImplementation((p: fs.PathLike) => {
        if (p.toString().endsWith(path.join(mockWorkspacePath, "extension", "snmp"))) {
          return ["mib1"];
        }
        return [];
      });

      const actual = getSnmpMibFiles();

      expect(actual).toHaveLength(1);
      expect(actual[0].endsWith(path.join("extension", "snmp", "mib1"))).toBe(true);
    });
  });
});

const getCertPath = (component: "OneAgent" | "ActiveGate") => {
  return process.platform === "win32"
    ? component === "OneAgent"
      ? "C:\\ProgramData\\dynatrace\\oneagent\\agent\\config\\certificates"
      : "C:\\ProgramData\\dynatrace\\remotepluginmodule\\agent\\conf\\certificates"
    : component === "OneAgent"
    ? "/var/lib/dynatrace/oneagent/agent/config/certificates"
    : "/var/lib/dynatrace/remotepluginmodule/agent/conf/certificates";
};

const setupContextWithStorage = () => {
  jest
    .spyOn(extension, "getActivationContext")
    .mockReturnValue(new MockExtensionContext(mockGlobalStoragePath, mockWorkspaceStoragePath));
};

const mockExistsSync = (items: string[]) => {
  mockFs.existsSync.mockImplementation(p => {
    return items.includes(p.toString());
  });
};

const mockReadFileSync = (items: [string, string][]) => {
  mockFs.existsSync.mockImplementation(p => {
    return items.find(i => i[0] === p.toString()) !== undefined;
  });
  mockFs.readFileSync.mockImplementation(p => {
    const item = items.find(i => i[0] === p.toString());
    if (item) {
      return item[1];
    }
    throw new Error("File not found");
  });
};
