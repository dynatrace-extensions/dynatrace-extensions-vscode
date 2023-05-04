/**
  Copyright 2023 Dynatrace LLC

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
import { ExtensionV1DTO, ExtensionV1ListDto } from "../interfaces/extensions";

/**
 * Implementation of the Extensions V2 API
 */
export class ExtensionsServiceV1 {
  private readonly endpoint = "/api/config/v1/extensions";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Gets the list of uploaded v1 extensions.
   * @returns list of extensions
   */
  async getExtensions(): Promise<ExtensionV1DTO[]> {
    const extensions: ExtensionV1DTO[] = [];
    let nextPageKey;
    do {
      const res: ExtensionV1ListDto = await this.httpClient.makeRequest<ExtensionV1ListDto>(
        this.endpoint,
        {
          nextPageKey: nextPageKey,
        },
      );
      extensions.push(...res.extensions);
      nextPageKey = res.nextPageKey;
    } while (nextPageKey);
    return extensions;
  }

  /**
   * Get the binary of a v1 extension
   * @param extensionId the id of the extension
   * @returns the binary of the extension
   */
  async getExtensionBinary(extensionId: string): Promise<Uint8Array> {
    return this.httpClient.makeRequest(
      `${this.endpoint}/${extensionId}/binary`,
      undefined,
      "GET",
      {},
      undefined,
      undefined,
      "arraybuffer",
    );
  }
}
