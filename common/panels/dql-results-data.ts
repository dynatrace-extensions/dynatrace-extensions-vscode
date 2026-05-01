/**
  Copyright 2025 Dynatrace LLC

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
import { MetricSeriesCollection } from "./metric-results-data";

export interface DqlResultsPanelData extends PanelDataBase {
  dataType: typeof PanelDataType.DqlResults;
  /** The DQL query to display in the panel header */
  dqlQuery: string;
  /** True when the first command is "timeseries" */
  isTimeseries: boolean;
  /** Normalized timeseries data — populated only when isTimeseries is true */
  timeseriesData?: MetricSeriesCollection[];
  /** Raw result records — populated only when isTimeseries is false */
  records?: Record<string, unknown>[];
}
