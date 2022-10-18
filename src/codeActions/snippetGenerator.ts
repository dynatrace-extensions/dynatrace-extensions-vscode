import * as vscode from "vscode";
import * as yaml from "yaml";
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
import {
  buildAttributePropertySnippet,
  buildChartCardSnippet,
  buildEntitiesListCardSnippet,
  buildGraphChartSnippet,
  buildRelationPropertySnippet,
  buildScreenSnippet,
  getAllCardKeysSnippet,
  getAllChartCardsSnippet,
  getAllEntitiesListsSnippet,
  slugify,
} from "./utils/snippetBuildingUtils";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

/**
 * Provider for Code Actions that insert snippets of code into the existing extension yaml.
 */
export class SnippetGenerator implements vscode.CodeActionProvider {
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
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    var codeActions: vscode.CodeAction[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var parentBlocks = getParentBlocks(range.start.line, document.getText());
    var lineText = document.lineAt(range.start.line).text;

    // add properties to properties card
    if (parentBlocks[parentBlocks.length - 1] === "propertiesCard") {
      if (lineText.includes("properties:")) {
        // attribute properties
        codeActions.push(...this.createAttributePropertyInsertions(document, range, extension, "properties"));
        // relation properties
        codeActions.push(...this.createRelationPropertyInsertions(document, range, extension, "properties"));
      }
    }

    // add columns in entitiesListCards
    if (parentBlocks[parentBlocks.length - 1] === "entitiesListCards" && lineText.includes("columns:")) {
      // attribute columns
      codeActions.push(...this.createAttributePropertyInsertions(document, range, extension, "columns"));
      // relation columns
      codeActions.push(...this.createRelationPropertyInsertions(document, range, extension, "columns"));
    }

    // add charts
    if (lineText.includes("charts:")) {
      // in chartsCard
      if (parentBlocks[parentBlocks.length - 1] === "chartsCards") {
        codeActions.push(...this.createChartInsertions(document, range, extension, "chartsCard"));
      }
      // in entitiesListCard
      if (parentBlocks[parentBlocks.length - 1] === "entitiesListCards") {
        codeActions.push(...this.createChartInsertions(document, range, extension, "entitiesListCard"));
      }
    }

    // add metrics to graph charts
    if (lineText.includes("metrics:") && parentBlocks[parentBlocks.length - 1] === "graphChartConfig") {
      // in chartCards
      if (parentBlocks[parentBlocks.length - 3] === "chartsCards") {
        codeActions.push(...this.createChartInsertions(document, range, extension, "chartsCard", true));
      }
      // in entitiesListCards
      if (parentBlocks[parentBlocks.length - 3] === "entitiesListCards") {
        codeActions.push(...this.createChartInsertions(document, range, extension, "entitiesListCard", true));
      }
    }

    // add whole chart cards
    if (lineText.includes("chartsCards:")) {
      codeActions.push(...this.createChartCardInsertions(document, range, extension));
    }

    // add entity list cards
    if (lineText.includes("entitiesListCards:")) {
      codeActions.push(...this.createEntitiesListCardInsertions(document, range, extension));
    }

    // generate entire entity screens
    if (lineText.includes("screens:")) {
      codeActions.push(...this.createScreenInsertions(document, range, extension));
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
    range: vscode.Range
  ): vscode.CodeAction {
    if (document.lineCount === range.start.line + 1) {
      textToInsert = "\n" + textToInsert;
    }
    var insertPosition = new vscode.Position(range.start.line + 1, 0);
    const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPosition, textToInsert);
    return action;
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
    insertionType: "properties" | "columns"
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;

    // Find already inserted attributes
    var attributesInserted = [];
    if (insertionType === "properties") {
      attributesInserted = extension.screens![screenIdx].propertiesCard.properties.filter(
        (prop: any) => prop.type === "ATTRIBUTE"
      );
    } else {
      const cardIdx = getBlockItemIndexAtLine("entitiesListCards", range.start.line, document.getText());
      const selectorTemplate = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
      if (selectorTemplate) {
        entityType = selectorTemplate.split("type(")[1].split(")")[0];
      }
      attributesInserted = extension.screens![screenIdx].entitiesListCards![cardIdx].columns!.filter(
        (col) => col.type === "ATTRIBUTE"
      );
    }
    if (attributesInserted) {
      attributesInserted = attributesInserted.map((item: any) => item.attribute.key);
    }

    // Map available attributes to Code Actions
    var attributesToInsert = getAttributesFromTopology(entityType, extension, attributesInserted);
    return attributesToInsert.map((attribute) =>
      this.createInsertAction(
        `Insert ${attribute.key} attribute`,
        buildAttributePropertySnippet(attribute.key, attribute.displayName, indent),
        document,
        range
      )
    );
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
    insertionType: "properties" | "columns"
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;

    // Find already inserted relations
    var relationsInserted: any[] = [];
    if (insertionType === "properties") {
      relationsInserted = extension.screens![screenIdx].propertiesCard.properties.filter(
        (prop: any) => prop.type === "RELATION"
      );
    } else {
      const cardIdx = getBlockItemIndexAtLine("entitiesListCards", range.start.line, document.getText());
      const selectorTemplate = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
      if (selectorTemplate) {
        entityType = selectorTemplate.split("type(")[1].split(")")[0];
      }
      relationsInserted = extension.screens![screenIdx].entitiesListCards![cardIdx].columns!.filter(
        (col) => col.type === "RELATION"
      );
    }
    if (relationsInserted) {
      relationsInserted = relationsInserted.map((property: any) => {
        if (property.relation.entitySelectorTemplate) {
          try {
            return property.relation.entitySelectorTemplate.split("type(")[1].split(")")[0];
          } catch {
            return "";
          }
        }
      });
    }
    // TODO: Filter out relationships that are not suitable for properties (e.g. have many)
    var relationsToInsert = getRelationships(entityType, extension).filter(
      (rel) => !relationsInserted.includes(rel.entity)
    );

    // Map available relations to Code Actions
    if (relationsToInsert.length > 0) {
      return relationsToInsert.map((rel) => {
        var relEntityName = getEntityName(rel.entity, extension) || rel.entity;
        return this.createInsertAction(
          `Insert relation to ${relEntityName}`,
          buildRelationPropertySnippet(
            `type(${rel.entity}),${rel.direction === "to" ? "from" : "to"}Relationships.${
              rel.relation
            }($(entityConditions))`,
            `Related ${relEntityName}`,
            indent
          ),
          document,
          range
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
    metricOnly: boolean = false
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var cardIdx = getBlockItemIndexAtLine(`${cardType}s`, range.start.line, document.getText());

    var entityType = extension.screens![screenIdx].entityType;
    if (cardType === "entitiesListCard") {
      let entitySelector = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
      if (entitySelector) {
        entityType = entitySelector.split("type(")[1].split(")")[0];
      }
    }

    var typeIdx = extension.topology.types.findIndex((type) => type.name === entityType);
    var metricsInserted =
      cardType === "chartsCard"
        ? getMetricKeysFromChartCard(screenIdx, cardIdx, extension)
        : getMetricKeysFromEntitiesListCard(screenIdx, cardIdx, extension);
    var metricsToInsert = getEntityMetrics(typeIdx, extension, metricsInserted);

    return metricOnly
      ? metricsToInsert.map((metric) =>
          this.createInsertAction(
            `Insert metric ${metric}`,
            `${" ".repeat(indent + 2)}- metricSelector: ${metric}:splitBy("dt.entity.${entityType}")\n`,
            document,
            range
          )
        )
      : metricsToInsert.map((metric) =>
          this.createInsertAction(
            `Insert chart for ${metric}`,
            buildGraphChartSnippet(metric, entityType, indent),
            document,
            range
          )
        );
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
    extension: ExtensionStub
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var typeIdx = extension.topology.types.findIndex((type) => type.name === entityType);
    var cardsInserted = getEntityChartCardKeys(screenIdx, extension);
    var entityMetrics = getEntityMetrics(typeIdx, extension);
    var cardsToInsert: { key: string; featureSet: string; metrics: string[] }[] = [];

    getAllMetricsByFeatureSet(extension)
      .filter((fs) => !cardsInserted.includes(slugify(`${entityType}-charts-${fs.name}`)))
      .forEach((fs) => {
        let metrics = fs.metrics.filter((m) => entityMetrics.includes(m));
        if (metrics.length > 0) {
          cardsToInsert.push({
            key: `${entityType}-charts-${fs.name}`,
            featureSet: fs.name,
            metrics: metrics,
          });
        }
      });

    return cardsToInsert.map((card) =>
      this.createInsertAction(
        `Insert card for ${card.featureSet} metrics`,
        buildChartCardSnippet(card.key, card.featureSet, card.metrics, entityType, indent),
        document,
        range
      )
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
    extension: ExtensionStub
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var entityName = getEntityName(entityType, extension);

    // TODO: Filter out only the list-able relationships (e.g. to many)
    var relationships = getRelationships(entityType, extension);
    var cardsInserted = getEntitiesListCardKeys(screenIdx, extension);
    var insertions = [];

    if (!cardsInserted.includes(slugify(`${entityType}-list-self`))) {
      insertions.push(
        this.createInsertAction(
          `Insert list of ${entityName}s`,
          buildEntitiesListCardSnippet(`${entityType}-list-self`, 15, `List of ${entityName}s`, entityType, indent),
          document,
          range
        )
      );
    }

    relationships
      .filter((rel) => !cardsInserted.includes(slugify(`${entityType}-list-${rel.entity}`)))
      .forEach((rel) => {
        var relEntityName = getEntityName(rel.entity, extension) || rel.entity;
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
              }($(entityConditions))`
            ),
            document,
            range
          )
        );
      });

    return insertions;
  }

  /**
   * Creates Code Actions that insert entire entity screens. The screen is generated as best as possible
   * given the data available. An action is also created for generating all available screens in one go.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createScreenInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub
  ): vscode.CodeAction[] {
    const insertions: vscode.CodeAction[] = [];
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;

    // Which entities should we generate screens for
    var allEntities = extension.topology.types ? extension.topology.types : [];
    const existingScreens = extension.screens ? extension.screens.map((s) => s.entityType) : [];
    allEntities = allEntities.filter((e) => !existingScreens.includes(e.name));
    if (allEntities.length === 0) {
      return [];
    }
    // Actions for individual screens
    allEntities.forEach((e) => {
      insertions.push(
        this.createInsertAction(
          `Generate screen for ${e.displayName}`,
          buildScreenSnippet(
            e,
            extension.name,
            getAllEntitiesListsSnippet(e.name, extension),
            getAllChartCardsSnippet(e.name, extension),
            getAllCardKeysSnippet(e.name, extension),
            indent
          ),
          document,
          range
        )
      );
    });
    // All-in-one action for multiple screens
    if (allEntities.length - existingScreens.length > 1) {
      insertions.push(
        this.createInsertAction(
          "Auto-generate all screens",
          allEntities
            .map((e) =>
              buildScreenSnippet(
                e,
                extension.name,
                getAllEntitiesListsSnippet(e.name, extension),
                getAllChartCardsSnippet(e.name, extension),
                getAllCardKeysSnippet(e.name, extension),
                indent,
                false
              )
            )
            .join("\n"),
          document,
          range
        )
      );
    }

    return insertions;
  }
}
