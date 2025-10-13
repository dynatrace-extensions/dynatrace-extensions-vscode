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

import fs from "fs";
import path from "path";
import { EecType, OsType, SimulationConfig, SimulationLocation } from "@common";
import vscode from "vscode";
import * as extension from "../../../../src/extension";
import {
  canSimulateDatasource,
  getDatasourceDir,
  getDatasourceExe,
  getDatasourcePath,
  loadDefaultSimulationConfig,
} from "../../../../src/utils/simulator";
import { mockFileSystemItem } from "../../../shared/utils";
import { MockExtensionContext, MockWorkspaceConfiguration } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

const mockGlobalStorage = path.join("mock", "globalStorage");
const targetsJsonPathParts = ["mock", "globalStorage", "targets.json"];

describe("Simulator Utils", () => {
  const DATASOURCES = {
    WINDOWS_ONEAGENT: ["prometheus", "python", "statsd", "wmi"],
    WINDOWS_ACTIVEGATE: [
      "prometheus",
      "snmp",
      "snmptraps",
      "sqlOracle",
      "sqlServer",
      "statsd",
      "wmi",
      "python",
    ],
    LINUX_ONEAGENT: ["prometheus", "python", "statsd"],
    LINUX_ACTIVEGATE: [
      "prometheus",
      "python",
      "snmp",
      "snmptraps",
      "sqlDb2",
      "sqlHana",
      "sqlMySql",
      "sqlOracle",
      "sqlPostgres",
      "sqlServer",
      "sqlSnowflake",
      "statsd",
    ],
  };
  const PARAMS: Record<string, [OsType, EecType, string]> = {
    WINDOWS_ONEAGENT: [OsType.Windows, EecType.OneAgent, "MOCK_DS"],
    WINDOWS_ACTIVEGATE: [OsType.Windows, EecType.ActiveGate, "MOCK_DS"],
    LINUX_ONEAGENT: [OsType.Linux, EecType.OneAgent, "MOCK_DS"],
    LINUX_ACTIVEGATE: [OsType.Linux, EecType.ActiveGate, "MOCK_DS"],
  };
  const EXPECTED = {
    WINDOWS_ONEAGENT: {
      dir: "C:\\Program Files\\dynatrace\\oneagent\\agent\\datasources\\MOCK_DS\\",
      exe: "oneagentsourceMOCK_DS.exe",
      path: "C:\\Program Files\\dynatrace\\oneagent\\agent\\datasources\\MOCK_DS\\oneagentsourceMOCK_DS.exe",
    },
    WINDOWS_ACTIVEGATE: {
      dir: "C:\\Program Files\\dynatrace\\remotepluginmodule\\agent\\datasources\\MOCK_DS\\",
      exe: "dynatracesourceMOCK_DS.exe",
      path: "C:\\Program Files\\dynatrace\\remotepluginmodule\\agent\\datasources\\MOCK_DS\\dynatracesourceMOCK_DS.exe",
    },
    LINUX_ONEAGENT: {
      dir: "/opt/dynatrace/oneagent/agent/datasources/MOCK_DS/",
      exe: "oneagentsourceMOCK_DS",
      path: "/opt/dynatrace/oneagent/agent/datasources/MOCK_DS/oneagentsourceMOCK_DS",
    },
    LINUX_ACTIVEGATE: {
      dir: "/opt/dynatrace/remotepluginmodule/agent/datasources/MOCK_DS/",
      exe: "dynatracesourceMOCK_DS",
      path: "/opt/dynatrace/remotepluginmodule/agent/datasources/MOCK_DS/dynatracesourceMOCK_DS",
    },
  };

  describe("getDatasourceDir", () => {
    test.each([
      { params: PARAMS.WINDOWS_ONEAGENT, expected: EXPECTED.WINDOWS_ONEAGENT.dir },
      { params: PARAMS.WINDOWS_ACTIVEGATE, expected: EXPECTED.WINDOWS_ACTIVEGATE.dir },
      { params: PARAMS.LINUX_ONEAGENT, expected: EXPECTED.LINUX_ONEAGENT.dir },
      { params: PARAMS.LINUX_ACTIVEGATE, expected: EXPECTED.LINUX_ACTIVEGATE.dir },
    ])("should return expected directory for $params", ({ params, expected }) => {
      const actual = getDatasourceDir(...params);

      expect(actual).toEqual(expected);
    });
  });

  describe("getDatasourceExe", () => {
    test.each([
      { params: PARAMS.WINDOWS_ONEAGENT, expected: EXPECTED.WINDOWS_ONEAGENT.exe },
      { params: PARAMS.WINDOWS_ACTIVEGATE, expected: EXPECTED.WINDOWS_ACTIVEGATE.exe },
      { params: PARAMS.LINUX_ONEAGENT, expected: EXPECTED.LINUX_ONEAGENT.exe },
      { params: PARAMS.LINUX_ACTIVEGATE, expected: EXPECTED.LINUX_ACTIVEGATE.exe },
    ])("should return expected executable for $params", ({ params, expected }) => {
      const actual = getDatasourceExe(...params);

      expect(actual).toEqual(expected);
    });
  });

  describe("getDatasourcePath", () => {
    test.each([
      { params: PARAMS.WINDOWS_ONEAGENT, expected: EXPECTED.WINDOWS_ONEAGENT.path },
      { params: PARAMS.WINDOWS_ACTIVEGATE, expected: EXPECTED.WINDOWS_ACTIVEGATE.path },
      { params: PARAMS.LINUX_ONEAGENT, expected: EXPECTED.LINUX_ONEAGENT.path },
      { params: PARAMS.LINUX_ACTIVEGATE, expected: EXPECTED.LINUX_ACTIVEGATE.path },
    ])("should return expected path for $params", ({ params, expected }) => {
      const actual = getDatasourcePath(...params);

      expect(actual).toEqual(expected);
    });
  });

  describe("canSimulateDatasource", () => {
    [
      { params: PARAMS.WINDOWS_ONEAGENT, datasources: DATASOURCES.WINDOWS_ONEAGENT },
      { params: PARAMS.WINDOWS_ACTIVEGATE, datasources: DATASOURCES.WINDOWS_ACTIVEGATE },
      { params: PARAMS.LINUX_ONEAGENT, datasources: DATASOURCES.LINUX_ONEAGENT },
      { params: PARAMS.LINUX_ACTIVEGATE, datasources: DATASOURCES.LINUX_ACTIVEGATE },
    ].forEach(({ params, datasources }) => {
      test.each(datasources)(
        `should return true for ["${params[0]}", "${params[1]}", "%s"]`,
        datasource => {
          const actual = canSimulateDatasource(params[0], params[1], datasource);

          expect(actual).toEqual(true);
        },
      );
    });

    test.each([
      PARAMS.WINDOWS_ONEAGENT,
      PARAMS.WINDOWS_ACTIVEGATE,
      PARAMS.LINUX_ONEAGENT,
      PARAMS.LINUX_ACTIVEGATE,
    ])('should return false for ["%s", "%s", "%s"]', (osType, eecType, datasource) => {
      const actual = canSimulateDatasource(osType, eecType, datasource);

      expect(actual).toEqual(false);
    });
  });

  describe("loadDefaultSimulationConfig", () => {
    const remoteTarget = {
      name: "mockTarget",
      address: "mockHost",
      username: "mockUser",
      privateKey: "mockKey",
      eecType: EecType.ActiveGate,
      osType: OsType.Linux,
    };

    beforeAll(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify([remoteTarget]));
    });

    beforeEach(() => {
      jest
        .spyOn(extension, "getActivationContext")
        .mockReturnValue(new MockExtensionContext("mock/globalStorage"));
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    afterAll(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it("should return workspace settings if defined", () => {
      setupWorkspaceWithConfiguration("mockLocation", "mockEecType", "mockMetricsIngest");

      const actual = loadDefaultSimulationConfig();

      expect(actual).toBeDefined();
      expect(actual.eecType).toBe("mockEecType");
      expect(actual.location).toBe("mockLocation");
      expect(actual.sendMetrics).toBe("mockMetricsIngest");
      expect(actual.target).toBeUndefined();
    });

    it("should add target details for remote location", () => {
      setupWorkspaceWithConfiguration(
        SimulationLocation.Remote,
        EecType.ActiveGate,
        false,
        "mockTarget",
      );
      mockFileSystemItem(mockFs, [
        {
          pathParts: targetsJsonPathParts,
          content: JSON.stringify([remoteTarget]),
        },
      ]);

      const actual = loadDefaultSimulationConfig();

      expect(actual).toBeDefined();
      expect(actual.eecType).toBe(EecType.ActiveGate);
      expect(actual.location).toBe(SimulationLocation.Remote);
      expect(actual.sendMetrics).toBe(false);
      expect(actual.target).toBeDefined();
      expect(actual.target).toEqual(remoteTarget);
    });

    test.each([
      {
        condition: "defaultLocation is undefined",
        setup: () => setupWorkspaceWithConfiguration(undefined, "mock", "mock"),
      },
      {
        condition: "defaultEecType is undefined",
        setup: () => setupWorkspaceWithConfiguration("mock", undefined, "mock"),
      },
      {
        condition: "defaultMetricsIngestion is undefined",
        setup: () => setupWorkspaceWithConfiguration("mock", "mock", undefined),
      },
      {
        condition: "remote target eec doesn't match settings value",
        setup: () =>
          setupWorkspaceWithConfiguration(
            SimulationLocation.Remote,
            EecType.OneAgent,
            false,
            "mockTarget",
          ),
      },
      {
        condition: "remote target not found",
        setup: () =>
          setupWorkspaceWithConfiguration(
            SimulationLocation.Remote,
            EecType.ActiveGate,
            false,
            "mockTarget2",
          ),
      },
    ])("should return fallback value if $condition", ({ setup }) => {
      setup();
      mockFileSystemItem(mockFs, [
        { pathParts: targetsJsonPathParts, content: JSON.stringify([remoteTarget]) },
      ]);
      const expected: SimulationConfig = {
        eecType: EecType.OneAgent,
        location: SimulationLocation.Local,
        sendMetrics: false,
      };

      const actual = loadDefaultSimulationConfig();

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
    });
  });
});

const setupWorkspaceWithConfiguration = (
  defaultLocation?: unknown,
  defaultEecType?: unknown,
  defaultMetricsIngestion?: unknown,
  remoteTargetName?: unknown,
) => {
  jest.spyOn(vscode.workspace, "getConfiguration").mockReturnValue(
    new MockWorkspaceConfiguration({
      defaultLocation,
      defaultEecType,
      defaultMetricsIngestion,
      remoteTargetName,
    }),
  );
};
