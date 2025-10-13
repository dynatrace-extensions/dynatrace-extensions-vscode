import { ObjectValues } from "./util-types";

/**
 * Commands that the Extension Simulator panel can trigger
 */
export const SimulatorCommand = {
  SIMULATOR_ADD_TARGERT_CMD: "dynatrace-extensions.simulator.addTarget",
  SIMULATOR_DELETE_TARGERT_CMD: "dynatrace-extensions.simulator.deleteTarget",
  SIMULATOR_READ_LOG_CMD: "dynatrace-extensions.simulator.readLog",
  SIMULATOR_CHECK_READY_CMD: "dynatrace-extensions.simulator.checkReady",
  SIMULATOR_START_CMD: "dynatrace-extensions.simulator.start",
  SIMULATOR_STOP_CMD: "dynatrace-extensions.simulator.stop",
  SIMULATOR_OPEN_UI_CMD: "dynatrace-extensions.simulator.refreshUI",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulatorCommand = ObjectValues<typeof SimulatorCommand>;
