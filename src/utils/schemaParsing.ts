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

/********************************************************************************
 * UTILITIES FOR AGNOSTICALLY/GNERICALLY PARSING SCHEMAS
 ********************************************************************************/

import { existsSync, readFileSync } from "fs";
import path = require("path");
import { DatasourceName } from "../interfaces/extensionMeta";
import * as logger from "./logging";

const logTrace = ["utils", "schemaParsing"];

type UnknownSchemaProperties = Record<string, Record<string, unknown>>;
interface SubPrecondition {
  type: "EQUALS" | "NULL" | "IN";
  property: string;
  expectedValue?: string;
  expectedValues?: string[];
}
interface Precondition {
  type: string;
  property?: string;
  expectedValue?: string;
  expectedValues?: string[];
  precondition?: SubPrecondition;
  preconditions?: {
    type: "EQUALS" | "NULL" | "NOT" | "IN";
    property: string;
    expectedValue?: string;
    expectedValues?: string[];
  }[];
}

interface ListItem {
  items: { type: { $ref: string } };
}
interface SchemaEnum {
  items?: { value: unknown }[];
}
interface MinimalSchema {
  properties: UnknownSchemaProperties;
  enums?: Record<string, SchemaEnum>;
  types?: Record<string, MinimalSchema>;
}

/**
 * Processes a current configuration object against a precondition definition.
 * The return is a tuple where the first element is a boolean indicating whether the precondition
 * is met or not, and the second element is a list of key/value records that can be applied to the
 * configuration object to meet the precondition.
 * @param precondition precondition definition
 * @param configObject current object being assessed
 * @param negate whether a "NOT" type of precondition is assessed
 * @returns tuple of assessment result and changes needed to meet the precondition
 */
function meetsPreconditions(
  precondition: Precondition | SubPrecondition,
  configObject: Record<string, unknown>,
  negate: boolean = false,
): [boolean, Record<string, unknown>[]] {
  const fnLogTrace = [...logTrace, "meetsPreconditions"];
  const property = precondition.property;
  switch (precondition.type) {
    case "EQUALS":
      return !negate && property && configObject[property]
        ? [configObject[property] === precondition.expectedValue, []]
        : [false, [{ [String(property)]: precondition.expectedValue }]];
    case "IN":
      return !negate && property && configObject[property] && precondition.expectedValues
        ? [Array.from(precondition.expectedValues).includes(configObject[property] as string), []]
        : [false, [{ [String(property)]: precondition.expectedValues?.[0] }]];
    case "NULL":
      return !negate && property && configObject[property]
        ? [false, [{ [property]: null }]]
        : [true, []];
    case "NOT":
      if (!precondition.precondition) {
        logger.error("Precondition is expected but not found. This is an error.", ...fnLogTrace);
        return [true, []];
      }
      return meetsPreconditions(precondition.precondition, configObject, true);
    case "AND": {
      const andPreconditions = precondition.preconditions;
      if (!andPreconditions) {
        logger.error("Preconditions is expected but not found. This is an error", ...fnLogTrace);
        return [true, []];
      }
      const andMeetsArray: [boolean, Record<string, unknown>[]][] = Array.from(
        andPreconditions.map((andPrecondition: Precondition) =>
          meetsPreconditions(andPrecondition, configObject),
        ),
      );
      if (
        andMeetsArray.some(result => {
          const [meets, changes] = result;
          return !meets && changes.length === 0;
        })
      ) {
        return [false, []];
      } else if (
        andMeetsArray.every(result => {
          const [meets] = result;
          return meets;
        })
      ) {
        return [true, []];
      }
      return [
        false,
        andMeetsArray
          .filter(result => {
            const [meets, changes] = result;
            return !meets && changes.length > 0;
          })
          .map(result => {
            const [, changes] = result;
            return changes[0];
          }),
      ];
    }
    case "OR": {
      const orPreconditions = precondition.preconditions;
      if (!orPreconditions) {
        logger.error("Preconditions is expected but not found. This is an error", ...fnLogTrace);
        return [true, []];
      }
      const orMeetsArray: [boolean, Record<string, unknown>[]][] = Array.from(
        orPreconditions.map((orPrecondition: Precondition) =>
          meetsPreconditions(orPrecondition, configObject),
        ),
      );
      if (
        orMeetsArray.every(result => {
          const [meets, changes] = result;
          return !meets && changes.length === 0;
        })
      ) {
        return [false, []];
      } else if (
        orMeetsArray.some(result => {
          const [meets] = result;
          return meets;
        })
      ) {
        return [true, []];
      }
      return [
        false,
        orMeetsArray.filter(result => {
          const [meets, changes] = result;
          return !meets && changes.length > 0;
        })[0][1], // Just pick up the first change, it's an OR
      ];
    }
    default:
      logger.error(
        `Cannot process precondition of type "${precondition.type}". Unknown type.`,
        ...fnLogTrace,
      );
      return [true, []];
  }
}

/**
 * Extracts the first available value of an enum.
 * @param schema schema that the referenced enum is part of
 * @param enumName the name of the enum
 * @returns tuple of value extraction success and the extracted value
 */
function extractEnum(schema: MinimalSchema, enumName: string): [boolean, unknown] {
  const enumItemValue = schema.enums?.[enumName].items?.[0].value;

  if (enumItemValue) {
    return [true, enumItemValue];
  }
  return [false, undefined];
}

/**
 * Parses the schema of a custom type returning some instance of the object.
 * Object contains minimum viable details based on the type schema.
 * @param schema schema that the refernced type is part of
 * @param typeName the name of the object type to process
 * @returns object instance
 */
function extractTypeObj(schema: MinimalSchema, typeName: string): unknown {
  // Extract a sub schema
  const subSchema = schema.types?.[typeName];
  if (subSchema) {
    // Persist the original types & enums as they may be used downstream
    subSchema.types = schema.types;
    subSchema.enums = schema.enums;
    // Remove circular references
    delete subSchema.types?.[typeName];
    // Parse as if new schema
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return createObjectFromSchema(subSchema);
  }
  return null;
}

/**
 * Processes a complex type reference from within a schema attempting to
 * extract a value of compute an object instance.
 * @param schema schema that the reference is part of
 * @param ref the string value of $ref
 * @returns tuple of value extraction success and the extracted value
 */
function handleRef(schema: MinimalSchema, ref: string): [boolean, unknown] {
  if (ref.startsWith("#/enums")) {
    const enumName = ref.split("#/enums/")[1];
    return extractEnum(schema, enumName);
  }
  if (ref.startsWith("#/types")) {
    const typeName = ref.split("#/types/")[1];
    return [true, extractTypeObj(schema, typeName)];
  }
  return [false, undefined];
}

/**
 * Handles generating a number for the given property. Attempts to parse any constraints
 * and provide a valid number, otherwise defaults to 0.
 * @param definition property definition for this number
 * @returns number or zero
 */
function handleNumber(definition: Record<string, unknown>): number {
  if (definition.constraints && Array.isArray(definition.constraints)) {
    const rangeConstraints = Array.from(definition.constraints).filter(
      (c: Record<string, unknown>) => c.type && c.type === "RANGE",
    );
    if (rangeConstraints.length > 0) {
      return (rangeConstraints[0] as { minimum: number }).minimum;
    }
  }

  return 0;
}

/**
 * Gives a "primitive" type of property some value according to its type.
 * The only primitives with more logic are "set" and "list" for which we attempt to extract
 * either an enum value or an instance of a referenced complex type.
 * @param schema the schema this property is part of
 * @param propertyKey the key of the property it defines
 * @returns value or null in case the primitive is not implemented
 */
function getValueForPrimitive(schema: MinimalSchema, propertyKey: string) {
  const property = schema.properties[propertyKey];
  switch (property.type) {
    case "local_time":
      return "00:00";
    case "boolean":
      return false;
    case "secret":
    case "text":
      return "";
    case "integer":
      return handleNumber(property);
    case "set":
    case "list": {
      // Attempt to populate the list
      const listValue = [];
      if ((property as unknown as ListItem).items.type.$ref) {
        const ref = (property as unknown as ListItem).items.type.$ref;
        const [available, value] = handleRef(schema, ref);
        if (available) {
          listValue.push(value);
        }
      }
      return listValue;
    }
    default:
      logger.warn(
        `Cannot process property of type "${String(property.type)}". Unkown primitive.`,
        ...logTrace,
        "getValueForPrimitive",
      );
      return null;
  }
}

/**
 * Creates an Object from a given JSON schema definition by attempting to parse its
 * properties and structure to come up with the mandatory properties and some value.
 * The goal is to produce a valid object for the schema, but not necessarily functional.
 * @param schema JSON schema to browse (or Settings 2.0 schema)
 * @param startingObject schema-compliant object to build onto; useful for enforcing pre-conditions
 * @returns object
 */
export function createObjectFromSchema(schema: unknown, startingObject?: Record<string, unknown>) {
  const configObject: Record<string, unknown> = startingObject ?? {};

  if (!Object.prototype.hasOwnProperty.call(schema, "properties")) {
    return {};
  }

  Object.keys((schema as MinimalSchema).properties).forEach(propertyKey => {
    // If the object instance already has this property it was probably set to meet
    // a precondition so we should not attempt to process it again.
    if (Object.keys(configObject).includes(propertyKey)) {
      return;
    }
    const property = (schema as MinimalSchema).properties[propertyKey];
    if (property.type && property.nullable === false) {
      if (property.precondition) {
        // First, check preconditions for this property
        const [meets, changesNeeded] = meetsPreconditions(
          property.precondition as Precondition,
          configObject,
        );
        // If we don't meet preconditions due to other missing properties
        if (!meets) {
          if (changesNeeded.length > 0) {
            // Set the properties such that we meet the preconditions
            changesNeeded.forEach((change: Record<string, unknown>) => {
              Object.keys(change).forEach(key => {
                configObject[key] = change[key];
              });
            });
            // Otherwise, skip the current property (it doesn't apply)
          } else {
            return;
          }
        }
      }
      // Then, attempt to assign a value to it
      const defaultValue = property.default;
      // Process primitives
      if (typeof property.type === "string") {
        configObject[propertyKey] =
          defaultValue ?? getValueForPrimitive(schema as MinimalSchema, propertyKey);
        // Process complex types
      } else if (Object.prototype.hasOwnProperty.call(property.type, "$ref")) {
        if (defaultValue) {
          // If we're lucky enough to have a default value, use it
          configObject[propertyKey] = defaultValue;
        } else {
          const ref = (property.type as { $ref: string }).$ref;
          const [available, value] = handleRef(schema as MinimalSchema, ref);
          if (available) {
            configObject[propertyKey] = value;
          }
        }
      }
    }
  });

  return configObject;
}

/**
 * Creates a generic Monitoring Configuration object that applies to the given datasource.
 * This cannot be imported directly to Dynatrace, modifications will be needed.
 * @param datasource one of the supported datasources
 * @returns a configuration object that complies with the Dynatrace schema
 */
export function createGenericConfigObject(
  datasource: DatasourceName,
  startingObject?: Record<string, unknown>,
) {
  const schemaPath = path.join(
    __filename,
    "..",
    "..",
    "src",
    "assets",
    "jsonSchemas",
    `${datasource.toLowerCase()}-generic-schema.json`,
  );
  // If we don't have the file, it's not supported yet by Dynatrace Extensions
  if (!existsSync(schemaPath)) {
    return { description: "", version: "0.0.0" };
  }
  const schema = JSON.parse(readFileSync(schemaPath).toString()) as unknown;
  return createObjectFromSchema(schema, startingObject);
}
