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
} from "../utils/snippetBuilding";
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

    // add attribute properties in properties card
    if (
      parentBlocks[parentBlocks.length - 1] === "propertiesCard" &&
      document.lineAt(range.start.line).text.includes("properties:")
    ) {
      codeActions.push(...this.createPropertyInsertions(document, range, extension));
    }

    // add charts
    if (document.lineAt(range.start.line).text.includes("charts:")) {
      // in chartsCard
      if (parentBlocks[parentBlocks.length - 1] === "chartsCards") {
        codeActions.push(...this.createChartInsertions("chartsCard", document, range, extension));
      }
      // in entitiesListCard
      if (parentBlocks[parentBlocks.length - 1] === "entitiesListCards") {
        codeActions.push(...this.createChartInsertions("entitiesListCard", document, range, extension));
      }
    }

    // add whole chart cards
    if (document.lineAt(range.start.line).text.includes("chartsCards:")) {
      codeActions.push(...this.createChartCardInsertions(document, range, extension));
    }

    // add entity list cards
    if (document.lineAt(range.start.line).text.includes("entitiesListCards:")) {
      codeActions.push(...this.createEntitiesListCardInsertions(document, range, extension));
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
    var insertPosition = new vscode.Position(range.start.line + 1, 0);
    const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPosition, textToInsert);
    return action;
  }

  /**
   * Assuming the triggering range is within a `propertiesCard`, creates Code Actions for
   * each attribute property that hasn't been inserted into the card yet.
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createPropertyInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub
  ): vscode.CodeAction[] {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var propertiesInserted = extension.screens![screenIdx].propertiesCard.properties.filter(
      (prop: any) => prop.type === "ATTRIBUTE"
    );
    if (propertiesInserted) {
      propertiesInserted = propertiesInserted.map((property: any) => property.attribute.key);
    }
    var propertiesToInsert = getAttributesFromTopology(entityType, extension, propertiesInserted);
    return propertiesToInsert.map((property) =>
      this.createInsertAction(
        `Insert ${property.key} property`,
        buildAttributePropertySnippet(property.key, property.displayName, indent),
        document,
        range
      )
    );
  }

  /**
   * Creates Code Actions for each metric belonging to the surrounding entity so that it can
   * be added as a chart.
   * @param cardType the type of card these charts are meant for
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createChartInsertions(
    cardType: "chartsCard" | "entitiesListCard",
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub
  ) {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var cardIdx = getBlockItemIndexAtLine(`${cardType}s`, range.start.line, document.getText());

    var entityType: string;
    if (cardType === "chartsCard") {
      entityType = extension.screens![screenIdx].entityType;
    } else {
      let entitySelector = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
      if (entitySelector) {
        entityType = entitySelector.split("type(")[1].split(")")[0];
      } else {
        entityType = extension.screens![screenIdx].entityType;
      }
    }

    var typeIdx = -1;
    extension.topology.types.forEach((type, idx) => {
      if (type.name === entityType) {
        typeIdx = idx;
      }
    });
    var metricsInserted =
      cardType === "chartsCard"
        ? getMetricKeysFromChartCard(screenIdx, cardIdx, extension)
        : getMetricKeysFromEntitiesListCard(screenIdx, cardIdx, extension);
    var metricsToInsert = getEntityMetrics(typeIdx, extension, metricsInserted);

    return metricsToInsert.map((metric) =>
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
  private createChartCardInsertions(document: vscode.TextDocument, range: vscode.Range, extension: ExtensionStub) {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var typeIdx = -1;
    extension.topology.types.forEach((type, idx) => {
      if (type.name === entityType) {
        typeIdx = idx;
      }
    });
    var cardsInserted = getEntityChartCardKeys(screenIdx, extension);
    var entityMetrics = getEntityMetrics(typeIdx, extension);
    var cardsToInsert: { key: string; featureSet: string; metrics: string[] }[] = [];
    getAllMetricsByFeatureSet(extension)
      .filter((fs) => !cardsInserted.includes(`${entityType}-charts-${fs.name}`))
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
  ) {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var entityName = getEntityName(entityType, extension);

    // TODO: Filter out only the list-able relationships (e.g. to many)
    var relationships = getRelationships(entityType, extension);
    var cardsInserted = getEntitiesListCardKeys(screenIdx, extension);
    var cardsToInsert = [];

    if (!cardsInserted.includes(`${entityType}-list-self`)) {
      cardsToInsert.push(
        this.createInsertAction(
          `Insert list of ${entityName}s`,
          buildEntitiesListCardSnippet(`${entityType}-list-self`, 15, `List of ${entityName}s`, indent),
          document,
          range
        )
      );
    }

    relationships
      .filter((rel) => !cardsInserted.includes(`${entityType}-list-${rel.entity}`))
      .forEach((rel) => {
        cardsToInsert.push(
          this.createInsertAction(
            `Insert list of related ${getEntityName(rel.entity, extension)}s`,
            buildEntitiesListCardSnippet(
              `${entityType}-list-${rel.entity}`,
              5,
              `List of related ${getEntityName(rel.entity, extension)}s`,
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

    return cardsToInsert;
  }
}
