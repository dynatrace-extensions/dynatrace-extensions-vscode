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
import {
  ExtensionMonitoringConfiguration,
  ExtensionStatusDto,
  MinimalExtension,
  SchemaFiles,
  SchemaList,
} from "../interfaces/extensions";

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
   * @param signal cancellation signal
   * @returns list of versions
   */
  async listSchemaVersions(signal?: AbortSignal): Promise<string[]> {
    return this.httpClient
      .makeRequest<SchemaList>({ path: this.schemaEndpoint, signal })
      .then(res => res.versions.reverse());
  }

  /**
   * Gets the list of schema files of a specific version.
   * @param version valid schema version available on the cluster
   * @param signal cancellation signal
   * @returns list of file names
   */
  async listSchemaFiles(version: string, signal?: AbortSignal): Promise<string[]> {
    return this.httpClient
      .makeRequest<SchemaFiles>({
        path: `${this.schemaEndpoint}/${version}`,
        headers: { accept: "application/json; charset=utf-8" },
        signal,
      })
      .then(res => res.files);
  }

  /**
   * Gets the content of a schema file for a specific version
   * @param version valid schema version available on the cluster
   * @param fileName the name of the schema file
   * @param signal cancellation signal
   * @returns response data
   */
  async getSchemaFile(
    version: string,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.httpClient.makeRequest({
      path: `${this.schemaEndpoint}/${version}/${fileName}`,
      signal,
    });
  }

  /**
   * Lists all versions of the extension 2.0
   * @param extensionName the extension name (ID)
   * @param signal cancellation signal
   * @returns list of versions
   */
  async listVersions(extensionName: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    return this.httpClient.paginatedCall<MinimalExtension>({
      path: `${this.endpoint}/${extensionName}`,
      item: "extensions",
      signal,
    });
  }

  /**
   * Deletes the specified version of the extension 2.0
   * @param extensionName extension name (ID)
   * @param version version to delete
   * @param signal cancellation signal
   * @returns response data
   */
  async deleteVersion(extensionName: string, version: string, signal?: AbortSignal) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/${version}`,
      method: "DELETE",
      signal,
    });
  }

  /**
   * Uploads or verifies a new extension 2.0
   * @param file the extension archive as a Buffer
   * @param validateOnly whether to only validate or also upload
   * @param signal cancellation signal
   * @returns response data
   */
  async upload(file: Buffer, validateOnly = false, signal?: AbortSignal) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}`,
      method: "POST",
      params: { validateOnly: validateOnly },
      file,
      signal,
    });
  }

  /**
   * Updates the active environment configuration version of the extension 2.0
   * @param extensionName name of the extension to activate
   * @param version the version to activate
   * @param signal cancellation signal
   * @returns response data
   */
  async putEnvironmentConfiguration(extensionName: string, version: string, signal?: AbortSignal) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/environmentConfiguration`,
      method: "PUT",
      body: { version: version },
      signal,
    });
  }

  /**
   * Lists all the extensions 2.0 available in the environment.
   * @param name Filters the resulting set of extensions 2.0 by name.
   *             You can specify a partial name. In that case, the CONTAINS operator is used.
   * @param signal cancellation signal
   * @returns the list of extensions
   */
  async list(name?: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    return this.httpClient.paginatedCall({
      path: `${this.endpoint}`,
      item: "extensions",
      params: { name: name },
      signal,
    });
  }

  /**
   * Lists all the monitoring configurations of the specified Extension 2.0
   * @param extensionName the name of the requested extension 2.0
   * @param version Filters the resulting set of configurations by extension 2.0 version.
   * @param activeOnly Filters the resulting set of configurations by the active state.
   * @param signal cancellation signal
   * @returns list of monitoring configurations
   */
  async listMonitoringConfigurations(
    extensionName: string,
    version?: string,
    activeOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration[]> {
    return this.httpClient.paginatedCall<ExtensionMonitoringConfiguration>({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations`,
      item: "items",
      params: { version: version, active: activeOnly },
      signal,
    });
  }

  /**
   * Gets the most recent status of the execution of given monitoring configuration.
   * @param extensionName The name of the requested extension 2.0.
   * @param configurationId The ID of the requested monitoring configuration.
   * @param signal cancellation signal
   * @returns the status and timestamp as object
   */
  async getMonitoringConfigurationStatus(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionStatusDto> {
    return this.httpClient.makeRequest<ExtensionStatusDto>({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}/status`,
      signal,
    });
  }

  /**
   * Deletes the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @param signal cancellation signal
   * @returns response data
   */
  async deleteMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`,
      method: "DELETE",
      signal,
    });
  }

  /**
   * Gets the details of the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @param signal cancellation signal
   * @returns details of the monitoring configuration object
   */
  async getMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration> {
    return this.httpClient.makeRequest<ExtensionMonitoringConfiguration>({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`,
      signal,
    });
  }

  /**
   * Updates the specified monitoring configuration.
   * @param extensionName The name of the requested extension 2.0
   * @param configurationId The ID of the requested monitoring configuration
   * @param configurationDetails The new details of the configuration object
   * @param signal cancellation signal
   * @returns response data
   */
  async putMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations/${configurationId}`,
      method: "PUT",
      body: configurationDetails,
      signal,
    });
  }

  /**
   * Creates a new monitoring configuration for the requested extension, using
   * the provided configuration details
   * @param extensionName name of the extension to configure
   * @param configurationDetails details of the monitoring configuration
   * @param signal cancellation signal
   * @returns response data
   */
  async postMonitoringConfiguration(
    extensionName: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/monitoringConfigurations`,
      method: "POST",
      body: configurationDetails,
      signal,
    });
  }

  /**
   * Gets the settings 2.0 schema for an extension 2.0
   * @param extensionName name of the requested extension
   * @param extensionVersion version of the requested extension
   * @param signal cancellation signal
   * @returns schema of the extension
   */
  async getExtensionSchema(extensionName: string, extensionVersion: string, signal?: AbortSignal) {
    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/${extensionVersion}/schema`,
      signal,
    });
  }

  /**
   * Gets the details of the specified version of the extension 2.0.
   * @param extensionName name of the requested extension
   * @param extensionVersion version of the requested extension
   * @param downloadPackage if false, only the metadata of the extension is fetched
   * @param signal cancellation signal
   * @returns either JSON metadata or extension zip package
   */
  async getExtension(
    extensionName: string,
    extensionVersion: string,
    downloadPackage: boolean = false,
    signal?: AbortSignal,
  ) {
    const headers: Record<string, string> = {};
    headers.Accept = downloadPackage
      ? "application/octet-stream"
      : "application/json; charset=utf-8";

    return this.httpClient.makeRequest({
      path: `${this.endpoint}/${extensionName}/${extensionVersion}`,
      headers,
      responseType: downloadPackage ? "arraybuffer" : "json",
      signal,
    });
  }
}
