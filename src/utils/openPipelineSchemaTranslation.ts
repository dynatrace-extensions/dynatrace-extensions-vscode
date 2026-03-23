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

import {
  DtConstraint,
  DtEnumDef,
  DtItemDef,
  DtPrecondition,
  DtPropertyDef,
  DtPropertyType,
  DtSchema,
  DtTypeDef,
  DtTypeRef,
  JsonSchema,
} from "../interfaces/openPipelineSchemas";

// ---------------------------------------------------------------------------
// Translation helpers
// ---------------------------------------------------------------------------

function isTypeRef(type: DtPropertyType): type is DtTypeRef {
  return typeof type === "object" && "$ref" in type;
}

/** Dynatrace $ref paths use "#/types/" or "#/enums/" — map both to "#/$defs/" */
export function translateRef(ref: string): string {
  return ref.replace(/^#\/(types|enums)\//, "#/$defs/");
}

function applyStringConstraints(schema: JsonSchema, constraints: DtConstraint[]): void {
  for (const constraint of constraints) {
    switch (constraint.type) {
      case "LENGTH":
        if (constraint.minLength !== undefined) schema.minLength = constraint.minLength;
        if (constraint.maxLength !== undefined) schema.maxLength = constraint.maxLength;
        break;
      case "NOT_BLANK":
      case "NOT_EMPTY":
        schema.minLength = Math.max(schema.minLength ?? 0, 1);
        break;
      case "NO_WHITESPACE":
        schema.pattern = "^\\S*$";
        break;
      case "PATTERN":
        if (constraint.pattern) schema.pattern = constraint.pattern;
        break;
    }
  }
}

/** Translate the type of an array item (which cannot itself be a list/set) */
export function translateItemSchema(item: DtItemDef): JsonSchema {
  const { type, constraints = [] } = item;
  if (isTypeRef(type)) {
    return { $ref: translateRef(type.$ref) };
  }
  return translatePrimitiveSchema(type, constraints);
}

/** Translate a Dynatrace primitive type string to a JSON Schema object */
export function translatePrimitiveSchema(dtType: string, constraints: DtConstraint[]): JsonSchema {
  switch (dtType) {
    case "text":
    case "secret":
    case "setting": {
      const schema: JsonSchema = { type: "string" };
      applyStringConstraints(schema, constraints);
      return schema;
    }
    case "boolean":
      return { type: "boolean" };
    case "integer":
      return { type: "integer" };
    case "float":
      return { type: "number" };
    default:
      // Unknown primitives treated as string to avoid breaking validation
      return { type: "string" };
  }
}

/** Translate a single Dynatrace property definition to a JSON Schema node */
export function translatePropertySchema(prop: DtPropertyDef): JsonSchema {
  const { type, constraints = [], nullable, minObjects, maxObjects, items } = prop;

  let schema: JsonSchema;

  if (isTypeRef(type)) {
    schema = { $ref: translateRef(type.$ref) };
  } else if (type === "list" || type === "set") {
    schema = { type: "array" };

    if (type === "set") schema.uniqueItems = true;
    if (items) schema.items = translateItemSchema(items);

    const hasNotEmpty = constraints.some(c => c.type === "NOT_EMPTY");
    const effectiveMin = Math.max(hasNotEmpty ? 1 : 0, minObjects ?? 0);
    if (effectiveMin > 0) schema.minItems = effectiveMin;
    if (maxObjects !== undefined && maxObjects > 1) schema.maxItems = maxObjects;
  } else {
    schema = translatePrimitiveSchema(type, constraints);
  }

  // Wrap nullable types so the field can also be explicitly set to null
  if (nullable) {
    schema = { anyOf: [schema, { type: "null" }] };
  }

  return schema;
}

function translateProperties(dtProps: Record<string, DtPropertyDef>): Record<string, JsonSchema> {
  const properties: Record<string, JsonSchema> = {};
  for (const [key, prop] of Object.entries(dtProps)) {
    properties[key] = translatePropertySchema(prop);
  }
  return properties;
}

/** Translate a Dynatrace enum definition to a JSON Schema */
export function translateEnum(dtEnum: DtEnumDef): JsonSchema {
  return {
    type: "string",
    enum: dtEnum.items.map(item => item.value),
  };
}

/**
 * Compute the list of unconditionally required property names.
 * A property is required when it is non-nullable and has no precondition.
 */
export function computeRequiredProperties(dtProps: Record<string, DtPropertyDef>): string[] {
  return Object.entries(dtProps)
    .filter(([, prop]) => !prop.nullable && !prop.precondition)
    .map(([key]) => key);
}

/** Build a JSON Schema condition block from a single Dynatrace precondition. */
function buildConditionSchema(precondition: DtPrecondition): JsonSchema {
  switch (precondition.type) {
    case "EQUALS":
      return {
        properties: { [precondition.property]: { const: precondition.expectedValue } },
        required: [precondition.property],
      };
    case "NOT":
      return { not: buildConditionSchema(precondition.precondition) };
    case "IN":
      return {
        properties: { [precondition.property]: { enum: precondition.expectedValues } },
        required: [precondition.property],
      };
  }
}

/** Serialize a precondition to a stable string key for grouping. */
function preconditionKey(precondition: DtPrecondition): string {
  return JSON.stringify(precondition);
}

/**
 * Build if/then conditional blocks from preconditioned properties.
 * Properties sharing the same precondition are grouped into a single if/then.
 */
export function buildConditionals(dtProps: Record<string, DtPropertyDef>): JsonSchema[] {
  const groups = new Map<string, { precondition: DtPrecondition; propNames: string[] }>();

  for (const [key, prop] of Object.entries(dtProps)) {
    if (!prop.precondition) continue;

    const groupKey = preconditionKey(prop.precondition);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.propNames.push(key);
    } else {
      groups.set(groupKey, { precondition: prop.precondition, propNames: [key] });
    }
  }

  const conditionals: JsonSchema[] = [];
  for (const { precondition, propNames } of groups.values()) {
    conditionals.push({
      if: buildConditionSchema(precondition),
      then: { required: propNames },
    });
  }

  return conditionals;
}

/**
 * Build a complete object schema with properties, required, additionalProperties, and conditionals.
 */
function buildObjectSchema(dtProps: Record<string, DtPropertyDef>): JsonSchema {
  const schema: JsonSchema = {
    type: "object",
    properties: translateProperties(dtProps),
    additionalProperties: false,
  };

  const required = computeRequiredProperties(dtProps);
  if (required.length > 0) {
    schema.required = required;
  }

  const conditionals = buildConditionals(dtProps);
  if (conditionals.length > 0) {
    schema.allOf = conditionals;
  }

  return schema;
}

/** Translate a Dynatrace complex type definition to a JSON Schema object */
export function translateType(dtType: DtTypeDef): JsonSchema {
  return buildObjectSchema(dtType.properties);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Translate a raw Dynatrace schema (parsed JSON) into a standard JSON Schema */
export function translateSchema(raw: unknown): JsonSchema {
  const dt = raw as DtSchema;

  const $defs: Record<string, JsonSchema> = {};

  for (const [name, dtEnum] of Object.entries(dt.enums ?? {})) {
    $defs[name] = translateEnum(dtEnum);
  }
  for (const [name, dtType] of Object.entries(dt.types ?? {})) {
    $defs[name] = translateType(dtType);
  }

  const jsonSchema: JsonSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: dt.displayName,
    description: dt.description,
    ...buildObjectSchema(dt.properties),
  };

  if (Object.keys($defs).length > 0) {
    jsonSchema.$defs = $defs;
  }

  return jsonSchema;
}
