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

import path from "path";
import yaml from "yaml";
import { ExtensionStub } from "../../../../src/interfaces/extensionMeta";
import {
  getAllMetricKeys,
  getAllMetricsByFeatureSet,
  getAttributesFromTopology,
  getAttributesKeysFromTopology,
  getDatasourceName,
  getDimensionsFromDataSource,
  getEntityForMetric,
  getEntityMetricPatterns,
  getEntityMetrics,
  getExtensionDatasource,
  getMetricDisplayName,
  getMetricKeysFromChartCard,
  getMetricKeysFromEntitiesListCard,
  getMetricValue,
  getMetricsFromDataSource,
  getPrometheusLabelKeys,
  getPrometheusMetricKeys,
  incrementExtensionVersion,
  normalizeExtensionVersion,
} from "../../../../src/utils/extensionParsing";
import { readTestDataFile } from "../../../shared/utils";

jest.mock("../../../../src/utils/logging");

const mockAttributes = [
  { key: "mock_attr_1_1" },
  { key: "mock_attr_1_2", displayName: "MockAttribute_1_2" },
];
const mockEntityType = "mock:entity-1";
const mockMetricKeys = [
  "mock.e1.metric.one",
  "mock.e1.metric.two",
  "mock.e1.metric.three",
  "mock.e1.metric.four",
  "mock.e1.metric.five",
  "mock.e1.metric.a.three",
  "mock.e1.metric.six",
];

describe("Extension Parsing Utils", () => {
  const mockExtension = yaml.parse(
    readTestDataFile(path.join("manifests", "full_extension.yaml")),
  ) as ExtensionStub;
  const mockPrometheusExtension = yaml.parse(
    readTestDataFile(path.join("manifests", "prometheus_extension.yaml")),
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

      const actual = getAttributesKeysFromTopology(mockEntityType, mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getAttributesFromTopology", () => {
    it("returns all attributes of type without exclusions", () => {
      const actual = getAttributesFromTopology(mockEntityType, mockExtension);

      expect(actual).toEqual(mockAttributes);
    });

    it("omits excluded keys", () => {
      const actual = getAttributesFromTopology(mockEntityType, mockExtension, [
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
      const actual = getAllMetricKeys(mockExtension);

      expect(actual).toEqual(mockMetricKeys);
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
      const actual = getEntityMetrics(0, mockExtension);

      expect(actual).toEqual(mockMetricKeys);
    });

    it("doesn't include excluded keys", () => {
      const actual = getEntityMetrics(0, mockExtension, ["mock.e1.metric.a.three"]).includes(
        "mock.e1.metric.a.three",
      );

      expect(actual).toEqual(false);
    });
  });

  describe("getEntityForMetric", () => {
    it("returns the entity type based on metric metadata", () => {
      const actual = getEntityForMetric("mock.e1.metric.six", mockExtension);

      expect(actual).toBe(mockEntityType);
    });

    it("returns the entity type based on topology", () => {
      const actual = getEntityForMetric("mock.e1.metric.one", mockExtension);

      expect(actual).toBe(mockEntityType);
    });
  });

  describe("getPrometheusMetricKeys", () => {
    it("extracts metric keys from a group", () => {
      const expected = ["prom_key_one"];

      const actual = getPrometheusMetricKeys(mockPrometheusExtension, 0);

      expect(actual).toEqual(expected);
    });

    it("extracts metric keys from a subgroup", () => {
      const expected = ["prom_key_two"];

      const actual = getPrometheusMetricKeys(mockPrometheusExtension, 1, 0);

      expect(actual).toEqual(expected);
    });
  });

  describe("getPrometheusLabelKeys", () => {
    it("extracts label keys from a group", () => {
      const expected = ["prom_label_one"];

      const actual = getPrometheusLabelKeys(mockPrometheusExtension, 0);

      expect(actual).toEqual(expected);
    });

    it("extracts label keys from a subgroup", () => {
      const expected = ["prom_label_two"];

      const actual = getPrometheusLabelKeys(mockPrometheusExtension, 1, 0);

      expect(actual).toEqual(expected);
    });
  });

  describe("getMetricValue", () => {
    it("extracts metric value from a group", () => {
      const expected = "oid:2.2.2.2.2.2";

      const actual = getMetricValue("mock.e1.metric.two", mockExtension);

      expect(actual).toEqual(expected);
    });

    it("extracts metric value from a subgroup", () => {
      const expected = "oid:1.1.1.1.1";

      const actual = getMetricValue("mock.e1.metric.one", mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getMetricDisplayName", () => {
    it("extracts displayName from metadata", () => {
      const expected = "Mock metric six";

      const actual = getMetricDisplayName("mock.e1.metric.six", mockExtension);

      expect(actual).toEqual(expected);
    });

    it("returns empty string if displayName is not present", () => {
      const expected = "";

      const actual = getMetricDisplayName("mock.some.metric", mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getAllMetricsByFeatureSet", () => {
    it("maps all metrics to feature set", () => {
      const expected = [
        { name: "default", metrics: ["mock.e1.metric.six"] },
        { name: "fs1", metrics: ["mock.e1.metric.one"] },
        {
          name: "fs2",
          metrics: ["mock.e1.metric.two", "mock.e1.metric.three", "mock.e1.metric.four"],
        },
        { name: "fs3", metrics: ["mock.e1.metric.five", "mock.e1.metric.a.three"] },
      ];

      const actual = getAllMetricsByFeatureSet(mockExtension);

      expect(actual).toEqual(expected);
    });
  });

  describe("getMetricsFromDataSource", () => {
    it("returns metric keys and types", () => {
      const expected = [
        { key: "mock.e1.metric.one", type: "gauge" },
        { key: "mock.e1.metric.two", type: "gauge" },
        { key: "mock.e1.metric.three", type: "gauge" },
        { key: "mock.e1.metric.four", type: "gauge" },
        { key: "mock.e1.metric.five", type: "count" },
        { key: "mock.e1.metric.a.three", type: "gauge" },
        { key: "mock.e1.metric.six", type: "gauge" },
      ];

      const actual = getMetricsFromDataSource(mockExtension, false);

      expect(actual).toEqual(expected);
    });

    it("includes values if enabled", () => {
      const expected = [
        { key: "mock.e1.metric.one", type: "gauge", value: "oid:1.1.1.1.1" },
        { key: "mock.e1.metric.two", type: "gauge", value: "oid:2.2.2.2.2.2" },
        { key: "mock.e1.metric.three", type: "gauge", value: "oid:3.3.3.3.3.3" },
        { key: "mock.e1.metric.four", type: "gauge", value: "oid:4.4.4.4.4.4" },
        { key: "mock.e1.metric.five", type: "count", value: "oid:5.5.5.5.5.5" },
        { key: "mock.e1.metric.a.three", type: "gauge", value: "oid:3.3.3.3.33" },
        { key: "mock.e1.metric.six", type: "gauge", value: "oid:6.6.6.6.6" },
      ];

      const actual = getMetricsFromDataSource(mockExtension, true);

      expect(actual).toEqual(expected);
    });
  });

  describe("getDimensionsFromDataSource", () => {
    it("returns dimension keys", () => {
      const expected = [{ key: "mock.dimension.one" }, { key: "mock.dimension.two" }];

      const actual = getDimensionsFromDataSource(mockExtension, false);

      expect(actual).toEqual(expected);
    });

    it("includes values if enabled", () => {
      const expected = [
        { key: "mock.dimension.one", value: "oid:1.1.1.1.0" },
        { key: "mock.dimension.two", value: "oid:1.1.1.0.0" },
      ];

      const actual = getDimensionsFromDataSource(mockExtension, true);

      expect(actual).toEqual(expected);
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
