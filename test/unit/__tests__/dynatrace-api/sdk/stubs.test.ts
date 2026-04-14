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
  StubbedActiveGatesService,
  StubbedCredentialVaultService,
  StubbedDashboardService,
  StubbedEntityServiceV2,
  StubbedExtensionsServiceV1,
  StubbedMetricService,
} from "../../../../../src/dynatrace-api/sdk/stubs";

jest.mock("../../../../../src/utils/logging");

describe("SaaS SDK stubs", () => {
  describe("StubbedEntityServiceV2", () => {
    const service = new StubbedEntityServiceV2();

    it("list() returns empty array", async () => {
      const result = await service.list("type(HOST)");

      expect(result).toEqual([]);
    });

    it("listTypes() returns empty array", async () => {
      const result = await service.listTypes();

      expect(result).toEqual([]);
    });

    it("get() throws not supported", async () => {
      await expect(service.get("HOST-123")).rejects.toThrow("not supported on SaaS");
    });

    it("getType() throws not supported", async () => {
      await expect(service.getType("HOST")).rejects.toThrow("not supported on SaaS");
    });
  });

  describe("StubbedMetricService", () => {
    const service = new StubbedMetricService();

    it("query() returns empty array", async () => {
      const result = await service.query("builtin:host.cpu.usage");

      expect(result).toEqual([]);
    });
  });

  describe("StubbedCredentialVaultService", () => {
    const service = new StubbedCredentialVaultService();

    it("postCertificate() throws not supported", async () => {
      await expect(service.postCertificate("cert", "name")).rejects.toThrow(
        "not supported on SaaS",
      );
    });

    it("putCertificate() throws not supported", async () => {
      await expect(service.putCertificate("id", "cert", "name")).rejects.toThrow(
        "not supported on SaaS",
      );
    });

    it("getCertificate() throws not supported", async () => {
      await expect(service.getCertificate("id")).rejects.toThrow("not supported on SaaS");
    });
  });

  describe("StubbedExtensionsServiceV1", () => {
    const service = new StubbedExtensionsServiceV1();

    it("getExtensions() throws not supported", async () => {
      await expect(service.getExtensions()).rejects.toThrow("not supported on SaaS");
    });

    it("getExtensionBinary() throws not supported", async () => {
      await expect(service.getExtensionBinary("ext-id")).rejects.toThrow(
        "not supported on SaaS",
      );
    });
  });

  describe("StubbedDashboardService", () => {
    const service = new StubbedDashboardService();

    it("post() throws not supported", async () => {
      await expect(service.post({} as never)).rejects.toThrow("not supported on SaaS");
    });
  });

  describe("StubbedActiveGatesService", () => {
    const service = new StubbedActiveGatesService();

    it("list() throws not supported", async () => {
      await expect(service.list()).rejects.toThrow("not supported on SaaS");
    });
  });
});
