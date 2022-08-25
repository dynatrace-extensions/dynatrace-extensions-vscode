/**
 * Extracts all attribute keys of a given entity type from topology section of the extension.
 * @param entityType entity type to extract for
 * @param extension extension.yaml serialized as object
 * @returns
 */
export function getAttributesKeysFromTopology(
  entityType: string,
  extension: ExtensionStub
): string[] {
  var attributes: string[] = [];
  extension.topology.types
    .filter((type) => type.name.toLowerCase() === entityType)
    .forEach((type) => {
      type.rules.forEach((rule) => {
        rule.attributes.forEach((attribute) => {
          if (attribute.key) {
            attributes.push(attribute.key);
          }
        });
      });
    });

  return attributes;
}

/**
 * Universally returns the datasource portion of the extension.
 * @param extension extension.yaml serialized as object
 * @returns extension datasource
 */
export function getExtensionDatasource(extension: ExtensionStub): DatasourceGroup[] {
  if (extension.snmp) {
    return extension.snmp;
  }
  if (extension.wmi) {
    return extension.wmi;
  }
  if (extension.sql) {
    return extension.sql;
  }
  if (extension.prometheus) {
    return extension.prometheus;
  }
  return [];
}

/**
 * Given a metric condition pattern, extracts all dimension keys from matching groups and subgroups.
 * @param conditionPattern condition pattern as expressed in toplogy rules
 * @param extension extension.yaml serialized as object
 * @returns list of dimension keys
 */
export function getDimensionsFromMatchingMetrics(
  conditionPattern: string,
  extension: ExtensionStub
): string[] {
  var dimensions: string[] = [];
  var matcher = conditionPattern.split("(")[0];
  var pattern = conditionPattern.split("(")[1].split(")")[0];
  var datasource = getExtensionDatasource(extension);
  datasource.forEach((group) => {
    // If the group has metrics, group dimensions should be added if
    // any of the metrics match the pattern
    if (group.metrics) {
      if (
        group.metrics.filter((metric) => {
          switch (matcher) {
            case "$eq":
              return metric.key === pattern;
            case "$prefix":
              return metric.key.startsWith(pattern);
            default:
              return false;
          }
        }).length > 0
      ) {
        if (group.dimensions) {
          dimensions.push(
            ...group.dimensions
              .filter((dimension) => !dimensions.includes(dimension.key))
              .map((dimension) => dimension.key)
          );
        }
      }
    }
    // If the group has subgroups, both group and subgroup dimensions should be
    // added if any of the metrics match the pattern
    if (group.subgroups) {
      group.subgroups.forEach((subgroup) => {
        if (
          subgroup.metrics.filter((metric) => {
            switch (matcher) {
              case "$eq":
                return metric.key === pattern;
              case "$prefix":
                return metric.key.startsWith(pattern);
              default:
                return false;
            }
          }).length > 0
        ) {
          if (group.dimensions) {
            dimensions.push(
              ...group.dimensions
                .filter((dimension) => !dimensions.includes(dimension.key))
                .map((dimension) => dimension.key)
            );
          }
          if (subgroup.dimensions) {
            dimensions.push(
              ...subgroup.dimensions
                .filter((dimension) => !dimensions.includes(dimension.key))
                .map((dimension) => dimension.key)
            );
          }
        }
      });
    }
  });
  return dimensions;
}

/**
 * Extracts dimension keys from `requiredDimensions` section of a specific rule & type definition.
 * @param typeIdx index of topology type definition
 * @param ruleIdx index of rule within the type definition
 * @param extension extension.yaml serialized as object
 * @returns list of dimension keys
 */
export function getRequiredDimensions(
  typeIdx: number,
  ruleIdx: number,
  extension: ExtensionStub
): string[] {
  var requiredDimensions = extension.topology.types[typeIdx].rules[ruleIdx].requiredDimensions;
  if (!requiredDimensions) {
    return [];
  }

  return requiredDimensions.map((dimension) => dimension.key);
}

export function getRelationships(
  entityType: string,
  direction: "to" | "from",
  extension: ExtensionStub
): string[] {
  return extension.topology.relationships
    .filter((rel) => (direction === "to" ? rel.toType === entityType : rel.fromType === entityType))
    .map((rel) => toCamelCase(rel.typeOfRelation));
}

function toCamelCase(text: string) {
  var newStr = "";
  text = text.toLowerCase();
  var chunks = text.split("_");
  for (let [i, chunk] of chunks.entries()) {
    if (i === 0) {
      newStr += chunk;
    } else {
      newStr += chunk[0].toUpperCase() + chunk.substring(1, chunk.length);
    }
  }

  return newStr;
}
