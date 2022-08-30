import { attributeSnippet, chartCardSnippet, entitiesListCardSnippet, graphChartSnippet } from "./snippets";

/**
 * Builds a YAML snippet for an entities list card. If no entity selector is provided then
 * it is assumed to be a "self" listing card for the same entity as the screen definition.
 * @param key the key for this card
 * @param pageSize page size of the entity list
 * @param cardName the name for this card
 * @param indent level of indentation required
 * @param entitySelector optional entity selector in case of related entities
 * @returns the formatted and indented snippet
 */
export function buildEntitiesListCardSnippet(
  key: string,
  pageSize: number,
  cardName: string,
  indent: number,
  entitySelector?: string
) {
  let snippet = entitiesListCardSnippet;

  snippet = snippet.replace("<card-key>", key);
  snippet = snippet.replace("<page-size>", String(pageSize));
  snippet = snippet.replace("<card-name>", cardName);

  if (entitySelector) {
    snippet = snippet.replace("<entity-selector>", entitySelector);
  } else {
    snippet = snippet.replace("entitySelectorTemplate: <entity-selector>\n  ", "");
  }

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for a charts card, with desiered indentation.
 * Details like feature set and entity type allow building more relevant and easy to understand cards.
 * @param key the chart card's key
 * @param featureSet the feature set it covers
 * @param metrics the metrics that should be translated to charts
 * @param entityType the type of entity the metrics are assocaited with
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildChartCardSnippet(
  key: string,
  featureSet: string,
  metrics: string[],
  entityType: string,
  indent: number
): string {
  let snippet = chartCardSnippet;
  let charts = metrics.map((m) => buildGraphChartSnippet(m, entityType, indent - 2)).join("");

  snippet = snippet.replace("<card-key>", key);
  snippet = snippet.replace("<card-name>", `${featureSet} metrics`);
  snippet = snippet.replace("<charts>", charts);

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for an `attribute` type of property, with desired indentation.
 * @param key the attribute's key
 * @param displayName the attribute's display name
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildAttributePropertySnippet(key: string, displayName: string, indent: number): string {
  let snippet = attributeSnippet;

  snippet = snippet.replace("<attribute-key>", key);
  snippet = snippet.replace("<attribute-name>", displayName);

  return indentSnippet(snippet, indent);
}

/**
 * Builds a YAML snippet for a `chart`. This can be used in any section that supports charts,
 * e.g. chartsCards, entitiesListCards, etc.
 * @param metricKey metric key to use in the metric selector
 * @param entityType entity type for this chart (used in metric selector)
 * @param indent level of indentation required
 * @returns the formatted and indented snippet
 */
export function buildGraphChartSnippet(metricKey: string, entityType: string, indent: number): string {
  let snippet = graphChartSnippet;

  snippet = snippet.replace(/<metric-key>/g, metricKey);
  snippet = snippet.replace("<entity-type>", entityType);

  return indentSnippet(snippet, indent);
}

/**
 * Indents a snippet by a given indentation level (indent is of two characters).
 * @param snippet snippet to indent
 * @param indent level of indentation required
 * @returns the indentend snippet
 */
function indentSnippet(snippet: string, indent: number): string {
  snippet = snippet
    .split("\n")
    .map((line) => `${" ".repeat(indent + 2)}${line}`)
    .join("\n");
  snippet += "\n";
  return snippet;
}
