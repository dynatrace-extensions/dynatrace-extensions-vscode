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

// ---------------------------------------------------------------------------
// Configuration for OpenPipeline schema download and conversion
// ---------------------------------------------------------------------------

export interface OpenPipelineSchemaConfig {
  schemaId: string;
  filePattern: string;
  outputFilename: string;
}

export const OPENPIPELINE_SCHEMA_CONFIGS: OpenPipelineSchemaConfig[] = [
  {
    schemaId: "builtin:openpipeline.metrics.pipelines",
    filePattern: "**/openpipeline/*metrics.pipeline.json",
    outputFilename: "metrics.pipeline.schema.json",
  },
  {
    schemaId: "builtin:openpipeline.metrics.ingest-sources",
    filePattern: "**/openpipeline/*metrics.source.json",
    outputFilename: "metrics.source.schema.json",
  },
  {
    schemaId: "builtin:openpipeline.logs.pipelines",
    filePattern: "**/openpipeline/*logs.pipeline.json",
    outputFilename: "logs.pipeline.schema.json",
  },
  {
    schemaId: "builtin:openpipeline.logs.ingest-sources",
    filePattern: "**/openpipeline/*logs.source.json",
    outputFilename: "logs.source.schema.json",
  },
];

// ---------------------------------------------------------------------------
// Dynatrace schema types (input format)
// ---------------------------------------------------------------------------

export type DtTypeRef = { $ref: string };
export type DtPropertyType = string | DtTypeRef;

export interface DtConstraint {
  type: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface DtItemDef {
  type: DtPropertyType;
  constraints?: DtConstraint[];
}

export interface DtPreconditionEquals {
  type: "EQUALS";
  property: string;
  expectedValue: unknown;
}

export interface DtPreconditionNot {
  type: "NOT";
  precondition: DtPrecondition;
}

export interface DtPreconditionIn {
  type: "IN";
  property: string;
  expectedValues: unknown[];
}

export type DtPrecondition = DtPreconditionEquals | DtPreconditionNot | DtPreconditionIn;

export interface DtPropertyDef {
  displayName?: string;
  description?: string;
  type: DtPropertyType;
  nullable?: boolean;
  constraints?: DtConstraint[];
  items?: DtItemDef;
  minObjects?: number;
  maxObjects?: number;
  precondition?: DtPrecondition;
  default?: unknown;
}

export interface DtTypeDef {
  type: "object";
  displayName?: string;
  description?: string;
  properties: Record<string, DtPropertyDef>;
}

export interface DtEnumItem {
  value: string;
}

export interface DtEnumDef {
  type: "enum";
  displayName?: string;
  description?: string;
  items: DtEnumItem[];
}

export interface DtSchema {
  schemaId: string;
  displayName?: string;
  description?: string;
  enums?: Record<string, DtEnumDef>;
  types?: Record<string, DtTypeDef>;
  properties: Record<string, DtPropertyDef>;
}

// ---------------------------------------------------------------------------
// JSON Schema types (output format — draft-07)
// ---------------------------------------------------------------------------

export interface JsonSchema {
  $schema?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
}
