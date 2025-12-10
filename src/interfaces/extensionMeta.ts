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

import { UtilTypes } from "@common";

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

export const DetailInjectionCardType = {
  ENTITIES_LIST: "ENTITIES_LIST",
  CHART_GROUP: "CHART_GROUP",
  MESSAGE: "MESSAGE",
  LOGS: "LOGS",
  EVENTS: "EVENTS",
  METRIC_TABLE: "METRIC_TABLE",
  INJECTIONS: "INJECTIONS",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type DetailInjectionCardType = UtilTypes.ObjectValues<typeof DetailInjectionCardType>;

interface TopologyStub {
  types?: TopologyType[];
  relationships?: RelationshipStub[];
}

export interface TopologyType {
  displayName: string;
  name: string;
  rules: {
    idPattern?: string;
    instanceNamePattern?: string;
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
  healthCards?: HealthCardStub[];
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

export const isAttributeProperty = (prop: Property | Column): prop is AttributeProperty =>
  prop.type === "ATTRIBUTE";
export const isRelationProperty = (prop: Property | Column): prop is RelationProperty =>
  prop.type === "RELATION";

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

export interface HealthCardStub {
  key: string;
  tiles: TileStub[];
}

export interface TileStub {
  displayName?: string;
  metricSelecor: string;
  foldTransformation: string;
  anchor?: AnchorStub;
}

export interface AnchorStub {
  cardName?: string;
  chartName?: string;
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

export interface DocumentDashboard {
  displayName: string;
  path: string;
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
  documents?: {
    dashboards?: DocumentDashboard[];
  };
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

export interface V1ConfigUIProperty {
  key: string;
  displayName?: string;
  displayHint?: string;
  displayOrder?: number;
}

export interface V1ConfigUI {
  displayName: string;
  properties?: V1ConfigUIProperty[];
}

export interface V1Property {
  key: string;
  type: "string" | "boolean" | "integer" | "float" | "password" | "json" | "textarea" | "dropdown";
  defaultValue?: string | number | boolean;
  dropdownValues?: string[];
}

export interface ExtensionV1 {
  name: string;
  metricGroup?: string;
  version: string;
  type: string;
  metrics: MetricDto[];
  technologies?: string[];
  ui?: V1UI;
  configUI?: V1ConfigUI;
  properties?: V1Property[];
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
  displayname?: string;
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

export interface ActivationSchemaObjectType {
  $ref: string;
}

export interface ActivationSchemaItem {
  type: ActivationSchemaObjectType;
}

export type ActivationSchemaPropertyType =
  | "boolean"
  | "integer"
  | "float"
  | "local_date"
  | "local_time"
  | "local_date_time"
  | "zoned_date_time"
  | "time_zone"
  | "text"
  | "secret"
  | "setting"
  | "list"
  | "set"
  | ActivationSchemaObjectType;

export interface ActivationSchemaProperty {
  type: ActivationSchemaPropertyType;
  displayName: string;
  description?: string;
  items?: ActivationSchemaItem;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
  metaData?: Record<string, string>;
  subType?: "multiline" | "uri" | "url";
  default?: string | number | boolean;
}

export interface ActivationSchemaType {
  type: string;
  displayName: string;
  properties: Record<string, ActivationSchemaProperty>;
  summaryPattern?: string;
}

export interface ActivationSchemaEnum {
  displayName: string;
  type: "enum";
  items: {
    value: string;
    displayName: string;
    description?: string;
  }[];
}

export interface ActivationSchema {
  types: Record<string, ActivationSchemaType>;
  properties: Record<string, ActivationSchemaProperty>;
  enums?: Record<string, ActivationSchemaEnum>;

  // Just used to make the playground happy
  dynatrace: "1";
  description: string;
  displayName: string;
  schemaId: string;
  ownerProductManagement: string;
  ownerDevelopment: string;
  maturity: string;
  allowedScopes: string[];
  multiObject: boolean;
}

export interface OpenPipelinePipeline {
  displayName: string;
  pipelinePath: string;
  configScope: "metrics" | "logs";
}

export interface OpenPipelineSource {
  displayName: string;
  sourcePath: string;
  configScope: "metrics" | "logs";
}

export interface OpenPipeline {
  pipelines: Array<OpenPipelinePipeline>;
  sources: Array<OpenPipelineSource>;
}
