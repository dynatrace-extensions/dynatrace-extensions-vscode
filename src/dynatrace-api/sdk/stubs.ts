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

import { MetricSeriesCollection } from "@common";
import logger from "../../utils/logging";
import { ActiveGate } from "../interfaces/activegates";
import { CredentialsResponseElement } from "../interfaces/credentialVault";
import { Dashboard } from "../interfaces/dashboards";
import { ExtensionV1DTO } from "../interfaces/extensions";
import { Entity, EntityType } from "../interfaces/monitoredEntities";
import {
  ActiveGatesServiceInterface,
  CredentialVaultServiceInterface,
  DashboardServiceInterface,
  EntityServiceV2Interface,
  ExtensionsServiceV1Interface,
  MetricServiceInterface,
} from "../interfaces/services";

const logTrace = ["dynatrace-api", "sdk", "stubs"];

function notSupported(service: string): never {
  throw new Error(`${service} is not supported on SaaS platform.`);
}

/**
 * Stub: Entity queries via DQL are deferred to a later phase.
 */
export class StubbedEntityServiceV2 implements EntityServiceV2Interface {
  async list(
    _entitySelector: string,
    _from?: string,
    _to?: string,
    _fields?: string,
    _sort?: string,
    _signal?: AbortSignal,
  ): Promise<Entity[]> {
    logger.info("Entity queries via DQL not yet supported on SaaS. Returning empty.", ...logTrace);
    return [];
  }

  async get(_entityId: string): Promise<unknown> {
    notSupported("Entity queries (DQL)");
  }

  async listTypes(_signal?: AbortSignal): Promise<EntityType[]> {
    logger.info(
      "Entity type queries via DQL not yet supported on SaaS. Returning empty.",
      ...logTrace,
    );
    return [];
  }

  async getType(_type: string): Promise<EntityType> {
    notSupported("Entity type queries (DQL)");
  }
}

/**
 * Stub: Metric queries via DQL are deferred to a later phase.
 */
export class StubbedMetricService implements MetricServiceInterface {
  async query(
    _metricSelector: string,
    _resolution?: string,
    _from?: string,
    _to?: string,
    _entitySelector?: string,
    _mzSelector?: string,
    _signal?: AbortSignal,
  ): Promise<MetricSeriesCollection[]> {
    logger.info("Metric queries via DQL not yet supported on SaaS. Returning empty.", ...logTrace);
    return [];
  }
}

/**
 * Stub: Credential vault management for SaaS is not yet supported.
 */
export class StubbedCredentialVaultService implements CredentialVaultServiceInterface {
  async postCertificate(
    _certificate: string,
    _name: string,
    _description?: string,
    _signal?: AbortSignal,
  ): Promise<{ id: string }> {
    notSupported("Credential vault");
  }

  async putCertificate(
    _certificateId: string,
    _certificate: string,
    _name: string,
    _description?: string,
    _signal?: AbortSignal,
  ): Promise<unknown> {
    notSupported("Credential vault");
  }

  async getCertificate(
    _certificateId: string,
    _signal?: AbortSignal,
  ): Promise<CredentialsResponseElement> {
    notSupported("Credential vault");
  }
}

/**
 * Stub: Extensions V1 API is not available on SaaS.
 */
export class StubbedExtensionsServiceV1 implements ExtensionsServiceV1Interface {
  async getExtensions(_signal?: AbortSignal): Promise<ExtensionV1DTO[]> {
    notSupported("Extensions V1 API");
  }

  async getExtensionBinary(_extensionId: string, _signal?: AbortSignal): Promise<Uint8Array> {
    notSupported("Extensions V1 API");
  }
}

/**
 * Stub: Dashboard API is not available on SaaS.
 */
export class StubbedDashboardService implements DashboardServiceInterface {
  async post(_dashboard: Dashboard, _signal?: AbortSignal): Promise<unknown> {
    notSupported("Dashboard API");
  }
}

/**
 * Stub: ActiveGates API is not available on SaaS.
 */
export class StubbedActiveGatesService implements ActiveGatesServiceInterface {
  async list(_params?: Record<string, unknown>, _signal?: AbortSignal): Promise<ActiveGate[]> {
    notSupported("ActiveGates API");
  }
}
