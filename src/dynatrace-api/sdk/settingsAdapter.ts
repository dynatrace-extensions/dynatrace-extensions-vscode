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

import { DynatraceAPIError, wrapSdkError } from "../errors";
import { SettingsServiceInterface } from "../interfaces/services";
import {
  SchemaStub,
  SettingsObject,
  SettingsObjectCreate,
  SettingsObjectUpdate,
} from "../interfaces/settings";
import { RateLimitRetryHandler } from "../rateLimitHandler";
import { SettingsClient } from "./settingsClient";

/**
 * SaaS adapter for Settings 2.0 API — wraps a custom SettingsClient to match existing service interface.
 */
export class SdkSettingsService implements SettingsServiceInterface {
  private readonly retryHandler: RateLimitRetryHandler;

  constructor(
    private readonly settingsClient: SettingsClient,
    retryHandler?: RateLimitRetryHandler,
  ) {
    this.retryHandler = retryHandler ?? new RateLimitRetryHandler();
  }

  async listSchemas(signal?: AbortSignal): Promise<SchemaStub[]> {
    try {
      return await this.retryHandler.execute(() => this.settingsClient.listSchemas(signal), signal);
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
      return await this.retryHandler.execute(
        () => this.settingsClient.listObjects(schemaIds, scopes, fields, pageSize, signal),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putObject(
    _objectId: string,
    _payload: SettingsObjectUpdate,
    _signal?: AbortSignal,
  ): Promise<unknown> {
    throw new DynatraceAPIError("putObject is not yet supported on the SaaS platform", {
      code: 501,
      constraintViolations: [],
      message: "putObject is not yet supported on the SaaS platform",
    });
  }

  async getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.retryHandler.execute(
        () => this.settingsClient.getSchema(schemaId, signal),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async postObject(
    _payload: SettingsObjectCreate[],
    _validateOnly: boolean = false,
    _signal?: AbortSignal,
  ): Promise<unknown> {
    throw new DynatraceAPIError("postObject is not yet supported on the SaaS platform", {
      code: 501,
      constraintViolations: [],
      message: "postObject is not yet supported on the SaaS platform",
    });
  }
}
