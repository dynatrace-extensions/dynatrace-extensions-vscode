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

/**
 * Implementation of the Extensions V2 API
 */
export class ExtensionsServiceV2 {
  private readonly endpoint = "/api/v2/extensions";
  private readonly schemaEndpoint = "/api/v2/extensions/schemas";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Gets the list of schema versions available on the cluster.
   * @returns list of versions
   */
  async listSchemaVersions(): Promise<string[]> {
    return this.httpClient.makeRequest(this.schemaEndpoint).then((res: SchemaList) => res.versions.reverse());
  }

  /**
   * Gets the list of schema files of a specific version.
   * @param version valid schema version available on the cluster
   * @returns list of file names
   */
  async listSchemaFiles(version: string): Promise<string[]> {
    return this.httpClient
      .makeRequest(`${this.schemaEndpoint}/${version}`, null, "GET", {
        accept: "application/json; charset=utf-8",
      })
      .then((res: SchemaFiles) => res.files);
  }

  /**
   * Gets the content of a schema file for a specific version
   * @param version valid schema version available on the cluster
   * @param fileName the name of the schema file
   * @returns response data
   */
  async getSchemaFile(version: string, fileName: string): Promise<any> {
    return this.httpClient.makeRequest(`${this.schemaEndpoint}/${version}/${fileName}`);
  }

  /**
   * Lists all versions of the extension 2.0
   * @param extensionName the extension name (ID)
   * @returns list of versions
   */
  async listVersions(extensionName: string): Promise<MinimalExtension[]> {
    return this.httpClient.paginatedCall(`${this.endpoint}/${extensionName}`, "extensions");
  }

  /**
   * Deletes the specified version of the extension 2.0
   * @param extensionName extension name (ID)
   * @param version version to delete
   * @returns response data
   */
  async deleteVersion(extensionName: string, version: string) {
    return this.httpClient.makeRequest(`${this.endpoint}/${extensionName}/${version}`, {}, "DELETE");
  }

  /**
   * Uploads or verifies a new extension 2.0
   * @param file the extension archive as a Buffer
   * @param validateOnly whether to only validate or also upload
   * @returns response data
   */
  async upload(file: Buffer, validateOnly = false) {
    return this.httpClient.makeRequest(
      `${this.endpoint}`,
      {},
      "POST",
      {},
      { validateOnly: validateOnly },
      { file: file, name: "extension.zip" }
    );
  }

  /**
   * Updates the active environment configuration version of the extension 2.0
   * @param extensionName name of the extension to activate
   * @param version the version to activate
   * @returns response data
   */
  async putEnvironmentConfiguration(extensionName: string, version: string) {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/environmentConfiguration`,
      { version: version },
      "PUT"
    );
  }

  /**
   * Lists all the extensions 2.0 available in the environment.
   * @param name Filters the resulting set of extensions 2.0 by name.
   *             You can specify a partial name. In that case, the CONTAINS operator is used.
   * @returns the list of extensions
   */
  async list(name?: string): Promise<MinimalExtension[]> {
    return this.httpClient.paginatedCall(`${this.endpoint}`, "extensions", { name: name });
  }

  /**
   * Lists all the monitoring configurations of the specified Extension 2.0
   * @param extensionName the name of the requested extension 2.0
   * @param version Filters the resulting set of configurations by extension 2.0 version.
   * @param activeOnly Filters the resulting set of configurations by the active state.
   * @returns list of monitoring configurations
   */
  async listMonitoringConfigurations(
    extensionName: string,
    version?: string,
    activeOnly?: boolean
  ): Promise<ExtensionMonitoringConfiguration[]> {
    return this.httpClient.paginatedCall(`${this.endpoint}/${extensionName}/monitoringConfigurations`, "items", {
      version: version,
      active: activeOnly,
    });
  }

  /**
   * Gets the most recent status of the execution of given monitoring configuration.
   * @param extensionName The name of the requested extension 2.0.
   * @param configurationId The ID of the requested monitoring configuration.
   * @returns the status and timestamp as object
   */
  async getMonitoringConfigurationStatus(extensionName: string, configurationId: string): Promise<ExtensionStatusDto> {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}/status`
    );
  }

  /**
   * Deletes the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @returns response data
   */
  async deleteMonitoringConfiguration(extensionName: string, configurationId: string) {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`,
      {},
      "DELETE"
    );
  }

  /**
   * Gets the details of the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @returns details of the monitoring configuration object
   */
  async getMonitoringConfiguration(extensionName: string, configurationId: string) {
    return this.httpClient.makeRequest(`${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`);
  }

  /**
   * Updates the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @param configurationDetails The new details of the configuration object
   * @returns response data
   */
  async putMonitoringConfiguration(extensionName: string, configurationId: string, configurationDetails: any) {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`,
      configurationDetails,
      "PUT"
    );
  }

  async postMonitoringConfiguration(extensionName: string, configurationDetails: any) {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/monitoringConfigurations`,
      configurationDetails,
      "POST"
    );
  }

  async getExtensionSchema(extensionName: string, extensionVersion: string) {
    return this.httpClient.makeRequest(`${this.endpoint}/${extensionName}/${extensionVersion}/schema`);
  }
}
