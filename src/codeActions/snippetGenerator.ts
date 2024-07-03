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
import {
  ExtensionStub,
  RelationProperty,
  isAttributeProperty,
  isRelationProperty,
} from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import {
  getAllMetricsByFeatureSet,
  getAttributesFromTopology,
  getEntitiesListCardKeys,
  getEntityChartCardKeys,
  getEntityMetrics,
  getEntityName,
  getMetricKeysFromChartCard,
  getMetricKeysFromEntitiesListCard,
  getRelationships,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getIndent, getParentBlocks } from "../utils/yamlParsing";
import {
  buildAttributePropertySnippet,
  buildChartCardSnippet,
  buildConfigActionSnippet,
  buildEntitiesListCardSnippet,
  buildFilterGroupSnippet,
  buildFilterSnippet,
  buildGraphChartSnippet,
  buildRelationPropertySnippet,
  buildScreenSnippet,
  getAllCardKeysSnippet,
  getAllChartCardsSnippet,
  getAllEntitiesListsSnippet,
  slugify,
} from "./utils/snippetBuildingUtils";

/**
 * Provides singleton access to the SnippetGenerator action provider.
 */
export const getSnippetGenerator = (() => {
  let instance: SnippetGenerator | undefined;

  return () => {
    instance = instance === undefined ? new SnippetGenerator() : instance;
    return instance;
  };
})();

/**
 * Provider for Code Actions that insert snippets of code into the existing extension yaml.
 */
class SnippetGenerator implements vscode.CodeActionProvider {
  /**
   * Provides Code Actions that insert code snippets relevant to the triggered context.
   * @param document document that activated the provider
   * @param range range that activated the provider
   * @param context Code Action context
   * @param token cancellation token
   * @returns list of Code Actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const parentBlocks = getParentBlocks(range.start.line, document.getText());
    const lineText = document.lineAt(range.start.line).text;

    const parsedExtension = getCachedParsedExtension();
    if (!parsedExtension) {
      return codeActions;
    }

    // add properties to properties card
    if (parentBlocks[parentBlocks.length - 1] === "propertiesCard") {
      if (lineText.includes("properties:")) {
        // attribute properties
        codeActions.push(
          ...this.createAttributePropertyInsertions(document, range, parsedExtension, "properties"),
        );
        // relation properties
        codeActions.push(
          ...this.createRelationPropertyInsertions(document, range, parsedExtension, "properties"),
        );
      }
    }

    // add columns in entitiesListCards
    if (
      parentBlocks[parentBlocks.length - 1] === "entitiesListCards" &&
      lineText.includes("columns:")
    ) {
      // attribute columns
      codeActions.push(
        ...this.createAttributePropertyInsertions(document, range, parsedExtension, "columns"),
      );
      // relation columns
      codeActions.push(
        ...this.createRelationPropertyInsertions(document, range, parsedExtension, "columns"),
      );
    }

    // add charts
    if (lineText.includes("charts:")) {
      // in chartsCard
      if (parentBlocks[parentBlocks.length - 1] === "chartsCards") {
        codeActions.push(
          ...this.createChartInsertions(document, range, parsedExtension, "chartsCard"),
        );
      }
      // in entitiesListCard
      if (parentBlocks[parentBlocks.length - 1] === "entitiesListCards") {
        codeActions.push(
          ...this.createChartInsertions(document, range, parsedExtension, "entitiesListCard"),
        );
      }
    }

    // add metrics to graph charts
    if (
      lineText.includes("metrics:") &&
      parentBlocks[parentBlocks.length - 1] === "graphChartConfig"
    ) {
      // in chartCards
      if (parentBlocks[parentBlocks.length - 3] === "chartsCards") {
        codeActions.push(
          ...this.createChartInsertions(document, range, parsedExtension, "chartsCard", true),
        );
      }
      // in entitiesListCards
      if (parentBlocks[parentBlocks.length - 3] === "entitiesListCards") {
        codeActions.push(
          ...this.createChartInsertions(document, range, parsedExtension, "entitiesListCard", true),
        );
      }
    }

    // add whole chart cards
    if (lineText.includes("chartsCards:")) {
      codeActions.push(...this.createChartCardInsertions(document, range, parsedExtension));
    }

    // add entity list cards
    if (lineText.includes("entitiesListCards:")) {
      codeActions.push(...this.createEntitiesListCardInsertions(document, range, parsedExtension));
    }

    // generate entire entity screens
    if (lineText.includes("screens:")) {
      codeActions.push(...this.createScreenInsertions(document, range, parsedExtension));
    }

    // add known actions
    if (lineText.includes("actions:")) {
      if (parentBlocks[parentBlocks.length - 1] === "screens") {
        codeActions.push(...this.createGlobalActionInsertions(document, range, parsedExtension));
      }
      if (parentBlocks[parentBlocks.length - 1] === "actions") {
        codeActions.push(...this.createActionInsertions(document, range, parsedExtension));
      }
    }

    // add filtering inside an entities list card
    if (
      lineText.includes("filtering:") &&
      parentBlocks[parentBlocks.length - 1] === "entitiesListCards"
    ) {
      // add whole filtering block
      codeActions.push(...this.createFilteringBlockInsertions(document, range, parsedExtension));
    }
    if (
      lineText.includes("filters:") &&
      parentBlocks[parentBlocks.length - 3] === "entitiesListCards"
    ) {
      // add individual filters
      codeActions.push(...this.createFilterInsertions(document, range, parsedExtension));
    }

    return codeActions;
  }

  /**
   * Creates a Code Action that inserts a snippet of text on the next line at index 0.
   * @param actionName name of the Code Action
   * @param textToInsert the snippet to insert
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @returns Code Action
   */
  private createInsertAction(
    actionName: string,
    textToInsert: string,
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction {
    if (document.lineCount === range.start.line + 1) {
      textToInsert = "\n" + textToInsert;
    }
    const insertPosition = new vscode.Position(range.start.line + 1, 0);
    const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPosition, textToInsert);
    return action;
  }

  /**
   * Creates Code Actions that insert a whole entity filtering block.
   * Naturally this is only done once, when no other filtering has been defined yet. The
   * filtering block will contain one filter (on the entity's name).
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension.yaml serialized as object
   * @returns Code Actions
   */
  private createFilteringBlockInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const cardIdx = getBlockItemIndexAtLine(
      "entitiesListCards",
      range.start.line,
      document.getText(),
    );

    // Only insert whole filtering block if none are present
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screen = screens[screenIdx];
    if (!screen.entitiesListCards) {
      return [];
    }
    const cards = screen.entitiesListCards;
    const card = cards[cardIdx];
    if (!card.filtering && !Object.prototype.hasOwnProperty.call(card.filtering, "entityFilters")) {
      return [];
    }

    // Get the right entity type
    let entityType = screens[screenIdx].entityType;
    const selectorTemplate = card.entitySelectorTemplate;
    if (selectorTemplate) {
      entityType = selectorTemplate.split("type(")[1].split(")")[0].replace(/"/g, "");
    }

    actions.push(
      this.createInsertAction(
        "Insert filtering group",
        buildFilterGroupSnippet(entityType, indent),
        document,
        range,
      ),
    );

    return actions;
  }

  /**
   * Creates Code Actions that insert individual entity filters based on the entity's attributes.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension.yaml serialized as object
   * @returns Code Action
   */
  private createFilterInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const cardIdx = getBlockItemIndexAtLine(
      "entitiesListCards",
      range.start.line,
      document.getText(),
    );
    const groupIdx = getBlockItemIndexAtLine("entityFilters", range.start.line, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screen = screens[screenIdx];
    if (!screen.entitiesListCards) {
      return [];
    }
    const cards = screen.entitiesListCards;
    const card = cards[cardIdx];

    // Get correct entity type
    let entityType = screen.entityType;
    const selectorTemplate = card.entitySelectorTemplate;
    if (selectorTemplate) {
      entityType = selectorTemplate.split("type(")[1].split(")")[0].replace(/"/g, "");
    }
    // Get properties already inserted as filters
    let insertedProperties: string[] = [];
    const filtering = card.filtering;
    if (filtering) {
      const entityFilters = filtering.entityFilters;
      if (entityFilters) {
        const filters = entityFilters[groupIdx].filters;
        if (filters) {
          insertedProperties = filters.map(filter => filter.type);
        }
      }
    }
    // Add synonyms
    if (insertedProperties.includes("ipAddress")) {
      insertedProperties.push("dt.ip_addresses");
    }
    // Create snippets for remaining properties
    getAttributesFromTopology(entityType, extension, insertedProperties).forEach(attribute => {
      if (["dt.ip_addresses", "dt.listen_ports", "dt.dns_names"].includes(attribute.key)) {
        // Properties that entities API can offer suggestions for
        actions.push(
          this.createInsertAction(
            `Insert ${attribute.displayName} filter`,
            buildFilterSnippet(
              entityType,
              attribute.key,
              attribute.displayName,
              false,
              false,
              indent,
            ),
            document,
            range,
          ),
        );
      } else {
        // Other properties (i.e. no suggestions offered)
        actions.push(
          this.createInsertAction(
            `Insert ${attribute.displayName} filter`,
            buildFilterSnippet(
              entityType,
              attribute.key,
              attribute.displayName,
              true,
              false,
              indent,
              "contains",
            ),
            document,
            range,
          ),
        );
      }
    });

    return actions;
  }

  /**
   * Creates Code Actions for inserting actions into an entity's screen.
   * This function creates actions within GLOBAL_LIST and GLOBAL_DETAILS areas.
   * Currently the only inserted actions are for configuring the extension.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of actions
   */
  private createGlobalActionInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screenActions = screens[screenIdx].actions;
    if (!screenActions) {
      return [];
    }
    // Only add actions if there aren't any matching the same definition
    if (
      screenActions.filter(
        action =>
          ["GLOBAL_LIST", "GLOBAL_DETAILS"].includes(action.actionScope) &&
          action.actions.filter(a =>
            a.actionExpression.startsWith(`hubExtension|extensionId=${extension.name}`),
          ).length > 0,
      ).length === 0
    ) {
      actions.push(
        this.createInsertAction(
          "Insert global actions for extension configuration",
          buildConfigActionSnippet(extension.name, false, indent),
          document,
          range,
        ),
      );
    }
    return actions;
  }

  /**
   * Creates Code Actions for isnerting actions into an entity's screen.
   * This function creates the actual action object, which can be inserted anywhere.
   * Currently the only inserted action is for configuring the extension.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of actions
   */
  private createActionInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const actionIdx = getBlockItemIndexAtLine("actions", range.start.line - 1, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screenActions = screens[screenIdx].actions;
    if (!screenActions) {
      return [];
    }

    // Only add the action if there aren't any matching the same definition
    if (
      screenActions[actionIdx].actions.filter(action =>
        action.actionExpression.startsWith(`hubExtension|extensionId=${extension.name}`),
      ).length === 0
    ) {
      actions.push(
        this.createInsertAction(
          "Insert action for extension configuration",
          buildConfigActionSnippet(extension.name, true, indent),
          document,
          range,
        ),
      );
    }

    return actions;
  }

  /**
   * Creates Code Actions for each attribute of the current entity that hasn't been inserted
   * into the YAML section yet. The YAML section can be either `propertiesCard.properties` or
   * `entitiesListCards.columns` as both have the same structure.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @param insertionType where are the attributes inserted?
   * @returns list of Code Actions
   */
  private createAttributePropertyInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
    insertionType: "properties" | "columns",
  ): vscode.CodeAction[] {
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screen = screens[screenIdx];
    let entityType = screen.entityType;

    // Find already inserted attributes
    let attributeKeysInserted: string[] = [];
    if (insertionType === "properties" && screen.propertiesCard) {
      attributeKeysInserted = screen.propertiesCard.properties
        .filter(isAttributeProperty)
        .map(prop => prop.attribute.key);
    } else {
      const cardIdx = getBlockItemIndexAtLine(
        "entitiesListCards",
        range.start.line,
        document.getText(),
      );
      const cards = screen.entitiesListCards;
      if (cards) {
        const selectorTemplate = cards[cardIdx].entitySelectorTemplate;
        if (selectorTemplate) {
          entityType = selectorTemplate.split("type(")[1].split(")")[0].replace(/"/g, "");
        }
        const columns = cards[cardIdx].columns;
        if (columns) {
          attributeKeysInserted = columns
            .filter(isAttributeProperty)
            .map(prop => prop.attribute.key);
        }
      }
    }
    // Map available attributes to Code Actions
    const attributesToInsert = getAttributesFromTopology(
      entityType,
      extension,
      attributeKeysInserted,
    );
    if (attributesToInsert.length > 0) {
      return attributesToInsert.map(attribute =>
        this.createInsertAction(
          `Insert ${attribute.key} attribute`,
          buildAttributePropertySnippet(attribute.key, attribute.displayName, indent),
          document,
          range,
        ),
      );
    }
    return [];
  }

  /**
   * Creates Code Actions for each relationship of the current entity that hasn't been inserted
   * into the YAML section yet. The YAML section can be either `propertiesCard.properties` or
   * `entitiesListCards.columns` as both have the same structure.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @param insertionType where are the relations inserted?
   * @returns list of Code Actions
   */
  private createRelationPropertyInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
    insertionType: "properties" | "columns",
  ): vscode.CodeAction[] {
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const screen = screens[screenIdx];
    let entityType = screen.entityType;

    // Find already inserted relations
    let relationsInserted: RelationProperty[] = [];
    if (insertionType === "properties") {
      const card = screen.propertiesCard;
      if (card) {
        relationsInserted = card.properties.filter(isRelationProperty);
      }
    } else {
      const cardIdx = getBlockItemIndexAtLine(
        "entitiesListCards",
        range.start.line,
        document.getText(),
      );
      const cards = screen.entitiesListCards;
      if (cards) {
        const card = cards[cardIdx];
        const selectorTemplate = card.entitySelectorTemplate;
        if (selectorTemplate) {
          entityType = selectorTemplate.split("type(")[1].split(")")[0].replace(/"/g, "");
        }
        if (card.columns) {
          relationsInserted = card.columns.filter(isRelationProperty);
        }
      }
    }
    const typesInserted = relationsInserted.map(property => {
      if (property.relation.entitySelectorTemplate) {
        try {
          return property.relation.entitySelectorTemplate
            .split("type(")[1]
            .split(")")[0]
            .replace(/"/g, "");
        } catch {
          return "";
        }
      }
    });

    // TODO: Filter out relationships that are not suitable for properties (e.g. have many)
    const relationsToInsert = getRelationships(entityType, extension).filter(
      rel => !typesInserted.includes(rel.entity),
    );

    // Map available relations to Code Actions
    if (relationsToInsert.length > 0) {
      return relationsToInsert.map(rel => {
        const relEntityName = getEntityName(rel.entity, extension) || rel.entity;
        return this.createInsertAction(
          `Insert relation to ${relEntityName}`,
          buildRelationPropertySnippet(
            `type(${rel.entity}),${rel.direction === "to" ? "from" : "to"}Relationships.${
              rel.relation
            }($(entityConditions))`,
            `Related ${relEntityName}`,
            indent,
          ),
          document,
          range,
        );
      });
    }
    return [];
  }

  /**
   * Creates Code Actions for each metric belonging to the surrounding entity so that it can
   * be added either as its own chart, or as part of an existing chart.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @param cardType the type of card these charts are meant for
   * @param metricOnly generate the metric insertion only instead of the whole chart
   * @returns list of Code Actions
   */
  private createChartInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
    cardType: "chartsCard" | "entitiesListCard",
    metricOnly: boolean = false,
  ): vscode.CodeAction[] {
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const cardIdx = getBlockItemIndexAtLine(`${cardType}s`, range.start.line, document.getText());
    const screens = extension.screens;
    const topology = extension.topology;
    const types = topology?.types;
    if (!screens || !topology || !types) {
      return [];
    }

    let entityType = screens[screenIdx].entityType;
    if (cardType === "entitiesListCard") {
      const cards = screens[screenIdx].entitiesListCards;
      if (cards) {
        const entitySelector = cards[cardIdx].entitySelectorTemplate;
        if (entitySelector) {
          entityType = entitySelector.split("type(")[1].split(")")[0].replace(/"/g, "");
        }
      }
    }

    const typeIdx = types.findIndex(type => type.name === entityType);
    const metricsInserted =
      cardType === "chartsCard"
        ? getMetricKeysFromChartCard(screenIdx, cardIdx, extension)
        : getMetricKeysFromEntitiesListCard(screenIdx, cardIdx, extension);
    const metricsToInsert = getEntityMetrics(typeIdx, extension, metricsInserted);

    if (metricOnly) {
      return metricsToInsert.map(metric =>
        this.createInsertAction(
          `Insert metric ${metric}`,
          `${" ".repeat(
            indent + 2,
          )}- metricSelector: ${metric}:splitBy("dt.entity.${entityType}")\n`,
          document,
          range,
        ),
      );
    } else {
      return metricsToInsert.map(metric =>
        this.createInsertAction(
          `Insert chart for ${metric}`,
          buildGraphChartSnippet(metric, entityType, indent),
          document,
          range,
        ),
      );
    }
  }

  /**
   * Creates Code Actions for generating entire chart cards for an entity. The cards are generated
   * to cover entire feature sets of metrics that are associated with the entity surrounding the
   * triggering section of yaml.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createChartCardInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const screens = extension.screens;
    const topology = extension.topology;
    const types = extension.topology?.types;
    if (!screens || !topology || !types) {
      return [];
    }
    const entityType = screens[screenIdx].entityType;
    const typeIdx = types.findIndex(type => type.name === entityType);
    const cardsInserted = getEntityChartCardKeys(screenIdx, extension);
    const entityMetrics = getEntityMetrics(typeIdx, extension);
    const cardsToInsert: { key: string; featureSet: string; metrics: string[] }[] = [];
    const [, minorVersion] = extension.minDynatraceVersion.split(".");

    getAllMetricsByFeatureSet(extension)
      .filter(fs => !cardsInserted.includes(slugify(`${entityType}-charts-${fs.name}`)))
      .forEach(fs => {
        const metrics = fs.metrics.filter(m => entityMetrics.includes(m));
        if (metrics.length > 0) {
          cardsToInsert.push({
            key: `${entityType}-charts-${fs.name}`,
            featureSet: fs.name,
            metrics: metrics,
          });
        }
      });

    return cardsToInsert.map(card =>
      this.createInsertAction(
        `Insert card for ${card.featureSet} metrics`,
        buildChartCardSnippet(
          card.key,
          card.featureSet,
          card.metrics,
          entityType,
          indent,
          true,
          Number(minorVersion) >= 269,
        ),
        document,
        range,
      ),
    );
  }

  /**
   * Creates Code Actions that insert entities lists cards for the current entity as well
   * as the directly related entities.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createEntitiesListCardInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const indent = getIndent(document, range.start.line);
    const screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    const screens = extension.screens;
    if (!screens) {
      return [];
    }
    const entityType = screens[screenIdx].entityType;
    const entityName = getEntityName(entityType, extension);

    // TODO: Filter out only the list-able relationships (e.g. to many)
    const relationships = getRelationships(entityType, extension);
    const cardsInserted = getEntitiesListCardKeys(screenIdx, extension);
    const insertions = [];

    if (!cardsInserted.includes(slugify(`${slugify(entityType)}_list_self`))) {
      insertions.push(
        this.createInsertAction(
          `Insert list of ${entityName}s`,
          buildEntitiesListCardSnippet(
            `${slugify(entityType)}_list_self`,
            15,
            `List of ${entityName}s`,
            entityType,
            indent,
          ),
          document,
          range,
        ),
      );
    }

    relationships
      .filter(rel => !cardsInserted.includes(slugify(`${entityType}-list-${rel.entity}`)))
      .forEach(rel => {
        const relEntityName = getEntityName(rel.entity, extension) || rel.entity;
        insertions.push(
          this.createInsertAction(
            `Insert list of related ${relEntityName}s`,
            buildEntitiesListCardSnippet(
              `${entityType}-list-${rel.entity}`,
              5,
              `List of related ${relEntityName}s`,
              rel.entity,
              indent,
              `type(${rel.entity}),${rel.direction === "to" ? "from" : "to"}Relationships.${
                rel.relation
              }($(entityConditions))`,
            ),
            document,
            range,
          ),
        );
      });

    return insertions;
  }

  /**
   * Creates Code Actions that insert entire entity screens. The screen is generated as best as
   * possible given the data available. An action is also created for generating all available
   * screens in one go.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createScreenInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const insertions: vscode.CodeAction[] = [];
    const indent = getIndent(document, range.start.line);
    const topology = extension.topology;
    const types = extension.topology?.types;
    if (!topology || !types) {
      return [];
    }

    // Which entities should we generate screens for
    let allEntities = types;
    const existingScreens = extension.screens ? extension.screens.map(s => s.entityType) : [];
    allEntities = allEntities.filter(e => !existingScreens.includes(e.name));
    if (allEntities.length === 0) {
      return [];
    }
    // Actions for individual screens
    allEntities.forEach(e => {
      insertions.push(
        this.createInsertAction(
          `Generate screen for ${e.displayName}`,
          buildScreenSnippet(
            e,
            extension.name,
            getAllEntitiesListsSnippet(e.name, extension),
            getAllChartCardsSnippet(e.name, extension),
            getAllCardKeysSnippet(e.name, extension),
            indent,
          ),
          document,
          range,
        ),
      );
    });
    // All-in-one action for multiple screens
    if (allEntities.length - existingScreens.length > 1) {
      insertions.push(
        this.createInsertAction(
          "Auto-generate all screens",
          allEntities
            .map(e =>
              buildScreenSnippet(
                e,
                extension.name,
                getAllEntitiesListsSnippet(e.name, extension),
                getAllChartCardsSnippet(e.name, extension),
                getAllCardKeysSnippet(e.name, extension),
                indent,
                false,
              ),
            )
            .join("\n") + "\n",
          document,
          range,
        ),
      );
    }

    return insertions;
  }
}
