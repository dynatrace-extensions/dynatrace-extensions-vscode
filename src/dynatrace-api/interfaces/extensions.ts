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

import { EecType } from "@common";

export interface SchemaList {
  versions: string[];
}

export interface SchemaFiles {
  files: string[];
}

export interface MinimalExtension {
  extensionName: string;
  version: string;
}

export interface ExtensionV1ListDto {
  extensions: ExtensionV1DTO[];
  totalResults: number;
  nextPageKey?: string;
}

export interface ExtensionV1DTO {
  id: string;
  name: string;
  type: EecType | "CODEMODULE" | "JMX" | "PMI" | "UNKNOWN";
}

export interface ExtensionMonitoringConfiguration {
  objectId?: string;
  scope?: string;
  value: MonitoringConfigurationValue;
}

interface MonitoringConfigurationValue {
  enabled: boolean;
  description: string;
  version: string;
  featuresets?: string[];
  vars?: unknown;
  snmp?: unknown;
  activationContext?: unknown;
}

export interface ExtensionStatusDto {
  timestamp: number;
  status: "ERROR" | "OK" | "UNKNOWN";
}
