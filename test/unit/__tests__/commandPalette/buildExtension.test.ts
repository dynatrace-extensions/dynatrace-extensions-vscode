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
  let getExtensionFilePathSpy: jest.SpyInstance;
  afterEach(() => {
    jest.resetAllMocks();
  });

  beforeAll(() => {
    getExtensionFilePathSpy = jest.spyOn(fileSystemUtils, "getExtensionFilePath");
  });

  describe("Preconditions check", () => {
    test.each([
      {
        condition: "workspace not open",
        setup: () => setupPreconditions(false),
      },
      {
        condition: "not an extension workspace",
        setup: () => setupPreconditions(true, false),
      },
      {
        condition: "dev certificate doesn't exist",
        setup: () => setupPreconditions(true, true, false),
      },
      {
        condition: "manfiest has problems",
        setup: () => setupPreconditions(true, true, true, false),
      },
    ])("should not run if $condition", async ({ setup }) => {
      setup();

      await buildExtensionWorkflow();

      expect(getExtensionFilePathSpy).not.toHaveBeenCalled();
    });

    it("should throw if extension file path doesn't exist", async () => {
      setupPreconditions();

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
 * Sets up workflow preconditions
 */
const setupPreconditions = (
  workspaceOpen: boolean = true,
  isExtensionsWorkspace: boolean = true,
  certificateExists: boolean = true,
  noProblemsInManifest: boolean = true,
  extensionFilePath?: string,
) => {
  jest
    .spyOn(conditionCheckers, "checkWorkspaceOpen")
    .mockReturnValue(Promise.resolve(workspaceOpen));
  jest
    .spyOn(conditionCheckers, "isExtensionsWorkspace")
    .mockReturnValue(Promise.resolve(isExtensionsWorkspace));
  jest
    .spyOn(conditionCheckers, "checkCertificateExists")
    .mockReturnValue(Promise.resolve(certificateExists));
  jest
    .spyOn(conditionCheckers, "checkNoProblemsInManifest")
    .mockReturnValue(Promise.resolve(noProblemsInManifest));
  jest.spyOn(fileSystemUtils, "getExtensionFilePath").mockReturnValue(extensionFilePath);
};

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

  setupPreconditions(true, true, true, true, "mockWorkspace/extension/extension.yaml");

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
