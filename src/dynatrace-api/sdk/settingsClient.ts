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

import { PlatformHttpClient } from "@dynatrace-sdk/http-client";
import { SchemaStub, SettingsObject } from "../interfaces/settings";

const SETTINGS_BASE_PATH = "/platform/settings/v1";

interface PaginatedSettingsResponse<T> {
  items: T[];
  nextPageKey?: string;
  totalCount?: number;
}

/**
 * Custom HTTP client for the Platform Settings v1 API.
 * Uses PlatformHttpClient directly instead of the outdated SDK settings clients.
 */
export class SettingsClient {
  constructor(private readonly httpClient: PlatformHttpClient) {}

  async listSchemas(signal?: AbortSignal): Promise<SchemaStub[]> {
    const allItems: SchemaStub[] = [];
    let nextPageKey: string | undefined;

    do {
      const params = new URLSearchParams();
      if (nextPageKey) {
        params.set("nextPageKey", nextPageKey);
      }
      const query = params.toString();
      const url = `${SETTINGS_BASE_PATH}/schemas${query ? `?${query}` : ""}`;

      const response = await this.httpClient.send({
        url,
        method: "GET",
        abortSignal: signal,
      });

      const body = (await response.body<"json">("json")) as PaginatedSettingsResponse<SchemaStub>;
      allItems.push(...body.items);
      nextPageKey = body.nextPageKey;
    } while (nextPageKey);

    return allItems;
  }

  async getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown> {
    const url = `${SETTINGS_BASE_PATH}/schemas/${encodeURIComponent(schemaId)}`;

    const response = await this.httpClient.send({
      url,
      method: "GET",
      abortSignal: signal,
    });

    return response.body("json");
  }

  async listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number,
    signal?: AbortSignal,
  ): Promise<SettingsObject[]> {
    const allItems: SettingsObject[] = [];
    let nextPageKey: string | undefined;

    do {
      const params = new URLSearchParams();
      if (nextPageKey) {
        params.set("nextPageKey", nextPageKey);
      } else {
        if (schemaIds) params.set("schemaIds", schemaIds);
        if (scopes) params.set("scopes", scopes);
        if (fields) params.set("fields", fields);
        if (pageSize !== undefined) params.set("pageSize", String(pageSize));
      }
      const query = params.toString();
      const url = `${SETTINGS_BASE_PATH}/objects${query ? `?${query}` : ""}`;

      const response = await this.httpClient.send({
        url,
        method: "GET",
        abortSignal: signal,
      });

      const body = (await response.body<"json">(
        "json",
      )) as PaginatedSettingsResponse<SettingsObject>;
      allItems.push(...body.items);
      nextPageKey = body.nextPageKey;
    } while (nextPageKey);

    return allItems;
  }
}
