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

interface Rollup {
  type?: "AUTO" | "AVG" | "MAX" | "MEDIAN" | "MIN" | "PERCENTILE" | "SUM";
  parameter?: number;
}

interface Invocation {
  function?: string;
  args?: string;
}

interface Filter {
  targetDimension?: string;
  rollup?: Rollup;
  referenceValue?: number;
  referenceInvocation?: Invocation;
  targetDimensions?: string[];
  referenceString?: string;
  type?:
    | "eq"
    | "ne"
    | "prefix"
    | "in"
    | "remainder"
    | "suffix"
    | "contains"
    | "existsKey"
    | "series"
    | "or"
    | "and"
    | "not"
    | "ge"
    | "gt"
    | "le"
    | "lt"
    | "otherwise";
  operands?: any[];
}

interface AppliedFilter {
  appliedTo: string[];
  filter?: Filter;
}

interface MetricSeries {
  dimensionMap: { [key: string]: string };
  timestamps: number[];
  dimensions: string[];
  values: number[];
}

interface MetricSeriesCollection {
  dataPointCountRatio: number;
  dimensionCountRatio: number;
  appliedOptionalFilters?: AppliedFilter[];
  metricId: string;
  data: MetricSeries[];
  warnings?: string;
}
