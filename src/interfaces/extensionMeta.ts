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

interface TopologyStub {
  types: TopologyType[];
  relationships: RelationshipStub[];
}

interface TopologyType {
  displayName: string;
  name: string;
  rules: {
    requiredDimensions?: {
      key: string;
      valuePattern?: any;
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
  sources: any[];
}

interface DimensionStub {
  key: string;
  value: string;
  filter?: string;
}
interface MetricStub {
  key: string;
  value: string;
  type?: string;
  featureSet?: string;
}

interface DatasourceGroup {
  featureSet?: string;
  dimensions?: DimensionStub[];
  metrics?: MetricStub[];
  subgroups?: SubGroup[];
}

interface SubGroup extends DatasourceGroup {
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

interface WmiSubGroup extends SubGroup {
  wmiNamespace?: string;
  query?: string;
  interval?: {
    minutes: number;
  };
  type?: "logfileEvent" | "metric" | "notificationEvent";
}

interface MetricMetadata {
  key: string;
  metadata: {
    displayName: string;
    description: string;
    unit: string;
    tags: string[];
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
  type: "ENTITIES_LIST" | "CHART_GROUP" | "MESSAGE";
}

interface DetailsScreenCard {
  key: string;
  entitySelectorTemplate?: string;
  type: "ENTITIES_LIST" | "CHART_GROUP" | "MESSAGE" | "LOGS" | "EVENTS";
}

interface DetailsSettings {
  layout?: {
    autoGenerate?: boolean;
    cards?: DetailsScreenCard[];
  };
}

interface ScreenStub {
  entityType: string;
  propertiesCard?: any;
  listSettings?: ListSettings;
  listInjections?: ListScreenCard[];
  detailsSettings?: DetailsSettings;
  detailsInjections?: DetailsScreenCard[];
  entitiesListCards?: EntitiesListCardStub[];
  chartsCards?: ChartsCardStub[];
  messageCards?: any[];
  logsCards?: any[];
  eventsCards?: any[];
  actions?: Action[];
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
  columns?: any[];
  charts?: ChartStub[];
}

interface ChartsCardStub {
  key: string;
  displayName?: string;
  charts: ChartStub[];
}

interface ChartStub {
  graphChartConfig?: GraphConfigStub;
  pieChartConfig?: SingleMetricConfig;
  singleValueConfig?: SingleMetricConfig;
}

interface ChartConfigStub {
  metrics: { metricSelector: string }[];
  visualization: any;
}

interface GraphConfigStub {
  metrics: { metricSelector: string }[];
}

interface SingleMetricConfig {
  metric: { metricSelector: string };
}

interface ExtensionStub {
  name: string;
  version: string;
  minDynatraceVersion: string;
  alerts: { path: string }[];
  dashboards: { path: string }[];
  snmp?: DatasourceGroup[];
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
  metrics: MetricMetadata[];
  topology: TopologyStub;
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
