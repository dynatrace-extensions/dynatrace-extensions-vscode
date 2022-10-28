/**
 * Normalize semi-invalid versions of extension because they get re-written cluster-side.
 * E.g. version can be 3 and cluster will re-write to 3.0.0
 * @param version version as-is
 * @returns version normalized
 */
export function normalizeExtensionVersion(version: string): string {
  let versionParts = version.split(".");
  while (versionParts.length < 3) {
    versionParts.push("0");
  }
  return versionParts.slice(0, 3).join(".");
}

/**
 * Increments the current extension version by 0.0.1 to avoid version conflicts.
 * @param currentVersion the current version string
 * @returns the incremented version
 */
export function incrementExtensionVersion(currentVersion: string) {
  currentVersion = normalizeExtensionVersion(currentVersion);
  let versionParts = currentVersion.split(".");
  return [...versionParts.slice(0, versionParts.length - 1), Number(versionParts[versionParts.length - 1]) + 1].join(
    "."
  );
}

/**
 * Extracts all attribute keys of a given entity type from topology section of the extension.
 * @param entityType entity type to extract for
 * @param extension extension.yaml serialized as object
 * @returns
 */
export function getAttributesKeysFromTopology(entityType: string, extension: ExtensionStub): string[] {
  var attributes: string[] = [];
  if (extension.topology && extension.topology.types) {
    extension.topology.types
      .filter((type) => (type.name ? type.name.toLowerCase() === entityType : false))
      .forEach((type) => {
        if (type.rules) {
          type.rules.forEach((rule) => {
            if (rule.attributes) {
              rule.attributes.forEach((attribute) => {
                if (attribute.key) {
                  attributes.push(attribute.key);
                }
              });
            }
          });
        }
      });
  }

  return attributes;
}

/**
 * Extracts all attributes (key and displayName) of a given entity type from the topology section
 * of the extension. Optionally, you can provide a list of keys to exclude from the response.
 * @param entityType entity type to extract for
 * @param extension extension.yaml serialized as object
 * @param excludeKeys attributes with these keys will be excluded from the response
 * @returns list of entity attributes
 */
export function getAttributesFromTopology(
  entityType: string,
  extension: ExtensionStub,
  excludeKeys?: string[]
): { key: string; displayName: string }[] {
  var attributes: { key: string; displayName: string }[] = [];
  if (extension.topology && extension.topology.types) {
    extension.topology.types
      .filter((type) => (type.name ? type.name.toLowerCase() === entityType : false))
      .forEach((type) => {
        if (type.rules) {
          type.rules.forEach((rule) => {
            if (rule.attributes) {
              rule.attributes
                .filter((property) =>
                  property.key ? (excludeKeys ? !excludeKeys.includes(property.key) : true) : false
                )
                .forEach((property) => {
                  if (
                    !attributes.some(
                      (attribute) =>
                        JSON.stringify(attribute) ===
                        JSON.stringify({ key: property.key, displayName: property.displayName })
                    )
                  ) {
                    attributes.push({
                      key: property.key,
                      displayName: property.displayName,
                    });
                  }
                });
            }
          });
        }
      });
  }
  return attributes;
}

/**
 * Extracts all metric keys from metric selectors found in the charts of a given chart card.
 * The card and screen definition must be referenced by index.
 * @param screenIdx index of the screen definition
 * @param cardIdx index of the chart card definition
 * @param extension extension.yaml serialized as object
 * @returns list of metric keys
 */
export function getMetricKeysFromChartCard(screenIdx: number, cardIdx: number, extension: ExtensionStub): string[] {
  var metrics: string[] = [];
  if (
    extension.screens &&
    extension.screens[screenIdx].chartsCards &&
    extension.screens[screenIdx].chartsCards![cardIdx].charts
  ) {
    extension.screens[screenIdx].chartsCards![cardIdx].charts.forEach((c) => {
      if (c.graphChartConfig) {
        c.graphChartConfig.metrics.forEach((ms) => {
          metrics.push(ms.metricSelector.split(":")[0]);
        });
      }
      if (c.pieChartConfig) {
        metrics.push(c.pieChartConfig.metric.metricSelector.split(":")[0]);
      }
      if (c.singleValueConfig) {
        metrics.push(c.singleValueConfig.metric.metricSelector.split(":")[0]);
      }
    });
  }
  return metrics;
}

/**
 * Extracts all metric keys from metric selectors found in the charts of a given entities list card.
 * The card and screen definition must be referenced by index.
 * @param screenIdx index of the screen definition
 * @param cardIdx index of the entities list card definition
 * @param extension extension.yaml serialized as object
 * @returns list of metric keys
 */
export function getMetricKeysFromEntitiesListCard(
  screenIdx: number,
  cardIdx: number,
  extension: ExtensionStub
): string[] {
  var metrics: string[] = [];
  if (
    extension.screens &&
    extension.screens[screenIdx].entitiesListCards &&
    extension.screens[screenIdx].entitiesListCards![cardIdx].charts
  ) {
    extension.screens![screenIdx].entitiesListCards![cardIdx].charts!.forEach((c) => {
      if (c.graphChartConfig) {
        c.graphChartConfig.metrics.forEach((ms) => {
          metrics.push(ms.metricSelector.split(":")[0]);
        });
      }
      if (c.pieChartConfig) {
        metrics.push(c.pieChartConfig.metric.metricSelector.split(":")[0]);
      }
      if (c.singleValueConfig) {
        metrics.push(c.singleValueConfig.metric.metricSelector.split(":")[0]);
      }
    });
  }
  return metrics;
}

/**
 * Extracts all the metric keys of a given entity. Metrics are extracted from the datasource
 * section, then cross-referenced with topology rules to form associations with the entity.
 * Exclusions can be provided as a list of keys.
 * @param typeIdx index of entity type within the topology section
 * @param extension extension.yaml serialized as object
 * @param excludeKeys keys to exclude from the response
 */
export function getEntityMetrics(typeIdx: number, extension: ExtensionStub, excludeKeys: string[] = []) {
  var matchingMetrics: string[] = [];
  var allMetrics = getAllMetricKeysFromDataSource(extension);
  var patterns = getEntityMetricPatterns(typeIdx, extension);
  if (allMetrics) {
    patterns.forEach((pattern) => {
      let matcher = pattern.split("(")[0];
      let value = pattern.split("(")[1].split(")")[0];
      matchingMetrics.push(
        ...allMetrics.filter((metric) => {
          switch (matcher) {
            case "$eq":
              return metric === value && !matchingMetrics.includes(metric);
            case "$prefix":
              return metric.startsWith(value) && !matchingMetrics.includes(metric);
            default:
              return false;
          }
        })
      );
    });
    return matchingMetrics.filter((metric) => !excludeKeys.includes(metric));
  }
  return [];
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
  // TODO: Figure out support for Python
  if (extension.python) {
    return [];
  }
  return [];
}

/**
 * Returns the name of the extension datasource.
 * Name coincides with the YAML node that defines the datasource portion of the extension.
 * @param extension extension.yaml serialized as object
 * @returns datasource name
 */
export function getDatasourceName(extension: ExtensionStub): string {
  if (extension.snmp) {
    return "snmp";
  }
  if (extension.wmi) {
    return "wmi";
  }
  if (extension.sql) {
    return "sql";
  }
  if (extension.prometheus) {
    return "prometheus";
  }
  if (extension.python) {
    return "python";
  }
  return "unsupported";
}

/**
 * Gets all the Prometheus metric keys that have been already inserted in the datasource section
 * of the YAML in a given group/subgroup location. Specify the group and subgroup by index.
 * The group index is mandatory if subgroup metrics should be returned as one includes the other.
 * @param extension extension.yaml serialized as object
 * @param groupIdx the index of the group where metrics should be extracted from
 * @param subgroupIdx the index of the subgroup where metrics should be extracted from
 * @returns list of (prometheus) metric keys
 */
export function getPrometheusMetricKeys(
  extension: ExtensionStub,
  groupIdx: number = -2,
  subgroupIdx: number = -2
): string[] {
  var metricKeys: string[] = [];
  if (groupIdx !== -2) {
    // Metrics at group level
    if (extension.prometheus![groupIdx].metrics) {
      metricKeys.push(
        ...extension
          .prometheus![groupIdx].metrics!.filter((metric) => metric.value && metric.value.startsWith("metric:"))
          .map((metric) => metric.value.split("metric:")[1])
      );
    }
    if (subgroupIdx !== -2) {
      // Metrics at subgroup level
      if (extension.prometheus![groupIdx].subgroups![subgroupIdx].metrics) {
        metricKeys.push(
          ...extension
            .prometheus![groupIdx].subgroups![subgroupIdx].metrics!.filter(
              (metric) => metric.value && metric.value.startsWith("metric:")
            )
            .map((metric) => metric.value.split("metric:")[1])
        );
      }
    }
  }
  return metricKeys;
}

/**
 * Gets all the Prometheus label keys that have been already inserted in the datasource section
 * of the YAML in a given group/subgroup location. Specify the group and subgroup by index.
 * The group index is mandatory if subgroup labels should be returned as one includes the other.
 * @param extension extension.yaml serialized as object
 * @param groupIdx the index of the group where labels should be extracted from
 * @param subgroupIdx the index of the subgroup where labels should be extracted from
 * @returns list of (prometheus) label keys
 */
export function getPrometheusLabelKeys(
  extension: ExtensionStub,
  groupIdx: number = -2,
  subgroupIdx: number = -2
): string[] {
  var labelKeys: string[] = [];
  if (groupIdx !== -2) {
    // Dimensions at group level
    if (extension.prometheus![groupIdx].dimensions) {
      labelKeys.push(
        ...extension
          .prometheus![groupIdx].dimensions!.filter(
            (dimension) => dimension.value && dimension.value.startsWith("label:")
          )
          .map((dimension) => dimension.value.split("label:")[1])
      );
    }
    if (subgroupIdx !== -2) {
      // Dimensions at subgroup level
      if (extension.prometheus![groupIdx].subgroups![subgroupIdx].dimensions) {
        labelKeys.push(
          ...extension
            .prometheus![groupIdx].subgroups![subgroupIdx].dimensions!.filter(
              (dimension) => dimension.value && dimension.value.startsWith("label:")
            )
            .map((dimension) => dimension.value.split("label:")[1])
        );
      }
    }
  }
  return labelKeys;
}

/**
 * Iterates through the datasource group and subgroup metrics to extract the value given
 * a specific metric key.
 * @param metricKey metric key to extract the value for
 * @param extension extesnion.yaml serialized as object
 * @returns value or empty string of not found
 */
export function getMetricValue(metricKey: string, extension: ExtensionStub): string {
  const datasource = getExtensionDatasource(extension);
  for (let group of datasource) {
    if (group.metrics) {
      for (let metric of group.metrics) {
        if (metric.key === metricKey) {
          return metric.value;
        }
      }
    }
    if (group.subgroups) {
      for (let subgroup of group.subgroups) {
        if (subgroup.metrics) {
          for (let metric of subgroup.metrics) {
            if (metric.key === metricKey) {
              return metric.value;
            }
          }
        }
      }
    }
  }
  return "";
}

/**
 * Given a metric key, returns the metric display name as defined in metadata.
 * If not found, empty string is returned.
 * @param metricKey key to search for
 * @param extension extension.yaml serialized as object
 * @returns display name or empty string if not found
 */
export function getMetricDisplayName(metricKey: string, extension: ExtensionStub): string {
  if (extension.metrics) {
    let idx = extension.metrics.findIndex((m) => m.key === metricKey && m.metadata !== undefined);
    if (idx >= 0) {
      return extension.metrics[idx].metadata.displayName;
    }
  }
  return "";
}

/**
 * Extracts a list of feature sets and their included metrics for the whole extension.
 * @param extension extension.yaml serialized as object
 * @returns list of feature sets and metrics
 */
export function getAllMetricsByFeatureSet(extension: ExtensionStub): FeatureSetDoc[] {
  var featureSets: FeatureSetDoc[] = [{ name: "default", metrics: [] }];
  var datasource = getExtensionDatasource(extension);

  // Loop through groups, subgroups, and metrics to extract feature sets
  datasource.forEach((group) => {
    if (group.featureSet && !featureSets.map((fs) => fs.name).includes(group.featureSet)) {
      featureSets.push({
        name: group.featureSet,
        metrics: [],
      });
    }
    if (group.metrics) {
      let fsIdx = featureSets.findIndex((fs) => fs.name === (group.featureSet || "default"));
      featureSets[fsIdx].metrics.push(...group.metrics.map((m) => m.key));
    }

    if (group.subgroups) {
      group.subgroups.forEach((sg) => {
        if (sg.featureSet && !featureSets.map((fs) => fs.name).includes(sg.featureSet)) {
          featureSets.push({
            name: sg.featureSet,
            metrics: [],
          });
        }

        sg.metrics.forEach((m) => {
          if (m.featureSet) {
            if (!featureSets.map((fs) => fs.name).includes(m.featureSet)) {
              featureSets.push({
                name: m.featureSet,
                metrics: [m.key],
              });
            } else {
              let fsIdx = featureSets.findIndex((fs) => fs.name === "default");
              if (fsIdx !== -1 && !featureSets[fsIdx].metrics.includes(m.key)) {
                featureSets[fsIdx].metrics.push(m.key);
              }
            }
          } else if (sg.featureSet) {
            let fsIdx = featureSets.findIndex((fs) => fs.name === sg.featureSet);
            if (fsIdx !== -1 && !featureSets[fsIdx].metrics.includes(m.key)) {
              featureSets[fsIdx].metrics.push(m.key);
            }
          } else if (group.featureSet) {
            let fsIdx = featureSets.findIndex((fs) => fs.name === group.featureSet);
            if (fsIdx !== -1 && !featureSets[fsIdx].metrics.includes(m.key)) {
              featureSets[fsIdx].metrics.push(m.key);
            }
          } else {
            let fsIdx = featureSets.findIndex((fs) => fs.name === "default");
            if (fsIdx !== -1 && !featureSets[fsIdx].metrics.includes(m.key)) {
              featureSets[fsIdx].metrics.push(m.key);
            }
          }
        });
      });
    }
  });

  return featureSets;
}

/**
 * Extracts all the conditions (patterns) for Metrics sourceType across all rules of a given
 * topology type. The topology type must be referenced by index.
 * @param typeIdx index of the topology type
 * @param extension extension.yaml serialized as object
 * @returns list of condition patterns
 */
export function getEntityMetricPatterns(typeIdx: number, extension: ExtensionStub) {
  var patterns: string[] = [];
  if (extension.topology.types[typeIdx].rules) {
    extension.topology.types[typeIdx].rules.forEach((rule) => {
      if (rule.sources) {
        rule.sources.forEach((source) => {
          if (source.sourceType === "Metrics" && !patterns.includes(source.condition)) {
            patterns.push(source.condition);
          }
        });
      }
    });
  }
  return patterns;
}

/**
 * Extracts all metrics keys detected within the datasource section of the extension.yaml
 * @param extension extension.yaml serialized as object
 * @returns list of metric keys
 */
export function getAllMetricKeysFromDataSource(extension: ExtensionStub): string[] {
  var metrics: string[] = [];
  var datasource = getExtensionDatasource(extension);
  datasource.forEach((group) => {
    if (group.metrics) {
      group.metrics.forEach((metric) => {
        if (!metrics.includes(metric.key)) {
          metrics.push(metric.key);
        }
      });
    }
    if (group.subgroups) {
      group.subgroups.forEach((subgroup) => {
        if (subgroup.metrics) {
          subgroup.metrics.forEach((metric) => {
            if (!metrics.includes(metric.key)) {
              metrics.push(metric.key);
            }
          });
        }
      });
    }
  });
  return metrics;
}

/**
 * Extracts all metrics keys and values detected within the datasource section of the extension.yaml
 * @param extension extension.yaml serialized as object
 * @returns list of metric keys
 */
export function getAllMetricKeysAndValuesFromDataSource(extension: ExtensionStub): { key: string; value: string }[] {
  var data: { key: string; value: string }[] = [];
  var datasource = getExtensionDatasource(extension);
  datasource.forEach((group) => {
    if (group.metrics) {
      group.metrics.forEach((metric) => {
        if (!data.map((d) => d.key).includes(metric.key)) {
          data.push({ key: metric.key, value: metric.value });
        }
      });
    }
    if (group.subgroups) {
      group.subgroups.forEach((subgroup) => {
        if (subgroup.metrics) {
          subgroup.metrics.forEach((metric) => {
            if (!data.map((d) => d.key).includes(metric.key)) {
              data.push({ key: metric.key, value: metric.value });
            }
          });
        }
      });
    }
  });
  return data;
}

/**
 * Given a metric condition pattern, extracts all dimension keys from matching groups and subgroups.
 * @param conditionPattern condition pattern as expressed in toplogy rules
 * @param extension extension.yaml serialized as object
 * @returns list of dimension keys
 */
export function getDimensionsFromMatchingMetrics(conditionPattern: string, extension: ExtensionStub): string[] {
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
export function getRequiredDimensions(typeIdx: number, ruleIdx: number, extension: ExtensionStub): string[] {
  var requiredDimensions = extension.topology.types[typeIdx].rules[ruleIdx].requiredDimensions;
  if (!requiredDimensions) {
    return [];
  }

  return requiredDimensions.map((dimension) => dimension.key);
}

/**
 * Extracts all the types of relations of a given entity type in a particular direction.
 * The relationship types are converted to camel case to match the format required
 * for entity selectors.
 * @param entityType entity type to extract for
 * @param direction to or from relationships
 * @param extension extension.yaml serialized as object
 * @returns list of relationships
 */
export function getRelationshipTypes(entityType: string, direction: "to" | "from", extension: ExtensionStub): string[] {
  return extension.topology.relationships
    .filter((rel) => (direction === "to" ? rel.toType === entityType : rel.fromType === entityType))
    .map((rel) => relationToCamelCase(rel.typeOfRelation));
}

/**
 * Extracts all the topology relationships (to and from) for a given entity.
 * @param entityType entity type to exract the rules for
 * @param extension extension.yaml serialized as object
 * @returns
 */
export function getRelationships(
  entityType: string,
  extension: ExtensionStub
): { entity: string; relation: string; direction: "to" | "from" }[] {
  if (extension.topology && extension.topology.relationships) {
    return extension.topology.relationships
      .filter((rel) => rel.toType === entityType || rel.fromType === entityType)
      .map((rel) => ({
        entity: rel.toType === entityType ? rel.fromType : rel.toType,
        relation: relationToCamelCase(rel.typeOfRelation),
        direction: rel.toType === entityType ? "to" : "from",
      }));
  }
  return [];
}

/**
 * Extracts the display name of a given entity type.
 * @param entityType type of entity
 * @param extension extension.yaml serialized as object
 * @returns displayName of type if found in topology
 */
export function getEntityName(entityType: string, extension: ExtensionStub) {
  let foundType = extension.topology.types.filter((t) => t.name === entityType).pop();
  if (foundType) {
    return foundType.displayName;
  }

  return "";
}

/**
 * Extracts the keys of entities list cards of a given entity type.
 * The entity type is referenced by the index of its screen definition.
 * @param screenIdx index of the entity's screen definition
 * @param extension extension.yaml serialized as object
 * @returns list of card keys
 */
export function getEntitiesListCardKeys(screenIdx: number, extension: ExtensionStub) {
  if (extension.screens && extension.screens[screenIdx].entitiesListCards) {
    return extension.screens[screenIdx].entitiesListCards!.map((elc) => elc.key);
  }
  return [];
}

/**
 * Converts a generic type of relation from ID (snake case) to camel case for use in selectors.
 * e.g. CHILD_OF must be isChildOf in selectors.
 * @param typeOfRelation relation type to convert to camel case
 * @returns camel case converted relation type
 */
function relationToCamelCase(typeOfRelation: string) {
  switch (typeOfRelation) {
    case "RUNS_ON":
      return "runsOn";
    case "SAME_AS":
      return "isSameAs";
    case "INSTANCE_OF":
      return "isInstanceOf";
    case "CHILD_OF":
      return "isChildOf";
    case "CALLS":
      return "calls";
    case "PART_OF":
      return "isPartOf";
    default:
      return "";
  }
}

/**
 * Extracts all the keys of charts cards belonging to a given entity type.
 * The entity type is specified using its index within the screens section of the yaml.
 * @param screenIdx index of the entity's screen definition
 * @param extension extension.yaml serialized as object
 * @returns list of chart card keys
 */
export function getEntityChartCardKeys(screenIdx: number, extension: ExtensionStub): string[] {
  if (!extension.screens || !extension.screens![screenIdx].chartsCards) {
    return [];
  }

  return extension.screens![screenIdx].chartsCards!.map((cc) => cc.key);
}

type CardMeta = {
  key: string;
  type: "ENTITIES_LIST" | "CHART_GROUP" | "MESSAGE" | "LOGS" | "EVENTS";
};

/**
 * Extracts all the cards defined within layouts of a given screen as short representations.
 * The screen must be referenced by index within the screens list.
 * @param screenIdx index of the screen in list
 * @param extension extension.yaml serialized as object
 * @returns list of card metadatas
 */
export function getCardMetaFromLayout(screenIdx: number, extension: ExtensionStub): CardMeta[] {
  var cards: CardMeta[] = [];

  if (
    extension.screens![screenIdx].listSettings &&
    extension.screens![screenIdx].listSettings!.layout &&
    extension.screens![screenIdx].listSettings!.layout!.cards
  ) {
    extension.screens![screenIdx].listSettings!.layout!.cards!.forEach((card) => {
      if (cards.findIndex((c) => c.key === card.key) === -1) {
        // Only add valid cards. User may have mis-typed keys.
        if (card.key && card.type) {
          cards.push({ key: card.key, type: card.type });
        }
      }
    });
  }

  if (
    extension.screens![screenIdx].detailsSettings &&
    extension.screens![screenIdx].detailsSettings!.layout &&
    extension.screens![screenIdx].detailsSettings!.layout!.cards
  ) {
    extension.screens![screenIdx].detailsSettings!.layout!.cards!.forEach((card) => {
      if (cards.findIndex((c) => c.key === card.key) === -1) {
        // Only add valid cards. User may have mis-typed keys.
        if (card.key && card.type) {
          cards.push({ key: card.key, type: card.type });
        }
      }
    });
  }

  return cards;
}

/**
 * Extracts all the cards as short representations, with details taken from each card's definition.
 * The screen must be referenced by index within the screens list.
 * @param screenIdx index of the screen in list
 * @param extension extension.yaml serialized as object
 * @param cardType optional - narrow down to single section of the yaml.
 * @returns list of card metadatas
 */
export function getCardMetaFromDefinition(
  screenIdx: number,
  extension: ExtensionStub,
  cardType?: "entitiesListCards" | "chartsCards" | "eventsCards" | "logsCards" | "messageCards"
): CardMeta[] {
  var cards: CardMeta[] = [];

  if (!cardType || cardType === "entitiesListCards") {
    if (extension.screens![screenIdx].entitiesListCards) {
      extension.screens![screenIdx].entitiesListCards?.forEach((card) => {
        if (cards.findIndex((c) => c.key === card.key) === -1) {
          cards.push({ key: card.key, type: "ENTITIES_LIST" });
        }
      });
    }
  }
  if (!cardType || cardType === "chartsCards") {
    if (extension.screens![screenIdx].chartsCards) {
      extension.screens![screenIdx].chartsCards?.forEach((card) => {
        if (cards.findIndex((c) => c.key === card.key) === -1) {
          cards.push({ key: card.key, type: "CHART_GROUP" });
        }
      });
    }
  }
  if (!cardType || cardType === "messageCards") {
    if (extension.screens![screenIdx].messageCards) {
      extension.screens![screenIdx].messageCards?.forEach((card) => {
        if (cards.findIndex((c) => c.key === card.key) === -1) {
          cards.push({ key: card.key, type: "MESSAGE" });
        }
      });
    }
  }
  if (!cardType || cardType === "logsCards") {
    if (extension.screens![screenIdx].logsCards) {
      extension.screens![screenIdx].logsCards?.forEach((card) => {
        if (cards.findIndex((c) => c.key === card.key) === -1) {
          cards.push({ key: card.key, type: "LOGS" });
        }
      });
    }
  }
  if (!cardType || cardType === "eventsCards") {
    if (extension.screens![screenIdx].eventsCards) {
      extension.screens![screenIdx].eventsCards?.forEach((card) => {
        if (cards.findIndex((c) => c.key === card.key) === -1) {
          cards.push({ key: card.key, type: "EVENTS" });
        }
      });
    }
  }

  return cards;
}
