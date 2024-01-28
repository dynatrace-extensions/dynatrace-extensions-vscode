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

import * as path from "path";
import * as yaml from "yaml";
import { ExtensionStub } from "../../../../src/interfaces/extensionMeta";
import {
  getAttributesFromTopology,
  getAttributesKeysFromTopology,
  getDatasourceName,
  getExtensionDatasource,
  getMetricKeysFromChartCard,
  incrementExtensionVersion,
  normalizeExtensionVersion,
} from "../../../../src/utils/extensionParsing";
import { readTestDataFile } from "../../../shared/utils";

jest.mock("../../../../src/utils/logging");

const oracleBackupAttributes = [
  { key: "start_time", displayName: "Start time" },
  { key: "end_time", displayName: "End time" },
  { key: "backup_status", displayName: "Backup Status" },
  { key: "input_type", displayName: "Input Type" },
  { key: "autobackup_done", displayName: "Auto-Backup Done" },
  { key: "optimized", displayName: "Optimized" },
  { key: "backup_types", displayName: "Backup types" },
  { key: "datafiles_included", displayName: "Datafiles included" },
  { key: "redo_logs_included", displayName: "Redo logs included" },
  { key: "controlfile_included", displayName: "Controlfile included" },
  { key: "incremental_level", displayName: "Incremental level" },
];
const oracleBackupEntityId = "sql:com_dynatrace_extension_sql-oracle_backup_job";

describe("Extension Parsing Utils", () => {
  const oracleExtension = yaml.parse(
    readTestDataFile(path.join("manifests", "oracle_extension.yaml")),
  ) as ExtensionStub;

  describe("normalizeExtensionVersion", () => {
    test.each([
      { input: "1.1.1", expected: "1.1.1" },
      { input: "1.1", expected: "1.1.0" },
      { input: "1", expected: "1.0.0" },
    ])("version $input is normalized as $expected", ({ input, expected }) => {
      const actual = normalizeExtensionVersion(input);

      expect(actual).toBe(expected);
    });
  });

  describe("incrementExtensionVersion", () => {
    test.each([
      { input: "1.1.1", expected: "1.1.2" },
      { input: "1.1", expected: "1.1.1" },
      { input: "1", expected: "1.0.1" },
    ])("version $input is incremented to $expected", ({ input, expected }) => {
      const actual = incrementExtensionVersion(input);

      expect(actual).toBe(expected);
    });
  });

  describe("getAttributesKeysFromTopology", () => {
    it("collects all attribute keys from given entity", () => {
      const expected = oracleBackupAttributes.map(a => a.key);

      const actual = getAttributesKeysFromTopology(oracleBackupEntityId, oracleExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getAttributesFromTopology", () => {
    it("returns all attributes of type without exclusions", () => {
      const actual = getAttributesFromTopology(oracleBackupEntityId, oracleExtension);

      expect(actual).toEqual(oracleBackupAttributes);
    });

    it("omits excluded keys", () => {
      const actual = getAttributesFromTopology(oracleBackupEntityId, oracleExtension, [
        "end_time",
      ]).findIndex(a => a.key === "end_time");

      expect(actual).toBe(-1);
    });
  });

  describe("getExtensionDatasource", () => {
    test.each([
      "snmp",
      "wmi",
      "sqlDb2",
      "sqlServer",
      "sqlMySql",
      "sqlOracle",
      "sqlPostgres",
      "sqlHana",
      "sqlSnowflake",
      "prometheus",
      "python",
      "mock",
    ])("extracts groups for %s datasource", (datasource: string) => {
      const extension = getParsedExtensionWithDatasource(datasource);
      const expected = ["python", "mock"].includes(datasource) ? [] : ["mockEntry"];

      const actual = getExtensionDatasource(extension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getDatasourceName", () => {
    test.each([
      "snmp",
      "wmi",
      "sqlDb2",
      "sqlServer",
      "sqlMySql",
      "sqlOracle",
      "sqlPostgres",
      "sqlHana",
      "sqlSnowflake",
      "prometheus",
      "python",
      "mock",
    ])("extracts groups for %s datasource", (datasource: string) => {
      const extension = getParsedExtensionWithDatasource(datasource);
      const expected = datasource === "mock" ? "unsupported" : datasource;

      const actual = getDatasourceName(extension);

      expect(actual).toEqual(expected);
    });

    describe("getMetricKeysFromChartCard", () => {
      it("extracts all metric keys from chart card", () => {
        const si = 1;
        const ci = 0;
        const expected = [
          "com.dynatrace.extension.sql-oracle.cpu.cores",
          "com.dynatrace.extension.sql-oracle.cpu.foregroundTotal",
          "com.dynatrace.extension.sql-oracle.cpu.backgroundTotal",
        ];

        const actual = getMetricKeysFromChartCard(si, ci, oracleExtension);

        expect(actual).toEqual(expected);
      });
    });
  });
});

const getParsedExtensionWithDatasource = (datasource: string) => {
  const baseExtension: Record<string, unknown> = {
    name: "custom:mock_test",
    version: "0",
    minDynatraceVersion: "0",
    author: {
      name: "Mock",
    },
  };

  baseExtension[datasource] = ["mockEntry"];

  return baseExtension as unknown as ExtensionStub;
};
