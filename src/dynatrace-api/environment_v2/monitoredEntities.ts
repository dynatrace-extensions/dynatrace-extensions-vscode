import { HttpClient } from "../http_client";

/**
 * Implementation of the Monitored Entities V2 API
 */
export class EntityServiceV2 {
  endpoint: string;
  typesEndpoint: string;
  httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.endpoint = "/api/v2/entities";
    this.typesEndpoint = "/api/v2/entityTypes";
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
