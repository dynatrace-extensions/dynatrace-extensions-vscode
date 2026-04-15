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

import { DynatraceClient } from "../dynatrace";
import {
  ActiveGatesServiceInterface,
  CredentialVaultServiceInterface,
  DashboardServiceInterface,
  EntityServiceV2Interface,
  ExtensionsServiceV1Interface,
  ExtensionsServiceV2Interface,
  MetricServiceInterface,
  SettingsServiceInterface,
} from "../interfaces/services";
import { RateLimitConfig, RateLimitRetryHandler } from "../rateLimitHandler";
import { SdkExtensionsServiceV2 } from "./extensionsAdapter";
import { createSdkClients } from "./sdkClientFactory";
import { SdkSettingsService } from "./settingsAdapter";
import {
  StubbedActiveGatesService,
  StubbedCredentialVaultService,
  StubbedDashboardService,
  StubbedEntityServiceV2,
  StubbedExtensionsServiceV1,
  StubbedMetricService,
} from "./stubs";

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

  constructor(baseUrl: string, platformToken: string, rateLimitConfig?: Partial<RateLimitConfig>) {
    const clients = createSdkClients(baseUrl, platformToken);
    const retryHandler = new RateLimitRetryHandler(rateLimitConfig);

    this.extensionsV2 = new SdkExtensionsServiceV2(
      clients.definitions,
      clients.configurations,
      clients.schema,
      clients.environment,
      clients.discovery,
      retryHandler,
    );
    this.settings = new SdkSettingsService(
      clients.settingsObjects,
      clients.settingsSchemas,
      retryHandler,
    );

    // Stubbed services — not yet supported on SaaS
    this.extensionsV1 = new StubbedExtensionsServiceV1();
    this.credentialVault = new StubbedCredentialVaultService();
    this.entitiesV2 = new StubbedEntityServiceV2();
    this.metrics = new StubbedMetricService();
    this.dashboards = new StubbedDashboardService();
    this.activeGates = new StubbedActiveGatesService();
  }
}
