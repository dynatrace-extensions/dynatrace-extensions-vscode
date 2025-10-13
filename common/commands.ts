import { ObjectValues } from "./util-types";

/**
 * Commands that the Extension Simulator panel can trigger
 */
export const SimulatorCommand = {
  AddTarget: "dynatrace-extensions.simulator.addTarget",
  DeleteTarget: "dynatrace-extensions.simulator.deleteTarget",
  ReadLog: "dynatrace-extensions.simulator.readLog",
  CheckReady: "dynatrace-extensions.simulator.checkReady",
  Start: "dynatrace-extensions.simulator.start",
  Stop: "dynatrace-extensions.simulator.stop",
  OpenUI: "dynatrace-extensions.simulator.refreshUI",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulatorCommand = ObjectValues<typeof SimulatorCommand>;
