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
import { ActiveGate } from "./activegates";
import { CredentialsResponseElement } from "./credentialVault";
import { Dashboard } from "./dashboards";
import { DqlQueryResult, DqlVerifyResult } from "./dql";
import {
  ExtensionMonitoringConfiguration,
  ExtensionStatusDto,
  ExtensionV1DTO,
  JMXProcess,
  MBeanListDto,
  MinimalExtension,
} from "./extensions";
import { Entity, EntityType } from "./monitoredEntities";
import { SchemaStub, SettingsObject } from "./settings";

export interface ExtensionsServiceV2Interface {
  listSchemaVersions(signal?: AbortSignal): Promise<string[]>;
  listSchemaFiles(version: string, signal?: AbortSignal): Promise<string[]>;
  getSchemaFile(
    version: string,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  listVersions(extensionName: string, signal?: AbortSignal): Promise<MinimalExtension[]>;
  deleteVersion(extensionName: string, version: string, signal?: AbortSignal): Promise<unknown>;
  upload(file: Buffer, validateOnly?: boolean, signal?: AbortSignal): Promise<unknown>;
  putEnvironmentConfiguration(
    extensionName: string,
    version: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  list(name?: string, signal?: AbortSignal): Promise<MinimalExtension[]>;
  listMonitoringConfigurations(
    extensionName: string,
    version?: string,
    activeOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration[]>;
  getMonitoringConfigurationStatus(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionStatusDto>;
  deleteMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  getMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration>;
  putMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  postMonitoringConfiguration(
    extensionName: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  getExtensionSchema(
    extensionName: string,
    extensionVersion: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  getExtension(
    extensionName: string,
    extensionVersion: string,
    downloadPackage?: boolean,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listJMXProcesses(signal?: AbortSignal): Promise<JMXProcess[]>;
  getJMXProcessDetails(processId?: string, signal?: AbortSignal): Promise<MBeanListDto>;
}

export interface EntityServiceV2Interface {
  list(
    entitySelector: string,
    from?: string,
    to?: string,
    fields?: string,
    sort?: string,
    signal?: AbortSignal,
  ): Promise<Entity[]>;
  get(
    entityId: string,
    from?: string,
    to?: string,
    fields?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listTypes(signal?: AbortSignal): Promise<EntityType[]>;
  getType(type: string, signal?: AbortSignal): Promise<EntityType>;
}

export interface MetricServiceInterface {
  query(
    metricSelector: string,
    resolution?: string,
    from?: string,
    to?: string,
    entitySelector?: string,
    mzSelector?: string,
    signal?: AbortSignal,
  ): Promise<MetricSeriesCollection[]>;
}

export interface SettingsServiceInterface {
  listSchemas(signal?: AbortSignal): Promise<SchemaStub[]>;
  listObjects(
    schemaIds?: string,
    scopes?: string,
    fields?: string,
    pageSize?: number,
    signal?: AbortSignal,
  ): Promise<SettingsObject[]>;
  getSchema(schemaId: string, signal?: AbortSignal): Promise<unknown>;
}

export interface CredentialVaultServiceInterface {
  postCertificate(
    certificate: string,
    name: string,
    description?: string,
    signal?: AbortSignal,
  ): Promise<{ id: string }>;
  putCertificate(
    certificateId: string,
    certificate: string,
    name: string,
    description?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  getCertificate(certificateId: string, signal?: AbortSignal): Promise<CredentialsResponseElement>;
}

export interface ExtensionsServiceV1Interface {
  getExtensions(signal?: AbortSignal): Promise<ExtensionV1DTO[]>;
  getExtensionBinary(extensionId: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface DashboardServiceInterface {
  post(dashboard: Dashboard, signal?: AbortSignal): Promise<unknown>;
}

export interface ActiveGatesServiceInterface {
  list(params?: Record<string, unknown>, signal?: AbortSignal): Promise<ActiveGate[]>;
}

export interface DqlServiceInterface {
  verify(query: string, signal?: AbortSignal): Promise<DqlVerifyResult>;
  execute(query: string, signal?: AbortSignal): Promise<DqlQueryResult>;
}
