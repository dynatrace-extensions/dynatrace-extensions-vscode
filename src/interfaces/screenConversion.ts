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

import {
  ChartGroup,
  ChartTimeseriesMetricVisualization,
  DqlTable,
  EntityDetailsDefinitionDocument,
  EntityDetailsInjectionDocument,
  Filtering,
  HorizontalLayout,
  InvExDefinitionDocument,
  InvExInjectionDocument,
  Message,
  Metadata,
  VerticalLayout,
} from "@dynatrace/unified-analysis/documents";
import { ScreenStub } from "./extensionMeta";

/** Resolved context for a single screen entity type conversion */
export interface ScreenConversionContext extends NodeContext {
  /** The name of the extension in the workspace */
  extensionName: string;
  /** The original entity type from the YAML screen (e.g. "f5:instance") */
  entityType: string;
  /** The sanitized entity type for file names (colons → underscores) */
  fileNamePrefix: string;
  /** The parsed screen definition from extension.yaml */
  screen: ScreenStub;
  /** Root-level keywords from extension.yaml (used for action mapping) */
  keywords?: string[];
  /** Mapping of entity types to node contexts */
  entityToNodeMap: EntityToNodeMap;
}

export interface EntityToNodeMap {
  [entityType: string]: NodeContext;
}

export interface NodeContext {
  /** The resolved node type for the new format (e.g. "EXT_NETWORK_DEVICE") */
  nodeType: string;
  /** Node field mapping to gen2 attribute key */
  fieldMap: Record<string, string>;
  /** Static edges ({edge_type}.{node_type}) available on this node type */
  staticEdges: string[];
}

/** A single warning emitted during conversion */
export interface ConversionWarning {
  category: WarningCategory;
  message: string;
}

export type WarningCategory =
  | "default-card"
  | "skipped-classic"
  | "skipped-out-of-scope"
  | "no-dql"
  | "entity-selector"
  | "conditions"
  | "breadcrumbs"
  | "actions"
  | "relation-properties"
  | "multi-metric-partial"
  | "dql-conversion";

/** Result of converting a single screen entity type */
export interface ScreenConversionResult {
  filesWritten: string[];
  warnings: ConversionWarning[];
  conversionReport: string;
}

/** The output JSON document wrapper — written to disk as-is */
export interface OutputDocument {
  fileName: string;
  content:
    | EntityDetailsDefinitionDocument
    | EntityDetailsInjectionDocument
    | InvExDefinitionDocument
    | InvExInjectionDocument;
}

/** All the fold transformations available for single value metrics */
export type FoldTransformation =
  | "AUTO"
  | "AVG"
  | "LAST_VALUE"
  | "MAX"
  | "MEDIAN"
  | "MIN"
  | "PERCENTILE_10"
  | "PERCENTILE_75"
  | "PERCENTILE_90"
  | "SUM"
  | "VALUE";

export interface DqlQueryInfo extends DqlParseResult {
  /** Original query processed */
  dqlQuery: string;
}

/** Parsed metric fields and named args extracted from a DQL query */
export interface DqlParseResult {
  /** Metric field names exposed by the query (aliases or full function calls) */
  metricFields: string[];
  /** Raw series text extracted from the query (comma-separated, without keyword or named args) */
  seriesText: string;
  /** Named args after the metric series (e.g. `by:{...}, filter:{...}`), trimmed */
  args?: string;
}

/** DQL info for a timeseries chart metric */
export interface TimeseriesDqlInfo {
  dqlQuery: string;
  name?: string;
  seriesText?: string;
  args?: string;
  visualization?: ChartTimeseriesMetricVisualization;
}

/** Dql Column types for Dql Table */
export type DqlTableColumnType =
  | "text"
  | "date"
  | "number"
  | "array"
  | "record"
  | "bit"
  | "sparkline"
  | "meterbar"
  | "gantt"
  | "log-content"
  | "markdown";

/** Dql Column width types for Dql Table */
export type DqlTableColumnWidthType = "pixels" | "auto" | "ratio";

/** MessageCard text color */
export type MessageColor = "INFO" | "WARNING" | "CRITICAL";

/** Need to compile ourselves because UA doesn't export these */
export type TabsLayoutElement = FullySupportedElements | DqlTable;
export type FullySupportedElements =
  | VerticalLayout
  | HorizontalLayout
  | Filtering
  | Message
  | Metadata
  | ChartGroup;
