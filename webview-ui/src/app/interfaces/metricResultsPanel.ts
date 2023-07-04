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
  operands?: unknown[];
}

interface AppliedFilter {
  appliedTo: string[];
  filter?: Filter;
}

interface MetricSeries {
  dimensionMap: Record<string, string>;
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

export { MetricSeriesCollection, MetricSeries };
