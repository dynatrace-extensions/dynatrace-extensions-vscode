import { PanelData } from "./webview";

export type EecType = "ONEAGENT" | "ACTIVEGATE";
export type OsType = "LINUX" | "WINDOWS";
export type SimulationLocation = "LOCAL" | "REMOTE";
export type SimulatorStatus = "READY" | "RUNNING" | "NOTREADY" | "CHECKING";

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
