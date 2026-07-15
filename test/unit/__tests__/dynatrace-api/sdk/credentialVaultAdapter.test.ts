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
  CredentialVaultEntriesClient,
  CredentialsResponseElement as SdkCredentialsResponseElement,
} from "@dynatrace-sdk/client-credential-vault";
import { util } from "node-forge";
import { DynatraceAPIError } from "../../../../../src/dynatrace-api/errors";
import { SdkCredentialVaultAdapter } from "../../../../../src/dynatrace-api/sdk/credentialVaultAdapter";

const makeMockClient = (): jest.Mocked<
  Pick<
    CredentialVaultEntriesClient,
    "createCredentialVaultEntry" | "updateCredentialVaultEntry" | "getCredentialVaultEntry"
  >
> => ({
  createCredentialVaultEntry: jest.fn(),
  updateCredentialVaultEntry: jest.fn(),
  getCredentialVaultEntry: jest.fn(),
});

const SDK_RESPONSE: SdkCredentialsResponseElement = {
  id: "CREDENTIALS-ABC123",
  name: "My CA Cert",
  description: "Root CA for extensions",
  owner: "test-user",
  ownerAccessOnly: true,
  scope: "EXTENSION",
  scopes: ["EXTENSION"],
  type: "PUBLIC_CERTIFICATE",
  allowedEntities: [],
  credentialUsageSummary: [],
};

describe("SdkCredentialVaultAdapter", () => {
  describe("postCertificate()", () => {
    it("calls createCredentialVaultEntry with base64-encoded cert and returns id", async () => {
      const client = makeMockClient();
      client.createCredentialVaultEntry.mockResolvedValue({ id: "CREDENTIALS-ABC123" });

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      const result = await adapter.postCertificate("PEM_CONTENT", "My Cert", "A description");

      expect(result).toEqual({ id: "CREDENTIALS-ABC123" });
      expect(client.createCredentialVaultEntry).toHaveBeenCalledWith({
        body: expect.objectContaining({
          name: "My Cert",
          description: "A description",
          ownerAccessOnly: true,
          scopes: ["EXTENSION"],
          type: "PUBLIC_CERTIFICATE",
          certificate: util.encode64("PEM_CONTENT"),
          certificateFormat: "PEM",
          password: "",
        }),
        abortSignal: undefined,
      });
    });

    it("uses empty string for description when omitted", async () => {
      const client = makeMockClient();
      client.createCredentialVaultEntry.mockResolvedValue({ id: "CREDENTIALS-NEW" });

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      await adapter.postCertificate("PEM", "Name");

      expect(client.createCredentialVaultEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ description: "" }),
        }),
      );
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const client = makeMockClient();
      client.createCredentialVaultEntry.mockRejectedValue(new Error("SDK failure"));

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );

      await expect(adapter.postCertificate("PEM", "Name")).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });

  describe("putCertificate()", () => {
    it("calls updateCredentialVaultEntry with entryId and base64-encoded cert", async () => {
      const client = makeMockClient();
      client.updateCredentialVaultEntry.mockResolvedValue(undefined);

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      await adapter.putCertificate("CREDENTIALS-XYZ", "PEM_CONTENT", "My Cert", "desc");

      expect(client.updateCredentialVaultEntry).toHaveBeenCalledWith({
        entryId: "CREDENTIALS-XYZ",
        body: expect.objectContaining({
          name: "My Cert",
          description: "desc",
          certificate: util.encode64("PEM_CONTENT"),
          type: "PUBLIC_CERTIFICATE",
        }),
        abortSignal: undefined,
      });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const client = makeMockClient();
      client.updateCredentialVaultEntry.mockRejectedValue(new Error("update failed"));

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );

      await expect(
        adapter.putCertificate("CREDENTIALS-XYZ", "PEM", "Name"),
      ).rejects.toBeInstanceOf(DynatraceAPIError);
    });
  });

  describe("getCertificate()", () => {
    it("returns mapped CredentialsResponseElement from SDK response", async () => {
      const client = makeMockClient();
      client.getCredentialVaultEntry.mockResolvedValue(SDK_RESPONSE);

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      const result = await adapter.getCertificate("CREDENTIALS-ABC123");

      expect(result.id).toBe("CREDENTIALS-ABC123");
      expect(result.name).toBe("My CA Cert");
      expect(result.description).toBe("Root CA for extensions");
      expect(result.owner).toBe("test-user");
      expect(result.ownerAccessOnly).toBe(true);
      expect(result.type).toBe("PUBLIC_CERTIFICATE");
    });

    it("falls back to empty string when id is absent in SDK response", async () => {
      const client = makeMockClient();
      client.getCredentialVaultEntry.mockResolvedValue({ ...SDK_RESPONSE, id: undefined });

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      const result = await adapter.getCertificate("CREDENTIALS-ABC123");

      expect(result.id).toBe("");
    });

    it("passes entryId to SDK client", async () => {
      const client = makeMockClient();
      client.getCredentialVaultEntry.mockResolvedValue(SDK_RESPONSE);

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );
      await adapter.getCertificate("CREDENTIALS-TARGET");

      expect(client.getCredentialVaultEntry).toHaveBeenCalledWith({
        entryId: "CREDENTIALS-TARGET",
        abortSignal: undefined,
      });
    });

    it("wraps SDK errors as DynatraceAPIError", async () => {
      const client = makeMockClient();
      client.getCredentialVaultEntry.mockRejectedValue(new Error("not found"));

      const adapter = new SdkCredentialVaultAdapter(
        client as unknown as CredentialVaultEntriesClient,
      );

      await expect(adapter.getCertificate("CREDENTIALS-MISSING")).rejects.toBeInstanceOf(
        DynatraceAPIError,
      );
    });
  });
});
