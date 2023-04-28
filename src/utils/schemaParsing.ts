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

/**
 * Creates an Object from a given JSON schema definition by attempting to parse its
 * properties and structure to come up with the mandatory properties and some value.
 * The goal is to produce a valid object for the schema, but not necessarily functional.
 * @param schema JSON schema to browse (or Settings 2.0 schema)
 * @returns object
 */
export function createObjectFromSchema(schema: any) {
  const configObject: Record<string, any> = {};

  if (!schema.properties) {
    return {};
  }

  Object.keys(schema.properties).forEach(propertyKey => {
    // If the object instance already has this property it was probably set to meet
    // a precondition so we should not attempt to process it again.
    if (Object.keys(configObject).includes(propertyKey)) {
      return;
    }
    if (schema.properties[propertyKey].type && schema.properties[propertyKey].nullable === false) {
      if (schema.properties[propertyKey].precondition) {
        // First, check preconditions for this property
        const [meets, changesNeeded] = meetsPreconditions(
          schema.properties[propertyKey].precondition,
          configObject,
        );
        // If we don't meet preconditions due to other missing properties
        if (!meets) {
          if (changesNeeded.length > 0) {
            // Set the properties such that we meet the preconditions
            changesNeeded.forEach((change: Record<string, any>) => {
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
      const defaultValue = schema.properties[propertyKey].default;
      // Process primitives
      if (typeof schema.properties[propertyKey].type === "string") {
        configObject[propertyKey] = defaultValue ?? getValueForPrimitive(schema, propertyKey);
        // Process complex types
      } else if (schema.properties[propertyKey].type["$ref"]) {
        if (defaultValue) {
          // If we're lucky enough to have a default value, use it
          configObject[propertyKey] = defaultValue;
        } else {
          const ref = schema.properties[propertyKey].type["$ref"] as string;
          const [available, value] = handleRef(schema, ref);
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
 * Gives a "primitive" type of property some value according to its type.
 * The only primitives with more logic are "set" and "list" for which we attempt to extract
 * either an enum value or an instance of a referenced complex type.
 * @param schema the schema this property is part of
 * @param propertyKey the key of the property it defines
 * @returns value or null in case the primitive is not implemented
 */
function getValueForPrimitive(schema: any, propertyKey: string) {
  switch (schema.properties[propertyKey].type) {
    case "local_time":
      return "00:00";
    case "boolean":
      return false;
    case "secret":
    case "text":
      return "";
    case "integer":
      return handleNumber(schema.properties[propertyKey]);
    case "set":
    case "list":
      // Attempt to populate the list
      const listValue = [];
      if (
        schema.properties[propertyKey].items &&
        schema.properties[propertyKey].items.type &&
        schema.properties[propertyKey].items.type["$ref"]
      ) {
        const ref = schema.properties[propertyKey].items.type["$ref"] as string;
        const [available, value] = handleRef(schema, ref);
        if (available) {
          listValue.push(value);
        }
      }
      return listValue;
    default:
      console.log(
        `Cannot process property of type "${schema.properties[propertyKey].type}". ` +
          "Unkown primitive.",
      );
      return null;
  }
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
  precondition: any,
  configObject: any,
  negate: boolean = false,
): [boolean, Record<string, any>[]] {
  switch (precondition.type) {
    case "EQUALS":
      return !negate && configObject[precondition.property]
        ? [configObject[precondition.property] === precondition.expectedValue, []]
        : [false, [{ [precondition.property]: precondition.expectedValue }]];
    case "IN":
      return !negate && configObject[precondition.property]
        ? [
            Array.from(precondition.expectedValues).includes(configObject[precondition.property]),
            [],
          ]
        : [false, [{ [precondition.property]: precondition.expectedValues[0] }]];
    case "NULL":
      return !negate && configObject[precondition.property]
        ? [false, [{ [precondition.property]: null }]]
        : [true, []];
    case "NOT":
      return meetsPreconditions(precondition.precondition, configObject, true);
    case "AND":
      const andPreconditions = precondition.preconditions;
      const andMeetsArray: [boolean, Record<string, any>[]][] = Array.from(
        andPreconditions.map((andPrecondition: any) =>
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
    case "OR":
      const orPreconditions = precondition.preconditions;
      const orMeetsArray: [boolean, Record<string, any>[]][] = Array.from(
        orPreconditions.map((orPrecondition: any) =>
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
    default:
      console.log(`Cannot process precondition of type "${precondition.type}". Unknown type.`);
      return [true, []];
  }
}

/**
 * Handles generating a number for the given property. Attempts to parse any constraints
 * and provide a valid number, otherwise defaults to 0.
 * @param definition property definition for this number
 * @returns number or zero
 */
function handleNumber(definition: any): number {
  if (definition.constraints && Array.isArray(definition.constraints)) {
    const rangeConstraints = Array.from(definition.constraints).filter(
      (c: any) => c.type && c.type === "RANGE",
    );
    if (rangeConstraints.length > 0) {
      return (rangeConstraints[0] as { minimum: number }).minimum;
    }
  }

  return 0;
}

/**
 * Processes a complex type reference from within a schema attempting to
 * extract a value of compute an object instance.
 * @param schema schema that the reference is part of
 * @param ref the string value of $ref
 * @returns tuple of value extraction success and the extracted value
 */
function handleRef(schema: any, ref: string): [boolean, any] {
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
 * Extracts the first available value of an enum.
 * @param schema schema that the referenced enum is part of
 * @param enumName the name of the enum
 * @returns tuple of value extraction success and the extracted value
 */
function extractEnum(schema: any, enumName: string): [boolean, any] {
  if (
    schema.enums &&
    schema.enums[enumName] &&
    schema.enums[enumName].items &&
    schema.enums[enumName].items[0] &&
    schema.enums[enumName].items[0].value
  ) {
    return [true, schema.enums[enumName].items[0].value];
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
function extractTypeObj(schema: any, typeName: string): any {
  // Extract a sub schema
  const subSchema = schema.types[typeName];
  // Persist the original types & enums as they may be used downstream
  subSchema.types = schema.types;
  subSchema.enums = schema.enums;
  // Remove circular references
  delete subSchema.types[typeName];
  // Parse as if new schema
  return createObjectFromSchema(subSchema);
}
