const attributeSnippet = `\
- type: ATTRIBUTE
  attribute:
    key: <attribute-key>
    displayName: <attribute-name>`;

const graphChartSnippet = `\
- displayName: <metric-key>
  visualizationType: GRAPH_CHART
  graphChartConfig:
    metrics:
      - metricSelector: <metric-key>:splitBy("dt.entity.<entity-type>")`;

/**
 * Builds a YAML snippet for an `attribute` type of property, with desired indentation.
 * @param key the attribute's key
 * @param displayName the attribute's display name
 * @param indent indentation of this snippet (number of spaces)
 * @returns the formatted and indented snippet
 */
export function buildAttributePropertySnippet(
  key: string,
  displayName: string,
  indent: number
): string {
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
export function buildGraphChartSnippet(
  metricKey: string,
  entityType: string,
  indent: number
): string {
  let snippet = graphChartSnippet;

  snippet = snippet.replace(/<metric-key>/g, metricKey);
  snippet = snippet.replace("<entity-type>", entityType);

  return indentSnippet(snippet, indent);
}

/**
 * Indents a snippet by a given indentation level (indent is of two characters).
 * @param snippet snippet to indent
 * @param indent indent level
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
