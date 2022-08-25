import { HttpClient } from "../http_client";
import { util } from "node-forge";

/**
 * Implementation of the Dynatrace Credential Vault API.
 */
export class CredentialVaultService {
  endpoint: string;
  httpClient: HttpClient;

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
    description: string = ""
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
