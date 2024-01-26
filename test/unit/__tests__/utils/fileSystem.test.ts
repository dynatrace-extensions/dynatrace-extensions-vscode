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
import { rmSync } from "fs";
import * as os from "os";
import * as path from "path";
import mock = require("mock-fs");
import FileSystem = require("mock-fs/lib/filesystem");
import * as vscode from "vscode";
import * as extension from "../../../../src/extension";
import {
  LocalExecutionSummary,
  RemoteExecutionSummary,
  RemoteTarget,
} from "../../../../src/interfaces/simulator";
import { DynatraceTenantDto, ExtensionWorkspace } from "../../../../src/interfaces/treeViews";
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
import { readTestDataFile } from "../../../shared/utils";
import { MockExtensionContext, MockUri, MockWorkspaceConfiguration } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

const mockGlobalStoragePath = "mock/globalStorage";
const mockWorkspaceStoragePath = "mock/workspaceStorage";
const mockWorkspacePath = path.join("mock", "my-workspace");
const mockWorkspaceFolders = [
  { index: 0, name: "MockWorkspace", uri: new MockUri(mockWorkspacePath) },
];
const mockExtensionWorkspacesEntries: ExtensionWorkspace[] = [
  { name: "MockWorkspace", folder: "file://mock/my-workspace", id: "mock" },
  { name: "OtherWorkspace", folder: "file://mock/other-workspace", id: "other" },
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
      { path: path.join(mockGlobalStoragePath, "extensionWorkspaces.json"), default: "[]" },
      { path: path.join(mockGlobalStoragePath, "dynatraceEnvironments.json"), default: "[]" },
      { path: path.join(mockGlobalStoragePath, "idToken.txt"), default: "1234" },
      { path: path.join(mockGlobalStoragePath, "summaries.json"), default: "[]" },
      { path: path.join(mockGlobalStoragePath, "targets.json"), default: "[]" },
    ];

    beforeAll(() => {
      jest
        .spyOn(extension, "getActivationContext")
        .mockReturnValue(new MockExtensionContext(mockGlobalStoragePath));
    });

    afterAll(() => {
      mock.restore();
      jest.restoreAllMocks();
    });

    it("should create folders and files on new init", () => {
      mock({ mock: {} });

      initializeGlobalStorage();

      expect(fs.existsSync(mockGlobalStoragePath)).toBe(true);
      expect(fs.existsSync(logsPath)).toBe(true);
      expectedFiles.forEach(file => {
        expect(fs.existsSync(file.path)).toBe(true);
      });
    });

    it("should create content with default values on new init", () => {
      mock({ mock: {} });

      initializeGlobalStorage();

      expectedFiles.forEach(file => {
        expect(fs.readFileSync(file.path).toString()).toBe(file.default);
      });
    });

    it("should preserve content if already initialized", () => {
      const expectedValue = "ABCD1234";
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

      initializeGlobalStorage();

      expectedFiles.forEach(file => {
        expect(fs.readFileSync(file.path).toString()).toBe(expectedValue);
      });
    });
  });

  describe("removeOldestFiles", () => {
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

  describe("initWorkspaceStorage", () => {
    let getActivationContextSpy: jest.SpyInstance;

    beforeAll(() => {
      getActivationContextSpy = jest.spyOn(extension, "getActivationContext");
    });

    beforeEach(() => {
      mock({ mock: {} });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    afterAll(() => {
      mock.restore();
    });

    it("shouldn't do anything if no workspace is open", () => {
      getActivationContextSpy.mockReturnValue(new MockExtensionContext(undefined, undefined));

      initWorkspaceStorage();

      expect(fs.readdirSync("mock").length).toBe(0);
    });

    it("should create directories if workspace path doesn't exist", () => {
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(undefined, mockWorkspaceStoragePath),
      );

      initWorkspaceStorage();

      expect(fs.existsSync(mockWorkspaceStoragePath)).toBe(true);
    });

    it("should preserve content if workspace path already exists", () => {
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(undefined, mockWorkspaceStoragePath),
      );
      mock({ mock: { workspaceStorage: { f1: "AAA" } } });

      initWorkspaceStorage();

      expect(fs.existsSync(`${mockWorkspaceStoragePath}/f1`)).toBe(true);
      expect(fs.readFileSync(`${mockWorkspaceStoragePath}/f1`).toString()).toBe("AAA");
    });
  });

  describe("registerWorkspace", () => {
    let getActivationContextSpy: jest.SpyInstance;
    let executeCommandSpy: jest.SpyInstance;
    const mockWorkspacesJsonPath = path.join(mockGlobalStoragePath, "extensionWorkspaces.json");

    beforeAll(() => {
      getActivationContextSpy = jest.spyOn(extension, "getActivationContext");
    });

    beforeEach(() => {
      mock({ mock: {} });
      getActivationContextSpy.mockReturnValue(
        new MockExtensionContext(mockGlobalStoragePath, mockWorkspaceStoragePath),
      );
      jest.spyOn(vscode.workspace, "name", "get").mockReturnValue("MockWorkspace");
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
      executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    afterAll(() => {
      mock.restore();
    });

    it("should bail early if no storage URI available", async () => {
      getActivationContextSpy.mockReturnValue(new MockExtensionContext(undefined, undefined));

      await registerWorkspace();

      expect(fs.readdirSync("mock").length).toBe(0);
      expect(executeCommandSpy).not.toHaveBeenCalled();
    });

    it("should add a new workspace to the list", async () => {
      const emptyWorkspaceJson = "[]";
      mock({
        mock: {
          globalStorage: { "extensionWorkspaces.json": emptyWorkspaceJson },
          workspaceStorage: {},
        },
      });

      await registerWorkspace();

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(mockWorkspacesJsonPath).toString(),
      ) as ExtensionWorkspace[];
      expect(actualWorkspaces).toHaveLength(1);
      expect(actualWorkspaces[0].name).toBe("MockWorkspace");
      expect(actualWorkspaces[0].folder).toBe(mockWorkspacePath);
      expect(actualWorkspaces[0].id).toBe("mock");
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
      mock({
        mock: {
          globalStorage: { "extensionWorkspaces.json": otherWorkspaceJson },
          workspaceStorage: {},
        },
      });

      await registerWorkspace();

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(mockWorkspacesJsonPath).toString(),
      ) as ExtensionWorkspace[];
      expect(actualWorkspaces).toHaveLength(2);
      expect(actualWorkspaces[0].name).toBe("OtherWorkspace");
      expect(actualWorkspaces[1].name).toBe("MockWorkspace");
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
      mock({
        mock: {
          globalStorage: { "extensionWorkspaces.json": twoWorkspaceJson },
          workspaceStorage: {},
        },
      });

      await registerWorkspace();

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(mockWorkspacesJsonPath).toString(),
      ) as ExtensionWorkspace[];
      expect(actualWorkspaces).toHaveLength(2);
      expect(actualWorkspaces[0].name).toBe("MockWorkspace");
      expect(actualWorkspaces[0].folder).toBe(mockWorkspacePath);
      expect(actualWorkspaces[0].id).toBe("mock");
      expect(actualWorkspaces[1].name).toBe("OtherWorkspace");
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
      mock.restore();
      jest.restoreAllMocks();
    });

    test.each([
      { case: "zero", expected: [] },
      { case: "single", expected: mockExtensionWorkspacesEntries.slice(0, 1) },
      { case: "multiple", expected: mockExtensionWorkspacesEntries },
    ])("$case entries should return expected value", ({ expected }) => {
      mock({ mock: { globalStorage: { "extensionWorkspaces.json": JSON.stringify(expected) } } });
      jest.spyOn(vscode.Uri, "parse").mockImplementation((val: string) => new MockUri(val));

      const actual = getAllWorkspaces();

      expect(actual.length).toBe(expected.length);
      actual.forEach((actualWorkspace, i) => {
        const expectedWorkspace = expected[i];

        expect(actualWorkspace.name).toBe(expectedWorkspace.name);
        expect((actualWorkspace.folder as MockUri).fsPath).toBe(expectedWorkspace.folder);
        expect(actualWorkspace.id).toBe(expectedWorkspace.id);
      });
    });
  });

  describe("findWorkspace", () => {
    const expected = mockExtensionWorkspacesEntries[0];

    beforeEach(() => {
      mock({ mock: { globalStorage: { "extensionWorkspaces.json": JSON.stringify([expected]) } } });
      jest.spyOn(vscode.Uri, "parse").mockImplementation((val: string) => new MockUri(val));
      setupContextWithStorage();
    });

    afterAll(() => {
      mock.restore();
      jest.restoreAllMocks();
    });

    it("should find workspace by name", () => {
      const actual = findWorkspace(expected.name);

      expect(actual).toBeDefined();
      expect(actual?.name).toBe(expected.name);
      expect((actual?.folder as MockUri).fsPath).toBe(expected.folder);
      expect(actual?.id).toBe(expected.id);
    });

    it("should find workspace by id", () => {
      const actual = findWorkspace(undefined, "mock");

      expect(actual).toBeDefined();
      expect(actual?.name).toBe(expected.name);
      expect((actual?.folder as MockUri).fsPath).toBe(expected.folder);
      expect(actual?.id).toBe(expected.id);
    });

    it("should return undefined if no workspaces exist", () => {
      mock({ mock: { globalStorage: { "extensionWorkspaces.json": "[]" } } });

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
      mock({ mock: { globalStorage: {} } });
    });

    afterAll(() => {
      mock.restore();
      jest.restoreAllMocks();
    });

    test.each([
      { case: "zero", expected: [] },
      { case: "single", expected: mockDynatraceEnvironmentsEntries.slice(0, 1) },
      { case: "multiple", expected: mockDynatraceEnvironmentsEntries },
    ])("$case entries should return expected value", ({ expected }) => {
      mock({ mock: { globalStorage: { "dynatraceEnvironments.json": JSON.stringify(expected) } } });

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
    const mockEnvironmentsJsonPath = path.join(mockGlobalStoragePath, "dynatraceEnvironments.json");

    beforeAll(() => {
      setupContextWithStorage();
    });

    beforeEach(() => {
      mock({ mock: { globalStorage: { "dynatraceEnvironments.json": "[]" } } });
    });

    afterAll(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    it("should update the numEnvironments context variable", async () => {
      const executeCommandSpy = jest.spyOn(vscode.commands, "executeCommand");

      await registerTenant("https://a/e/X", "", "");

      expect(executeCommandSpy).toHaveBeenCalledWith(
        "setContext",
        "dynatrace-extensions.numEnvironments",
        1,
      );
    });

    it("should add a new tenant to the list", async () => {
      const { url, apiUrl, token, current, label } = mockDynatraceEnvironmentsEntries[0];

      await registerTenant(url, apiUrl, token, label, current);

      const actualTenants = JSON.parse(
        fs.readFileSync(mockEnvironmentsJsonPath).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(1);
      expect(actualTenants[0]).toEqual(mockDynatraceEnvironmentsEntries[0]);
    });

    it("should preserve existing tenants", async () => {
      const existingWorkspace = mockDynatraceEnvironmentsEntries[0];
      mock({
        mock: {
          globalStorage: { "dynatraceEnvironments.json": JSON.stringify([existingWorkspace]) },
        },
      });

      await registerTenant("https://a/e/X", "", "");

      const actualTenants = JSON.parse(
        fs.readFileSync(mockEnvironmentsJsonPath).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(2);
      expect(actualTenants[0]).toEqual(existingWorkspace);
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
      mock({
        mock: {
          globalStorage: {
            "dynatraceEnvironments.json": JSON.stringify(mockDynatraceEnvironmentsEntries),
          },
        },
      });

      await registerTenant("https://abc12345.com", "", "", "");

      const actualTenants = JSON.parse(
        fs.readFileSync(mockEnvironmentsJsonPath).toString(),
      ) as DynatraceTenantDto[];
      const actual = actualTenants[0];
      expect(actualTenants).toHaveLength(2);
      expect(actual).toEqual(expected);
    });

    it("should disconnect other tenants when adding a current tenant", async () => {
      const existingWorkspace = mockDynatraceEnvironmentsEntries[0];
      mock({
        mock: {
          globalStorage: { "dynatraceEnvironments.json": JSON.stringify([existingWorkspace]) },
        },
      });

      await registerTenant("https://a/e/X", "", "", "", true);

      const actualTenants = JSON.parse(
        fs.readFileSync(mockEnvironmentsJsonPath).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(2);
      expect(actualTenants[0].current).toBe(false);
      expect(actualTenants[1].current).toBe(true);
    });

    it("should throw if json file doesn't exist", async () => {
      mock({ mock: { globalStorage: {} } });

      await expect(registerTenant("https://a/e/X", "", "", "", true)).rejects.toThrow();
    });
  });

  describe("removeTenant", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({ mock: { globalStorage: { "dynatraceEnvironments.json": "[]" } } });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
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
      mock({ mock: { globalStorage: {} } });

      await expect(removeTenant("A")).rejects.toThrow();
    });

    it("removes a tenant from the list", async () => {
      const expectedTenant = mockDynatraceEnvironmentsEntries[1];
      mock({
        mock: {
          globalStorage: {
            "dynatraceEnvironments.json": JSON.stringify(mockDynatraceEnvironmentsEntries),
          },
        },
      });

      await removeTenant("abc12345");

      const actualTenants = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "dynatraceEnvironments.json")).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(1);
      expect(actualTenants[0]).toEqual(expectedTenant);
    });

    it("it leaves the list unchanged if empty", async () => {
      await removeTenant("abc12345");

      const actualTenants = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "dynatraceEnvironments.json")).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(0);
    });

    it("it leaves the list unchanged if tenant doesn't exist", async () => {
      mock({
        mock: {
          globalStorage: {
            "dynatraceEnvironments.json": JSON.stringify(mockDynatraceEnvironmentsEntries),
          },
        },
      });

      await removeTenant("X");

      const actualTenants = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "dynatraceEnvironments.json")).toString(),
      ) as DynatraceTenantDto[];
      expect(actualTenants).toHaveLength(2);
      actualTenants.forEach((actualTenant, i) => {
        const expectedTenant = mockDynatraceEnvironmentsEntries[i];
        expect(actualTenant).toEqual(expectedTenant);
      });
    });
  });

  describe("removeWorkspace", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({ mock: { globalStorage: { "extensionWorkspaces.json": "[]" } } });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
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
      mock({ mock: { globalStorage: {} } });

      await expect(removeWorkspace("A")).rejects.toThrow();
    });

    it("removes a workspace from the list", async () => {
      const expectedWorkspace = mockExtensionWorkspacesEntries[1];
      mock({
        mock: {
          globalStorage: {
            "extensionWorkspaces.json": JSON.stringify(mockExtensionWorkspacesEntries),
          },
        },
      });

      await removeWorkspace("mock");

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "extensionWorkspaces.json")).toString(),
      ) as ExtensionWorkspace[];
      const actualWorkspace = actualWorkspaces[0];
      expect(actualWorkspaces).toHaveLength(1);
      expect(actualWorkspace).toEqual(expectedWorkspace);
    });

    it("it leaves the list unchanged if empty", async () => {
      await removeWorkspace("mock");

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "extensionWorkspaces.json")).toString(),
      ) as ExtensionWorkspace[];
      expect(actualWorkspaces).toHaveLength(0);
    });

    it("it leaves the list unchanged if workspace doesn't exist", async () => {
      mock({
        mock: {
          globalStorage: {
            "extensionWorkspaces.json": JSON.stringify(mockExtensionWorkspacesEntries),
          },
        },
      });

      await removeWorkspace("X");

      const actualWorkspaces = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "extensionWorkspaces.json")).toString(),
      ) as ExtensionWorkspace[];
      expect(actualWorkspaces).toHaveLength(2);
      actualWorkspaces.forEach((actualWorkspace, i) => {
        const expectedWorkspace = mockExtensionWorkspacesEntries[i];
        expect(actualWorkspace).toEqual(expectedWorkspace);
      });
    });
  });

  describe("registerSimulatorSummary", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({ mock: { globalStorage: { "summaries.json": "[]" } } });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
    });

    it("adds a summary to the list", () => {
      const expected = mockSummariesEntries[0];

      registerSimulatorSummary(expected);

      const actualSummaries = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "summaries.json")).toString(),
      ) as (LocalExecutionSummary | RemoteExecutionSummary)[];
      const actual = actualSummaries[0] as LocalExecutionSummary;
      expect(actualSummaries).toHaveLength(1);
      expect(actual.duration).toBe(expected.duration);
      expect(actual.location).toBe(expected.location);
      expect(actual.logPath).toBe(expected.logPath);
      expect(actual.startTime).toBe(expected.startTime.toISOString());
      expect(actual.success).toBe(expected.success);
      expect(actual.workspace).toBe(expected.workspace);
    });

    it("throws error if json file doesn't exist", () => {
      mock({ mock: { globalStorage: {} } });

      expect(() => {
        registerSimulatorSummary(mockSummariesEntries[0]);
      }).toThrow();
    });

    it("preserves existing summaries", () => {
      const existingSummary = mockSummariesEntries[0];
      mock({
        mock: {
          globalStorage: { "summaries.json": JSON.stringify([existingSummary]) },
        },
      });

      registerSimulatorSummary(mockSummariesEntries[1]);

      const actualSummaries = JSON.parse(
        fs.readFileSync(path.join(mockGlobalStoragePath, "summaries.json")).toString(),
      ) as (LocalExecutionSummary | RemoteExecutionSummary)[];
      expect(actualSummaries).toHaveLength(2);
      actualSummaries.forEach((actual, i) => {
        const expected = mockSummariesEntries[i];
        expect(actual.duration).toBe(expected.duration);
        expect(actual.location).toBe(expected.location);
        expect(actual.logPath).toBe(expected.logPath);
        expect(actual.startTime).toBe(expected.startTime.toISOString());
        expect(actual.success).toBe(expected.success);
        expect(actual.workspace).toBe(expected.workspace);
      });
    });
  });

  describe("getSimulatorSummaries", () => {
    beforeEach(() => {
      setupContextWithStorage();
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    test.each([
      { case: "zero", expectedSummaries: [] },
      { case: "single", expectedSummaries: mockSummariesEntries.slice(0, 1) },
      { case: "multiple", expectedSummaries: mockSummariesEntries },
    ])("$case entries should return expected value", ({ expectedSummaries }) => {
      mock({ mock: { globalStorage: { "summaries.json": JSON.stringify(expectedSummaries) } } });

      const actualSummaries = getSimulatorSummaries();

      expect(actualSummaries.length).toBe(expectedSummaries.length);
      actualSummaries.forEach((actual, i) => {
        const expected = expectedSummaries[i];
        expect(actual).toEqual(expected);
      });
    });

    it("throws error if json file doesn't exist", () => {
      mock({ mock: { globalStorage: {} } });

      expect(() => {
        getSimulatorSummaries();
      }).toThrow();
    });
  });

  describe("cleanUpSimulatorLogs", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({ mock: { globalStorage: { "summaries.json": JSON.stringify(mockSummariesEntries) } } });
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    test.each([{ settingValue: undefined }, { settingValue: -1 }])(
      "should not do anything if setting is $settingValue",
      ({ settingValue }) => {
        const expected = JSON.stringify(mockSummariesEntries);
        jest
          .spyOn(vscode.workspace, "getConfiguration")
          .mockReturnValue(new MockWorkspaceConfiguration({ maximumLogFiles: settingValue }));

        cleanUpSimulatorLogs();

        const actual = fs
          .readFileSync(path.join(mockGlobalStoragePath, "summaries.json"))
          .toString();
        expect(actual).toBe(expected);
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

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "summaries.json")).toString();
      expect(actual).toBe(expected);
    });

    it("should catch errors from deleting files", () => {
      const mockFs = { rmSync };
      jest.spyOn(mockFs, "rmSync").mockImplementation(() => {
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
      mock({ mock: { globalStorage: { "targets.json": "[]" } } });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
    });

    it("replaces the list of targets", () => {
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      registerSimulatorTargets(mockSimulatorTargetEntries);

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "targets.json")).toString();
      expect(actual).toBe(expected);
    });
  });

  describe("registerSimulatorTarget", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({
        mock: {
          globalStorage: { "targets.json": JSON.stringify([mockSimulatorTargetEntries[0]]) },
        },
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
    });

    it("should add a target to the list", () => {
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      registerSimulatorTarget(mockSimulatorTargetEntries[1]);

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "targets.json")).toString();
      expect(actual).toBe(expected);
    });

    it("should update details if target re-registers", () => {
      const newTargetDetails = { ...mockSimulatorTargetEntries[0], address: "NEWVALUE" };
      const expected = JSON.stringify([newTargetDetails]);

      registerSimulatorTarget(newTargetDetails);

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "targets.json")).toString();
      expect(actual).toBe(expected);
    });
  });

  describe("deleteSimulatorTarget", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({
        mock: {
          globalStorage: { "targets.json": JSON.stringify(mockSimulatorTargetEntries) },
        },
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
      mock.restore();
    });

    it("removes a target from the list", () => {
      const expected = JSON.stringify([mockSimulatorTargetEntries[1]]);

      deleteSimulatorTarget(mockSimulatorTargetEntries[0]);

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "targets.json")).toString();
      expect(actual).toBe(expected);
    });

    it("throws if the file doesn't exist", () => {
      mock({ mock: { globalStorage: {} } });

      expect(() => {
        deleteSimulatorTarget(mockSimulatorTargetEntries[0]);
      }).toThrow();
    });

    it("leaves the list unchanged if target name doesn't exist", () => {
      const targetToDelete = { ...mockSimulatorTargetEntries[0], name: "MOCK" };
      const expected = JSON.stringify(mockSimulatorTargetEntries);

      deleteSimulatorTarget(targetToDelete);

      const actual = fs.readFileSync(path.join(mockGlobalStoragePath, "targets.json")).toString();
      expect(actual).toBe(expected);
    });
  });

  describe("getSimulatorTargets", () => {
    beforeEach(() => {
      setupContextWithStorage();
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    test.each([
      { case: "zero", expectedTargets: [] },
      { case: "one", expectedTargets: mockSimulatorTargetEntries.slice(0, 1) },
      { case: "multiple", expectedTargets: mockSimulatorTargetEntries },
    ])("returns expected value for $case entries", ({ expectedTargets }) => {
      mock({ mock: { globalStorage: { "targets.json": JSON.stringify(expectedTargets) } } });

      const actualTargets = getSimulatorTargets();

      actualTargets.forEach((actual, i) => {
        const expected = expectedTargets[i];
        expect(actual).toEqual(expected);
      });
    });

    it("throws if the file doesn't exist", () => {
      mock({ mock: { globalStorage: {} } });

      expect(() => {
        getSimulatorTargets();
      }).toThrow();
    });
  });

  describe("uploadComponentCert", () => {
    beforeEach(() => {
      setupContextWithStorage();
      mock({ mock: { "certificate": "AAA", "certificate.pem": "AAA" } });
    });

    afterEach(() => {
      mock.restore();
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

        uploadComponentCert(`mock/${certFile}`, typedComponentParam);

        const actualFile = path.join(getCertPath(typedComponentParam), expectedFile);
        expect(fs.existsSync(actualFile)).toBe(true);
        expect(fs.readFileSync(actualFile).toString()).toBe("AAA");
      },
    );

    test.each(["OneAgent", "ActiveGate"])("doesn't overwrite existing files on %s", component => {
      const typedComponentParam = component as "OneAgent" | "ActiveGate";
      const certPath = getCertPath(typedComponentParam);
      const dirs: FileSystem.DirectoryItems = {};
      dirs.mock = { certificate: "AAA" };
      dirs[certPath] = {
        "certificate_mock-workspace": mock.file({ content: "AAA", mtime: new Date(1) }),
      };
      mock(dirs);

      uploadComponentCert("mock/certificate", typedComponentParam);

      const actualFile = path.join(getCertPath(typedComponentParam), "certificate_mock-workspace");
      expect(fs.existsSync(actualFile)).toBe(true);
      expect(fs.readFileSync(actualFile).toString()).toBe("AAA");
      expect(fs.statSync(actualFile).mtime).toEqual(new Date(1));
    });
  });

  describe("readExtensionManifest", () => {
    const fsDirs: FileSystem.DirectoryItems = {};

    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    it("returns manifest content", () => {
      const expected = "AAA";
      fsDirs[mockWorkspacePath] = { extension: { "extension.yaml": expected } };
      mock(fsDirs);

      const actual = readExtensionManifest();

      expect(actual).toBe(expected);
    });

    it("it returns empty string in case of issues", () => {
      const expected = "";
      mock({ mock: {} });

      const actual = readExtensionManifest();

      expect(actual).toBe(expected);
    });
  });

  describe("getExtensionFilePath", () => {
    const fsDirs: FileSystem.DirectoryItems = {};

    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    it("finds the path in workspace root", () => {
      fsDirs[mockWorkspacePath] = { extension: { "extension.yaml": "AAA" } };
      mock(fsDirs);

      const actual = getExtensionFilePath();

      expect(actual).toBe(path.join(mockWorkspacePath, "extension", "extension.yaml"));
    });

    it("find the path one level under workspace root", () => {
      fsDirs[mockWorkspacePath] = { src: { extension: { "extension.yaml": "AAA" } } };
      mock(fsDirs);

      const actual = getExtensionFilePath();

      expect(actual).toBe(path.join(mockWorkspacePath, "src", "extension", "extension.yaml"));
    });

    it("returns undefined if not found", () => {
      const actual = getExtensionFilePath();

      expect(actual).toBeUndefined();
    });
  });

  describe("getExtensionWorkspaceDir", () => {
    const fsDirs: FileSystem.DirectoryItems = {};

    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
    });

    afterEach(() => {
      mock.restore();
      jest.resetAllMocks();
    });

    it("returns undefined if no workspace open", () => {
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBeUndefined();
    });

    it("returns undefined if directory not found", () => {
      fsDirs[mockWorkspacePath] = {};
      mock(fsDirs);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBeUndefined();
    });

    it("finds directory in workspace root", () => {
      fsDirs[mockWorkspacePath] = { extension: {} };
      mock(fsDirs);

      const actual = getExtensionWorkspaceDir();

      expect(actual).toBe(path.join("mock", "my-workspace", "extension"));
    });

    it("finds directory one level under workspace root", () => {
      fsDirs[mockWorkspacePath] = { src: { extension: {} } };
      mock(fsDirs);

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
      mock({ mock: {} });
    });

    afterAll(() => {
      mock.restore();
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
      jest.restoreAllMocks();
      mock.restore();
    });

    it("writes new gitignore file with base content", async () => {
      findFilesSpy.mockReturnValue([]);
      const expectedContent = readTestDataFile(path.join("workspace_files", "base_gitignore"));
      mock({ mock: { "my-workspace": {} }, expectedContent });

      await writeGititnore();

      const actual = fs.readFileSync(gitignorePath).toString();
      const expected = fs.readFileSync(path.join("expectedContent")).toString();
      expect(actual).toBe(expected);
    });

    it("doesn't create a file if no workspace open", async () => {
      findFilesSpy.mockReturnValue([]);
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);
      mock({ mock: { "my-workspace": {} } });

      await writeGititnore();

      const actual = fs.existsSync(gitignorePath);
      expect(actual).toBe(false);
    });

    it("preserves existing content", async () => {
      findFilesSpy.mockReturnValue([new MockUri(gitignorePath)]);
      const expectedContent = readTestDataFile(path.join("workspace_files", "partial_gitignore"));
      mock({ mock: { "my-workspace": { ".gitignore": expectedContent } }, expectedContent });

      await writeGititnore(true);

      const actual = fs.readFileSync(gitignorePath).toString();
      expect(actual.startsWith(expectedContent)).toBe(true);
    });
  });

  describe("getSnmpDirPath", () => {
    const fsDirs: FileSystem.DirectoryItems = {};

    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
      fsDirs[mockWorkspacePath] = { extension: { "extension.yaml": "AAA" } };
      mock(fsDirs);
    });

    afterEach(() => {
      mock.restore();
      jest.restoreAllMocks();
    });

    it("resolves a directory above the manifest path", () => {
      const manifestPath = path.join(mockWorkspacePath, "extension", "extension.yaml");
      const expected = path.resolve(manifestPath, "..", "snmp");

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
    const fsDirs: FileSystem.DirectoryItems = {};

    beforeEach(() => {
      setupContextWithStorage();
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockWorkspaceFolders);
      fsDirs[mockWorkspacePath] = { extension: { "extension.yaml": "AAA" } };
      mock(fsDirs);
    });

    afterEach(() => {
      mock.restore();
      jest.restoreAllMocks();
    });

    it("returns an empty array if no mib files found", () => {
      const actual = getSnmpMibFiles();

      expect(actual).toHaveLength(0);
    });

    it("returns an array of mib files", () => {
      const snmpDir = path.resolve(
        path.join(mockWorkspacePath, "extension", "extension.yaml"),
        "..",
        "snmp",
      );
      fsDirs[mockWorkspacePath] = {
        extension: { "extension.yaml": "AAA", "snmp": { "a.mib": "", "b.mib": "" } },
      };
      mock(fsDirs);

      const actual = getSnmpMibFiles();

      expect(actual).toHaveLength(2);
      expect(actual[0]).toBe(path.join(snmpDir, "a.mib"));
      expect(actual[1]).toBe(path.join(snmpDir, "b.mib"));
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
