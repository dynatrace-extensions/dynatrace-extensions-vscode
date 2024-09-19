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
import { getPropertyValidLines } from "../utils/jsonParsing";
import * as logger from "../utils/logging";

import {
  humanReadableNames,
  componentTemplates,
  propertyTemplates,
  numberConstraintTemplates,
  stringConstraintTemplates,
  preconditionTemplates,
} from "./utils/activationSchemaTemplates";
import { indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provides singleton access to the activationSchemaActionProvider.
 */
export const getActivationSchemaActionProvider = (() => {
  let instance: activationSchemaActionProvider | undefined;

  return () => {
    instance = instance === undefined ? new activationSchemaActionProvider() : instance;
    return instance;
  };
})();

/**
 * Provider for Code Actions that work with scraped activationSchema data to automatically
 * insert it in the Extension yaml.
 */
class activationSchemaActionProvider implements vscode.CodeActionProvider {
  /**
   * Provides the Code Actions that insert details based on activationSchema scraped data.
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

    const lineIndex = document.lineAt(range.start.line).lineNumber;
    const [lineList, typeLineList, enumLineList, validLinesPerType, validPreconditionLines] =
      getPropertyValidLines(document.getText());

    if (lineList.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, true, false, ""));
    }

    if (typeLineList.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, true, true, ""));
    }

    if (enumLineList.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, false, false, ""));
    }

    if (validLinesPerType.number.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, false, false, "number"));
    }

    if (validLinesPerType.string.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, false, false, "string"));
    }

    if (validPreconditionLines.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, false, false, "all"));
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
  ): vscode.CodeAction | undefined {
    const indentMatch = /[^ ]/i.exec(document.lineAt(range.start.line).text);
    const [preComma, postComma] = this.checkCommaPosition(document, range);
    if (indentMatch) {
      const indent = indentMatch.index - 2;
      const insertPosition = new vscode.Position(
        range.start.line,
        document.lineAt(range.start.line).text.length,
      );
      const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      const indentedSnippet = indentSnippet(textToInsert, indent);
      const insertSnippet =
        preComma +
        indentSnippet(textToInsert, indent).substring(0, indentedSnippet.length - 1) +
        postComma;
      action.edit.insert(document.uri, insertPosition, insertSnippet);
      return action;
    }
  }

  /**
   * Creates Code Actions for inserting metric metadata based on scraped activationSchema data.
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
    property: boolean,
    onlyObject: boolean,
    propertyType: string,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];

    if (propertyType !== "") {
      if (propertyType == "all") {
        for (const mapKey in preconditionTemplates) {
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            preconditionTemplates[mapKey],
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
      } else {
        if (propertyType == "number") {
          for (const mapKey in numberConstraintTemplates) {
            const constraintTemplate = numberConstraintTemplates[mapKey];
            const action = this.createInsertAction(
              humanReadableNames[mapKey],
              constraintTemplate,
              document,
              range,
            );
            if (action) {
              codeActions.push(action);
            }
          }
        } else if (propertyType == "string") {
          for (const mapKey in stringConstraintTemplates) {
            const constraintTemplate = stringConstraintTemplates[mapKey];
            const action = this.createInsertAction(
              humanReadableNames[mapKey],
              constraintTemplate,
              document,
              range,
            );
            if (action) {
              codeActions.push(action);
            }
          }
        }
      }
    } else {
      if (property) {
        if (onlyObject) {
          const action = this.createInsertAction(
            "Add object field",
            propertyTemplates.object,
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        } else {
          for (const mapKey in propertyTemplates) {
            const propertyTemplate = propertyTemplates[mapKey];
            const action = this.createInsertAction(
              humanReadableNames[mapKey],
              propertyTemplate,
              document,
              range,
            );
            if (action) {
              codeActions.push(action);
            }
          }
        }
      } else {
        for (const mapKey in componentTemplates) {
          const componentTemplate = componentTemplates[mapKey];
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            componentTemplate,
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
      }
    }
    return codeActions;
  }

  private checkCommaPosition(document: vscode.TextDocument, range: vscode.Range): [string, string] {
    const precommaIndex = /[,{]/i.exec(document.lineAt(range.start.line).text);
    if (precommaIndex) {
      return ["\n", ","];
    } else {
      return [",\n", ""];
    }
  }
}
