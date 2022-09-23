import * as vscode from "vscode";
import * as yaml from "yaml";
import { CachedDataProvider } from "../utils/dataCaching";
import {
  getAttributesKeysFromTopology,
  getDimensionsFromMatchingMetrics,
  getEntityName,
  getRequiredDimensions,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

/**
 * Provider for code auto-completion related to entities and entity types.
 */
export class TopologyCompletionProvider implements vscode.CompletionItemProvider {
  private builtinEntities: EntityType[];
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
    this.builtinEntities = [];
  }

  /**
   * Provides the actual completion items related to topology section of the extension YAML.
   * @param document
   * @param position
   * @param token
   * @param context
   * @returns
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    var completionItems: vscode.CompletionItem[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var parentBlocks = getParentBlocks(position.line, document.getText());
    var line = document.lineAt(position.line).text.substring(0, position.character);

    this.builtinEntities = this.cachedData.getBuiltinEntities();

    // Entity types completions
    for (const keyword of ["fromType: ", "toType: ", "entityType: "]) {
      if (line.endsWith(keyword)) {
        completionItems.push(...this.createTypeCompletions(extension, true, true, false));
      }
    }
    if (line.endsWith("entityTypes: ")) {
      completionItems.push(...this.createTypeCompletions(extension, true, true, true));
    }

    // Entity attribute completions
    for (const direction of ["source", "destination"]) {
      if (line.endsWith(`${direction}Property: `)) {
        completionItems.push(
          ...this.createPropertyCompletion(
            direction as "source" | "destination",
            getBlockItemIndexAtLine("relationships", position.line, document.getText()),
            extension
          )
        );
      }
    }

    if (parentBlocks[parentBlocks.length - 1] === "attribute" && line.endsWith("key: ")) {
      var screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());
      var entityType = extension.screens![screenIdx].entityType;
      // Attributes listed in propertiesCard
      if (parentBlocks[parentBlocks.length - 2] === "properties") {
        completionItems.push(...this.createAttributeCompletion(entityType, extension));
        // Attributes listed in entitiesListCards
      } else if (parentBlocks[parentBlocks.length - 2] === "columns") {
        var cardIdx = getBlockItemIndexAtLine("entitiesListCards", position.line, document.getText());
        let entitySelector = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
        if (entitySelector) {
          entityType = entitySelector.split("type(")[1].split(")")[0];
        }
        completionItems.push(...this.createAttributeCompletion(entityType, extension));
      }
    }

    // Dimension-based completions
    if (line.endsWith("requiredDimensions: ")) {
      completionItems.push(...this.createDimensionKeyCompletion(position, document, extension, true));
    }
    if (line.endsWith("key: ") && parentBlocks[parentBlocks.length - 1] === "requiredDimensions") {
      completionItems.push(...this.createDimensionKeyCompletion(position, document, extension, false));
    }

    return completionItems;
  }

  /**
   * Creates a completion item for entity attributes. This is meant to trigger at the
   * `sourceProperty` and `destinationProperty` attributes of an Entities-based relationship.
   * @param direction `source` or `destination` depending on which item triggered it
   * @param relationshipIdx index of the triggering relationship item within the (yaml)
   *                        list of relationships see {@link getBlockItemIndexAtLine}
   * @param extension - the extension yaml serialized as object
   * @returns list of completion items
   */
  private createPropertyCompletion(
    direction: "source" | "destination",
    relationshipIdx: number,
    extension: ExtensionStub
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var attributes: string[] = [];

    // Get the entity type needed. No suggestions made if type not present yet.
    try {
      var entityType =
        direction === "source"
          ? extension.topology.relationships[relationshipIdx].fromType.toLowerCase()
          : extension.topology.relationships[relationshipIdx].toType.toLowerCase();
    } catch {
      return [];
    }

    // Check if it's a built-in entity
    var builtinIdx = this.builtinEntities.findIndex((type) => type.type?.toLowerCase() === entityType);
    // Get the entity's attributes and name
    var entityName: string;
    if (builtinIdx >= 0) {
      entityName = this.builtinEntities[builtinIdx].displayName as string;
      attributes.push(...this.builtinEntities[builtinIdx].properties.map((prop) => prop.id));
    } else {
      entityName = getEntityName(entityType, extension);
      attributes.push(...getAttributesKeysFromTopology(entityType, extension));
    }

    const propertyCompletion = new vscode.CompletionItem(`${entityName} attributes`, vscode.CompletionItemKind.Field);
    propertyCompletion.detail = "Copilot suggestion";
    propertyCompletion.documentation = `Browse ${entityName} (${entityType}) properties ${
      builtinIdx >= 0 ? "that are built into Dynatrace." : "that have been detected from this yaml file."
    }`;
    propertyCompletion.insertText = new vscode.SnippetString();
    propertyCompletion.insertText.appendChoice(attributes);
    completions.push(propertyCompletion);

    return completions;
  }

  /**
   * Creates a completion item for entity attribute keys. This is meant to trigger in
   * places where attributes are extracted from entities, not the datasource (e.g. `propertiesCard`
   * or `columns`)
   * @param entityType the entity type to suggest attributes for
   * @param extension the extension yaml serialized as object
   * @returns list of completion items
   */
  private createAttributeCompletion(entityType: string, extension: ExtensionStub): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    const entityName = getEntityName(entityType, extension);

    var attributes = getAttributesKeysFromTopology(entityType, extension);
    if (attributes.length > 0) {
      const attributeCompletion = new vscode.CompletionItem(
        `${entityName} attributes`,
        vscode.CompletionItemKind.Field
      );
      attributeCompletion.detail = "Copilot suggestion";
      attributeCompletion.documentation = `Browse ${entityName} (${entityType}) attributes that have been detected from this yaml file.`;
      attributeCompletion.insertText = new vscode.SnippetString();
      attributeCompletion.insertText.appendChoice(attributes);
      completions.push(attributeCompletion);
    }

    return completions;
  }

  /**
   * Creates a completion item for entity types. For convenience, separates suggestions for
   * built-in types vs. custom types. You can omit one or the other.
   * @param extension the extension yaml serialized as object
   * @param includeCustom suggestions will include custom entity types
   * @param includeBuiltin suggestions will include built-in entity types
   * @param asList inserts text on new line starting with '-' to mark a list item
   * @returns a completion item relevant to the triggering position within the document
   */
  private createTypeCompletions(
    extension: ExtensionStub,
    includeCustom = true,
    includeBuiltin = true,
    asList = false
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];

    // Custom entity types
    if (includeCustom) {
      const customTypes = extension.topology.types.map((type) => type.name);
      const customTypeCompletion = new vscode.CompletionItem("Custom entities", vscode.CompletionItemKind.Class);
      customTypeCompletion.detail = "Copilot suggestion";
      customTypeCompletion.documentation =
        "Browse custom entity types detected by the Extensions Copilot within this yaml file.";
      customTypeCompletion.insertText = new vscode.SnippetString();
      if (asList) {
        customTypeCompletion.insertText.appendText("\n - ");
      }
      customTypeCompletion.insertText.appendChoice(customTypes);
      completions.push(customTypeCompletion);
    }

    // Builtin entity types
    if (includeBuiltin) {
      var builtinTypes = this.builtinEntities.map((type) => type.type!.toLowerCase());
      const builtinTypeCompletion = new vscode.CompletionItem("Built-in entities", vscode.CompletionItemKind.Class);
      builtinTypeCompletion.detail = "Copilot suggestion";
      builtinTypeCompletion.documentation = "Browse Dynatrace's built-in entity types.";
      builtinTypeCompletion.insertText = new vscode.SnippetString();
      if (asList) {
        builtinTypeCompletion.insertText.appendText("\n- ");
      }
      builtinTypeCompletion.insertText.appendChoice(builtinTypes);
      completions.push(builtinTypeCompletion);
    }

    return completions;
  }

  /**
   * Creates a completion item for dimension keys. This is meant to trigger in areas like
   * `requiredDimensions` or `attributes` of the topology yaml.
   * @param position position that triggered this completion
   * @param document document that triggered this completion
   * @param extension extension yaml serialized as object
   * @param asList whether to provide completions as standalone labels or list items
   * @returns list of completion items
   */
  private createDimensionKeyCompletion(
    position: vscode.Position,
    document: vscode.TextDocument,
    extension: ExtensionStub,
    asList = false
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var dimensions: string[] = [];
    var ruleIdx = getBlockItemIndexAtLine("rules", position.line, document.getText());
    var typeIdx = getBlockItemIndexAtLine("types", position.line, document.getText());

    // Gather available dimensions without repeating what is already in yaml
    var dimensionsInserted = getRequiredDimensions(typeIdx, ruleIdx, extension);
    extension.topology.types[typeIdx].rules[ruleIdx].sources
      .filter((source) => source.sourceType === "Metrics")
      .map((source) => source.condition)
      .forEach((condition) => {
        var extractedDimensions = getDimensionsFromMatchingMetrics(condition, extension);
        extractedDimensions.forEach((dimension) => {
          if (!dimensions.includes(dimension) && !dimensionsInserted.includes(dimension)) {
            dimensions.push(dimension);
          }
        });
      });

    if (dimensions.length > 0) {
      var dimensionKeyCompletion = new vscode.CompletionItem("Browse dimension keys", vscode.CompletionItemKind.Field);
      dimensionKeyCompletion.detail = "Copilot suggestion";
      dimensionKeyCompletion.documentation =
        "Browse dimension keys detected from this yaml file that match the sources defined in this topology rule.";
      dimensionKeyCompletion.insertText = new vscode.SnippetString();
      if (asList) {
        dimensionKeyCompletion.insertText.appendText("\n  - key: ");
      }
      dimensionKeyCompletion.insertText.appendChoice(dimensions);
      completions.push(dimensionKeyCompletion);
    }

    return completions;
  }
}
