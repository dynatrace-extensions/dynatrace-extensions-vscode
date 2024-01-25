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
import * as path from "path";
import mock = require("mock-fs");
import * as vscode from "vscode";
import * as extension from "../../../../src/extension";
import { DynatraceTenantDto, ExtensionWorkspace } from "../../../../src/interfaces/treeViews";
import {
  createValidFileName,
  findWorkspace,
  getAllTenants,
  getAllWorkspaces,
  initializeGlobalStorage,
  initWorkspaceStorage,
  registerTenant,
  registerWorkspace,
  removeOldestFiles,
  removeTenant,
  removeWorkspace,
} from "../../../../src/utils/fileSystem";
import { MockExtensionContext, MockUri } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

const mockGlobalStoragePath = "mock/globalStorage";
const mockWorkspaceStoragePath = "mock/workspaceStorage";
const mockExtensionWorkspacesEntries = [
  { name: "MockWorkspace", folder: "file://mock/my-workspace", id: "mock" },
  { name: "OtherWorkspace", folder: "file://mock/other-workspace", id: "other" },
];
const mockDynatraceEnvironmentsEntries = [
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

describe("Filesystem Utils", () => {
  describe("createUniqueFileName", () => {
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
      jest.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([
        {
          index: 0,
          name: "MockWorkspace",
          uri: new MockUri("mock/my-workspace"),
        },
      ]);
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
      expect(actualWorkspaces[0].folder).toBe("mock/my-workspace");
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
      expect(actualWorkspaces[0].folder).toBe("mock/my-workspace");
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
      setupContextWithGlobalStorage();
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
      setupContextWithGlobalStorage();
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
      setupContextWithGlobalStorage();
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
      setupContextWithGlobalStorage();
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
      setupContextWithGlobalStorage();
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
      setupContextWithGlobalStorage();
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
});

const setupContextWithGlobalStorage = () => {
  jest
    .spyOn(extension, "getActivationContext")
    .mockReturnValue(new MockExtensionContext(mockGlobalStoragePath));
};
