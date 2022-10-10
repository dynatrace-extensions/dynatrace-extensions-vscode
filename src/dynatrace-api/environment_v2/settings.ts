import { HttpClient } from "../http_client";

/**
 * Implementation of the Settings 2.0 API
 */
export class SettingsService {
  private readonly schemasEndpoint = "/api/v2/settings/schemas";
  private readonly objectsEndpoint = "/api/v2/settings/objects";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Lists all available settings schemas
   * @returns schemas
   */
  async listSchemas(): Promise<SchemaStub[]> {
    return this.httpClient.paginatedCall(this.schemasEndpoint, "items");
  }

  /**
   * Lists persisted settings objects for selected schemas at selected scopes (or entities).
   * If nothing is persisted, no items will be returned.
   * @param schemaIds A list of comma-separated schema IDs to which the requested objects belong.
   * @param scopes A list of comma-separated scopes, that the requested objects target.
   * @param fields A list of fields to be included to the response. The provided set of fields replaces the default set.
   * @param pageSize The amount of settings objects in a single response payload.
   * @returns list of settings objects matching criteria
   */
  async listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number
  ): Promise<SettingsObject[]> {
    return this.httpClient.paginatedCall(this.objectsEndpoint, "items", {
      schemaIds: schemaIds,
      scopes: scopes,
      fields: fields,
      pageSize: pageSize,
    });
  }

  /**
   * Updates an existing settings object.
   * @param objectId The ID of the required settings object.
   * @param payload The updated details of the settings object.
   * @returns
   */
  async putObject(objectId: string, payload: SettingsObjectUpdate) {
    return this.httpClient.makeRequest(`${this.objectsEndpoint}/${objectId}`, payload, "PUT");
  }

  /**
   * Creates a new settings object.
   * You can upload several objects at once. In that case each object returns its own response code.
   * @param validateOnly If true, the request runs only validation of the submitted settings objects, without saving them.
   * @param payload Contains the settings objects to be created.
   * @returns
   */
  async postObject(validateOnly: boolean = false, payload: SettingsObjectCreate[]) {
    return this.httpClient.makeRequest(`${this.objectsEndpoint}`, payload, "POST");
  }
}
