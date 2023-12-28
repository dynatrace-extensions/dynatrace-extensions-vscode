import { PanelData } from "./general";

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
