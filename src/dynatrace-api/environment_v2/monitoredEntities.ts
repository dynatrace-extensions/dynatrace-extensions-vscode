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
 * Implementation of the Monitored Entities V2 API
 */
export class EntityServiceV2 {
  private readonly endpoint = "/api/v2/entities";
  private readonly typesEndpoint = "/api/v2/entityTypes";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Gets the list of all monitored entities matching the query parameters.
   * @param entitySelector Defines the scope of the query. Only entities matching the specified
   * criteria are included into response.
   * @param from The start of the requested timeframe. Defaults to now-3d.
   * @param to The end of the requested timeframe. Defaults to current timestamp.
   * @param fields Defines the list of entity properties included in the response. The ID and the
   * name of an entity are always included to the response.
   * @param sort Defines the ordering of the entities returned.
   * @returns list of entities
   */
  async list(
    entitySelector: string,
    from?: string,
    to?: string,
    fields?: string,
    sort?: string,
  ): Promise<Entity[]> {
    return this.httpClient.paginatedCall(this.endpoint, "entities", {
      entitySelector: entitySelector,
      from: from,
      to: to,
      fields: fields,
      sort: sort,
    });
  }

  /**
   * Gets the details of the specified monitored entity.
   * @param entityId The ID of the required entity.
   * @param from The start of the requested timeframe. Defaults to now-3d.
   * @param to The end of the requested timeframe. Defaults to current timestamp.
   * @param fields Defines the list of entity properties included in the response. The ID and the
   * name of an entity are always included to the response.
   * @returns the requested entity
   */
  async get(entityId: string, from?: string, to?: string, fields?: string) {
    return this.httpClient.makeRequest(`${this.endpoint}/${entityId}`, {
      from: from,
      to: to,
      fields: fields,
    });
  }

  /**
   * Fetches the list of all entity types within Dynatrace
   * @returns list of entity types
   */
  async listTypes(): Promise<EntityType[]> {
    return this.httpClient.paginatedCall(this.typesEndpoint, "types", { pageSize: 500 });
  }

  /**
   * Fetches the details of a given entity type
   * @param type the entity type to fetch details for
   * @returns details of the entity type
   */
  async getType(type: string): Promise<EntityType> {
    return this.httpClient.makeRequest(`${this.typesEndpoint}/${type}`);
  }
}
