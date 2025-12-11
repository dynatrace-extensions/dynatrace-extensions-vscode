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

import { util } from "node-forge";
import { HttpClient } from "../http_client";
import { CredentialsResponseElement } from "../interfaces/credentialVault";

/**
 * Implementation of the Dynatrace Credential Vault API.
 */
export class CredentialVaultService {
  private readonly endpoint: string;
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.endpoint = "/api/v2/credentials";
  }

  /**
   * Create a credential in the Dynatrace credential vault with details required
   * for signing Extensions 2.0.
   * @param certificate the certificate as a PEM encoded string
   * @param name the name for this credential as it will appear in the vault
   * @param description the description associated with the credential
   * @param signal cancellation signal
   * @returns response data
   */
  async postCertificate(
    certificate: string,
    name: string,
    description: string = "",
    signal?: AbortSignal,
  ) {
    const body = {
      name: name,
      description: description,
      ownerAccessOnly: true,
      scope: "EXTENSION",
      type: "PUBLIC_CERTIFICATE",
      certificate: util.encode64(certificate),
      password: util.encode64("PasswordNotSupported"),
      certificateFormat: "PEM",
    };
    return this.httpClient.makeRequest<{ id: string }>({
      path: this.endpoint,
      method: "POST",
      body,
      signal,
    });
  }

  /**
   * Update an existing credential from the Dynatrace credential vault. The updated
   * details will match the credential requirements for signing Extensions 2.0
   * @param certificateId ID of the existing credential
   * @param certificate the new certificate as a PEM encoded string
   * @param name the name for this credential as it will appear in the vault
   * @param description the description associated with the credential
   * @param signal cancellation signal
   * @returns response data
   */
  async putCertificate(
    certificateId: string,
    certificate: string,
    name: string,
    description: string = "",
    signal?: AbortSignal,
  ) {
    const body = {
      name: name,
      description: description,
      ownerAccessOnly: true,
      scope: "EXTENSION",
      type: "PUBLIC_CERTIFICATE",
      certificate: util.encode64(certificate),
      password: util.encode64("PasswordNotSupported"),
      certificateFormat: "PEM",
    };
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${certificateId}`,
      method: "PUT",
      body,
      signal,
    });
  }

  /**
   * Gets the details of a credential stored in the Dynatrace credential vault.
   * @param certificateId ID of the credential to retrieve
   * @param signal cancellation signal
   * @returns response data
   */
  async getCertificate(certificateId: string, signal?: AbortSignal) {
    return this.httpClient.makeRequest<CredentialsResponseElement>({
      path: `${this.endpoint}/${certificateId}`,
      signal,
    });
  }
}
