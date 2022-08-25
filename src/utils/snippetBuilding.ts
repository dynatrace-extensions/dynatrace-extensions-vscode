const attributeSnippet = `\
- type: ATTRIBUTE
  attribute:
    key: <attribute-key>
    displayName: <attribute-name>`;

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
  snippet = snippet
    .split("\n")
    .map((line) => `${" ".repeat(indent + 2)}${line}`)
    .join("\n");
  snippet += "\n";

  return snippet;
}
