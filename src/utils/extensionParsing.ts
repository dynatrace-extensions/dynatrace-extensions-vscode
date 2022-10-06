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
 * Extracts all attribute keys of a given entity type from topology section of the extension.
 * @param entityType entity type to extract for
 * @param extension extension.yaml serialized as object
 * @returns
 */
export function getAttributesKeysFromTopology(entityType: string, extension: ExtensionStub): string[] {
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
  extension.topology.types
    .filter((type) => type.name.toLowerCase() === entityType)
    .forEach((type) => {
      type.rules.forEach((rule) => {
        rule.attributes
          .filter((property) => (excludeKeys ? !excludeKeys.includes(property.key) : true))
          .forEach((property) => {
            attributes.push({
              key: property.key,
              displayName: property.displayName,
            });
          });
      });
    });
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
  extension.screens![screenIdx].chartsCards![cardIdx].charts.forEach((c) => {
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
    !extension.screens ||
    !extension.screens[screenIdx].entitiesListCards ||
    !extension.screens[screenIdx].entitiesListCards![cardIdx].charts
  ) {
    return [];
  }
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

    group.subgroups?.forEach((sg) => {
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
            if (fsIdx !== -1) {
              featureSets[fsIdx].metrics.push(m.key);
            }
          }
        } else if (sg.featureSet) {
          let fsIdx = featureSets.findIndex((fs) => fs.name === sg.featureSet);
          if (fsIdx !== -1) {
            featureSets[fsIdx].metrics.push(m.key);
          }
        } else if (group.featureSet) {
          let fsIdx = featureSets.findIndex((fs) => fs.name === group.featureSet);
          if (fsIdx !== -1) {
            featureSets[fsIdx].metrics.push(m.key);
          }
        } else {
          let fsIdx = featureSets.findIndex((fs) => fs.name === "default");
          if (fsIdx !== -1) {
            featureSets[fsIdx].metrics.push(m.key);
          }
        }
      });
    });
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
  extension.topology.types[typeIdx].rules.forEach((rule) => {
    rule.sources.forEach((source) => {
      if (source.sourceType === "Metrics") {
        patterns.push(source.condition);
      }
    });
  });
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
    .map((rel) => toCamelCase(rel.typeOfRelation));
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
  return extension.topology.relationships
    .filter((rel) => rel.toType === entityType || rel.fromType === entityType)
    .map((rel) => ({
      entity: rel.toType === entityType ? rel.fromType : rel.toType,
      relation: toCamelCase(rel.typeOfRelation),
      direction: rel.toType === entityType ? "to" : "from",
    }));
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
  if (!extension.screens || !extension.screens[screenIdx].entitiesListCards) {
    return [];
  }
  return extension.screens[screenIdx].entitiesListCards!.map((elc) => elc.key);
}

/**
 * Roughly converts a string from snake case to camel case.
 * Used in relationships e.g. SAME_AS must be sameAs in selectors.
 * @param text string to convert to camel case
 * @returns camel case converted string
 */
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
