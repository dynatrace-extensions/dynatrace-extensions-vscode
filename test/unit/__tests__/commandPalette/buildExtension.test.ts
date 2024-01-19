import { existsSync, readFileSync, readdirSync } from "fs";
import * as path from "path";
import mock = require("mock-fs");
import * as vscode from "vscode";
import * as yaml from "yaml";
import { buildExtensionWorkflow } from "../../../../src/commandPalette/buildExtension";
import * as extension from "../../../../src/extension";
import * as tenantsTreeView from "../../../../src/treeViews/tenantsTreeView";
import * as conditionCheckers from "../../../../src/utils/conditionCheckers";
import * as fileSystemUtils from "../../../../src/utils/fileSystem";
import {
  MockCancellationToken,
  MockExtensionContext,
  MockProgress,
  MockUri,
} from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

describe("Build Extension Workflow", () => {
  let checkWorkspaceOpenSpy: jest.SpyInstance;
  let isExtensionsWorkspaceSpy: jest.SpyInstance;
  let checkCertificateExistsSpy: jest.SpyInstance;
  let checkNoProblemsInManifestSpy: jest.SpyInstance;
  let getExtensionFilePathSpy: jest.SpyInstance;

  afterEach(() => {
    jest.resetAllMocks();
  });

  beforeAll(() => {
    checkWorkspaceOpenSpy = jest.spyOn(conditionCheckers, "checkWorkspaceOpen");
    isExtensionsWorkspaceSpy = jest.spyOn(conditionCheckers, "isExtensionsWorkspace");
    checkCertificateExistsSpy = jest.spyOn(conditionCheckers, "checkCertificateExists");
    checkNoProblemsInManifestSpy = jest.spyOn(conditionCheckers, "checkNoProblemsInManifest");
    getExtensionFilePathSpy = jest.spyOn(fileSystemUtils, "getExtensionFilePath");
  });

  describe("Preconditions check", () => {
    test.each([
      {
        condition: "workspace not open",
        workSpaceOpen: false,
        isExtensionsWorkspace: true,
        certificateExists: true,
        noProblemsInManifest: true,
      },
      {
        condition: "not an extension workspace",
        workSpaceOpen: true,
        isExtensionsWorkspace: false,
        certificateExists: true,
        noProblemsInManifest: true,
      },
      {
        condition: "dev certificate doesn't exist",
        workSpaceOpen: true,
        isExtensionsWorkspace: true,
        certificateExists: false,
        noProblemsInManifest: true,
      },
      {
        condition: "manfiest has problems",
        workSpaceOpen: true,
        isExtensionsWorkspace: true,
        certificateExists: true,
        noProblemsInManifest: false,
      },
    ])(
      "should not run if $condition",
      async ({ workSpaceOpen, isExtensionsWorkspace, certificateExists, noProblemsInManifest }) => {
        checkWorkspaceOpenSpy.mockReturnValue(Promise.resolve(workSpaceOpen));
        isExtensionsWorkspaceSpy.mockReturnValue(Promise.resolve(isExtensionsWorkspace));
        checkCertificateExistsSpy.mockReturnValue(Promise.resolve(certificateExists));
        checkNoProblemsInManifestSpy.mockReturnValue(Promise.resolve(noProblemsInManifest));

        await buildExtensionWorkflow();

        expect(getExtensionFilePathSpy).not.toHaveBeenCalled();
      },
    );

    it("should throw if extension file path doesn't exist", async () => {
      checkWorkspaceOpenSpy.mockReturnValue(Promise.resolve(true));
      isExtensionsWorkspaceSpy.mockReturnValue(Promise.resolve(true));
      checkCertificateExistsSpy.mockReturnValue(Promise.resolve(true));
      checkNoProblemsInManifestSpy.mockReturnValue(Promise.resolve(true));
      getExtensionFilePathSpy.mockReturnValue(undefined);

      await expect(buildExtensionWorkflow()).rejects.toThrow(
        "Extension manifest file does not exist.",
      );
    });
  });

  describe("Execution", () => {
    beforeAll(() => {
      baseExecutionSetup();
    });

    afterAll(() => {
      mock.restore();
    });

    it("should package the extension", async () => {
      await buildExtensionWorkflow();

      const distDir = "mockWorkspace/dist";
      expect(existsSync(distDir)).toBe(true);
      expect(readdirSync(distDir).length).toBe(1);
      expect(readdirSync(distDir)[0]).toBe("custom_sample.extension-1.0.0.zip");
    });
  });
});

/**
 * Performs the base setup for allowing the build extension workflow to run.
 */
const baseExecutionSetup = () => {
  const validManifestContent = yaml.stringify({
    name: "custom:sample.extension",
    version: "1.0.0",
    minDynatraceVersion: "1.0.0",
    author: { name: "MockTest" },
  });
  const devCertKeyPath = path.resolve(
    __dirname,
    "..",
    "..",
    "test_data",
    "cryptography",
    "test_developer.pem",
  );
  mock({
    mockGlobalStorage: {},
    mockWorkspaceStorage: {},
    mockWorkspace: { extension: { "extension.yaml": validManifestContent } },
    mock: { devCertKey: readFileSync(devCertKeyPath).toString() },
  });
  jest.spyOn(conditionCheckers, "checkWorkspaceOpen").mockReturnValue(Promise.resolve(true));
  jest.spyOn(conditionCheckers, "isExtensionsWorkspace").mockReturnValue(Promise.resolve(true));
  jest.spyOn(conditionCheckers, "checkCertificateExists").mockReturnValue(Promise.resolve(true));
  jest.spyOn(conditionCheckers, "checkNoProblemsInManifest").mockReturnValue(Promise.resolve(true));
  jest
    .spyOn(fileSystemUtils, "getExtensionFilePath")
    .mockReturnValue("mockWorkspace/extension/extension.yaml");

  jest
    .spyOn(extension, "getActivationContext")
    .mockReturnValue(new MockExtensionContext("mockGlobalStorage", "mockWorkspaceStorage"));
  jest.spyOn(vscode.workspace, "getConfiguration").mockImplementation(() => {
    const settings: Record<string, unknown> = {
      developerCertkeyLocation: "mock/devCertKey",
    };
    return {
      get: <T>(config: string) => settings[config] as T,
      has: jest.fn(),
      inspect: jest.fn(),
      update: jest.fn(),
    };
  });
  jest
    .spyOn(vscode.workspace, "workspaceFolders", "get")
    .mockReturnValue([{ index: 0, name: "MockWorkspace", uri: new MockUri("mockWorkspace") }]);
  jest.spyOn(tenantsTreeView, "getDynatraceClient").mockReturnValue(Promise.resolve(undefined));
  jest.spyOn(vscode.window, "withProgress").mockImplementation(async (_, task) => {
    return task(new MockProgress(), new MockCancellationToken()).then(
      result => {
        console.log(result);
        return result;
      },
      error => {
        console.log(error);
        return false;
      },
    );
  });
  jest
    .spyOn(vscode.window, "showInformationMessage")
    .mockReturnValue(Promise.resolve("No" as unknown as vscode.MessageItem));
};
