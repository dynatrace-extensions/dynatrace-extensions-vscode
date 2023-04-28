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
 * Implementation of the Metrics V2 API
 */
export class MetricService {
  private readonly endpoint = "/api/v2/metrics";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Gets data points of the specified metrics
   * @param metricSelector Selects metrics for the query by their keys. You can select up to 10
   * metrics for one query.
   * @param resolution The desired resolution of data points.
   * @param from The start of the requested timeframe.
   * @param to The end of the requested timeframe.
   * @param entitySelector Specifies the entity scope of the query. Only data points delivered by
   * matched entities are included in response.
   * @param mzSelector The management zone scope of the query. Only metrics data relating to the
   * specified management zones are included to the response.
   * @returns
   */
  async query(
    metricSelector: string,
    resolution?: string,
    from?: string,
    to?: string,
    entitySelector?: string,
    mzSelector?: string,
  ): Promise<MetricSeriesCollection[]> {
    return this.httpClient.paginatedCall(`${this.endpoint}/query`, "result", {
      metricSelector: metricSelector,
      resolution: resolution,
      from: from,
      to: to,
      entitySelector: entitySelector,
      mzSelector: mzSelector,
    });
  }
}
