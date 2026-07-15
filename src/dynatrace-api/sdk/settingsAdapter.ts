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

import {
  SettingsObject as SdkSettingsObject,
  SettingsObjectsClient,
  SettingsSchemasClient,
} from "@dynatrace-sdk/client-settings";
import { wrapSdkError } from "../errors";
import { SettingsServiceInterface } from "../interfaces/services";
import { SchemaStub, SettingsObject } from "../interfaces/settings";
import { RateLimitRetryHandler } from "../rateLimitHandler";

/**
 * SaaS adapter for Settings 2.0 API — wraps the official @dynatrace-sdk/client-settings
 * clients to match the existing SettingsServiceInterface. Read-only: the platform token
 * carries read scope, and no consumer exercises write operations.
 */
export class SdkSettingsService implements SettingsServiceInterface {
  private readonly retryHandler: RateLimitRetryHandler;

  constructor(
    private readonly settingsObjects: SettingsObjectsClient,
    private readonly settingsSchemas: SettingsSchemasClient,
    retryHandler?: RateLimitRetryHandler,
  ) {
    this.retryHandler = retryHandler ?? new RateLimitRetryHandler();
  }

  async listSchemas(signal?: AbortSignal): Promise<SchemaStub[]> {
    try {
      const response = await this.retryHandler.execute(
        () => this.settingsSchemas.listSchemaDefinitions({ abortSignal: signal }),
        signal,
      );
      return response.items.map(item => ({
        schemaId: item.schemaId,
        latestSchemaVersion: item.latestSchemaVersion,
        displayName: item.displayName,
      }));
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number,
    signal?: AbortSignal,
  ): Promise<SettingsObject[]> {
    try {
      const allItems: SettingsObject[] = [];
      let pageKey: string | undefined;

      do {
        const response = await this.retryHandler.execute(
          () =>
            this.settingsObjects.listSettingsObjects(
              pageKey
                ? { pageKey, abortSignal: signal }
                : {
                    schemaId: schemaIds,
                    scope: scopes,
                    addFields: fields,
                    pageSize,
                    abortSignal: signal,
                  },
            ),
          signal,
        );
        allItems.push(...response.items.map(mapSettingsObject));
        pageKey = response.nextPageKey;
      } while (pageKey);

      return allItems;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.retryHandler.execute(
        () => this.settingsSchemas.getSchemaDefinition({ schemaId, abortSignal: signal }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }
}

/**
 * Maps an SDK settings object to the local DTO. The SDK exposes richer modification
 * metadata; the local shape flattens it (author/created/modified) and treats the
 * optimistic-locking `version` as the update token.
 */
function mapSettingsObject(obj: SdkSettingsObject): SettingsObject {
  return {
    objectId: obj.objectId,
    externalId: obj.externalId ?? "",
    schemaId: obj.schemaId ?? "",
    schemaVersion: obj.schemaVersion ?? "",
    scope: obj.scope ?? "",
    value: obj.value,
    summary: obj.summary ?? "",
    author: obj.modificationInfo?.createdBy ?? "",
    created: obj.modificationInfo?.createdTime?.getTime() ?? 0,
    modified: obj.modificationInfo?.lastModifiedTime?.getTime() ?? 0,
    updateToken: obj.version,
  };
}
