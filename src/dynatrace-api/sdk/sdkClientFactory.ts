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
  ConfigurationsClient,
  DefinitionsClient,
  DiscoveryClient,
  EnvironmentClient,
  SchemaClient,
} from "@dynatrace-internal/client-extensions";
import { CredentialVaultEntriesClient } from "@dynatrace-sdk/client-credential-vault";
import { QueryAssistanceClient, QueryExecutionClient } from "@dynatrace-sdk/client-query";
import { SettingsObjectsClient, SettingsSchemasClient } from "@dynatrace-sdk/client-settings";
import { PlatformHttpClient } from "@dynatrace-sdk/http-client";

export interface SdkClients {
  definitions: DefinitionsClient;
  configurations: ConfigurationsClient;
  schema: SchemaClient;
  environment: EnvironmentClient;
  discovery: DiscoveryClient;
  queryAssistance: QueryAssistanceClient;
  queryExecution: QueryExecutionClient;
  credentialVault: CredentialVaultEntriesClient;
  settingsObjects: SettingsObjectsClient;
  settingsSchemas: SettingsSchemasClient;
}

/**
 * Creates all SDK client instances backed by a single PlatformHttpClient.
 * @param baseUrl the SaaS platform base URL (e.g. https://<id>.apps.dynatrace.com)
 * @param platformToken a Dynatrace platform token
 */
export function createSdkClients(baseUrl: string, platformToken: string): SdkClients {
  const httpClient = new PlatformHttpClient({
    baseUrl,
    defaultHeaders: {
      "Authorization": `Bearer ${platformToken}`,
      "user-agent": "dynatrace-extensions-vscode",
    },
  });

  return {
    definitions: new DefinitionsClient(httpClient),
    configurations: new ConfigurationsClient(httpClient),
    schema: new SchemaClient(httpClient),
    environment: new EnvironmentClient(httpClient),
    discovery: new DiscoveryClient(httpClient),
    queryAssistance: new QueryAssistanceClient(httpClient),
    queryExecution: new QueryExecutionClient(httpClient),
    credentialVault: new CredentialVaultEntriesClient(httpClient),
    settingsObjects: new SettingsObjectsClient(httpClient),
    settingsSchemas: new SettingsSchemasClient(httpClient),
  };
}
