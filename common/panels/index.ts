import { ObjectValues } from "../util-types";
import { EmptyStatePanelData } from "./empty-state-data";
import { MetricResultsPanelData } from "./metric-results-data";
import { SimulatorPanelData } from "./simulator-data";
import { WmiQueryResultPanelData } from "./wmi-query-result-data";

export * from "./simulator-data";
export * from "./metric-results-data";
export * from "./wmi-query-result-data";
export * from "./empty-state-data";

/**
 * Registered data types for panels
 */
export const PanelDataType = {
  Empty: "EMPTY_STATE",
  MetricResults: "METRIC_RESULTS",
  WmiQueryResults: "WMI_RESULT",
  ExtensionSimulator: "SIMULATOR_DATA",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type PanelDataType = ObjectValues<typeof PanelDataType>;

/**
 * Registered viewType (id) values for known webivew panels.
 */
export const ViewType = {
  MetricResults: "dynatrace-extensions.MetricResults",
  WmiQueryResults: "dynatrace-extensions.WmiResults",
  ExtensionSimulator: "dynatrace-extensions.SimulatorUI",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ViewType = ObjectValues<typeof ViewType>;

export interface PanelDataBase {
  /** Used to match component on the React side */
  dataType: string;
  /** Holds actual data the panel works with */
  data?: unknown;
}

export type PanelData =
  | SimulatorPanelData
  | MetricResultsPanelData
  | WmiQueryResultPanelData
  | EmptyStatePanelData;
