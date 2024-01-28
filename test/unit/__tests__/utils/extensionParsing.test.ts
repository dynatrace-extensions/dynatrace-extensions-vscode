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
  getAllMetricKeys,
  getAttributesFromTopology,
  getAttributesKeysFromTopology,
  getDatasourceName,
  getEntityMetricPatterns,
  getEntityMetrics,
  getExtensionDatasource,
  getMetricKeysFromChartCard,
  getMetricKeysFromEntitiesListCard,
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

    describe("getMetricKeysFromEntitiesListCard", () => {
      it("extracts all metric keys from entities list card", () => {
        const si = 0;
        const ci = 0;
        const expected = [
          "com.dynatrace.extension.sql-oracle.cpu.foregroundTotal",
          "com.dynatrace.extension.sql-oracle.cpu.backgroundTotal",
          "com.dynatrace.extension.sql-oracle.memory.pga.used",
        ];

        const actual = getMetricKeysFromEntitiesListCard(si, ci, oracleExtension);

        expect(actual).toEqual(expected);
      });
    });

    describe("getAllMetricKeys", () => {
      it("extracts all metric keys from extension datasource", () => {
        const expected = [
          "com.dynatrace.extension.sql-oracle.cpu.cores",
          "com.dynatrace.extension.sql-oracle.cpu.backgroundTotal",
          "com.dynatrace.extension.sql-oracle.cpu.foregroundTotal",
          "com.dynatrace.extension.sql-oracle.memory.pga.size.pgaAggregateLimit",
          "com.dynatrace.extension.sql-oracle.memory.pga.size.pgaAggregateTarget",
          "com.dynatrace.extension.sql-oracle.memory.pga.used",
          "com.dynatrace.extension.sql-oracle.memory.pga.allocated",
          "com.dynatrace.extension.sql-oracle.memory.sga.cacheBuffer.sharedPoolFree",
          "com.dynatrace.extension.sql-oracle.memory.sga.redoBuffer.redoLogSpaceWaitTime.count",
          "com.dynatrace.extension.sql-oracle.memory.sga.redoBuffer.redoSizeIncrease.count",
          "com.dynatrace.extension.sql-oracle.memory.sga.redoBuffer.redoWriteTime.count",
          "com.dynatrace.extension.sql-oracle.memory.sessionLogicalReads.count",
          "com.dynatrace.extension.sql-oracle.memory.physicalReads.count",
          "com.dynatrace.extension.sql-oracle.memory.physicalReadsDirect.count",
          "com.dynatrace.extension.sql-oracle.memory.memorySorts.count",
          "com.dynatrace.extension.sql-oracle.memory.diskSorts.count",
          "com.dynatrace.extension.sql-oracle.memory.libraryCacheHitRatio",
          "com.dynatrace.extension.sql-oracle.asm.free_mb",
          "com.dynatrace.extension.sql-oracle.asm.total_mb",
          "com.dynatrace.extension.sql-oracle.asm.used_pct",
          "com.dynatrace.extension.sql-oracle.asm.reads.count",
          "com.dynatrace.extension.sql-oracle.asm.writes.count",
          "com.dynatrace.extension.sql-oracle.status",
          "com.dynatrace.extension.sql-oracle.db_status",
          "com.dynatrace.extension.sql-oracle.io.bytesRead.count",
          "com.dynatrace.extension.sql-oracle.io.bytesWritten.count",
          "com.dynatrace.extension.sql-oracle.io.wait.count",
          "com.dynatrace.extension.sql-oracle.sessions.active",
          "com.dynatrace.extension.sql-oracle.sessions.all",
          "com.dynatrace.extension.sql-oracle.sessions.userCalls.count",
          "com.dynatrace.extension.sql-oracle.limits.sessions",
          "com.dynatrace.extension.sql-oracle.limits.processes",
          "com.dynatrace.extension.sql-oracle.wait.count",
          "com.dynatrace.extension.sql-oracle.wait.time.count",
          "com.dynatrace.extension.sql-oracle.tablespaces.totalSpace",
          "com.dynatrace.extension.sql-oracle.tablespaces.freeSpace",
          "com.dynatrace.extension.sql-oracle.tablespaces.usedSpace",
          "com.dynatrace.extension.sql-oracle.tablespaces.usedSpaceRatio",
          "com.dynatrace.extension.sql-oracle.tablespaces.freeSpaceRatio",
          "com.dynatrace.extension.sql-oracle.backup-input_bytes",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes",
          "com.dynatrace.extension.sql-oracle.backup-elapsed_seconds",
          "com.dynatrace.extension.sql-oracle.backup-compression_ratio",
          "com.dynatrace.extension.sql-oracle.backup-input_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-autobackup_count_number",
          "com.dynatrace.extension.sql-oracle.backup.state",
          "com.dynatrace.extension.sql-oracle.backup.time_since",
          "com.dynatrace.extension.sql-oracle.queries.connectionManagement.count",
          "com.dynatrace.extension.sql-oracle.queries.plSqlExec.count",
          "com.dynatrace.extension.sql-oracle.queries.sqlExec.count",
          "com.dynatrace.extension.sql-oracle.queries.sqlParse.count",
          "com.dynatrace.extension.sql-oracle.queries.dbTime.count",
          "com.dynatrace.extension.sql-oracle.queries.cpuTime.count",
          "com.dynatrace.extension.sql-oracle.pdb-total_size",
          "com.dynatrace.extension.sql-oracle.pdb-block_size",
          "com.dynatrace.extension.sql-oracle.pdb-diagnostic_size",
          "com.dynatrace.extension.sql-oracle.pdb-audit_files_size",
          "com.dynatrace.extension.sql-oracle.pdb-max_size",
          "com.dynatrace.extension.sql-oracle.pdb-max_diagnostic_size",
          "com.dynatrace.extension.sql-oracle.pdb-max_audit_size",
        ];

        const actual = getAllMetricKeys(oracleExtension);

        expect(actual).toEqual(expected);
      });
    });

    describe("getEntityMetricPatterns", () => {
      it("extracts all entity metric source patterns/conditions", () => {
        const expected = ["$prefix(com.dynatrace.extension.sql-oracle.backup)"];

        const actual = getEntityMetricPatterns(0, oracleExtension);

        expect(actual).toEqual(expected);
      });
    });

    describe("getEntityMetrics", () => {
      it("extracts metric keys matching given entity", () => {
        const expected = [
          "com.dynatrace.extension.sql-oracle.backup-input_bytes",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes",
          "com.dynatrace.extension.sql-oracle.backup-elapsed_seconds",
          "com.dynatrace.extension.sql-oracle.backup-compression_ratio",
          "com.dynatrace.extension.sql-oracle.backup-input_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-autobackup_count_number",
          "com.dynatrace.extension.sql-oracle.backup.state",
          "com.dynatrace.extension.sql-oracle.backup.time_since",
        ];

        const actual = getEntityMetrics(0, oracleExtension);

        expect(actual).toEqual(expected);
      });

      it("doesn't include excluded keys", () => {
        const expected = [
          "com.dynatrace.extension.sql-oracle.backup-input_bytes",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes",
          "com.dynatrace.extension.sql-oracle.backup-elapsed_seconds",
          "com.dynatrace.extension.sql-oracle.backup-compression_ratio",
          "com.dynatrace.extension.sql-oracle.backup-input_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-output_bytes_per_second",
          "com.dynatrace.extension.sql-oracle.backup-autobackup_count_number",
          "com.dynatrace.extension.sql-oracle.backup.state",
        ];

        const actual = getEntityMetrics(0, oracleExtension, [
          "com.dynatrace.extension.sql-oracle.backup.time_since",
        ]);

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
