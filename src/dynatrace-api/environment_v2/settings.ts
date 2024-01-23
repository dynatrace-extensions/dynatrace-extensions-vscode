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
  SchemaStub,
  SettingsObject,
  SettingsObjectCreate,
  SettingsObjectUpdate,
} from "../interfaces/settings";

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
    return this.httpClient.paginatedCall({ path: this.schemasEndpoint, item: "items" });
  }

  /**
   * Lists persisted settings objects for selected schemas at selected scopes (or entities).
   * If nothing is persisted, no items will be returned.
   * @param schemaIds A list of comma-separated schema IDs to which the requested objects belong.
   * @param scopes A list of comma-separated scopes, that the requested objects target.
   * @param fields A list of fields to be included to the response. The provided set of fields
   * replaces the default set.
   * @param pageSize The amount of settings objects in a single response payload.
   * @returns list of settings objects matching criteria
   */
  async listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number,
  ): Promise<SettingsObject[]> {
    return this.httpClient.paginatedCall({
      path: this.objectsEndpoint,
      item: "items",
      params: {
        schemaIds: schemaIds,
        scopes: scopes,
        fields: fields,
        pageSize: pageSize,
      },
    });
  }

  /**
   * Updates an existing settings object.
   * @param objectId The ID of the required settings object.
   * @param payload The updated details of the settings object.
   * @returns
   */
  async putObject(objectId: string, payload: SettingsObjectUpdate) {
    return this.httpClient.makeRequest({
      path: `${this.objectsEndpoint}/${objectId}`,
      method: "PUT",
      body: payload as unknown as Record<string, unknown>,
    });
  }

  /**
   * Creates a new settings object.
   * You can upload several objects at once. In that case each object returns its own response code.
   * @param payload Contains the settings objects to be created.
   * @param validateOnly If true, the request runs only validation of the submitted settings objects
   * without saving them.
   * @returns
   */
  async postObject(payload: SettingsObjectCreate[], validateOnly: boolean = false) {
    return this.httpClient.makeRequest({
      path: `${this.objectsEndpoint}`,
      method: "POST",
      body: payload as unknown as Record<string, unknown>,
      params: { validateOnly: validateOnly },
    });
  }
}
