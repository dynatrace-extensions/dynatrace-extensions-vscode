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

const mockAttributes = [
  { key: "mock_attr_1_1" },
  { key: "mock_attr_1_2", displayName: "MockAttribute_1_2" },
];
const mockEntityId = "mock:entity-1";
const mockMetricKeys = [
  "mock.e1.metric.one",
  "mock.e1.metric.two",
  "mock.e1.metric.three",
  "mock.e1.metric.four",
  "mock.e1.metric.five",
  "mock.e1.metric.a.three",
];

describe("Extension Parsing Utils", () => {
  const mockExtension = yaml.parse(
    readTestDataFile(path.join("manifests", "full_extension.yaml")),
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
      const expected = mockAttributes.map(a => a.key);

      const actual = getAttributesKeysFromTopology(mockEntityId, mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getAttributesFromTopology", () => {
    it("returns all attributes of type without exclusions", () => {
      const actual = getAttributesFromTopology(mockEntityId, mockExtension);

      expect(actual).toEqual(mockAttributes);
    });

    it("omits excluded keys", () => {
      const actual = getAttributesFromTopology(mockEntityId, mockExtension, [
        "mock_attr_1_1",
      ]).findIndex(a => a.key === "mock_attr_1_1");

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
  });

  describe("getMetricKeysFromChartCard", () => {
    it("extracts all metric keys from chart card", () => {
      const expected = ["mock.e1.metric.three", "mock.e1.metric.four", "mock.e1.metric.five"];

      const actual = getMetricKeysFromChartCard(0, 0, mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getMetricKeysFromEntitiesListCard", () => {
    it("extracts all metric keys from entities list card", () => {
      const expected = ["mock.e1.metric.one", "mock.e1.metric.two", "mock.e1.metric.a.three"];

      const actual = getMetricKeysFromEntitiesListCard(0, 0, mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getAllMetricKeys", () => {
    it("extracts all metric keys from extension datasource", () => {
      const actual = getAllMetricKeys(mockExtension).every(k => mockMetricKeys.includes(k));

      expect(actual).toBe(true);
    });
  });

  describe("getEntityMetricPatterns", () => {
    it("extracts all entity metric source patterns/conditions", () => {
      const expected = ["$prefix(mock.e1.metric.)", "$eq(mock.e1.metric.a.)"];

      const actual = getEntityMetricPatterns(0, mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getEntityMetrics", () => {
    it("extracts metric keys matching given entity", () => {
      const actual = getEntityMetrics(0, mockExtension).every(k => mockMetricKeys.includes(k));

      expect(actual).toBe(true);
    });

    it("doesn't include excluded keys", () => {
      const actual = getEntityMetrics(0, mockExtension, ["mock.e1.metric.a.three"]).includes(
        "mock.e1.metric.a.three",
      );

      expect(actual).toEqual(false);
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
