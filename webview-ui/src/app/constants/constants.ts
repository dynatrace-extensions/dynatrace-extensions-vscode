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

// Registered data types for panels
export const EMPTY_STATE_DATA_TYPE = "EMPTY_STATE";
export const METRIC_RESULTS_DATA_TYPE = "METRIC_RESULTS";
export const WMI_RESULT_DATA_TYPE = "WMI_RESULT";
export const SIMULATOR_DATA_TYPE = "SIMULATOR_DATA";

// Commands that the Extension Simulator panel can trigger
export const SIMULATOR_ADD_TARGERT_CMD = "dynatrace-extensions.simulator.addTarget";
export const SIMULATOR_DELETE_TARGERT_CMD = "dynatrace-extensions.simulator.deleteTarget";
export const SIMULATOR_READ_LOG_CMD = "dynatrace-extensions.simulator.readLog";
export const SIMULATOR_CHECK_READY_CMD = "dynatrace-extensions.simulator.checkReady";
export const SIMULATOR_START_CMD = "dynatrace-extensions.simulator.start";
export const SIMULATOR_STOP_CMD = "dynatrace-extensions.simulator.stop";
