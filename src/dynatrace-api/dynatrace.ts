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

import { DeploymentModel } from "../interfaces/treeViews";
import { CredentialVaultService } from "./configuration_v1/credentialVault";
import { DashboardService } from "./configuration_v1/dashboards";
import { ExtensionsServiceV1 } from "./configuration_v1/extensions";
import { ActiveGatesService } from "./environment_v2/activegates";
import { ExtensionsServiceV2 } from "./environment_v2/extensions";
import { MetricService } from "./environment_v2/metrics";
import { EntityServiceV2 } from "./environment_v2/monitoredEntities";
import { SettingsService } from "./environment_v2/settings";
import { HttpClient } from "./http_client";
import {
  ActiveGatesServiceInterface,
  CredentialVaultServiceInterface,
  DashboardServiceInterface,
  EntityServiceV2Interface,
  ExtensionsServiceV1Interface,
  ExtensionsServiceV2Interface,
  MetricServiceInterface,
  SettingsServiceInterface,
} from "./interfaces/services";
import { SaaSDynatraceClient } from "./sdk/sdkDynatraceClient";

/**
 * Common interface for Dynatrace API clients, regardless of deployment model.
 */
export interface DynatraceClient {
  readonly extensionsV2: ExtensionsServiceV2Interface;
  readonly extensionsV1: ExtensionsServiceV1Interface;
  readonly credentialVault: CredentialVaultServiceInterface;
  readonly entitiesV2: EntityServiceV2Interface;
  readonly metrics: MetricServiceInterface;
  readonly settings: SettingsServiceInterface;
  readonly dashboards: DashboardServiceInterface;
  readonly activeGates: ActiveGatesServiceInterface;
}

/**
 * Managed/on-prem implementation of the Dynatrace API client.
 * Uses the existing HttpClient-based transport.
 */
export class ManagedDynatraceClient implements DynatraceClient {
  private readonly _httpClient: HttpClient;
  public readonly extensionsV2: ExtensionsServiceV2;
  public readonly extensionsV1: ExtensionsServiceV1;
  public readonly credentialVault: CredentialVaultService;
  public readonly entitiesV2: EntityServiceV2;
  public readonly metrics: MetricService;
  public readonly settings: SettingsService;
  public readonly dashboards: DashboardService;
  public readonly activeGates: ActiveGatesService;

  constructor(baseUrl: string, apiToken: string) {
    this._httpClient = new HttpClient(baseUrl, apiToken);
    this.extensionsV2 = new ExtensionsServiceV2(this._httpClient);
    this.credentialVault = new CredentialVaultService(this._httpClient);
    this.entitiesV2 = new EntityServiceV2(this._httpClient);
    this.metrics = new MetricService(this._httpClient);
    this.settings = new SettingsService(this._httpClient);
    this.dashboards = new DashboardService(this._httpClient);
    this.extensionsV1 = new ExtensionsServiceV1(this._httpClient);
    this.activeGates = new ActiveGatesService(this._httpClient);
  }
}

/**
 * Creates a Dynatrace API client appropriate for the given deployment model.
 * @param url base URL of the Dynatrace environment
 * @param token API or platform token
 * @param deploymentModel "managed" or "saas"
 */
export function createDynatraceClient(
  url: string,
  token: string,
  deploymentModel: DeploymentModel,
): DynatraceClient {
  switch (deploymentModel) {
    case "managed":
      return new ManagedDynatraceClient(url, token);
    case "saas":
      return new SaaSDynatraceClient(url, token);
  }
}

/** @deprecated Use DynatraceClient instead. Kept for backward compatibility. */
export type Dynatrace = DynatraceClient;
