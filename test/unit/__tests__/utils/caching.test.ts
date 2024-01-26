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

import { ValidationStatus } from "../../../../src/codeLens/utils/selectorUtils";
import { WmiQueryResult } from "../../../../src/codeLens/utils/wmiUtils";
import { Dynatrace } from "../../../../src/dynatrace-api/dynatrace";
import { Entity } from "../../../../src/dynatrace-api/interfaces/monitoredEntities";
import * as tenantsTreeView from "../../../../src/treeViews/tenantsTreeView";
import {
  getCachedEntityInstances,
  getCachedSelectorStatus,
  getCachedWmiQueryResult,
  getCachedWmiStatus,
  setCachedSelectorStatus,
  setCachedWmiQueryResult,
  setCachedWmiStatus,
  updateEntityInstances,
} from "../../../../src/utils/caching";

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
const mockEntityInstances: Entity[] = [
  { type: "mock1", entityId: "mock1", displayName: "mock1", firstSeenTms: 1, lastSeenTms: 2 },
  { type: "mock2", entityId: "mock2", displayName: "mock2", firstSeenTms: 3, lastSeenTms: 4 },
];

describe("Caching Utils", () => {
  beforeAll(() => {
    jest.spyOn(tenantsTreeView, "getDynatraceClient").mockImplementation(() =>
      Promise.resolve({
        entitiesV2: {
          list: (selector: string) => {
            if (selector === "type(mock1)") return Promise.resolve([mockEntityInstances[0]]);
            if (selector === "type(mock2)") return Promise.resolve([mockEntityInstances[1]]);
          },
        },
      } as Dynatrace),
    );
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

  describe("get/ set CachedWmiStatus", () => {
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

  describe("get/ set CachedSelectorStatus", () => {
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

  describe("get/ set CachedEntityInstances", () => {
    test("get - returns undefined if entity type is not cached", () => {
      const actual = getCachedEntityInstances("mock");

      expect(actual).toBeUndefined();
    });

    test("set/get - cached entity instances", async () => {
      await updateEntityInstances(["mock1"]);

      const actual = getCachedEntityInstances("mock1");

      expect(actual).toEqual([mockEntityInstances[0]]);
    });
  });
});
