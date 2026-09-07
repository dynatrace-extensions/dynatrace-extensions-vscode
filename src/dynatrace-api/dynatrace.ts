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
  DqlServiceInterface,
  EntityServiceV2Interface,
  ExtensionsServiceV1Interface,
  ExtensionsServiceV2Interface,
  MetricServiceInterface,
  SettingsServiceInterface,
} from "./interfaces/services";
import { RateLimitConfig, RateLimitRetryHandler } from "./rateLimitHandler";
import { SdkCredentialVaultAdapter } from "./sdk/credentialVaultAdapter";
import { SdkDqlService } from "./sdk/dqlAdapter";
import { SdkExtensionsServiceV2 } from "./sdk/extensionsAdapter";
import { createSdkClients } from "./sdk/sdkClientFactory";
import { SdkSettingsService } from "./sdk/settingsAdapter";
import {
  StubbedActiveGatesService,
  StubbedDashboardService,
  StubbedDqlService,
  StubbedEntityServiceV2,
  StubbedExtensionsServiceV1,
  StubbedMetricService,
} from "./sdk/stubs";

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
  readonly dql: DqlServiceInterface;
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
  public readonly dql: DqlServiceInterface;

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
    this.dql = new StubbedDqlService();
  }
}

/**
 * SaaS platform implementation of the Dynatrace API client.
 * Uses SDK clients for extensions and settings, stubs for everything else.
 */
export class SaaSDynatraceClient implements DynatraceClient {
  public readonly extensionsV2: ExtensionsServiceV2Interface;
  public readonly extensionsV1: ExtensionsServiceV1Interface;
  public readonly credentialVault: CredentialVaultServiceInterface;
  public readonly entitiesV2: EntityServiceV2Interface;
  public readonly metrics: MetricServiceInterface;
  public readonly settings: SettingsServiceInterface;
  public readonly dashboards: DashboardServiceInterface;
  public readonly activeGates: ActiveGatesServiceInterface;
  public readonly dql: DqlServiceInterface;

  constructor(baseUrl: string, platformToken: string, rateLimitConfig?: Partial<RateLimitConfig>) {
    const clients = createSdkClients(baseUrl, platformToken);
    const retryHandler = new RateLimitRetryHandler(rateLimitConfig);

    this.extensionsV2 = new SdkExtensionsServiceV2(
      clients.extensions,
      clients.schemas,
      clients.discovery,
      retryHandler,
    );
    this.settings = new SdkSettingsService(
      clients.settingsObjects,
      clients.settingsSchemas,
      retryHandler,
    );
    this.credentialVault = new SdkCredentialVaultAdapter(clients.credentialVault, retryHandler);
    this.dql = new SdkDqlService(clients.queryAssistance, clients.queryExecution);

    // Stubbed services — not yet supported on SaaS
    this.extensionsV1 = new StubbedExtensionsServiceV1();
    this.entitiesV2 = new StubbedEntityServiceV2();
    this.metrics = new StubbedMetricService();
    this.dashboards = new StubbedDashboardService();
    this.activeGates = new StubbedActiveGatesService();
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
  rateLimitConfig?: Partial<RateLimitConfig>,
): DynatraceClient {
  switch (deploymentModel) {
    case "managed":
      return new ManagedDynatraceClient(url, token);
    case "saas":
      return new SaaSDynatraceClient(url, token, rateLimitConfig);
  }
}

/** @deprecated Use DynatraceClient instead. Kept for backward compatibility. */
export type Dynatrace = DynatraceClient;
