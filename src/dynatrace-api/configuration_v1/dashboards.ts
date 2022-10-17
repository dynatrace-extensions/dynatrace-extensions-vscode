import { HttpClient } from "../http_client";

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
    return this.httpClient.makeRequest(this.endpoint, dashboard, "POST");
  }
}
