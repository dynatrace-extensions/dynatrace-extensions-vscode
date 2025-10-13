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
import { WmiQueryResult } from "@common";
import axios from "axios";
import * as yaml from "yaml";
import { PromData } from "../../../../src/codeLens/prometheusScraper";
import { ValidationStatus } from "../../../../src/codeLens/utils/selectorUtils";
import * as extension from "../../../../src/extension";
import { ExtensionStub } from "../../../../src/interfaces/extensionMeta";
import * as tenantsTreeView from "../../../../src/treeViews/tenantsTreeView";
import {
  getCachedBaristaIcons,
  getCachedBuiltinEntityTypes,
  getCachedEntityInstances,
  getCachedOid,
  getCachedParsedExtension,
  getCachedPrometheusData,
  getCachedSelectorStatus,
  getCachedSnmpOids,
  getCachedWmiQueryResult,
  getCachedWmiStatus,
  initializeCache,
  pushManifestTextForParsing,
  setCachedPrometheusData,
  setCachedSelectorStatus,
  setCachedWmiQueryResult,
  setCachedWmiStatus,
  updateCachedOid,
  updateCachedSnmpOids,
  updateEntityInstances,
  useMemo,
} from "../../../../src/utils/caching";
import * as fileSystemUtils from "../../../../src/utils/fileSystem";
import { waitForCondition } from "../../../../src/utils/general";
import * as snmpUtils from "../../../../src/utils/snmp";
import { OidInformation } from "../../../../src/utils/snmp";
import { readTestDataFile } from "../../../shared/utils";
import { MockDynatrace, mockEntities } from "../../mocks/dynatrace";
import { MockExtensionContext } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

const mockWmiQueryResults: WmiQueryResult[] = [
  {
    query: "mock1",
    error: false,
    responseTime: "10",
    results: [{ mock: "mock" }],
  },
  {
    query: "mock2",
    error: true,
    errorMessage: "mock error",
    responseTime: "20",
    results: [{ moreMock: "moreMock" }],
  },
];
const mockValidationStatuses: ValidationStatus[] = [
  { status: "valid" },
  { status: "invalid", error: { code: 400, message: "mock error" } },
];
const mockPrometheusData: PromData = { mock1: { type: "mock1" }, mock2: { type: "mock2" } };
const mockSnmpOids: Record<string, OidInformation> = {
  "1.2.3.4.5": {
    oid: "1.2.3.4.5",
    description: "Mock OID 1",
    source: "MOCK_MIB",
    objectType: "MockOid1",
  },
  "9.8.7.6.5": {
    oid: "9.8.7.6.5",
    description: "Mock OID 2",
    source: "MOCK_MIB",
    objectType: "MockOid2",
  },
};

describe("Caching Utils", () => {
  beforeEach(() => {
    setupForCacheInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("get / set CachedWmiQueryResult", () => {
    test("get - returns undefined if query is not cached", () => {
      expect(getCachedWmiQueryResult("mock")).toBeUndefined();
    });

    test("set/get - cached query result", () => {
      const expected = mockWmiQueryResults[0];
      setCachedWmiQueryResult(expected);

      const actual = getCachedWmiQueryResult(expected.query);

      expect(actual).toEqual(expected);
    });

    test("set - overwrites existing cached query result", () => {
      setCachedWmiQueryResult(mockWmiQueryResults[0]);
      const expected = { ...mockWmiQueryResults[1], query: "mock1" };
      setCachedWmiQueryResult(expected);

      const actual = getCachedWmiQueryResult(expected.query);

      expect(actual).toEqual(expected);
    });
  });

  describe("get / set CachedWmiStatus", () => {
    test("get - returns undefined if status is not cached", () => {
      const actual = getCachedWmiStatus("mock");

      expect(actual).toBeUndefined();
    });

    test("set/get - cached status", () => {
      setCachedWmiStatus("mock1", mockValidationStatuses[0]);

      const actual = getCachedWmiStatus("mock1");

      expect(actual).toEqual(mockValidationStatuses[0]);
    });

    test("set - overwrites existing cached status", () => {
      setCachedWmiStatus("mock1", mockValidationStatuses[0]);
      setCachedWmiStatus("mock1", mockValidationStatuses[1]);

      const actual = getCachedWmiStatus("mock1");

      expect(actual).toEqual(mockValidationStatuses[1]);
    });
  });

  describe("get / set CachedSelectorStatus", () => {
    test("get - returns undefined if status is not cached", () => {
      const actual = getCachedSelectorStatus("mock");

      expect(actual).toBeUndefined();
    });

    test("set/get - cached status", () => {
      setCachedSelectorStatus("mock1", mockValidationStatuses[0]);

      const actual = getCachedSelectorStatus("mock1");

      expect(actual).toEqual(mockValidationStatuses[0]);
    });

    test("set - overwrites existing cached status", () => {
      setCachedSelectorStatus("mock1", mockValidationStatuses[0]);
      setCachedSelectorStatus("mock1", mockValidationStatuses[1]);

      const actual = getCachedSelectorStatus("mock1");

      expect(actual).toEqual(mockValidationStatuses[1]);
    });
  });

  describe("get / set CachedEntityInstances", () => {
    beforeEach(() => {
      mockDynatraceClient();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("get - returns undefined if entity type is not cached", () => {
      const actual = getCachedEntityInstances("mock");

      expect(actual).toBeUndefined();
    });

    test("set/get - cached entity instances", async () => {
      await updateEntityInstances(["mock1"]);

      const actual = getCachedEntityInstances("mock1");

      expect(actual).toEqual(mockEntities["type(mock1)"]);
    });
  });

  describe("get / set PrometheusData", () => {
    test("get - returns {} if prometheus data not loaded", () => {
      const actual = getCachedPrometheusData();

      expect(actual).toEqual({});
    });

    test("set/get - cached prometheus data", () => {
      setCachedPrometheusData(mockPrometheusData);

      const actual = getCachedPrometheusData();

      expect(actual).toEqual(mockPrometheusData);
    });
  });

  describe("get / update SNMP OIDs", () => {
    beforeEach(() => {
      jest
        .spyOn(snmpUtils, "fetchOID")
        .mockImplementation((oid: string) => Promise.resolve(mockSnmpOids[oid]));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("get returns undefined if OID is not cached", () => {
      const actual = getCachedOid("1.0.0.0.0");

      expect(actual).toBeUndefined();
    });

    test("get returns empty map if SNMP MIBs not loaded", async () => {
      const expected = new Map<string, OidInformation>();
      await initializeCache();

      const actual = getCachedSnmpOids();

      expect(actual).toEqual(expected);
    });

    test("update/get - cached OID", async () => {
      const expected = mockSnmpOids["1.2.3.4.5"];

      await updateCachedOid("1.2.3.4.5");

      const actual = getCachedOid("1.2.3.4.5");
      expect(actual).toEqual(expected);
    });

    test("update/get - cached OIDs", async () => {
      const expected = Object.values(mockSnmpOids);

      await updateCachedSnmpOids(Object.keys(mockSnmpOids));

      const actual = Array.from(getCachedSnmpOids().values());
      expect(actual).toEqual(expected);
    });
  });

  describe("getCachedBuiltinEntityTypes", () => {
    it("returns empty list if entities were not loaded", () => {
      const actual = getCachedBuiltinEntityTypes();

      expect(actual).toEqual([]);
    });
  });

  describe("useMemo", () => {
    it("it returns cached value when deps unchanged", async () => {
      const actualValues: string[] = [];
      for (let i = 0; i < 2; i++) {
        const val = await useMemo(() => `mock-${i}`, []);
        actualValues.push(val);
      }

      actualValues.forEach(actual => {
        expect(actual).toEqual("mock-0");
      });
    });

    it("it fetches new value when deps changed", async () => {
      const actualValues: string[] = [];
      for (let i = 0; i < 2; i++) {
        const val = await useMemo(() => `mock-${i}`, [i]);
        actualValues.push(val);
      }

      actualValues.forEach((actual, i) => {
        expect(actual).toEqual(`mock-${i}`);
      });
    });

    it("deletes the cached result when clear flag is set", async () => {
      const val1 = await useMemo(() => "mock-1", []);
      const val2 = await useMemo(() => "mock-1", [], true);

      expect(val1).toEqual("mock-1");
      expect(val2).toEqual(undefined);
    });
  });

  describe("initializeCache", () => {
    beforeEach(() => {
      mockDynatraceClient();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("loads built-in entity types", async () => {
      const expected = ["mock1", "mock2"];

      await initializeCache();

      await expect(
        waitForCondition(() => getCachedBuiltinEntityTypes().length > 0, {
          interval: 1,
          timeout: 5,
        }),
      ).resolves.not.toThrow();
      const actual = getCachedBuiltinEntityTypes();
      expect(actual).toEqual(expected);
    });

    test.each([
      { case: "internal", internal: true },
      { case: "public", internal: false },
    ])("loads barista icons from $case URL", async ({ internal }) => {
      mockBarista(internal);
      const expected = ["mockIcon1", "mockIcon2"];

      await initializeCache();

      await expect(
        waitForCondition(() => getCachedBaristaIcons().length > 0, {
          interval: 1,
          timeout: 200,
        }),
      ).resolves.not.toThrow();
      const actual = getCachedBaristaIcons();
      expect(actual).toEqual(expected);
    });

    it("parses the extension manifest", async () => {
      const manifestText = readTestDataFile(path.join("manifests", "basic_extension.yaml"));
      jest.spyOn(fileSystemUtils, "readExtensionManifest").mockReturnValue(manifestText);
      const expected = yaml.parse(manifestText) as ExtensionStub;

      await initializeCache();

      await expect(
        waitForCondition(() => getCachedParsedExtension() !== null, {
          interval: 1,
          timeout: 1000,
        }),
      ).resolves.not.toThrow();
      const actual = getCachedParsedExtension();
      expect(actual).toEqual(expected);
    });
  });

  describe("pushManifestTextForParsing", () => {
    const initialManifestText = readTestDataFile(path.join("manifests", "basic_extension.yaml"));
    const initialParsedExtension = yaml.parse(initialManifestText) as ExtensionStub;
    let readExtensionManifestSpy: jest.SpyInstance;

    beforeEach(async () => {
      readExtensionManifestSpy = jest.spyOn(fileSystemUtils, "readExtensionManifest");
      // Load initial manifest
      readExtensionManifestSpy.mockReturnValue(initialManifestText);
      await initializeCache();
      await waitForCondition(() => getCachedParsedExtension() !== null, {
        interval: 1,
        timeout: 1000,
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("updates the parsed extension value", async () => {
      const updatedManifest = readTestDataFile(path.join("manifests", "snmp_extension.yaml"));
      readExtensionManifestSpy.mockReturnValue(updatedManifest);
      const expected = yaml.parse(updatedManifest) as ExtensionStub;

      pushManifestTextForParsing();

      await expect(
        waitForCondition(
          () =>
            getCachedParsedExtension() !== null &&
            getCachedParsedExtension()?.name !== "custom:mock_basic_extension",
          {
            interval: 1,
            timeout: 1000,
          },
        ),
      ).resolves.not.toThrow();
      const actual = getCachedParsedExtension();
      expect(actual).toEqual(expected);
    });

    test.each([
      { case: "invalid YAML", updatedManifest: "  name:\naaaa\n" },
      { case: "empty manifest", updatedManifest: "" },
    ])("keeps previous value for $case", async ({ updatedManifest }) => {
      // Simulate content update
      readExtensionManifestSpy.mockReturnValue(updatedManifest);

      pushManifestTextForParsing();

      await expect(
        waitForCondition(
          () =>
            yaml.stringify(getCachedParsedExtension()) !== yaml.stringify(initialParsedExtension),
          {
            interval: 1,
            timeout: 500,
          },
        ),
      ).rejects.toThrow("Timeout after 500 ms");
    });
  });
});

const mockBarista = (internal: boolean) => {
  jest.spyOn(axios, "get").mockImplementation((url: string) => {
    return new Promise((resolve, reject) => {
      if (url.includes(internal ? "barista.lab.dynatrace.org" : "raw.githubusercontent.com")) {
        resolve({ data: { icons: [{ name: "mockIcon1" }, { name: "mockIcon2" }] } });
      }
      reject(new Error("mock error"));
    });
  });
};

const mockDynatraceClient = () => {
  jest
    .spyOn(tenantsTreeView, "getDynatraceClient")
    .mockReturnValue(Promise.resolve(new MockDynatrace()));
};

const setupForCacheInit = () => {
  const mockGlobalStoragePath = "mock/globalStorage";
  const mockWorkspaceStoragePath = "mock/workspaceStorage";
  jest
    .spyOn(extension, "getActivationContext")
    .mockReturnValue(new MockExtensionContext(mockGlobalStoragePath, mockWorkspaceStoragePath));
};
