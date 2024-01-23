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
import { Dashboard } from "../interfaces/dashboards";

/**
 * Implementation of the Dashboards API.
 */
export class DashboardService {
  private readonly httpClient: HttpClient;
  private readonly endpoint = "/api/config/v1/dashboards";

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Create a dashboard
   * @param dashboard dashboard definition
   * @returns
   */
  async post(dashboard: Dashboard) {
    return this.httpClient.makeRequest({
      path: this.endpoint,
      params: dashboard as unknown as Record<string, unknown>,
      method: "POST",
    });
  }
}
