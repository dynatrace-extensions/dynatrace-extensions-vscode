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

import { PanelDataBase, PanelDataType } from ".";
import { ObjectValues } from "../util-types";

export const EecType = {
  OneAgent: "ONEAGENT",
  ActiveGate: "ACTIVEGATE",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type EecType = ObjectValues<typeof EecType>;

export const OsType = {
  Linux: "LINUX",
  Windows: "WINDOWS",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type OsType = ObjectValues<typeof OsType>;

export const SimulatorStatus = {
  Ready: "READY",
  Running: "RUNNING",
  NotReady: "NOTREADY",
  Unsupported: "UNSUPPORTED",
  Checking: "CHECKING",
  Unknown: "UNKNOWN",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulatorStatus = ObjectValues<typeof SimulatorStatus>;

export const SimulationLocation = {
  Local: "LOCAL",
  Remote: "REMOTE",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulationLocation = ObjectValues<typeof SimulationLocation>;

export interface SimulationConfig {
  location: SimulationLocation;
  eecType: EecType;
  target?: RemoteTarget;
  sendMetrics: boolean;
}

export interface SimulatorData {
  targets: RemoteTarget[];
  summaries: ExecutionSummary[];
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

export interface SimulatorPanelData extends PanelDataBase {
  dataType: typeof PanelDataType.ExtensionSimulator;
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

interface ExecutionSummaryBase {
  location: string;
  startTime: Date;
  duration: number;
  success: boolean;
  workspace: string;
  logPath: string;
}

export interface LocalExecutionSummary extends ExecutionSummaryBase {
  location: typeof SimulationLocation.Local;
}

export interface RemoteExecutionSummary extends ExecutionSummaryBase {
  location: typeof SimulationLocation.Remote;
  target: string;
}

export type ExecutionSummary = LocalExecutionSummary | RemoteExecutionSummary;
