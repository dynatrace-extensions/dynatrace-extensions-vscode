import { HttpClient } from "../http_client";

/**
 * Implementation of the Extensions V2 API
 */
export class ExtensionsServiceV2 {
  endpoint: string;
  schemaEndpoint: string;
  httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.endpoint = "/api/v2/extensions";
    this.schemaEndpoint = "/api/v2/extensions/schemas";
  }

  /**
   * Gets the list of schema versions available on the cluster.
   * @returns list of versions
   */
  async listSchemaVersions(): Promise<string[]> {
    return this.httpClient
      .makeRequest(this.schemaEndpoint)
      .then((res: SchemaList) => res.versions.reverse());
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
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionName}/${version}`,
      {},
      "DELETE"
    );
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
}
