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

import {
  SchemaList,
  SettingsObjectsClient,
  SettingsObjectsList,
  SettingsSchemasClient,
} from "@dynatrace-sdk/client-settings";
import { DynatraceAPIError } from "../../../../../src/dynatrace-api/errors";
import { SdkSettingsService } from "../../../../../src/dynatrace-api/sdk/settingsAdapter";

const makeMockObjectsClient = (): jest.Mocked<
  Pick<SettingsObjectsClient, "listSettingsObjects">
> => ({
  listSettingsObjects: jest.fn(),
});

const makeMockSchemasClient = (): jest.Mocked<
  Pick<SettingsSchemasClient, "listSchemaDefinitions" | "getSchemaDefinition">
> => ({
  listSchemaDefinitions: jest.fn(),
  getSchemaDefinition: jest.fn(),
});

const makeAdapter = (
  objects: ReturnType<typeof makeMockObjectsClient>,
  schemas: ReturnType<typeof makeMockSchemasClient>,
) =>
  new SdkSettingsService(
    objects as unknown as SettingsObjectsClient,
    schemas as unknown as SettingsSchemasClient,
  );

describe("SdkSettingsService", () => {
  describe("listSchemas()", () => {
    it("maps SDK schema stubs to the local shape", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      const response: SchemaList = {
        totalCount: 1,
        items: [
          {
            schemaId: "builtin:test",
            latestSchemaVersion: "1.2.3",
            displayName: "Test schema",
            maturity: "GENERAL_AVAILABILITY",
          },
        ],
      };
      schemas.listSchemaDefinitions.mockResolvedValue(response);

      const result = await makeAdapter(objects, schemas).listSchemas();

      expect(result).toEqual([
        { schemaId: "builtin:test", latestSchemaVersion: "1.2.3", displayName: "Test schema" },
      ]);
      expect(schemas.listSchemaDefinitions).toHaveBeenCalledWith({ abortSignal: undefined });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      schemas.listSchemaDefinitions.mockRejectedValue(new Error("boom"));

      await expect(makeAdapter(objects, schemas).listSchemas()).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });

  describe("getSchema()", () => {
    it("returns the raw schema definition and forwards the schemaId", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      const rawSchema = { schemaId: "builtin:test", properties: {} };
      schemas.getSchemaDefinition.mockResolvedValue(rawSchema as never);

      const result = await makeAdapter(objects, schemas).getSchema("builtin:test");

      expect(result).toBe(rawSchema);
      expect(schemas.getSchemaDefinition).toHaveBeenCalledWith({
        schemaId: "builtin:test",
        abortSignal: undefined,
      });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      schemas.getSchemaDefinition.mockRejectedValue(new Error("not found"));

      await expect(makeAdapter(objects, schemas).getSchema("missing")).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });

  describe("listObjects()", () => {
    it("maps SDK objects and passes query params on the first page", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      const response: SettingsObjectsList = {
        totalCount: 1,
        pageSize: 100,
        version: "list-v1",
        items: [
          {
            objectId: "obj-1",
            version: "v-token",
            schemaId: "builtin:test",
            schemaVersion: "1.0",
            scope: "environment",
            summary: "an object",
            externalId: "ext-1",
            value: { config: { enabled: true } },
            modificationInfo: {
              createdBy: "author-user",
              createdTime: new Date("2024-01-01T00:00:00.000Z"),
              lastModifiedTime: new Date("2024-02-01T00:00:00.000Z"),
            },
          },
        ],
      };
      objects.listSettingsObjects.mockResolvedValue(response);

      const result = await makeAdapter(objects, schemas).listObjects(
        "builtin:test",
        "environment",
        "value",
        100,
      );

      expect(objects.listSettingsObjects).toHaveBeenCalledWith({
        schemaId: "builtin:test",
        scope: "environment",
        addFields: "value",
        pageSize: 100,
        abortSignal: undefined,
      });
      expect(result).toEqual([
        {
          objectId: "obj-1",
          externalId: "ext-1",
          schemaId: "builtin:test",
          schemaVersion: "1.0",
          scope: "environment",
          value: { config: { enabled: true } },
          summary: "an object",
          author: "author-user",
          created: new Date("2024-01-01T00:00:00.000Z").getTime(),
          modified: new Date("2024-02-01T00:00:00.000Z").getTime(),
          updateToken: "v-token",
        },
      ]);
    });

    it("follows nextPageKey and only sends pageKey on subsequent pages", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      objects.listSettingsObjects
        .mockResolvedValueOnce({
          totalCount: 2,
          pageSize: 1,
          nextPageKey: "PAGE-2",
          items: [{ objectId: "obj-1", version: "v1" }],
        } as SettingsObjectsList)
        .mockResolvedValueOnce({
          totalCount: 2,
          pageSize: 1,
          items: [{ objectId: "obj-2", version: "v2" }],
        } as SettingsObjectsList);

      const result = await makeAdapter(objects, schemas).listObjects("builtin:test");

      expect(result.map(o => o.objectId)).toEqual(["obj-1", "obj-2"]);
      expect(objects.listSettingsObjects).toHaveBeenNthCalledWith(2, {
        pageKey: "PAGE-2",
        abortSignal: undefined,
      });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const objects = makeMockObjectsClient();
      const schemas = makeMockSchemasClient();
      objects.listSettingsObjects.mockRejectedValue(new Error("bad request"));

      await expect(makeAdapter(objects, schemas).listObjects("builtin:test")).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });
});
