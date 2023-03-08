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

/**
 * Creates an Object from a given JSON schema definition by attempting to parse its
 * properties and structure to come up with the mandatory properties and some value.
 * The goal is to produce a valid object for the schema, but not necessarily functional.
 * @param schema JSON schema to browse (or Settings 2.0 schema)
 * @returns object
 */
export function createObjectFromSchema(schema: any) {
  const configObject: Record<string, any> = {};

  if (schema.properties) {
    Object.keys(schema.properties).forEach(propertyKey => {
      if (schema.properties[propertyKey].type && schema.properties[propertyKey].nullable === false) {
        const defaultValue = schema.properties[propertyKey].default;
        if (typeof schema.properties[propertyKey].type === "string") {
          // TODO: Check preconditions here
          switch (schema.properties[propertyKey].type) {
            case "boolean":
              configObject[propertyKey] = defaultValue ?? false;
              break;
            case "secret":
            case "text":
              configObject[propertyKey] = defaultValue ?? "";
              break;
            case "integer":
              if (!defaultValue) {
                if (
                  schema.properties[propertyKey].constraints &&
                  schema.properties[propertyKey].constraints[0] &&
                  schema.properties[propertyKey].constraints[0].minimum
                ) {
                  configObject[propertyKey] = schema.properties[propertyKey].constraints[0].minimum;
                } else {
                  configObject[propertyKey] = 0;
                }
              } else {
                configObject[propertyKey] = defaultValue;
              }
              break;
            case "set":
            case "list":
              if (!defaultValue) {
                configObject[propertyKey] = [];
                if (
                  schema.properties[propertyKey].items &&
                  schema.properties[propertyKey].items.type &&
                  schema.properties[propertyKey].items.type["$ref"]
                ) {
                  const typeRef = schema.properties[propertyKey].items.type["$ref"] as string;
                  if (typeRef.startsWith("#/enums")) {
                    const enumKey = typeRef.split("#/enums/")[1];
                    if (
                      schema.enums &&
                      schema.enums[enumKey] &&
                      schema.enums[enumKey].items &&
                      schema.enums[enumKey].items[0] &&
                      schema.enums[enumKey].items[0].value
                    ) {
                      configObject[propertyKey].push(schema.enums[enumKey].items[0].value);
                    }
                  } else if (typeRef.startsWith("#/types")) {
                    const typeName = typeRef.split("#/types/")[1];
                    if (schema.types && schema.types[typeName]) {
                      const typeSchema = schema.types[typeName];
                      typeSchema.types = schema.types;
                      typeSchema.enums = schema.enums;
                      delete typeSchema.types[typeName];
                      console.log(typeSchema);
                      const typeObject = createObjectFromSchema(typeSchema);
                      configObject[propertyKey].push(typeObject);
                    }
                  }
                }
              } else {
                configObject[propertyKey] = defaultValue;
              }
              break;
          }
        } else if (schema.properties[propertyKey].type["$ref"]) {
          const ref = schema.properties[propertyKey].type["$ref"] as string;
          if (ref.startsWith("#/types")) {
            const typeName = ref.split("#/types/")[1];
            if (schema.types && schema.types[typeName]) {
              const typeSchema = schema.types[typeName];
              typeSchema.types = schema.types;
              typeSchema.enums = schema.enums;
              delete typeSchema.types[propertyKey];
              const typeObject = createObjectFromSchema(typeSchema);
              if (typeObject) {
                configObject[propertyKey] = typeObject;
              }
            }
          } else if (ref.startsWith("#/enums")) {
            const enumName = ref.split("#/enums/")[1];
            if (
              schema.enums &&
              schema.enums[enumName] &&
              schema.enums[enumName].items &&
              schema.enums[enumName].items[0] &&
              schema.enums[enumName].items[0].value
            ) {
              configObject[propertyKey] = schema.enums[enumName].items[0].value;
            }
          }
        }
      }
    });
  }
  return configObject;
}
