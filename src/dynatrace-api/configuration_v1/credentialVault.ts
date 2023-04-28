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

import { HttpClient } from "../http_client";
import { util } from "node-forge";

/**
 * Implementation of the Dynatrace Credential Vault API.
 */
export class CredentialVaultService {
  private readonly endpoint: string;
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.endpoint = "/api/config/v1/credentials";
  }

  /**
   * Create a credential in the Dynatrace credential vault with details required
   * for signing Extensions 2.0.
   * @param certificate the certificate as a PEM encoded string
   * @param name the name for this credential as it will appear in the vault
   * @param description the description associated with the credential
   * @returns response data
   */
  async postCertificate(certificate: string, name: string, description: string = ""): Promise<any> {
    var payload = {
      name: name,
      description: description,
      ownerAccessOnly: true,
      scope: "EXTENSION",
      type: "PUBLIC_CERTIFICATE",
      certificate: util.encode64(certificate),
      password: util.encode64("PasswordNotSupported"),
      certificateFormat: "PEM",
    };
    return this.httpClient.makeRequest(this.endpoint, payload, "POST");
  }

  /**
   * Update an existing credential from the Dynatrace credential vault. The updated
   * details will match the credential requirements for signing Extensions 2.0
   * @param certificateId ID of the existing credential
   * @param certificate the new certificate as a PEM encoded string
   * @param name the name for this credential as it will appear in the vault
   * @param description the description associated with the credential
   * @returns response data
   */
  async putCertificate(
    certificateId: string,
    certificate: string,
    name: string,
    description: string = "",
  ): Promise<any> {
    var payload = {
      name: name,
      description: description,
      ownerAccessOnly: true,
      scope: "EXTENSION",
      type: "PUBLIC_CERTIFICATE",
      certificate: util.encode64(certificate),
      password: util.encode64("PasswordNotSupported"),
      certificateFormat: "PEM",
    };
    return this.httpClient.makeRequest(`${this.endpoint}/${certificateId}`, payload, "PUT");
  }

  /**
   * Gets the details of a credential stored in the Dynatrace credential vault.
   * @param certificateId ID of the credential to retrieve
   * @returns response data
   */
  async getCertificate(certificateId: string): Promise<any> {
    return this.httpClient.makeRequest(`${this.endpoint}/${certificateId}`);
  }
}
