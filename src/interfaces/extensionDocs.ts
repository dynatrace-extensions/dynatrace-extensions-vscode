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

interface AlertDoc {
  name: string;
  description: string;
  entity?: string;
}

interface DashboardDoc {
  name: string;
}

interface MetricDoc {
  key: string;
  name: string;
  description?: string;
  unit?: string;
  tags?: string[];
  entities: string[];
}

interface FeatureSetDoc {
  name: string;
  metrics: string[];
}

interface MetricEntityMap {
  metricEntityString: string;
  metrics: MetricDoc[];
}

interface EntityDoc {
  name: string;
  type: string;
  sources: string[];
  metrics: string[];
}

interface DynatraceDashboard {
  id: string;
  dashboardMetadata: {
    name: string;
    shared?: boolean;
    owner: string;
    dashboardFilter?: unknown;
    tags?: unknown[];
    preset?: boolean;
    dynamicFilters?: unknown;
    tilesNameSize?: unknown;
    hasConsistentColors?: unknown;
  };
  tiles: unknown[];
}

interface AlertDefinition extends AlertStrategy {
  id: string;
  metricSelector: string;
  severity?: string;
  primaryDimensionKey?: string;
  name: string;
  description: string;
  enabled: boolean;
  monitoringStrategy: AlertMonitoringStrategy;
  eventType: string;
}

interface AlertMonitoringStrategy extends AlertStrategy {
  type: string;
  unit?: string;
  alertingOnMissingData: boolean;
}

interface AlertStrategy {
  threshold: number;
  violatingSamples: number;
  samples: number;
  dealertingSamples: number;
  alertCondition: string;
}

export interface OpenPipelineFieldsToExtract {
  fieldName: string;
  referencedFieldName: string;
}

export interface OpenPipelineIdComponent {
  idComponent: string;
  referencedFieldName: string;
}

export interface OpenPipelineStaticEdge {
  edgeType: string;
  targetType: string;
  targetIdFieldName: string;
}

export interface OpenPipelineSmartscapeNode {
  nodeType: string;
  nodeIdFieldName: string;
  idComponents: Array<OpenPipelineIdComponent>;
  extractNode: boolean;
  nodeName?: {
    type: string;
    constant?: string;
    field?: {
      sourceFieldName: string;
      defaultValue: string;
    };
  };
  fieldsToExtract?: Array<OpenPipelineFieldsToExtract>;
  staticEdgesToExtract?: Array<OpenPipelineStaticEdge>;
}

export interface OpenPipelineSmartscapeEdge {
  sourceType: string;
  sourceIdFieldName: string;
  edgeType: string;
  targetType: string;
  targetIdFieldName: string;
}

export interface OpenPipelineProcessor {
  id: string;
  type: string;
  matcher: string;
  description?: string;
  smartscapeNode?: OpenPipelineSmartscapeNode;
  smartscapeEdge?: OpenPipelineSmartscapeEdge;
}

export interface OpenPipelineStage {
  processors: Array<OpenPipelineProcessor>;
}

export interface OpenPipelinePipeline {
  customId: string;
  displayName: string;
  processing?: OpenPipelineStage;
  metricExtraction?: OpenPipelineStage;
  davis?: OpenPipelineStage;
  smartscapeNodeExtraction?: OpenPipelineStage;
  smartscapeEdgeExtraction?: OpenPipelineStage;
}

export interface OpenPipelineSource {
  displayName: string;
  defaultBucket?: string;
  processing?: OpenPipelineStage;
  staticRouting?: {
    pipelineId: string;
  };
}

export {
  AlertDoc,
  DashboardDoc,
  FeatureSetDoc,
  MetricDoc,
  MetricEntityMap,
  EntityDoc,
  AlertDefinition,
  DynatraceDashboard,
};
