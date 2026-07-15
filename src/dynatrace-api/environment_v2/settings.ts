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
import { SettingsServiceInterface } from "../interfaces/services";
import { SchemaStub, SettingsObject } from "../interfaces/settings";

/**
 * Implementation of the Settings 2.0 API
 */
export class SettingsService implements SettingsServiceInterface {
  private readonly schemasEndpoint = "/api/v2/settings/schemas";
  private readonly objectsEndpoint = "/api/v2/settings/objects";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Lists all available settings schemas
   * @param signal cancellation signal
   * @returns schemas
   */
  async listSchemas(signal?: AbortSignal): Promise<SchemaStub[]> {
    return this.httpClient.paginatedCall({ path: this.schemasEndpoint, item: "items", signal });
  }

  /**
   * Lists persisted settings objects for selected schemas at selected scopes (or entities).
   * If nothing is persisted, no items will be returned.
   * @param schemaIds A list of comma-separated schema IDs to which the requested objects belong.
   * @param scopes A list of comma-separated scopes, that the requested objects target.
   * @param fields A list of fields to be included to the response. The provided set of fields
   * replaces the default set.
   * @param pageSize The amount of settings objects in a single response payload.
   * @param signal cancellation signal
   * @returns list of settings objects matching criteria
   */
  async listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number,
    signal?: AbortSignal,
  ): Promise<SettingsObject[]> {
    return this.httpClient.paginatedCall({
      path: this.objectsEndpoint,
      item: "items",
      params: { schemaIds, scopes, fields, pageSize },
      signal,
    });
  }

  /**
   * Fetches a single settings schema by its ID.
   * @param schemaId The full schema ID (e.g., "builtin:openpipeline.metrics.pipelines")
   * @param signal cancellation signal
   * @returns the raw schema definition
   */
  async getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown> {
    return this.httpClient.makeRequest({
      path: `${this.schemasEndpoint}/${schemaId}`,
      signal,
    });
  }
}
