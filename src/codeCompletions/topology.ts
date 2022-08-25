import * as vscode from "vscode";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import {
  getAttributesKeysFromTopology,
  getDimensionsFromMatchingMetrics,
  getRequiredDimensions,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks, isCursorAt } from "../utils/yamlParsing";

/**
 * Provider for code auto-completion related to entities and entity types.
 */
export class TopologyCompletionProvider implements vscode.CompletionItemProvider {
  builtinEntities: EntityType[];
  environments: EnvironmentsTreeDataProvider;

  /**
   * @param environments Dynatrace Environments Tree Provide
   */
  constructor(environments: EnvironmentsTreeDataProvider) {
    this.builtinEntities = [];
    this.environments = environments;
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

    if (this.builtinEntities.length === 0) {
      this.loadBuiltinEntities();
    }

    // Entity types completions
    for (const keyword of ["fromType: ", "toType: "]) {
      if (isCursorAt(document, position, keyword)) {
        completionItems.push(this.createTypeCompletion(keyword, extension));
      }
    }
    if (
      parentBlocks[parentBlocks.length - 1] === "screens" &&
      isCursorAt(document, position, "entityType:")
    ) {
      completionItems.push(this.createTypeCompletion("entityType: ", extension));
    }
    if (
      parentBlocks[parentBlocks.length - 1] === "filters" &&
      isCursorAt(document, position, "entityTypes:")
    ) {
      completionItems.push(this.createTypeCompletion("entityTypes: ", extension, false, true));
    }

    // Entity attribute completions
    try {
      for (const direction of ["source", "destination"]) {
        if (isCursorAt(document, position, `${direction}Property:`)) {
          completionItems.push(
            this.createPropertyCompletion(
              direction as "source" | "destination",
              getBlockItemIndexAtLine("relationships", position.line, document.getText()),
              extension
            )
          );
        }
      }
    } catch (error) {}
    if (
      parentBlocks[parentBlocks.length - 1] === "attribute" &&
      isCursorAt(document, position, "key:")
    ) {
      var screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());
      // Attributes listed in propertiesCard
      if (parentBlocks[parentBlocks.length - 2] === "properties") {
        if (screenIdx >= 0) {
          completionItems.push(
            this.createAttributeCompletion(
              "key: ",
              extension.screens![screenIdx].entityType,
              extension
            )
          );
        }
        // Attributes listed in entitiesListCards
      } else if (parentBlocks[parentBlocks.length - 2] === "columns") {
        var cardIdx = getBlockItemIndexAtLine(
          "entitiesListCards",
          position.line,
          document.getText()
        );
        if (screenIdx >= 0 && cardIdx >= 0) {
          var entityType;
          let entitySelector =
            extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
          if (entitySelector) {
            let matches = /type\((.*?)\)/.exec(entitySelector);
            entityType = matches![1];
          } else {
            entityType = extension.screens![screenIdx].entityType;
          }
          completionItems.push(this.createAttributeCompletion("key: ", entityType, extension));
        }
      }
    }

    // Dimension-based completions
    if (isCursorAt(document, position, "requiredDimensions:")) {
      completionItems.push(
        this.createDimensionKeyCompletion(
          "requiredDimensions: ",
          position,
          document,
          extension,
          true
        )
      );
    }
    if (
      isCursorAt(document, position, "key:") &&
      parentBlocks[parentBlocks.length - 1] === "requiredDimensions"
    ) {
      completionItems.push(
        this.createDimensionKeyCompletion("key: ", position, document, extension, false)
      );
    }

    return completionItems;
  }

  /**
   * Loads the details of all entity types available in Dynatrace
   */
  private loadBuiltinEntities() {
    if (this.environments.getDynatraceClient()) {
      this.environments
        .getDynatraceClient()!
        .entitiesV2.listTypes()
        .then((types: EntityType[]) => {
          this.builtinEntities.push(...types);
        });
    }
  }

  /**
   * Creates a completion item for entity attributes. This is meant to trigger at the
   * `sourceProperty` and `destinationProperty` attributes of an Entities-based relationship.
   * @param direction `source` or `destination` depending on which item triggered it
   * @param relationshipIdx index of the triggering relationship item within the (yaml)
   *                        list of relationships see {@link getBlockItemIndexAtLine}
   * @param extension - the extension yaml serialized as object
   * @returns a completion item relevant to the triggering position within the document
   */
  private createPropertyCompletion(
    direction: "source" | "destination",
    relationshipIdx: number,
    extension: ExtensionStub
  ): vscode.CompletionItem {
    const propertyCompletion = new vscode.CompletionItem(
      `${direction}Property: `,
      vscode.CompletionItemKind.Field
    );
    propertyCompletion.detail = "Browse available properties";

    var attributes: string[] = [];
    var entityType =
      direction === "source"
        ? extension.topology.relationships[relationshipIdx].fromType.toLowerCase()
        : extension.topology.relationships[relationshipIdx].toType.toLowerCase();
    var foundIdx = this.builtinEntities.findIndex(
      (type) => type.type?.toLowerCase() === entityType
    );
    if (foundIdx >= 0) {
      attributes.push(...this.builtinEntities[foundIdx].properties.map((prop) => prop.id));
    } else {
      attributes.push(...getAttributesKeysFromTopology(entityType, extension));
    }
    propertyCompletion.insertText = new vscode.SnippetString();
    propertyCompletion.insertText.appendChoice(attributes);
    return propertyCompletion;
  }

  /**
   * Creates a completion item for entity attribute keys. This is meant to trigger in
   * places where attributes are extracted from entities, not the datasource (e.g. `propertiesCard`
   * or `columns`)
   * @param keyword the keyword to trigger this completion on
   * @param entityType the entity type to suggest attributes for
   * @param extension the extension yaml serialized as object
   * @returns a completion item with the relevant entity attributes
   */
  private createAttributeCompletion(
    keyword: string,
    entityType: string,
    extension: ExtensionStub
  ): vscode.CompletionItem {
    const attributeCompletion = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Field);
    attributeCompletion.detail = `Browse ${entityType} attributes`;
    var attributes = getAttributesKeysFromTopology(entityType, extension);
    attributeCompletion.insertText = new vscode.SnippetString();
    attributeCompletion.insertText.appendChoice(attributes);
    return attributeCompletion;
  }

  /**
   * Creates a completion item for entity types. This is meant to trigger at the
   * any kind of Type attributes of any entity relationship.
   * @param keyword Type label prefix (e.g. from, to, entity, etc.)
   * @param extension the extension yaml serialized as object
   * @param customOnly suggestions include only custom entitites. Default is false.
   * @param asList inserts text on new line starting with '-' to mark a list item
   * @returns a completion item relevant to the triggering position within the document
   */
  private createTypeCompletion(
    keyword: string,
    extension: ExtensionStub,
    customOnly = false,
    asList = false
  ): vscode.CompletionItem {
    var customEntities = extension.topology.types.map((type) => type.name);
    var entities = [
      ...customEntities,
      ...(customOnly ? [] : this.builtinEntities.map((type) => type.type!.toLowerCase())),
    ];
    const typeCompletion = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Class);
    typeCompletion.detail = "Browse detected entity types";

    typeCompletion.insertText = new vscode.SnippetString();
    if (asList) {
      typeCompletion.insertText.appendText("\n  - ");
    }
    typeCompletion.insertText.appendChoice(entities);
    return typeCompletion;
  }

  /**
   * Creates a completion item for dimension keys. This is meant to trigger in areas like
   * `requiredDimensions` or `attributes` of the topology yaml.
   * @param keyword keyword that triggers this completion
   * @param position position that triggered this completion
   * @param document document that triggered this completion
   * @param extension extension yaml serialized as object
   * @param asList whether to provide completions as standalone labels or list items
   * @returns the completion item
   */
  private createDimensionKeyCompletion(
    keyword: string,
    position: vscode.Position,
    document: vscode.TextDocument,
    extension: ExtensionStub,
    asList = false
  ): vscode.CompletionItem {
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

    var dimensionKeyCompletion = new vscode.CompletionItem(
      keyword,
      vscode.CompletionItemKind.Field
    );
    dimensionKeyCompletion.detail = "Browse metric dimensions";

    // Suggestions should only happen if items are still available
    if (dimensions.length > 0) {
      dimensionKeyCompletion.insertText = new vscode.SnippetString();
      if (asList) {
        dimensionKeyCompletion.insertText.appendText("\n  - key: ");
      }
      dimensionKeyCompletion.insertText.appendChoice(dimensions);
    } else {
      dimensionKeyCompletion.insertText = "";
    }

    return dimensionKeyCompletion;
  }
}
