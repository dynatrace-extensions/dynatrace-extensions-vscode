export type EecType = "ONEAGENT" | "ACTIVEGATE";
export type OsType = "LINUX" | "WINDOWS";
export type SimulationLocation = "LOCAL" | "REMOTE";
export type SimulatorStatus = "READY" | "RUNNING" | "NOTREADY";

export interface SimulatorPanelData {
  dataType: "SIMULATOR_DATA";
  data: {
    targets: RemoteTarget[];
    summaries: ExecutionSummary[];
    status: SimulatorStatus;
  };
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
}

export interface LocalExecutionSummary extends ExecutionSummary {
  location: "LOCAL";
}

export interface RemoteExecutionSummary extends ExecutionSummary {
  location: "REMOTE";
  target: string;
}