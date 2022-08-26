import axios from "axios";
import * as FormData from "form-data";

/**
 * Implementation of a HTTP Client specialised for accessing Dynatrace APIs
 */
export class HttpClient {
  baseUrl: string;
  apiToken: string;

  constructor(baseUrl: string, apiToken: string) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
  }

  /**
   * Makes an HTTP Request with the given details.
   * All requests automatically contain the API Token as Authorization header
   * @param path URL path for the web request endpoint
   * @param params query parameters; in case of POST or PUT it becomes body of request
   * @param method HTTP method to use
   * @param headers additional request headers
   * @param queryParams query parameters; to be used for POST and PUT requests
   * @returns response data
   */
  async makeRequest(
    path: string,
    params?: any,
    method: string = "GET",
    headers: any = {},
    queryParams?: any,
    files?: any
  ): Promise<any> {
    let url = `${this.baseUrl}${path}`;

    let body = null;
    if (method === "POST" || method === "PUT") {
      body = params;
      params = queryParams;
    }

    if (!headers["Content-Type"]) {
      headers["Content-type"] = "application/json";
    }
    var form: FormData;
    if (files) {
      headers["Content-type"] = "multipart/form-data";
      form = new FormData();
      form.append("file", files.file, files.name);
    }
    headers["Authorization"] = `Api-Token ${this.apiToken}`;

    console.debug(
      `Making ${method} request to ${url} ${params ? "with params " + JSON.stringify(params) : ""} ${
        body ? " and body " + JSON.stringify(body) : ""
      }`
    );

    return axios
      .request({
        url: url,
        headers: headers,
        params: params,
        method: method,
        data: files ? form! : body,
      })
      .then((res) => {
        if (res.status >= 400) {
          throw new Error(`Error making request to ${url}: ${res.status}. Response: ${res.data}`);
        }
        return res.data;
      })
      .catch((err) => {
        throw new Error(`Error making request to ${url}: ${err.message}`);
      });
  }

  /**
   * Makes a paginated GET API call, going over all pages and returning the full list of items.
   * @param path path of the API endpoint
   * @param item the attribute in the response that holds the items
   * @param params query parameters
   * @param headers additional request headers
   * @returns list of items
   */
  async paginatedCall(path: string, item: string, params?: any, headers: any = {}): Promise<any[]> {
    var items: any[] = [];
    var nextPageKey: string | undefined = "firstCall";

    if (nextPageKey !== "firstCall") {
      params = { nextPageKey: nextPageKey };
    }
    while (nextPageKey) {
      await this.makeRequest(path, params, "GET", headers).then((res) => {
        nextPageKey = res.nextPageKey;
        items.push(...res[item]);
      });
    }

    return items;
  }
}
