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
  SettingsObjectsClient,
  SettingsSchemasClient,
  SettingsObject as SdkSettingsObject,
} from "@dynatrace-sdk/client-environment-v2";
import { wrapSdkError } from "../errors";
import { SettingsServiceInterface } from "../interfaces/services";
import {
  SchemaStub,
  SettingsObject,
  SettingsObjectCreate,
  SettingsObjectUpdate,
} from "../interfaces/settings";
import { RateLimitRetryHandler } from "../rateLimitHandler";

/**
 * SaaS adapter for Settings 2.0 API — wraps SDK clients to match existing service interface.
 */
export class SdkSettingsService implements SettingsServiceInterface {
  private readonly retryHandler: RateLimitRetryHandler;

  constructor(
    private readonly objectsClient: SettingsObjectsClient,
    private readonly schemasClient: SettingsSchemasClient,
    retryHandler?: RateLimitRetryHandler,
  ) {
    this.retryHandler = retryHandler ?? new RateLimitRetryHandler();
  }

  async listSchemas(signal?: AbortSignal): Promise<SchemaStub[]> {
    try {
      const res = await this.retryHandler.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- SDK AbortSignal type mismatch
        () => this.schemasClient.getAvailableSchemaDefinitions(signal as any),
        signal,
      );
      return res.items;
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
      const allItems: SdkSettingsObject[] = [];
      let nextPageKey: string | undefined;
      do {
        const pageKey = nextPageKey;
        const res = await this.retryHandler.execute(
          () =>
            this.objectsClient.getSettingsObjects({
              schemaIds,
              scopes,
              fields,
              pageSize,
              nextPageKey: pageKey,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- SDK AbortSignal type mismatch
              abortSignal: signal as any,
            }),
          signal,
        );
        allItems.push(...res.items);
        nextPageKey = res.nextPageKey ?? undefined;
      } while (nextPageKey);
      return allItems.map(mapSdkSettingsObject);
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putObject(objectId: string, payload: SettingsObjectUpdate, signal?: AbortSignal) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.objectsClient.putSettingsObjectByObjectId({
            objectId,
            body: { ...payload, value: payload.value as Record<string, unknown> },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- SDK AbortSignal type mismatch
            abortSignal: signal as any,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.retryHandler.execute(
        () =>
          this.schemasClient.getSchemaDefinition({
            schemaId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- SDK AbortSignal type mismatch
            abortSignal: signal as any,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async postObject(
    payload: SettingsObjectCreate[],
    validateOnly: boolean = false,
    signal?: AbortSignal,
  ) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.objectsClient.postSettingsObjects({
            body: payload.map(p => ({
              schemaId: p.schemaId,
              scope: p.scope,
              schemaVersion: p.schemaVersion,
              externalId: p.externalId,
              insertAfter: p.insertAfter,
              value: (p.value ?? {}) as Record<string, unknown>,
            })),
            validateOnly,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- SDK AbortSignal type mismatch
            abortSignal: signal as any,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }
}

function mapSdkSettingsObject(obj: SdkSettingsObject): SettingsObject {
  return {
    externalId: obj.externalId ?? "",
    schemaId: obj.schemaId ?? "",
    schemaVersion: obj.schemaVersion ?? "",
    author: obj.author ?? "",
    modified: obj.modified ?? 0,
    updateToken: obj.updateToken ?? "",
    objectId: obj.objectId ?? "",
    scope: obj.scope ?? "",
    value: obj.value,
    summary: obj.summary ?? "",
    created: obj.created ?? 0,
  };
}
