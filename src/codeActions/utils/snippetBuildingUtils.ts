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
  getAllMetricsByFeatureSet,
  getEntityMetrics,
  getEntityName,
  getRelationships,
} from "../../utils/extensionParsing";
import {
  attributeSnippet,
  chartCardSnippet,
  configActionSnippet,
  configSubActionSnippet,
  entitiesListCardSnippet,
  entityFilterGroupSnippet,
  filterSnippet,
  graphChartSnippet,
  metricMetadataSnippet,
  relationSnippet,
  screenSnippet,
} from "./snippets";
import { ExtensionStub, TopologyType } from "../../interfaces/extensionMeta";

/**
 * Builds a YAML snippet for an action that sends to extension configuration.
 * The action can be built as a global definition (inserting into GLOBAL_DETAILS and GLOBAL_LIST)
 * or as a sub-action to be inserted anywhere else.
 * @param extensionId id of the extension
 * @param subAction when true, the snippet is shorter and can be inserted anywhere
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildConfigActionSnippet(
  extensionId: string,
  subAction: boolean,
  indent: number,
): string {
  let subSnippet = configSubActionSnippet;
  subSnippet = subSnippet.replace("<extension-id>", extensionId);

  if (subAction) {
    return indentSnippet(subSnippet, indent);
  }

  let snippet = configActionSnippet;
  snippet = snippet.replace(/<config-subaction>/g, "\n" + indentSnippet(subSnippet, indent, false));

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for a whole entity screen. This snippet builder depends on other
 * snippets to be passed in for entity list and chart cards as well as their keys.
 * @param typeDefinition the entity type as defined in topology.types - see {@link TopologyType}
 * @param extensionId the ID of the extension
 * @param entitiesListCardsSnippet a snippet containing all entitiy list card definitions
 * @param chartCardsSnippet a snippet containing all chart card definitions
 * @param cardKeysSnippet a snippet containing all the key definitions for the cards
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildScreenSnippet(
  typeDefinition: TopologyType,
  extensionId: string,
  entitiesListCardsSnippet: string,
  chartCardsSnippet: string,
  cardKeysSnippet: string,
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = screenSnippet;

  snippet = snippet.replace(/<entity-type>/g, typeDefinition.name);
  snippet = snippet.replace(
    "<config-action>",
    "\n" + buildConfigActionSnippet(extensionId, false, indent + 2),
  );
  snippet = snippet.replace(/<extension-id>/g, extensionId);
  snippet = snippet.replace(/<entity-name>/g, typeDefinition.displayName);
  snippet = snippet.replace("<self-list-key>", `${slugify(typeDefinition.name)}_list_self`);
  snippet = snippet.replace(
    "<charts-cards>",
    "\n" + indentSnippet(chartCardsSnippet, indent, false),
  );
  snippet = snippet.replace(
    "<entities-list-cards>",
    "\n" + indentSnippet(entitiesListCardsSnippet, indent, false),
  );
  snippet = snippet.replace(
    "<details-layout-cards>",
    "\n" + indentSnippet(cardKeysSnippet, indent + 6, false),
  );

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for an individual entity filter.
 * @param entityType type of the entity the filter applies to
 * @param property the entity's property being filtered on
 * @param name the display name of this filter
 * @param freeText when True this filter accepts free text and you must provide a modifier
 * @param modifier the behavior of the free text filter's value; to be omitted when freeText is false
 * @param distinct when true, there can be only a single instance of this filter
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildFilterSnippet(
  entityType: string,
  property: string,
  name: string,
  freeText: boolean,
  distinct: boolean,
  indent: number,
  modifier?: "contains" | "equals" | "startsWith",
): string {
  let snippet = filterSnippet;

  snippet = snippet.replace("<filter-prop>", property);
  snippet = snippet.replace("<filter-name>", name);
  snippet = snippet.replace("<free-text>", String(freeText));
  snippet = modifier
    ? snippet.replace("<modifier>", `modifier: ${modifier}`)
    : snippet.replace("\n  <modifier>", "");
  snippet = snippet.replace("<distinct>", String(distinct));
  snippet = snippet.replace("<filtered-entity>", entityType);

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for an entity filtering group. The group is called "Filter by"
 * and contains one filter, for the entity's name (the built-in entityName).
 * @param entityType the type of the entity to be filtered
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildFilterGroupSnippet(entityType: string, indent: number): string {
  let snippet = entityFilterGroupSnippet;

  snippet = snippet.replace("<entity-type>", entityType);

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for an entities list card. If no entity selector is provided then
 * it is assumed to be a "self" listing card for the same entity as the screen definition.
 * @param key the key for this card
 * @param pageSize page size of the entity list
 * @param cardName the name for this card
 * @param entityType the type of the entity listed in this card
 * @param indent level of indentation required
 * @param entitySelector optional entity selector in case of related entities
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildEntitiesListCardSnippet(
  key: string,
  pageSize: number,
  cardName: string,
  entityType: string,
  indent: number,
  entitySelector?: string,
  withNewline: boolean = true,
): string {
  let snippet = entitiesListCardSnippet;

  snippet = snippet.replace("<card-key>", slugify(key));
  snippet = snippet.replace("<page-size>", String(pageSize));
  snippet = snippet.replace("<card-name>", cardName);
  snippet = snippet.replace(
    "<filtering>",
    "\n" + indentSnippet(entityFilterGroupSnippet, indent + 2, false),
  );
  snippet = snippet.replace("<entity-type>", entityType);

  if (entitySelector) {
    snippet = snippet.replace("<entity-selector>", entitySelector);
  } else {
    snippet = snippet.replace("entitySelectorTemplate: <entity-selector>\n  ", "");
  }

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for a charts card, with desiered indentation. Details like feature set and
 * entity type allow building more relevant and easy to understand cards.
 * @param key the chart card's key
 * @param featureSet the feature set it covers
 * @param metrics the metrics that should be translated to charts
 * @param entityType the type of entity the metrics are assocaited with
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildChartCardSnippet(
  key: string,
  featureSet: string,
  metrics: string[],
  entityType: string,
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = chartCardSnippet;
  let charts = metrics.map(m => buildGraphChartSnippet(m, entityType, 0, false)).join("\n");

  snippet = snippet.replace("<card-key>", slugify(key));
  snippet = snippet.replace("<card-name>", `${featureSet} metrics`);
  snippet = snippet.replace("<charts>", "\n" + indentSnippet(charts, 0, false));

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for an `attribute` type of property, with desired indentation.
 * @param key the attribute's key
 * @param displayName the attribute's display name
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildAttributePropertySnippet(
  key: string,
  displayName: string,
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = attributeSnippet;

  snippet = snippet.replace("<attribute-key>", key);
  snippet = snippet.replace("<attribute-name>", displayName);

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for an `attribute` type of property, with desired indentation.
 * @param entitySelector entity selector template for pulling the related entity
 * @param displayName the property's display name
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildRelationPropertySnippet(
  entitySelector: string,
  displayName: string,
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = relationSnippet;

  snippet = snippet.replace("<selector>", entitySelector);
  snippet = snippet.replace("<relation-name>", displayName);

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for metric metadata.
 * @param metricKey metric key as defined in the datasource (key should match exactly)
 * @param displayName display name of the metric
 * @param description description of the metric
 * @param unit measurement unit of the metric
 * @param indent indentation of the snippet
 * @param withNewline if true, adds a newline at the end
 * @returns the formatted and indented snippet
 */
export function buildMetricMetadataSnippet(
  metricKey: string,
  displayName: string,
  description: string,
  unit: string = "Unspecified",
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = metricMetadataSnippet;

  snippet = snippet.replace("<metric-key>", metricKey);
  snippet = snippet.replace("<metric-name>", displayName);
  snippet = snippet.replace("<metric-description>", description);
  snippet = snippet.replace("<metric-unit>", unit);

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Builds a YAML snippet for a `chart`. This can be used in any section that supports charts,
 * e.g. chartsCards, entitiesListCards, etc.
 * @param metricKey metric key to use in the metric selector
 * @param entityType entity type for this chart (used in metric selector)
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the formatted and indented snippet
 */
export function buildGraphChartSnippet(
  metricKey: string,
  entityType: string,
  indent: number,
  withNewline: boolean = true,
): string {
  let snippet = graphChartSnippet;

  snippet = snippet.replace(/<metric-key>/g, metricKey);
  snippet = snippet.replace("<entity-type>", entityType);

  return indentSnippet(snippet, indent, withNewline);
}

/**
 * Utility function to build a snippet of all possible enitity list cards for a given entity
 * @param entityType entity type that cards apply to
 * @param extension extension yaml serialized as object
 * @returns yaml snippet
 */
export function getAllEntitiesListsSnippet(entityType: string, extension: ExtensionStub): string {
  const entityName = getEntityName(entityType, extension);
  const relationships = getRelationships(entityType, extension);

  return [
    buildEntitiesListCardSnippet(
      `${slugify(entityType)}_list_self`,
      15,
      `List of ${entityName}s`,
      entityType,
      0,
      undefined,
      false,
    ),
    ...relationships.map(rel => {
      var relEntityName = getEntityName(rel.entity, extension) || rel.entity;
      return buildEntitiesListCardSnippet(
        `${entityType}-list-${rel.entity}`,
        5,
        `List of related ${relEntityName}s`,
        rel.entity,
        0,
        `type(${rel.entity}),${rel.direction === "to" ? "from" : "to"}Relationships.${
          rel.relation
        }($(entityConditions))`,
        false,
      );
    }),
  ].join("\n");
}

/**
 * Utility function to build a snippet of all possible chart cards for a given entity.
 * @param entityType entity type that chart cards apply to
 * @param extension extension yaml serialized as object
 * @returns yaml snippet
 */
export function getAllChartCardsSnippet(entityType: string, extension: ExtensionStub): string {
  const typeIdx = extension.topology.types.findIndex(type => type.name === entityType);
  const entityMetrics = getEntityMetrics(typeIdx, extension);
  const cards: { key: string; featureSet: string; metrics: string[] }[] = [];

  getAllMetricsByFeatureSet(extension).forEach(fs => {
    let metrics = fs.metrics.filter(m => entityMetrics.includes(m));
    if (metrics.length > 0) {
      cards.push({
        key: `${entityType}-charts-${fs.name}`,
        featureSet: fs.name,
        metrics: metrics,
      });
    }
  });
  return cards
    .map(card =>
      buildChartCardSnippet(card.key, card.featureSet, card.metrics, entityType, 0, false),
    )
    .join("\n");
}

/**
 * Utility function to build a snippet of all possible card keys (ready to insert into screen
 * layouts).Card keys include card type, and span entity lists and chart cards. Keys do not include
 * self entity list.
 * @param entityType entity type that cards apply to
 * @param extension extension yaml serialized as object
 * @returns yaml snippet
 */
export function getAllCardKeysSnippet(entityType: string, extension: ExtensionStub): string {
  const relationships = getRelationships(entityType, extension);
  const typeIdx = extension.topology.types.findIndex(type => type.name === entityType);
  const entityMetrics = getEntityMetrics(typeIdx, extension);

  return [
    ...getAllMetricsByFeatureSet(extension)
      .filter(fs => fs.metrics.findIndex(m => entityMetrics.includes(m)) > -1)
      .map(fs => `- key: ${slugify(`${entityType}-charts-${fs.name}`)}\n  type: CHART_GROUP`),
    ...relationships.map(
      rel => `- key: ${slugify(`${entityType}-list-${rel.entity}`)}\n  type: ENTITIES_LIST`,
    ),
  ].join("\n");
}

/**
 * Indents a snippet by a given indentation level (indent is of two characters).
 * @param snippet snippet to indent
 * @param indent level of indentation required
 * @param withNewline if true, a newline is added at the end of the snippet
 * @returns the indentend snippet
 */
export function indentSnippet(
  snippet: string,
  indent: number,
  withNewline: boolean = true,
): string {
  snippet = snippet
    .split("\n")
    .map(line => `${" ".repeat(indent + 2)}${line}`)
    .join("\n");
  if (withNewline) {
    snippet += "\n";
  }
  return snippet;
}

/**
 * Turns text into a "slug" representation.
 * @param text
 * @returns slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^-+|-+$/g, "");
}
