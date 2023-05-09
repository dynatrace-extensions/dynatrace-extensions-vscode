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
import { ActiveGate } from "../interfaces/activegates";

/**
 * Implementation of the ActiveGates API
 */
export class ActiveGatesService {
  private readonly endpoint = "/api/v2/activegates";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * List all available ActiveGates
   * The response includes all ActiveGates that are currently connected to the environment or have
   * been connected during last 2 hours.
   * @param params query string parameters for the request
   * @returns list of ActiveGates
   */
  async list(params?: Record<string, unknown>): Promise<ActiveGate[]> {
    return this.httpClient.paginatedCall<ActiveGate>(this.endpoint, "activeGates", params);
  }
}
