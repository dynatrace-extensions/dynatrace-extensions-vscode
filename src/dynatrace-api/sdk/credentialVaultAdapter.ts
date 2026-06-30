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
  PublicCertificateCredentials,
} from "@dynatrace-sdk/client-credential-vault";
import { util } from "node-forge";
import { wrapSdkError } from "../errors";
import { CredentialsResponseElement } from "../interfaces/credentialVault";
import { CredentialVaultServiceInterface } from "../interfaces/services";
import { RateLimitRetryHandler } from "../rateLimitHandler";

/**
 * SaaS adapter for Credential Vault — wraps CredentialVaultEntriesClient to match
 * the existing CredentialVaultServiceInterface.
 */
export class SdkCredentialVaultAdapter implements CredentialVaultServiceInterface {
  private readonly retryHandler: RateLimitRetryHandler;

  constructor(
    private readonly client: CredentialVaultEntriesClient,
    retryHandler?: RateLimitRetryHandler,
  ) {
    this.retryHandler = retryHandler ?? new RateLimitRetryHandler();
  }

  async postCertificate(
    certificate: string,
    name: string,
    description: string = "",
    signal?: AbortSignal,
  ): Promise<{ id: string }> {
    try {
      const body: PublicCertificateCredentials = {
        name,
        description,
        ownerAccessOnly: true,
        scopes: ["EXTENSION"],
        type: "PUBLIC_CERTIFICATE",
        certificate: util.encode64(certificate),
        password: "",
        certificateFormat: "PEM",
      };
      const res = await this.retryHandler.execute(
        () =>
          this.client.createCredentialVaultEntry({
            body,
            abortSignal: signal,
          }),
        signal,
      );
      return { id: res.id };
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putCertificate(
    certificateId: string,
    certificate: string,
    name: string,
    description: string = "",
    signal?: AbortSignal,
  ): Promise<unknown> {
    try {
      const body: PublicCertificateCredentials = {
        name,
        description,
        ownerAccessOnly: true,
        scopes: ["EXTENSION"],
        type: "PUBLIC_CERTIFICATE",
        certificate: util.encode64(certificate),
        password: "",
        certificateFormat: "PEM",
      };
      await this.retryHandler.execute(
        () =>
          this.client.updateCredentialVaultEntry({
            entryId: certificateId,
            body,
            abortSignal: signal,
          }),
        signal,
      );
      return undefined;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getCertificate(
    certificateId: string,
    signal?: AbortSignal,
  ): Promise<CredentialsResponseElement> {
    try {
      const res = await this.retryHandler.execute(
        () =>
          this.client.getCredentialVaultEntry({
            entryId: certificateId,
            abortSignal: signal,
          }),
        signal,
      );
      return mapCredentialsResponse(res);
    } catch (err) {
      throw wrapSdkError(err);
    }
  }
}

function mapCredentialsResponse(res: SdkCredentialsResponseElement): CredentialsResponseElement {
  return {
    name: res.name,
    id: res.id ?? "",
    description: res.description,
    owner: res.owner,
    ownerAccessOnly: res.ownerAccessOnly,
    scope: res.scope,
    scopes: res.scopes,
    type: res.type,
    externalVault: res.externalVault,
    credentialUsageSummary: res.credentialUsageSummary,
  };
}
