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

interface ActiveGateModule {
  misconfigured: boolean;
  type:
    | "AWS"
    | "AZURE"
    | "BEACON_FORWARDER"
    | "CLOUD_FOUNDRY"
    | "DB_INSIGHT"
    | "EXTENSIONS_V1"
    | "EXTENSIONS_V2"
    | "KUBERNETES"
    | "LOGS"
    | "MEMORY_DUMPS"
    | "METRIC_API"
    | "ONE_AGENT_ROUTING"
    | "OTLP_INGEST"
    | "REST_API"
    | "SYNTHETIC"
    | "VMWARE"
    | "Z_OS";
  version: string;
  enabled: boolean;
}

export interface ActiveGate {
  id: string;
  networkAddresses: string[];
  loadBalancerADdresses: string[];
  osType: "LINUX" | "WINDOWS";
  osArchitecture: "S390" | "X86";
  osBitness: "64";
  type: "CLUSTER" | "ENVIRONMENT" | "ENVIRONMENT_MULTI";
  hostname: string;
  group: string;
  modules: ActiveGateModule[];
}
