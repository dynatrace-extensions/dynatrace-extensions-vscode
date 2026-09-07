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
  DiscoveryClient,
  ExtensionsClient,
  SchemasClient,
} from "@dynatrace-sdk/client-extensions-v2";
import { DynatraceAPIError } from "../../../../../src/dynatrace-api/errors";
import { SdkExtensionsServiceV2 } from "../../../../../src/dynatrace-api/sdk/extensionsAdapter";

type MockExtensionsClient = jest.Mocked<
  Pick<
    ExtensionsClient,
    | "listExtensions"
    | "listExtensionVersions"
    | "deleteExtensionVersion"
    | "uploadExtension"
    | "validateExtension"
    | "updateExtensionEnvironmentConfiguration"
    | "listExtensionMonitoringConfigurations"
    | "getExtensionMonitoringConfigurationStatus"
    | "getExtensionMonitoringConfigurationDetails"
    | "createExtensionMonitoringConfiguration"
    | "updateExtensionMonitoringConfiguration"
    | "deleteExtensionMonitoringConfiguration"
    | "getExtensionConfigurationSchema"
    | "getExtensionDetails"
  >
>;

const makeMockExtensionsClient = (): MockExtensionsClient => ({
  listExtensions: jest.fn(),
  listExtensionVersions: jest.fn(),
  deleteExtensionVersion: jest.fn(),
  uploadExtension: jest.fn(),
  validateExtension: jest.fn(),
  updateExtensionEnvironmentConfiguration: jest.fn(),
  listExtensionMonitoringConfigurations: jest.fn(),
  getExtensionMonitoringConfigurationStatus: jest.fn(),
  getExtensionMonitoringConfigurationDetails: jest.fn(),
  createExtensionMonitoringConfiguration: jest.fn(),
  updateExtensionMonitoringConfiguration: jest.fn(),
  deleteExtensionMonitoringConfiguration: jest.fn(),
  getExtensionConfigurationSchema: jest.fn(),
  getExtensionDetails: jest.fn(),
});

const makeMockSchemasClient = (): jest.Mocked<
  Pick<SchemasClient, "listSchemaVersions" | "listSchemaVersionFiles" | "getSchemaVersionFile">
> => ({
  listSchemaVersions: jest.fn(),
  listSchemaVersionFiles: jest.fn(),
  getSchemaVersionFile: jest.fn(),
});

const makeMockDiscoveryClient = (): jest.Mocked<
  Pick<DiscoveryClient, "listJmxProcesses" | "getJmxProcess">
> => ({
  listJmxProcesses: jest.fn(),
  getJmxProcess: jest.fn(),
});

interface Mocks {
  extensions: MockExtensionsClient;
  schemas: ReturnType<typeof makeMockSchemasClient>;
  discovery: ReturnType<typeof makeMockDiscoveryClient>;
}

const makeMocks = (): Mocks => ({
  extensions: makeMockExtensionsClient(),
  schemas: makeMockSchemasClient(),
  discovery: makeMockDiscoveryClient(),
});

const makeAdapter = (mocks: Mocks) =>
  new SdkExtensionsServiceV2(
    mocks.extensions as unknown as ExtensionsClient,
    mocks.schemas as unknown as SchemasClient,
    mocks.discovery as unknown as DiscoveryClient,
  );

describe("SdkExtensionsServiceV2", () => {
  describe("listSchemaVersions()", () => {
    it("returns the schema versions newest-first", async () => {
      const mocks = makeMocks();
      mocks.schemas.listSchemaVersions.mockResolvedValue({ items: ["1.0.0", "1.1.0", "1.2.0"] });

      const result = await makeAdapter(mocks).listSchemaVersions();

      expect(result).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    });

    it("passes the abort signal only when one is given", async () => {
      const mocks = makeMocks();
      const signal = new AbortController().signal;
      mocks.schemas.listSchemaVersions.mockResolvedValue({ items: [] });

      await makeAdapter(mocks).listSchemaVersions();
      expect(mocks.schemas.listSchemaVersions).toHaveBeenCalledWith(undefined);

      await makeAdapter(mocks).listSchemaVersions(signal);
      expect(mocks.schemas.listSchemaVersions).toHaveBeenLastCalledWith({ abortSignal: signal });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const mocks = makeMocks();
      mocks.schemas.listSchemaVersions.mockRejectedValue(new Error("boom"));

      await expect(makeAdapter(mocks).listSchemaVersions()).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });

  describe("listSchemaFiles()", () => {
    it("unwraps the items of the file list", async () => {
      const mocks = makeMocks();
      mocks.schemas.listSchemaVersionFiles.mockResolvedValue({
        items: ["a.json", "b.json"],
      } as never);

      const result = await makeAdapter(mocks).listSchemaFiles("1.2.3");

      expect(result).toEqual(["a.json", "b.json"]);
      expect(mocks.schemas.listSchemaVersionFiles).toHaveBeenCalledWith({
        schemaVersion: "1.2.3",
        acceptType: "application/json; charset=utf-8",
        abortSignal: undefined,
      });
    });
  });

  describe("getSchemaFile()", () => {
    it("forwards the version and file name", async () => {
      const mocks = makeMocks();
      mocks.schemas.getSchemaVersionFile.mockResolvedValue({ type: "object" });

      const result = await makeAdapter(mocks).getSchemaFile("1.2.3", "a.json");

      expect(result).toEqual({ type: "object" });
      expect(mocks.schemas.getSchemaVersionFile).toHaveBeenCalledWith({
        schemaVersion: "1.2.3",
        fileName: "a.json",
        abortSignal: undefined,
      });
    });
  });

  describe("listVersions()", () => {
    it("follows the page key until all versions are collected", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensionVersions
        .mockResolvedValueOnce({
          items: [{ extensionName: "custom:test", version: "1.0.0" }],
          nextPageKey: "PAGE2",
          totalCount: 2,
        })
        .mockResolvedValueOnce({
          items: [{ extensionName: "custom:test", version: "2.0.0" }],
          totalCount: 2,
        });

      const result = await makeAdapter(mocks).listVersions("custom:test");

      expect(result).toEqual([
        { extensionName: "custom:test", version: "1.0.0" },
        { extensionName: "custom:test", version: "2.0.0" },
      ]);
      expect(mocks.extensions.listExtensionVersions).toHaveBeenNthCalledWith(1, {
        extensionName: "custom:test",
        pageKey: undefined,
        abortSignal: undefined,
      });
      expect(mocks.extensions.listExtensionVersions).toHaveBeenNthCalledWith(2, {
        extensionName: "custom:test",
        pageKey: "PAGE2",
        abortSignal: undefined,
      });
    });
  });

  describe("list()", () => {
    it("translates a name into a contains filter expression", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensions.mockResolvedValue({ items: [], totalCount: 0 });

      await makeAdapter(mocks).list("custom:test");

      expect(mocks.extensions.listExtensions).toHaveBeenCalledWith({
        filter: 'contains(name, "custom:test")',
        pageKey: undefined,
        abortSignal: undefined,
      });
    });

    it("omits the filter when no name is given", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensions.mockResolvedValue({ items: [], totalCount: 0 });

      await makeAdapter(mocks).list();

      expect(mocks.extensions.listExtensions).toHaveBeenCalledWith({
        filter: undefined,
        pageKey: undefined,
        abortSignal: undefined,
      });
    });

    it("drops the filter on subsequent pages, as the API requires", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensions
        .mockResolvedValueOnce({
          items: [{ extensionName: "custom:test", version: "1.0.0", keywords: [] }],
          nextPageKey: "PAGE2",
          totalCount: 2,
        })
        .mockResolvedValueOnce({
          items: [{ extensionName: "custom:other", version: "1.0.0", keywords: [] }],
          totalCount: 2,
        });

      const result = await makeAdapter(mocks).list("custom");

      expect(result).toHaveLength(2);
      expect(mocks.extensions.listExtensions).toHaveBeenLastCalledWith({
        filter: undefined,
        pageKey: "PAGE2",
        abortSignal: undefined,
      });
    });
  });

  describe("deleteVersion()", () => {
    it("forwards the name and version", async () => {
      const mocks = makeMocks();
      mocks.extensions.deleteExtensionVersion.mockResolvedValue({} as never);

      await makeAdapter(mocks).deleteVersion("custom:test", "1.0.0");

      expect(mocks.extensions.deleteExtensionVersion).toHaveBeenCalledWith({
        extensionName: "custom:test",
        extensionVersion: "1.0.0",
        abortSignal: undefined,
      });
    });
  });

  describe("upload()", () => {
    it("uploads the archive when not validating", async () => {
      const mocks = makeMocks();
      mocks.extensions.uploadExtension.mockResolvedValue({} as never);

      await makeAdapter(mocks).upload(Buffer.from("zip-content"));

      expect(mocks.extensions.uploadExtension).toHaveBeenCalledTimes(1);
      expect(mocks.extensions.validateExtension).not.toHaveBeenCalled();
      const { body } = mocks.extensions.uploadExtension.mock.calls[0][0];
      expect(await body.text()).toBe("zip-content");
    });

    it("routes validateOnly to the validation endpoint", async () => {
      const mocks = makeMocks();
      mocks.extensions.validateExtension.mockResolvedValue(undefined);

      await makeAdapter(mocks).upload(Buffer.from("zip-content"), true);

      expect(mocks.extensions.validateExtension).toHaveBeenCalledTimes(1);
      expect(mocks.extensions.uploadExtension).not.toHaveBeenCalled();
    });
  });

  describe("putEnvironmentConfiguration()", () => {
    it("sends the version as the request body", async () => {
      const mocks = makeMocks();
      mocks.extensions.updateExtensionEnvironmentConfiguration.mockResolvedValue({
        version: "1.0.0",
      });

      await makeAdapter(mocks).putEnvironmentConfiguration("custom:test", "1.0.0");

      expect(mocks.extensions.updateExtensionEnvironmentConfiguration).toHaveBeenCalledWith({
        extensionName: "custom:test",
        body: { version: "1.0.0" },
        abortSignal: undefined,
      });
    });
  });

  describe("listMonitoringConfigurations()", () => {
    it("maps SDK configurations to the local DTO shape", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensionMonitoringConfigurations.mockResolvedValue({
        items: [
          {
            objectId: "OBJ-1",
            scope: "HOST-1",
            modificationInfo: {},
            value: { enabled: false, description: "desc", version: "1.0.0", featuresets: ["fs"] },
          },
        ],
        totalCount: 1,
      });

      const result = await makeAdapter(mocks).listMonitoringConfigurations("custom:test");

      expect(result).toEqual([
        {
          objectId: "OBJ-1",
          scope: "HOST-1",
          value: {
            enabled: false,
            description: "desc",
            version: "1.0.0",
            featuresets: ["fs"],
            vars: undefined,
            snmp: undefined,
            activationContext: undefined,
          },
        },
      ]);
    });

    it("translates version and activeOnly into a filter expression", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensionMonitoringConfigurations.mockResolvedValue({
        items: [],
        totalCount: 0,
      });

      await makeAdapter(mocks).listMonitoringConfigurations("custom:test", "1.0.0", true);

      expect(mocks.extensions.listExtensionMonitoringConfigurations).toHaveBeenCalledWith({
        extensionName: "custom:test",
        filter: 'version = "1.0.0" AND active = true',
        pageKey: undefined,
        abortSignal: undefined,
      });
    });

    it("omits the filter when neither version nor activeOnly is given", async () => {
      const mocks = makeMocks();
      mocks.extensions.listExtensionMonitoringConfigurations.mockResolvedValue({
        items: [],
        totalCount: 0,
      });

      await makeAdapter(mocks).listMonitoringConfigurations("custom:test");

      expect(mocks.extensions.listExtensionMonitoringConfigurations).toHaveBeenCalledWith({
        extensionName: "custom:test",
        filter: undefined,
        pageKey: undefined,
        abortSignal: undefined,
      });
    });
  });

  describe("getMonitoringConfigurationStatus()", () => {
    it("converts the timestamp and collapses PENDING and WARNING to UNKNOWN", async () => {
      const mocks = makeMocks();
      mocks.extensions.getExtensionMonitoringConfigurationStatus
        .mockResolvedValueOnce({ status: "PENDING", timestamp: "2026-01-01T00:00:00.000Z" })
        .mockResolvedValueOnce({ status: "WARNING", timestamp: "2026-01-01T00:00:00.000Z" })
        .mockResolvedValueOnce({ status: "OK" });

      const adapter = makeAdapter(mocks);
      const expectedTime = new Date("2026-01-01T00:00:00.000Z").getTime();

      await expect(
        adapter.getMonitoringConfigurationStatus("custom:test", "OBJ-1"),
      ).resolves.toEqual({ status: "UNKNOWN", timestamp: expectedTime });
      await expect(
        adapter.getMonitoringConfigurationStatus("custom:test", "OBJ-1"),
      ).resolves.toEqual({ status: "UNKNOWN", timestamp: expectedTime });
      await expect(
        adapter.getMonitoringConfigurationStatus("custom:test", "OBJ-1"),
      ).resolves.toEqual({ status: "OK", timestamp: 0 });
    });
  });

  describe("postMonitoringConfiguration()", () => {
    it("unwraps a single-element array into the SDK's object body", async () => {
      const mocks = makeMocks();
      mocks.extensions.createExtensionMonitoringConfiguration.mockResolvedValue({
        code: 200,
        objectId: "OBJ-1",
      });

      await makeAdapter(mocks).postMonitoringConfiguration("custom:test", [
        { scope: "HOST-1", value: { enabled: true } },
      ] as unknown as Record<string, unknown>);

      expect(mocks.extensions.createExtensionMonitoringConfiguration).toHaveBeenCalledWith({
        extensionName: "custom:test",
        body: { scope: "HOST-1", value: { enabled: true } },
        abortSignal: undefined,
      });
    });

    it("passes an object body through unchanged", async () => {
      const mocks = makeMocks();
      mocks.extensions.createExtensionMonitoringConfiguration.mockResolvedValue({
        code: 200,
        objectId: "OBJ-1",
      });

      await makeAdapter(mocks).postMonitoringConfiguration("custom:test", {
        scope: "HOST-1",
        value: { enabled: true },
      });

      expect(mocks.extensions.createExtensionMonitoringConfiguration).toHaveBeenCalledWith({
        extensionName: "custom:test",
        body: { scope: "HOST-1", value: { enabled: true } },
        abortSignal: undefined,
      });
    });
  });

  describe("putMonitoringConfiguration()", () => {
    it("forwards the configuration details as the request body", async () => {
      const mocks = makeMocks();
      mocks.extensions.updateExtensionMonitoringConfiguration.mockResolvedValue({
        code: 200,
        objectId: "OBJ-1",
      });

      await makeAdapter(mocks).putMonitoringConfiguration("custom:test", "OBJ-1", {
        value: { enabled: false },
      });

      expect(mocks.extensions.updateExtensionMonitoringConfiguration).toHaveBeenCalledWith({
        extensionName: "custom:test",
        configurationId: "OBJ-1",
        body: { value: { enabled: false } },
        abortSignal: undefined,
      });
    });
  });

  describe("deleteMonitoringConfiguration()", () => {
    it("forwards the extension name and configuration id", async () => {
      const mocks = makeMocks();
      mocks.extensions.deleteExtensionMonitoringConfiguration.mockResolvedValue(undefined);

      await makeAdapter(mocks).deleteMonitoringConfiguration("custom:test", "OBJ-1");

      expect(mocks.extensions.deleteExtensionMonitoringConfiguration).toHaveBeenCalledWith({
        extensionName: "custom:test",
        configurationId: "OBJ-1",
        abortSignal: undefined,
      });
    });
  });

  describe("getExtensionSchema()", () => {
    it("returns the raw configuration schema", async () => {
      const mocks = makeMocks();
      const schema = { schemaId: "custom:test", properties: {} };
      mocks.extensions.getExtensionConfigurationSchema.mockResolvedValue(schema as never);

      const result = await makeAdapter(mocks).getExtensionSchema("custom:test", "1.0.0");

      expect(result).toBe(schema);
    });
  });

  describe("getExtension()", () => {
    it("requests JSON details by default", async () => {
      const mocks = makeMocks();
      const details = { extensionName: "custom:test", version: "1.0.0" };
      mocks.extensions.getExtensionDetails.mockResolvedValue(details as never);

      const result = await makeAdapter(mocks).getExtension("custom:test", "1.0.0");

      expect(result).toBe(details);
      expect(mocks.extensions.getExtensionDetails).toHaveBeenCalledWith({
        extensionName: "custom:test",
        extensionVersion: "1.0.0",
        acceptType: "application/json; charset=utf-8",
        abortSignal: undefined,
      });
    });

    it("unwraps the Binary into an ArrayBuffer when downloading the package", async () => {
      const mocks = makeMocks();
      const buffer = new ArrayBuffer(4);
      const binary = { get: jest.fn().mockResolvedValue(buffer) };
      mocks.extensions.getExtensionDetails.mockResolvedValue(binary);

      const result = await makeAdapter(mocks).getExtension("custom:test", "1.0.0", true);

      expect(result).toBe(buffer);
      expect(binary.get).toHaveBeenCalledWith("array-buffer");
      expect(mocks.extensions.getExtensionDetails).toHaveBeenCalledWith({
        extensionName: "custom:test",
        extensionVersion: "1.0.0",
        acceptType: "application/octet-stream",
        abortSignal: undefined,
      });
    });
  });

  describe("listJMXProcesses()", () => {
    it("maps the items and defaults missing properties", async () => {
      const mocks = makeMocks();
      mocks.discovery.listJmxProcesses.mockResolvedValue({
        items: [
          {
            id: "PROC-1",
            name: "process",
            agentVersion: "1.300.0",
            properties: { HOSTS: ["HOST-1"], TECHNOLOGIES: ["JAVA"], PROCESS_GROUPS: ["PG-1"] },
          },
          {},
        ],
      });

      const result = await makeAdapter(mocks).listJMXProcesses();

      expect(result).toEqual([
        {
          id: "PROC-1",
          name: "process",
          agentVersion: "1.300.0",
          properties: { HOSTS: ["HOST-1"], TECHNOLOGIES: ["JAVA"], PROCESS_GROUPS: ["PG-1"] },
        },
        {
          id: "",
          name: "",
          agentVersion: "",
          properties: { HOSTS: [], TECHNOLOGIES: [], PROCESS_GROUPS: [] },
        },
      ]);
    });
  });

  describe("getJMXProcessDetails()", () => {
    it("returns an empty object without calling the SDK when no process id is given", async () => {
      const mocks = makeMocks();

      const result = await makeAdapter(mocks).getJMXProcessDetails();

      expect(result).toEqual({});
      expect(mocks.discovery.getJmxProcess).not.toHaveBeenCalled();
    });

    it("forwards the process id", async () => {
      const mocks = makeMocks();
      mocks.discovery.getJmxProcess.mockResolvedValue({ domain: {} });

      const result = await makeAdapter(mocks).getJMXProcessDetails("PROC-1");

      expect(result).toEqual({ domain: {} });
      expect(mocks.discovery.getJmxProcess).toHaveBeenCalledWith({
        processId: "PROC-1",
        abortSignal: undefined,
      });
    });
  });
});
