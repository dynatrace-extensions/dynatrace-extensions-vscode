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
  ExtensionMonitoringConfiguration as SdkMonitoringConfig,
  SchemaClient,
} from "@dynatrace-internal/client-extensions";
import { wrapSdkError } from "../errors";
import {
  ExtensionMonitoringConfiguration,
  ExtensionStatusDto,
  JMXProcess,
  MBeanListDto,
  MinimalExtension,
} from "../interfaces/extensions";
import { ExtensionsServiceV2Interface } from "../interfaces/services";

/**
 * SaaS adapter for Extensions V2 API — wraps SDK clients to match the existing service interface.
 */
export class SdkExtensionsServiceV2 implements ExtensionsServiceV2Interface {
  constructor(
    private readonly definitions: DefinitionsClient,
    private readonly configurations: ConfigurationsClient,
    private readonly schema: SchemaClient,
    private readonly environment: EnvironmentClient,
    private readonly discovery: DiscoveryClient,
  ) {}

  async listSchemaVersions(signal?: AbortSignal): Promise<string[]> {
    try {
      const res = await this.schema.listSchemas(signal ? { abortSignal: signal } : undefined);
      return res.versions.reverse();
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listSchemaFiles(version: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const res = await this.schema.listSchemaFiles({
        schemaVersion: version,
        acceptType: "application/json; charset=utf-8",
        abortSignal: signal,
      });
      return res.files;
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
      const res = await this.schema.getSchemaFile({
        schemaVersion: version,
        fileName,
        abortSignal: signal,
      });
      return res as Record<string, unknown>;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listVersions(extensionName: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    try {
      const allExtensions: MinimalExtension[] = [];
      let nextPageKey: string | undefined;
      do {
        const res = await this.definitions.listExtensionVersions({
          extensionName,
          nextPageKey,
          abortSignal: signal,
        });
        allExtensions.push(...res.extensions);
        nextPageKey = res.nextPageKey ?? undefined;
      } while (nextPageKey);
      return allExtensions;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async deleteVersion(extensionName: string, version: string, signal?: AbortSignal) {
    try {
      return await this.definitions.removeExtension({
        extensionName,
        extensionVersion: version,
        abortSignal: signal,
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async upload(file: Buffer, validateOnly = false, signal?: AbortSignal) {
    try {
      return await this.definitions.uploadExtension({
        body: new Blob([file]),
        validateOnly,
        abortSignal: signal,
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async putEnvironmentConfiguration(extensionName: string, version: string, signal?: AbortSignal) {
    try {
      return await this.environment.updateExtensionEnvironmentConfiguration({
        extensionName,
        body: { version },
        abortSignal: signal,
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async list(name?: string, signal?: AbortSignal): Promise<MinimalExtension[]> {
    try {
      const allExtensions: MinimalExtension[] = [];
      let nextPageKey: string | undefined;
      do {
        const res = await this.definitions.listExtensionInfos({
          name: name ?? undefined,
          nextPageKey,
          abortSignal: signal,
        });
        allExtensions.push(...res.extensions);
        nextPageKey = res.nextPageKey ?? undefined;
      } while (nextPageKey);
      return allExtensions;
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
      const allConfigs: SdkMonitoringConfig[] = [];
      let nextPageKey: string | undefined;
      do {
        const res = await this.configurations.extensionMonitoringConfigurations({
          extensionName,
          version,
          active: activeOnly,
          nextPageKey,
          abortSignal: signal,
        });
        allConfigs.push(...res.items);
        nextPageKey = res.nextPageKey ?? undefined;
      } while (nextPageKey);
      return allConfigs.map(mapSdkMonitoringConfig);
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
      const res = await this.configurations.getExtensionMonitoringConfigurationStatus({
        extensionName,
        configurationId,
        abortSignal: signal,
      });
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
      await this.configurations.removeMonitoringConfiguration({
        extensionName,
        configurationId,
        abortSignal: signal,
      });
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
      const res = await this.configurations.monitoringConfigurationDetails({
        extensionName,
        configurationId,
        abortSignal: signal,
      });
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
      return await this.configurations.updateMonitoringConfiguration({
        extensionName,
        configurationId,
        body: configurationDetails,
        abortSignal: signal,
      });
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
      return await this.configurations.createMonitoringConfiguration({
        extensionName,
        body: [configurationDetails],
        abortSignal: signal,
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async getExtensionSchema(extensionName: string, extensionVersion: string, signal?: AbortSignal) {
    try {
      return await this.definitions.extensionConfigurationSchema({
        extensionName,
        extensionVersion,
        abortSignal: signal,
      });
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
        return await this.definitions.extensionDetails({
          extensionName,
          extensionVersion,
          acceptType: "application/octet-stream",
          abortSignal: signal,
        });
      }
      return await this.definitions.extensionDetails({
        extensionName,
        extensionVersion,
        acceptType: "application/json; charset=utf-8",
        abortSignal: signal,
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
  }

  async listJMXProcesses(signal?: AbortSignal): Promise<JMXProcess[]> {
    try {
      const containers = await this.discovery.listJmxProcesses(
        signal ? { abortSignal: signal } : undefined,
      );
      return containers.map(c => ({
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
      const res = await this.discovery.getJmxProcess({
        processId,
        abortSignal: signal,
      });
      return res as MBeanListDto;
    } catch (err) {
      throw wrapSdkError(err);
    }
  }
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
