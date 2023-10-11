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

export type DatasourceName =
  | "snmp"
  | "wmi"
  | "sqlDb2"
  | "sqlServer"
  | "sqlMySql"
  | "sqlOracle"
  | "sqlPostgres"
  | "sqlHana"
  | "sqlSnowflake"
  | "prometheus"
  | "python"
  | "unsupported";

export type DetailInjectionCardType =
  | "ENTITIES_LIST"
  | "CHART_GROUP"
  | "MESSAGE"
  | "LOGS"
  | "EVENTS"
  | "METRIC_TABLE"
  | "INJECTIONS";

interface TopologyStub {
  types?: TopologyType[];
  relationships?: RelationshipStub[];
}

export interface TopologyType {
  displayName: string;
  name: string;
  rules: {
    requiredDimensions?: {
      key: string;
      valuePattern?: string;
    }[];
    sources: {
      sourceType: string;
      condition: string;
    }[];
    attributes: {
      key: string;
      displayName: string;
      pattern: string;
    }[];
  }[];
}

interface RelationshipStub {
  fromType: string;
  toType: string;
  typeOfRelation: string;
  sources: {
    sourceType: string;
    condition: string;
  }[];
}

export interface DimensionStub {
  key: string;
  value: string;
  filter?: string;
}
export interface MetricStub {
  key: string;
  value: string;
  type?: string;
  featureSet?: string;
}

export interface DatasourceGroup {
  featureSet?: string;
  dimensions?: DimensionStub[];
  metrics?: MetricStub[];
  subgroups?: SubGroup[];
}

interface SubGroup {
  featureSet?: string;
  dimensions?: DimensionStub[];
  metrics: MetricStub[];
}

interface WmiGroup extends DatasourceGroup {
  wmiNamespace?: string;
  query?: string;
  interval?: {
    minutes: number;
  };
  subgroups?: WmiSubGroup[];
}

interface SnmpGroup extends DatasourceGroup {
  interval?: {
    minutes: number;
  };
  subgroups?: SnmpSubGroup[];
}

interface SnmpSubGroup extends SubGroup {
  interval?: {
    minutes: number;
  };
  table?: boolean;
}

interface WmiSubGroup extends SubGroup {
  wmiNamespace?: string;
  query?: string;
  interval?: {
    minutes: number;
  };
  type?: "logfileEvent" | "metric" | "notificationEvent";
}

export interface MetricMetadata {
  key: string;
  metadata: {
    displayName: string;
    description?: string;
    unit?: string;
    tags?: string[];
    sourceEntityType?: string;
  };
  query?: {
    metricSelector: string;
  };
}

interface VarStub {
  type: string;
  displayName: string;
  id: string;
}

interface ListSettings {
  layout?: {
    autoGenerate?: boolean;
    cards?: ListScreenCard[];
  };
}

interface ListScreenCard {
  key: string;
  entitySelectorTemplate?: string;
  type: "ENTITIES_LIST" | "CHART_GROUP" | "MESSAGE" | "INJECTIONS";
}

interface DetailsScreenCard {
  key: string;
  entitySelectorTemplate?: string;
  conditions?: string[];
  type: DetailInjectionCardType;
}

interface DetailsSettings {
  layout?: {
    autoGenerate?: boolean;
    cards?: DetailsScreenCard[];
  };
}

export interface ScreenStub {
  entityType: string;
  propertiesCard?: PropertiesCard;
  listSettings?: ListSettings;
  listInjections?: ListScreenCard[];
  detailsSettings?: DetailsSettings;
  detailsInjections?: DetailsScreenCard[];
  entitiesListCards?: EntitiesListCardStub[];
  metricTableCards?: MetricTableCardStub[];
  chartsCards?: ChartsCardStub[];
  messageCards?: MinimalCardStub[];
  logsCards?: MinimalCardStub[];
  eventsCards?: MinimalCardStub[];
  actions?: Action[];
}

interface PropertiesCard {
  displayOnlyConfigured: boolean;
  properties: Property[];
}

export type Property = AttributeProperty | RelationProperty;

type Column = AttributeProperty | RelationProperty | CustomColumn;

interface MinimalCardStub {
  key: string;
  displayName?: string;
}

interface Filtering {
  relationships?: string[];
  entityFilters?: EntityFilterGroupDefinition[];
}

interface EntityFilterGroupDefinition {
  displayName: string;
  filters?: EntityFilterDefinition[];
}

interface EntityFilterDefinition {
  type: string;
  entityTypes: string[];
  displayName: string;
  modifier?: "contains" | "equals" | "startsWith";
  distinct?: boolean;
  freeText: boolean;
  defaultSearch?: boolean;
}

interface Action {
  actionScope: string;
  actionLocation: string;
  actions: { actionExpression: string }[];
}

interface EntitiesListCardStub {
  key: string;
  displayName?: string;
  entitySelectorTemplate?: string;
  filtering?: Filtering;
  columns?: Column[];
  charts?: ChartStub[];
}

export interface AttributeProperty {
  type: "ATTRIBUTE";
  conditions?: string[];
  attribute: {
    key: string;
    displayName: string;
  };
}

export interface RelationProperty {
  type: "RELATION";
  conditions?: string[];
  relation: {
    entitySelectorTemplate: string;
    displayName: string;
  };
}

interface CustomColumn {
  type: "CUSTOM";
  conditions?: string[];
  custom: {
    key: string;
    displayName: string;
  };
}

export interface MetricTableCardStub {
  key: string;
  displayName?: string;
  charts: ChartStub[];
  displayCharts?: boolean;
  pageSize?: number;
  hideEmptyCharts?: boolean;
  numberOfVisibleCharts?: number;
  enableDetailsExpandability?: boolean;
}

export interface ChartsCardStub {
  key: string;
  displayName?: string;
  numberOfVisibleCharts?: number;
  chartsInRow?: number;
  mode?: string;
  hideEmptyCharts?: boolean;
  charts: ChartStub[];
}

export interface ChartStub {
  displayName?: string;
  visualizationType: string;
  graphChartConfig?: GraphConfigStub;
  pieChartConfig?: SingleMetricConfig;
  singleValueConfig?: SingleMetricConfig;
}

export type MetricVisualizationType = "LINE" | "AREA" | "COLUMN";

export interface ChartMetricVisualization {
  displayName?: string;
  themeColor?: string;
  seriesType?: MetricVisualizationType;
}

export interface ChartMetric {
  metricSelector: string;
  metricSelectorDetailed?: string;
  metricSelectorSort?: string;
  visualization?: ChartMetricVisualization;
  yAxisKey?: string;
}

export interface GraphConfigStub {
  metrics: ChartMetric[];
  visualization?: ChartMetricVisualization;
  stacked?: boolean;
  yAxes?: {
    key: string;
    position: "RIGHT" | "LEFT";
    visible: boolean;
  }[];
}

interface SingleMetricConfig {
  metric: { metricSelector: string };
}

export interface ExtensionStub {
  name: string;
  version: string;
  minDynatraceVersion: string;
  author: {
    name: string;
  };
  alerts?: { path: string }[];
  dashboards?: { path: string }[];
  snmp?: SnmpGroup[];
  wmi?: WmiGroup[];
  prometheus?: DatasourceGroup[];
  sqlMySql?: DatasourceGroup[];
  sqlDb2?: DatasourceGroup[];
  sqlHana?: DatasourceGroup[];
  sqlOracle?: DatasourceGroup[];
  sqlPostgres?: DatasourceGroup[];
  sqlServer?: DatasourceGroup[];
  sqlSnowflake?: DatasourceGroup[];
  python?: PythonDatasource;
  jmx?: { groups: JMXGroup[] };
  metrics?: MetricMetadata[];
  topology?: TopologyStub;
  vars?: VarStub[];
  screens?: ScreenStub[];
}

interface PythonDatasource {
  runtime: {
    module: string;
    version: {
      min: string;
    };
  };
  activation: {
    remote?: {
      path: string;
    };
  };
}

export interface JMXGroup extends DatasourceGroup {
  group: string;
  subgroups: JMXSubGroup[];
}

export interface JMXSubGroup extends SubGroup {
  subgroup: string;
  query: string;
  queryFilters?: JMXFilter[];
}

interface JMXFilter {
  field: string;
  filter: string;
}

export interface V1UI {
  charts?: ChartDto[];
  keycharts?: ChartDto[];
}

export interface JMXExtensionV1 {
  name: string;
  metricGroup?: string;
  version: string;
  type: string;
  metrics: MetricDto[];
  technologies?: string[];
  ui?: V1UI;
}

interface SeriesDto {
  key: string;
  color?: string;
  displayname?: string;
  aggregation?: string;
  mergeaggregation?: string;
  dimensions?: string[];
  seriestype?: "line" | "area" | "bar" | "LINE" | "AREA" | "BAR" | "Line" | "Area" | "Bar";
  stacked?: boolean;
  rightaxis?: boolean;
  unit?: string;
}

export interface ChartDto {
  group: string;
  title: string;
  description?: string;
  series: SeriesDto[];
}

export interface MetricDto {
  timeseries: TimeseriesDto;
  source: SourceDto;
  entity?: string;
}

export interface TimeseriesDto {
  key: string;
  unit: string;
  displayname: string;
  dimensions: string[];
}

export interface SourceDto {
  domain?: string;
  keyProperties: Record<string, string>;
  allowAdditionalKeys: boolean;
  attribute: string;
  calculateRate: boolean;
  calculateDelta: boolean;
  splitting?: SplittingDto;
  splittings?: SplittingDto[];
  aggregation?: string;
}

export interface SplittingDto {
  keyProperty: string;
  name: string;
  type: string;
}
