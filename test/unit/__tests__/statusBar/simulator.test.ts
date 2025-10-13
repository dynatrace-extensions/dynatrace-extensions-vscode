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
import {
  PanelDataType,
  ViewType,
  RemoteTarget,
  SimulationConfig,
  SimulatorData,
  WebviewEventType,
  SimulationLocation,
  SimulatorStatus,
  OsType,
  EecType,
} from "@common";
import * as vscode from "vscode";
import * as extension from "../../../../src/extension";
import { DatasourceName, ExtensionStub } from "../../../../src/interfaces/extensionMeta";
import { SimulatorManager } from "../../../../src/statusBar/simulator";
import * as cachingUtils from "../../../../src/utils/caching";
import * as conditionCheckers from "../../../../src/utils/conditionCheckers";
import * as extensionParsingUtils from "../../../../src/utils/extensionParsing";
import * as fileSystemUtils from "../../../../src/utils/fileSystem";
import * as otherExtensionsUtils from "../../../../src/utils/otherExtensions";
import * as simulatorUtils from "../../../../src/utils/simulator";
import * as webviewUtils from "../../../../src/webviews/webview-utils";
import { mockFileSystemItem } from "../../../shared/utils";
import { MockExtensionContext, MockUri } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

describe.only("Simulator Manager", () => {
  let simulatorManager: SimulatorManager;
  const mockContext = new MockExtensionContext();

  beforeEach(() => {
    jest.spyOn(extension, "getActivationContext").mockReturnValue(mockContext);
    simulatorManager = new SimulatorManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("checkMandatoryRequirements", () => {
    const mockExtensionStub: ExtensionStub = {
      name: "mockExtension",
      version: "1.0.0",
      minDynatraceVersion: "1.0.0",
      author: { name: "mockAuthor" },
      snmp: [],
    };
    it("should return false along with failed checks", () => {
      jest.spyOn(fileSystemUtils, "getExtensionFilePath").mockReturnValue(undefined);
      jest.spyOn(cachingUtils, "getCachedParsedExtension").mockReturnValue(undefined);
      jest.spyOn(extensionParsingUtils, "getDatasourceName").mockReturnValue("unsupported");

      const [status, failedChecks] = simulatorManager.checkMandatoryRequirements();

      expect(status).toBe(false);
      expect(failedChecks).toContain("Manifest");
      expect(failedChecks).toContain("Datasource");
      expect(failedChecks).toContain("Activation file");
      expect(simulatorManager.simulatorStatus).toBe(SimulatorStatus.Unsupported);
    });

    test.each([
      {
        condition: "simulator.json doesn't exist on non-python extension",
        datasource: "snmp",
        mockPaths: [],
      },
      {
        condition: "simulator.json & extension folder don't exist on python extension",
        datasource: "python",
        mockPaths: [{ pathParts: ["mock", "extension"] }, { pathParts: ["mock", "my-workspace"] }],
      },
      {
        condition: "simulator.json & activation.json don't exist on python extension",
        datasource: "python",
        mockPaths: [
          { pathParts: ["mock", "extension"] },
          { pathParts: ["mock", "my-workspace", "extension"] },
        ],
      },
    ])("activation file check fails if $condition", ({ datasource, mockPaths }) => {
      mockFileSystemItem(mockFs, mockPaths);
      jest
        .spyOn(fileSystemUtils, "getExtensionFilePath")
        .mockReturnValue(path.join("mock", "extension"));
      jest
        .spyOn(fileSystemUtils, "getExtensionWorkspaceDir")
        .mockReturnValue(path.join("mock", "extension"));
      jest.spyOn(cachingUtils, "getCachedParsedExtension").mockReturnValue(mockExtensionStub);
      jest
        .spyOn(extensionParsingUtils, "getDatasourceName")
        .mockReturnValue(datasource as DatasourceName);
      jest
        .spyOn(vscode.workspace, "workspaceFolders", "get")
        .mockReturnValue([
          { index: 0, name: "MockWorkspace", uri: new MockUri(path.join("mock", "my-workspace")) },
        ]);

      const [status, failedChecks] = simulatorManager.checkMandatoryRequirements();

      expect(status).toBe(false);
      expect(failedChecks).toContain("Activation file");
      expect(simulatorManager.simulatorStatus).toBe(SimulatorStatus.Unsupported);
    });

    it("should pass and update with valid checked details", () => {
      mockFileSystemItem(mockFs, [
        { pathParts: ["mock", "myWorkspace", "config", "simulator.json"], content: "" },
      ]);
      jest
        .spyOn(vscode.workspace, "workspaceFolders", "get")
        .mockReturnValue([
          { index: 0, name: "MockWorkspace", uri: new MockUri(path.join("mock", "myWorkspace")) },
        ]);
      jest
        .spyOn(fileSystemUtils, "getExtensionFilePath")
        .mockReturnValue(path.join("mock", "myWorkspace", "extension"));
      jest.spyOn(cachingUtils, "getCachedParsedExtension").mockReturnValue(mockExtensionStub);
      jest.spyOn(extensionParsingUtils, "getDatasourceName").mockReturnValue("snmp");

      const [status, failedChecks] = simulatorManager.checkMandatoryRequirements();

      expect(status).toBe(true);
      expect(failedChecks).toHaveLength(0);
      expect(simulatorManager.simulatorStatus).toBe(SimulatorStatus.Ready);
    });
  });

  describe("checkSimulationConfig", () => {
    const mockTarget: RemoteTarget = {
      name: "mockTarget",
      address: "mockHost",
      eecType: EecType.OneAgent,
      osType: OsType.Linux,
      privateKey: "mockKey",
      username: "mockUser",
    };

    it("should fail check on LOCAL for python extension if dt-sdk not found", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      jest.spyOn(otherExtensionsUtils, "getPythonVenvOpts").mockReturnValue(Promise.resolve({}));
      jest.spyOn(conditionCheckers, "checkDtSdkPresent").mockReturnValue(Promise.resolve(false));
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = "Python SDK not found";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Local,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on LOCAL for non-python extension if DS can't be simulated", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(false);
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = "Datasource mockDS cannot be simulated on this OS";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Local,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on LOCAL for non-python extension if DS exe doesn't exist", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(true);
      jest.spyOn(simulatorUtils, "getDatasourcePath").mockReturnValue("mock/dsLocation");
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = "Could not find datasource executable at mock/dsLocation";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Local,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on REMOTE for python extension", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = "Python datasource can only be simulated on local machine";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Remote,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on REMOTE for non-python if target missing", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = "No target given for remote simulation";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Remote,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on REMOTE for non-python if DS can't be simulated", async () => {
      const canSimulateDatasourceSpy = jest.spyOn(simulatorUtils, "canSimulateDatasource");
      canSimulateDatasourceSpy.mockReturnValue(false);
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      const expectedStatus = SimulatorStatus.NotReady;
      const expectedMessage = `Datasource mockDS cannot be simulated on ${mockTarget.osType}`;

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Remote,
        EecType.OneAgent,
        mockTarget,
      );

      expect(canSimulateDatasourceSpy).toHaveBeenCalledWith(
        mockTarget.osType,
        mockTarget.eecType,
        "mockDS",
      );
      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should pass check on LOCAL for python if dt-sdk exists", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      jest.spyOn(otherExtensionsUtils, "getPythonVenvOpts").mockReturnValue(Promise.resolve({}));
      jest.spyOn(conditionCheckers, "checkDtSdkPresent").mockReturnValue(Promise.resolve(true));
      const expectedStatus = SimulatorStatus.Ready;
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Local,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should pass check on LOCAL for non-python if DS exists and can be simulated", async () => {
      mockFileSystemItem(mockFs, [{ pathParts: ["mock", "dsLocation"], content: "" }]);

      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(true);
      jest
        .spyOn(simulatorUtils, "getDatasourcePath")
        .mockReturnValue(path.join("mock", "dsLocation"));
      const expectedStatus = SimulatorStatus.Ready;
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Local,
        EecType.OneAgent,
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should pass check on REMOTE for non-python if target exists and DS can be simulated", async () => {
      mockFileSystemItem(mockFs, [{ pathParts: ["mock", "dsLocation"] }]);
      const canSimulateDatasourceSpy = jest.spyOn(simulatorUtils, "canSimulateDatasource");
      canSimulateDatasourceSpy.mockReturnValue(true);
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "getDatasourcePath").mockReturnValue("mock/dsLocation");
      const expectedStatus = SimulatorStatus.Ready;
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        SimulationLocation.Remote,
        EecType.OneAgent,
        mockTarget,
      );

      expect(canSimulateDatasourceSpy).toHaveBeenCalledWith(
        mockTarget.osType,
        mockTarget.eecType,
        "mockDS",
      );
      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });
  });

  describe.only("checkReady", () => {
    let renderSpy: jest.SpyInstance;
    let postMessageSpy: jest.SpyInstance;
    const fallbackConfigValue: SimulationConfig = {
      eecType: EecType.OneAgent,
      location: SimulationLocation.Local,
      sendMetrics: false,
    };
    const mockPanelData: SimulatorData = {
      targets: [],
      summaries: [],
      currentConfiguration: fallbackConfigValue,
      specs: {
        isPython: false,
        dsSupportsActiveGateEec: false,
        dsSupportsOneAgentEec: false,
        localActiveGateDsExists: false,
        localOneAgentDsExists: false,
      },
      status: SimulatorStatus.Unsupported,
      statusMessage: "undefined",
      failedChecks: ["Activation file"],
    };

    beforeEach(() => {
      jest.spyOn(fileSystemUtils, "getSimulatorTargets").mockReturnValue([]);
      jest.spyOn(fileSystemUtils, "getSimulatorSummaries").mockReturnValue([]);
      renderSpy = jest.spyOn(webviewUtils, "renderPanel").mockImplementation(() => {});
    });

    it("first updates the panel with CHECKING status (render)", async () => {
      jest.spyOn(simulatorManager, "checkMandatoryRequirements").mockReturnValue([true, []]);
      simulatorManager = new SimulatorManager();

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        1,
        ViewType.ExtensionSimulator,
        "Extension Simulator",
        {
          dataType: PanelDataType.ExtensionSimulator,
          data: { ...mockPanelData, status: SimulatorStatus.Checking },
        },
      );
    });

    it("first updates the panel with CHECKING status (postMessage)", async () => {
      jest.spyOn(simulatorManager, "checkMandatoryRequirements").mockReturnValue([true, []]);
      simulatorManager = new SimulatorManager();
      postMessageSpy = jest.spyOn(webviewUtils, "postMessageToPanel").mockImplementation(() => {});

      await simulatorManager.checkReady(false);

      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(1, ViewType.ExtensionSimulator, {
        messageType: WebviewEventType.UpdateData,
        data: {
          dataType: PanelDataType.ExtensionSimulator,
          data: { ...mockPanelData, status: SimulatorStatus.Checking },
        },
      });
    });

    it("then updates the panel with READY state and panel data", async () => {
      jest.spyOn(simulatorManager, "checkMandatoryRequirements").mockReturnValue([true, []]);

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        ViewType.ExtensionSimulator,
        "Extension Simulator",
        {
          dataType: PanelDataType.ExtensionSimulator,
          data: { ...mockPanelData, status: SimulatorStatus.Ready },
        },
      );
    });

    it("updates the panel with UNSUPPORTED for mandatory check failures", async () => {
      const mockFailedChecks = ["a", "b", "c"];
      jest
        .spyOn(simulatorManager, "checkMandatoryRequirements")
        .mockReturnValue([false, mockFailedChecks]);

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        ViewType.ExtensionSimulator,
        "Extension Simulator",
        {
          dataType: PanelDataType.ExtensionSimulator,
          data: {
            ...mockPanelData,
            status: SimulatorStatus.Unsupported,
            failedChecks: mockFailedChecks,
          },
        },
      );
    });

    it("updates the panel with NOTREADY for simulation config check failures", async () => {
      jest.spyOn(simulatorManager, "checkMandatoryRequirements").mockReturnValue([true, []]);
      jest
        .spyOn(simulatorManager, "checkSimulationConfig")
        .mockReturnValue(Promise.resolve([SimulatorStatus.NotReady, "mockMessage"]));

      await simulatorManager.checkReady(true, fallbackConfigValue);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        ViewType.ExtensionSimulator,
        "Extension Simulator",
        {
          dataType: PanelDataType.ExtensionSimulator,
          data: {
            ...mockPanelData,
            status: SimulatorStatus.NotReady,
            statusMessage: "mockMessage",
          },
        },
      );
    });
  });
});
