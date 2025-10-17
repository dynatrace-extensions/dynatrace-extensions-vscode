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

import vscode from "vscode";
import { validLinesForCodeActions, checkJSONFormat } from "../utils/jsonParsing";

import { createSingletonProvider } from "../utils/singleton";
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
 * Provider for Code Actions that work with scraped activationSchema data to automatically
 * insert fields and their properties in the Extension activation schema.
 */
class ActivationSchemaActionProvider implements vscode.CodeActionProvider {
  private checkedFormat = false;

  /**
   * Provides the Code Actions that insert details based on activationSchema scraped data.
   * @param document document that activated the provider
   * @param range range that activated the provider
   * @returns list of Code Actions
   */
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): Promise<vscode.CodeAction[]> {
    if (!this.checkedFormat) {
      await checkJSONFormat(document.getText());
      this.checkedFormat = true;
    }

    const codeActions: vscode.CodeAction[] = [];

    const cursorLine = document.lineAt(range.start.line).lineNumber;
    const [
      addPropertyLines,
      addObjectOnlyLines,
      addEnumLines,
      addConstraintLines,
      addPreconditionLines,
    ] = validLinesForCodeActions(document.getText());

    if (addPropertyLines.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "all_properties"));
    }

    if (addObjectOnlyLines.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "only_objects"));
    }

    if (addEnumLines.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "enumerations"));
    }

    if (addConstraintLines.number.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "number_restrictions"));
    }

    if (addConstraintLines.string.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "string_restrictions"));
    }

    if (addPreconditionLines.includes(cursorLine)) {
      codeActions.push(...this.createMetadataInsertions(document, range, "preconditions"));
    }

    return codeActions;
  }

  /**
   * Creates Code Actions for inserting JSON block based on scraped activationSchema data.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param insertionType string that representes what kind of insertion we can do
   * @returns list of code actions
   */
  private createMetadataInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    insertionType: string,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];

    switch (insertionType) {
      case "all_properties": {
        for (const mapKey in propertyTemplates) {
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            propertyTemplates[mapKey],
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
        break;
      }
      case "only_objects": {
        const action = this.createInsertAction(
          "Add object field",
          propertyTemplates.object,
          document,
          range,
        );
        if (action) {
          codeActions.push(action);
        }
        break;
      }
      case "enumerations": {
        for (const mapKey in componentTemplates) {
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            componentTemplates[mapKey],
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
        break;
      }
      case "number_restrictions": {
        for (const mapKey in numberConstraintTemplates) {
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            numberConstraintTemplates[mapKey],
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
        break;
      }
      case "string_restrictions": {
        for (const mapKey in stringConstraintTemplates) {
          const action = this.createInsertAction(
            humanReadableNames[mapKey],
            stringConstraintTemplates[mapKey],
            document,
            range,
          );
          if (action) {
            codeActions.push(action);
          }
        }
        break;
      }
      case "preconditions": {
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
        break;
      }
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
      const indentedSnippet = indentSnippet(textToInsert, indent);
      const insertSnippet =
        preComma + indentedSnippet.substring(0, indentedSnippet.length - 1) + postComma;
      const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.insert(document.uri, insertPosition, insertSnippet);
      return action;
    }
  }

  /**
   * Checks if the block that needs to be added requires a comma before or after it.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @returns tuple comprised of the strings to attach before and after the block
   */
  private checkCommaPosition(document: vscode.TextDocument, range: vscode.Range): [string, string] {
    const precommaIndex = /[,{]/i.exec(document.lineAt(range.start.line).text);
    if (precommaIndex) {
      return ["\n", ","];
    } else {
      return [",\n", ""];
    }
  }
}

/**
 * Provides singleton access to the ActivationSchemaActionProvider.
 */
export const getActivationSchemaActionProvider = createSingletonProvider(
  ActivationSchemaActionProvider,
);
