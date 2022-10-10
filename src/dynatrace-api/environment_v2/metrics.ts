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
   * @param metricSelector Selects metrics for the query by their keys. You can select up to 10 metrics for one query.
   * @param resolution The desired resolution of data points.
   * @param from The start of the requested timeframe.
   * @param to The end of the requested timeframe.
   * @param entitySelector Specifies the entity scope of the query. Only data points delivered by matched entities are included in response.
   * @param mzSelector The management zone scope of the query. Only metrics data relating to the specified management zones are included to the response.
   * @returns
   */
  async query(
    metricSelector: string,
    resolution?: string,
    from?: string,
    to?: string,
    entitySelector?: string,
    mzSelector?: string
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
