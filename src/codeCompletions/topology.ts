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

import * as vscode from "vscode";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { getCachedBuiltinEntityTypes, getCachedParsedExtension } from "../utils/caching";
import {
  getAttributesKeysFromTopology,
  getDimensionsFromMatchingMetrics,
  getEntityName,
  getRequiredDimensions,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

let instance: TopologyCompletionProvider | undefined;

/**
 * Singleton access to TopologyCompletionProvider
 */
export const getTopologyCompletionProvider = (() => {
  return () => {
    instance = instance === undefined ? new TopologyCompletionProvider() : instance;
    return instance;
  };
})();

/**
 * Provider for code auto-completion related to entities and entity types.
 */
class TopologyCompletionProvider implements vscode.CompletionItemProvider {
  /**
   * Provides the actual completion items related to topology section of the extension YAML.
   * @param document {@link vscode.TextDocument} that triggered the provider
   * @param position {@link vscode.Position} when provider was triggered
   * @returns list of completion items
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const completionItems: vscode.CompletionItem[] = [];
    const parentBlocks = getParentBlocks(position.line, document.getText());
    const line = document.lineAt(position.line).text.substring(0, position.character);
    const parsedExtension = getCachedParsedExtension();
    if (!parsedExtension) {
      return completionItems;
    }

    // Entity types completions
    for (const keyword of ["fromType: ", "toType: ", "entityType: "]) {
      if (line.endsWith(keyword)) {
        completionItems.push(...this.createTypeCompletions(parsedExtension, true, true, false));
      }
    }
    if (line.endsWith("entityTypes: ")) {
      completionItems.push(...this.createTypeCompletions(parsedExtension, true, true, true));
    }

    // Entity attribute completions
    for (const direction of ["source", "destination"]) {
      if (line.endsWith(`${direction}Property: `)) {
        completionItems.push(
          ...this.createPropertyCompletion(
            direction as "source" | "destination",
            getBlockItemIndexAtLine("relationships", position.line, document.getText()),
            parsedExtension,
          ),
        );
      }
    }

    if (parentBlocks[parentBlocks.length - 1] === "attribute" && line.endsWith("key: ")) {
      const screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());
      let entityType = parsedExtension.screens?.[screenIdx].entityType;
      // Attributes listed in propertiesCard
      if (parentBlocks[parentBlocks.length - 2] === "properties" && entityType) {
        completionItems.push(...this.createAttributeCompletion(entityType, parsedExtension));
        // Attributes listed in entitiesListCards
      } else if (parentBlocks[parentBlocks.length - 2] === "columns") {
        const cardIdx = getBlockItemIndexAtLine(
          "entitiesListCards",
          position.line,
          document.getText(),
        );
        const entitySelector =
          parsedExtension.screens?.[screenIdx].entitiesListCards?.[cardIdx].entitySelectorTemplate;
        if (entitySelector) {
          entityType = entitySelector.split("type(")[1].split(")")[0].replace(/"/g, "");
        }
        if (entityType) {
          completionItems.push(...this.createAttributeCompletion(entityType, parsedExtension));
        }
      }
    }

    // Dimension-based completions
    if (line.endsWith("requiredDimensions: ")) {
      completionItems.push(
        ...this.createDimensionKeyCompletion(position, document, parsedExtension, true),
      );
    }
    if (line.endsWith("key: ") && parentBlocks[parentBlocks.length - 1] === "requiredDimensions") {
      completionItems.push(
        ...this.createDimensionKeyCompletion(position, document, parsedExtension, false),
      );
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
    extension: ExtensionStub,
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const attributes: string[] = [];
    const relationships = extension.topology?.relationships;
    if (!relationships) {
      return [];
    }

    // Get the entity type needed. No suggestions made if type not present yet.
    const entityType =
      direction === "source"
        ? relationships[relationshipIdx].fromType.toLowerCase()
        : relationships[relationshipIdx].toType.toLowerCase();

    // Check if it's a built-in entity
    const builtinIdx = getCachedBuiltinEntityTypes().findIndex(
      type => type.type?.toLowerCase() === entityType,
    );
    // Get the entity's attributes and name
    let entityName: string = "";
    if (builtinIdx >= 0) {
      const entity = getCachedBuiltinEntityTypes()[builtinIdx];
      if (entity.displayName) {
        entityName = entity.displayName;
        attributes.push(
          ...getCachedBuiltinEntityTypes()[builtinIdx].properties.map(prop => prop.id),
        );
      }
    } else {
      entityName = getEntityName(entityType, extension);
      attributes.push(...getAttributesKeysFromTopology(entityType, extension));
    }

    const propertyCompletion = new vscode.CompletionItem(
      `${entityName} attributes`,
      vscode.CompletionItemKind.Field,
    );
    propertyCompletion.detail = "Dynatrace Extensions";
    propertyCompletion.documentation = `Browse ${entityName} (${entityType}) properties ${
      builtinIdx >= 0
        ? "that are built into Dynatrace."
        : "that have been detected from this yaml file."
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
  private createAttributeCompletion(
    entityType: string,
    extension: ExtensionStub,
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const entityName = getEntityName(entityType, extension);

    const attributes = getAttributesKeysFromTopology(entityType, extension);
    if (attributes.length > 0) {
      const attributeCompletion = new vscode.CompletionItem(
        `${entityName} attributes`,
        vscode.CompletionItemKind.Field,
      );
      attributeCompletion.detail = "Dynatrace Extensions";
      attributeCompletion.documentation =
        `Browse ${entityName} (${entityType}) attributes ` +
        "that have been detected from this yaml file.";
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
    asList = false,
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // Custom entity types
    if (includeCustom) {
      const types = extension.topology?.types;
      if (types) {
        const customTypes = types.map(type => type.name);
        const customTypeCompletion = new vscode.CompletionItem(
          "Custom entities",
          vscode.CompletionItemKind.Class,
        );
        customTypeCompletion.detail = "Dynatrace Extensions";
        customTypeCompletion.documentation =
          "Browse custom entity types detected within this yaml file.";
        customTypeCompletion.insertText = new vscode.SnippetString();
        if (asList) {
          customTypeCompletion.insertText.appendText("\n - ");
        }
        customTypeCompletion.insertText.appendChoice(customTypes);
        completions.push(customTypeCompletion);
      }
    }

    // Builtin entity types
    if (includeBuiltin) {
      const builtinTypes = getCachedBuiltinEntityTypes().map(type => type.type?.toLowerCase());
      const builtinTypeCompletion = new vscode.CompletionItem(
        "Built-in entities",
        vscode.CompletionItemKind.Class,
      );
      builtinTypeCompletion.detail = "Dynatrace Extensions";
      builtinTypeCompletion.documentation = "Browse Dynatrace's built-in entity types.";
      builtinTypeCompletion.insertText = new vscode.SnippetString();
      if (asList) {
        builtinTypeCompletion.insertText.appendText("\n- ");
      }
      builtinTypeCompletion.insertText.appendChoice(builtinTypes.map(t => t ?? ""));
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
    asList = false,
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const dimensions: string[] = [];
    const types = extension.topology?.types;
    if (!types) {
      return [];
    }
    const ruleIdx = getBlockItemIndexAtLine("rules", position.line, document.getText());
    const typeIdx = getBlockItemIndexAtLine("types", position.line, document.getText());

    // Gather available dimensions without repeating what is already in yaml
    const dimensionsInserted = getRequiredDimensions(typeIdx, ruleIdx, extension);
    types[typeIdx].rules[ruleIdx].sources
      .filter(source => source.sourceType === "Metrics")
      .map(source => source.condition)
      .forEach(condition => {
        const extractedDimensions = getDimensionsFromMatchingMetrics(condition, extension);
        extractedDimensions.forEach(dimension => {
          if (!dimensions.includes(dimension) && !dimensionsInserted.includes(dimension)) {
            dimensions.push(dimension);
          }
        });
      });

    if (dimensions.length > 0) {
      const dimensionKeyCompletion = new vscode.CompletionItem(
        "Browse dimension keys",
        vscode.CompletionItemKind.Field,
      );
      dimensionKeyCompletion.detail = "Dynatrace Extensions";
      dimensionKeyCompletion.documentation =
        "Browse dimension keys detected from this yaml file " +
        "that match the sources defined in this topology rule.";
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
