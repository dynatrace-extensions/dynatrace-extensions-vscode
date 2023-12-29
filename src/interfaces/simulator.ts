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

import { PanelData } from "./webview";

export type EecType = "ONEAGENT" | "ACTIVEGATE";
export type OsType = "LINUX" | "WINDOWS";
export type SimulationLocation = "LOCAL" | "REMOTE";
export type SimulatorStatus = "READY" | "RUNNING" | "NOTREADY" | "UNSUPPORTED" | "CHECKING";

export interface SimulationConfig {
  location: SimulationLocation;
  eecType: EecType;
  target?: RemoteTarget;
  sendMetrics: boolean;
}

export interface SimulatorData {
  targets: RemoteTarget[];
  summaries: (LocalExecutionSummary | RemoteExecutionSummary)[];
  currentConfiguration: SimulationConfig;
  status: SimulatorStatus;
  statusMessage: string;
  failedChecks: string[];
  specs: SimulationSpecs;
}

export interface SimulationSpecs {
  isPython: boolean;
  localOneAgentDsExists: boolean;
  localActiveGateDsExists: boolean;
  dsSupportsOneAgentEec: boolean;
  dsSupportsActiveGateEec: boolean;
}

export interface SimulatorPanelData extends PanelData {
  dataType: "SIMULATOR_DATA";
  data: SimulatorData;
}

export interface RemoteTarget {
  name: string;
  address: string;
  username: string;
  privateKey: string;
  eecType: EecType;
  osType: OsType;
}

export interface ExecutionSummary {
  location: SimulationLocation;
  startTime: Date;
  duration: number;
  success: boolean;
  workspace: string;
  logPath: string;
}

export interface LocalExecutionSummary extends ExecutionSummary {
  location: "LOCAL";
}

export interface RemoteExecutionSummary extends ExecutionSummary {
  location: "REMOTE";
  target: string;
}
