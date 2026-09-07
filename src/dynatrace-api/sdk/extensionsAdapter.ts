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
  DiscoveryClient,
  ExtensionMonitoringConfiguration as SdkMonitoringConfig,
  ExtensionsClient,
  MonitoringConfiguration,
  SchemasClient,
} from "@dynatrace-sdk/client-extensions-v2";
import { wrapSdkError } from "../errors";
import {
  ExtensionMonitoringConfiguration,
  ExtensionStatusDto,
  JMXProcess,
  MBeanListDto,
  MinimalExtension,
} from "../interfaces/extensions";
import { ExtensionsServiceV2Interface } from "../interfaces/services";
import { RateLimitRetryHandler } from "../rateLimitHandler";

/**
 * SaaS adapter for Extensions V2 API — wraps SDK clients to match the existing service interface.
 */
export class SdkExtensionsServiceV2 implements ExtensionsServiceV2Interface {
  private readonly retryHandler: RateLimitRetryHandler;

  constructor(
    private readonly extensions: ExtensionsClient,
    private readonly schemas: SchemasClient,
    private readonly discovery: DiscoveryClient,
    retryHandler?: RateLimitRetryHandler,
  ) {
    this.retryHandler = retryHandler ?? new RateLimitRetryHandler();
  }

  async listSchemaVersions(signal?: AbortSignal): Promise<string[]> {
    try {
      const res = await this.retryHandler.execute(
        () => this.schemas.listSchemaVersions(signal ? { abortSignal: signal } : undefined),
        signal,
      );
      return [...res.items].reverse();
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listSchemaFiles(version: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const res = await this.retryHandler.execute(
        () =>
          this.schemas.listSchemaVersionFiles({
            schemaVersion: version,
            acceptType: "application/json; charset=utf-8",
            abortSignal: signal,
          }),
        signal,
      );
      return res.items;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getSchemaFile(
    version: string,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const res = await this.retryHandler.execute(
        () =>
          this.schemas.getSchemaVersionFile({
            schemaVersion: version,
            fileName,
            abortSignal: signal,
          }),
        signal,
      );
      return res;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listVersions(extensionName: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    try {
      return await this.collectPages(
        pageKey =>
          this.extensions.listExtensionVersions({
            extensionName,
            pageKey,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async deleteVersion(extensionName: string, version: string, signal?: AbortSignal) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.extensions.deleteExtensionVersion({
            extensionName,
            extensionVersion: version,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async upload(file: Buffer, validateOnly = false, signal?: AbortSignal) {
    // The SDK exposes validation and upload as two distinct operations.
    try {
      const body = new Blob([new Uint8Array(file)]);
      if (validateOnly) {
        return await this.retryHandler.execute(
          () => this.extensions.validateExtension({ body, abortSignal: signal }),
          signal,
        );
      }
      return await this.retryHandler.execute(
        () => this.extensions.uploadExtension({ body, abortSignal: signal }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putEnvironmentConfiguration(extensionName: string, version: string, signal?: AbortSignal) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.extensions.updateExtensionEnvironmentConfiguration({
            extensionName,
            body: { version },
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async list(name?: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    try {
      // The SDK replaced the dedicated `name` parameter with a filter expression.
      const filter = name ? `contains(name, "${name}")` : undefined;
      return await this.collectPages(
        (pageKey, isFirstPage) =>
          this.extensions.listExtensions({
            filter: isFirstPage ? filter : undefined,
            pageKey,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listMonitoringConfigurations(
    extensionName: string,
    version?: string,
    activeOnly?: boolean,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration[]> {
    try {
      const filter = buildMonitoringConfigurationFilter(version, activeOnly);
      const configs = await this.collectPages<SdkMonitoringConfig>(
        (pageKey, isFirstPage) =>
          this.extensions.listExtensionMonitoringConfigurations({
            extensionName,
            filter: isFirstPage ? filter : undefined,
            pageKey,
            abortSignal: signal,
          }),
        signal,
      );
      return configs.map(mapSdkMonitoringConfig);
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getMonitoringConfigurationStatus(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionStatusDto> {
    try {
      const res = await this.retryHandler.execute(
        () =>
          this.extensions.getExtensionMonitoringConfigurationStatus({
            extensionName,
            configurationId,
            abortSignal: signal,
          }),
        signal,
      );
      return {
        timestamp: res.timestamp ? new Date(res.timestamp).getTime() : 0,
        status: res.status === "PENDING" || res.status === "WARNING" ? "UNKNOWN" : res.status,
      };
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async deleteMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ) {
    try {
      await this.retryHandler.execute(
        () =>
          this.extensions.deleteExtensionMonitoringConfiguration({
            extensionName,
            configurationId,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    signal?: AbortSignal,
  ): Promise<ExtensionMonitoringConfiguration> {
    try {
      const res = await this.retryHandler.execute(
        () =>
          this.extensions.getExtensionMonitoringConfigurationDetails({
            extensionName,
            configurationId,
            abortSignal: signal,
          }),
        signal,
      );
      return mapSdkMonitoringConfig(res);
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putMonitoringConfiguration(
    extensionName: string,
    configurationId: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.extensions.updateExtensionMonitoringConfiguration({
            extensionName,
            configurationId,
            body: configurationDetails,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async postMonitoringConfiguration(
    extensionName: string,
    configurationDetails: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    try {
      // The REST API accepts a list of configurations, the SDK only a single one.
      const body = (
        Array.isArray(configurationDetails) ? configurationDetails[0] : configurationDetails
      ) as MonitoringConfiguration;
      return await this.retryHandler.execute(
        () =>
          this.extensions.createExtensionMonitoringConfiguration({
            extensionName,
            body,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getExtensionSchema(extensionName: string, extensionVersion: string, signal?: AbortSignal) {
    try {
      return await this.retryHandler.execute(
        () =>
          this.extensions.getExtensionConfigurationSchema({
            extensionName,
            extensionVersion,
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getExtension(
    extensionName: string,
    extensionVersion: string,
    downloadPackage: boolean = false,
    signal?: AbortSignal,
  ) {
    try {
      if (downloadPackage) {
        // The SDK returns a Binary wrapper here, not a raw ArrayBuffer. Unwrap it so callers
        // receive the same ArrayBuffer contract as the classic API client (JSZip needs this).
        const binary = await this.retryHandler.execute(
          () =>
            this.extensions.getExtensionDetails({
              extensionName,
              extensionVersion,
              acceptType: "application/octet-stream",
              abortSignal: signal,
            }),
          signal,
        );
        return await binary.get("array-buffer");
      }
      return await this.retryHandler.execute(
        () =>
          this.extensions.getExtensionDetails({
            extensionName,
            extensionVersion,
            acceptType: "application/json; charset=utf-8",
            abortSignal: signal,
          }),
        signal,
      );
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listJMXProcesses(signal?: AbortSignal): Promise<JMXProcess[]> {
    try {
      const res = await this.retryHandler.execute(
        () => this.discovery.listJmxProcesses(signal ? { abortSignal: signal } : undefined),
        signal,
      );
      return res.items.map(c => ({
        id: c.id ?? "",
        name: c.name ?? "",
        properties: {
          HOSTS: c.properties?.HOSTS ?? [],
          TECHNOLOGIES: c.properties?.TECHNOLOGIES ?? [],
          PROCESS_GROUPS: c.properties?.PROCESS_GROUPS ?? [],
        },
        agentVersion: c.agentVersion ?? "",
      }));
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getJMXProcessDetails(processId?: string, signal?: AbortSignal): Promise<MBeanListDto> {
    try {
      if (!processId) {
        return {};
      }
      const res = await this.retryHandler.execute(
        () =>
          this.discovery.getJmxProcess({
            processId,
            abortSignal: signal,
          }),
        signal,
      );
      return res;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  /**
   * Walks all pages of a paginated SDK endpoint and returns the flattened items.
   * Subsequent pages must be requested with the page key alone — the API rejects any
   * other query parameter alongside it — hence the `isFirstPage` flag.
   */
  private async collectPages<T>(
    fetchPage: (
      pageKey: string | undefined,
      isFirstPage: boolean,
    ) => Promise<{ items: T[]; nextPageKey?: string | null }>,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const allItems: T[] = [];
    let nextPageKey: string | undefined;
    do {
      const pageKey = nextPageKey;
      const res = await this.retryHandler.execute(
        () => fetchPage(pageKey, pageKey === undefined),
        signal,
      );
      allItems.push(...res.items);
      nextPageKey = res.nextPageKey ?? undefined;
    } while (nextPageKey);
    return allItems;
  }
}

/**
 * Builds the filter expression replacing the former `version` and `active` query parameters.
 */
function buildMonitoringConfigurationFilter(
  version?: string,
  activeOnly?: boolean,
): string | undefined {
  const clauses: string[] = [];
  if (version) {
    clauses.push(`version = "${version}"`);
  }
  if (activeOnly !== undefined) {
    clauses.push(`active = ${activeOnly}`);
  }
  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

/**
 * Maps SDK ExtensionMonitoringConfiguration → existing DTO shape.
 */
function mapSdkMonitoringConfig(config: SdkMonitoringConfig): ExtensionMonitoringConfiguration {
  const value = config.value as Record<string, unknown>;
  return {
    objectId: config.objectId,
    scope: config.scope,
    value: {
      enabled: (value.enabled as boolean) ?? true,
      description: (value.description as string) ?? "",
      version: (value.version as string) ?? "",
      featuresets: value.featuresets as string[] | undefined,
      vars: value.vars,
      snmp: value.snmp,
      activationContext: value.activationContext,
    },
  };
}
