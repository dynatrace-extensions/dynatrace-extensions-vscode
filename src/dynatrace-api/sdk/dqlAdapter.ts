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

import { QueryAssistanceClient, QueryExecutionClient } from "@dynatrace-sdk/client-query";
import { wrapSdkError } from "../errors";
import { DqlQueryResult, DqlVerifyResult } from "../interfaces/dql";
import { DqlServiceInterface } from "../interfaces/services";

/**
 * SaaS adapter for DQL — wraps QueryAssistanceClient and QueryExecutionClient
 * to conform to DqlServiceInterface.
 */
export class SdkDqlService implements DqlServiceInterface {
  constructor(
    private readonly assistance: QueryAssistanceClient,
    private readonly execution: QueryExecutionClient,
  ) {}

  async verify(query: string, signal?: AbortSignal): Promise<DqlVerifyResult> {
    try {
      const response = await this.assistance.queryVerify({ body: { query }, abortSignal: signal });
      return {
        valid: response.valid,
        canonicalQuery: response.canonicalQuery,
        notifications: response.notifications?.map(n => ({
          message: n.message,
          severity: n.severity,
        })),
      };
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async execute(query: string, signal?: AbortSignal): Promise<DqlQueryResult> {
    try {
      const response = await this.execution.queryExecute({
        body: { query, requestTimeoutMilliseconds: 5000 },
        abortSignal: signal,
      });

      if (response.state !== "SUCCEEDED") {
        throw wrapSdkError(new Error(`DQL query did not succeed. State: ${response.state}`));
      }

      return {
        records: (response.result?.records ?? []).filter(r => r !== null),
        metadata: response.result?.metadata,
        types: response.result?.types ?? [],
        state: "SUCCEEDED",
      };
    } catch (err) {
      throw wrapSdkError(err);
    }
  }
}
