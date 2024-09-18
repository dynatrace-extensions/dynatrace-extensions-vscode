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
import { indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provides singleton access to the PrometheusActionProvider.
 */
export const getActivationSchemaActionProvider = (() => {
  let instance: PrometheusActionProvider | undefined;

  return () => {
    instance = instance === undefined ? new PrometheusActionProvider() : instance;
    return instance;
  };
})();

/**
 * Provider for Code Actions that work with scraped Prometheus data to automatically
 * insert it in the Extension yaml.
 */
class PrometheusActionProvider implements vscode.CodeActionProvider {
  /**
   * Provides the Code Actions that insert details based on Prometheus scraped data.
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

    codeActions.push(...this.createMetadataInsertions(document, range));

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
  ): vscode.CodeAction | undefined {
    if (document.lineCount === range.start.line + 1) {
      textToInsert = "\n" + textToInsert;
    }
    const firstLineMatch = /[a-z]/i.exec(document.lineAt(range.start.line).text);
    if (firstLineMatch) {
      const indent = firstLineMatch.index;
      const insertPosition = new vscode.Position(range.start.line + 1, 0);
      const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.insert(document.uri, insertPosition, indentSnippet(textToInsert, indent));
      return action;
    }
  }

  /**
   * Creates Code Actions for inserting metric metadata based on scraped Prometheus data.
   * Metrics are filtered to only match the ones added in the datasource (not all scraped) and also
   * ones that don't already have metadata defined (so we don't duplicate).
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param extension extension.yaml serialized as object
   * @returns list of code actions
   */
  private createMetadataInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];

    const metricsToInsert = "test";

    // Action for all metrics in one go
    if (metricsToInsert.length > 1) {
      const action = this.createInsertAction(
        "Add metadata for all metrics",
        metricsToInsert,
        document,
        range,
      );
      if (action) {
        codeActions.push(action);
      }
    }

    return codeActions;
  }
}
