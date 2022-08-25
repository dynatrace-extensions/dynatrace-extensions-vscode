import * as vscode from "vscode";
import * as yaml from "yaml";
import {
  getAttributesFromTopology,
  getEntityMetrics,
  getMetricKeysFromChartCard,
} from "../utils/extensionParsing";
import { buildAttributePropertySnippet, buildGraphChartSnippet } from "../utils/snippetBuilding";
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

    // add charts within chartCards
    if (
      parentBlocks[parentBlocks.length - 1] === "chartsCards" &&
      document.lineAt(range.start.line).text.includes("charts:")
    ) {
      codeActions.push(...this.createChartInsertions(document, range, extension));
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
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @param extension extension yaml serialized as object
   * @returns list of Code Actions
   */
  private createChartInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub
  ) {
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var screenIdx = getBlockItemIndexAtLine("screens", range.start.line, document.getText());
    var cardIdx = getBlockItemIndexAtLine("chartsCards", range.start.line, document.getText());
    var entityType = extension.screens![screenIdx].entityType;
    var typeIdx = -1;
    extension.topology.types.forEach((type, idx) => {
      if (type.name === entityType) {
        typeIdx = idx;
      }
    });
    var metricsInserted = getMetricKeysFromChartCard(screenIdx, cardIdx, extension);
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
}
