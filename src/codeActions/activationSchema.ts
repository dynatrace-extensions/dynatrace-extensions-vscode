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
import { getPropertyValidLines, getComponentValidLines } from "../utils/jsonParsing";
import * as logger from "../utils/logging";

import { indentSnippet } from "./utils/snippetBuildingUtils";

interface FieldMap {
  [key: string]: string;
}

const componentTemplates: FieldMap = {
  enums: `"enums": {
    "options": {
      "description": "",
      "documentation": "",
      "nullable": false,
      "type": "enum",
      "items": [
        {
          "displayName": "Option A",
          "description": "Description of option A",
          "value": "A",
          "icon": "apple"
        },
        {
          "displayName": "Option B",
          "description": "Description of option B",
          "value": "B",
          "icon": "windows"
        },
        {
          "displayName": "Option C",
          "description": "Description of option C",
          "value": "C",
          "icon": "linux"
        }
      ]
    }
  },`,
};

const propertyTemplates: FieldMap = {
  boolean: `"field_name": {
  "displayName": "Boolean Field",
  "description": "Description",
  "nullable": false,
  "type": "boolean"
},`,
  integer: `"field_name": {
  "displayName": "Integer Field",
  "description": "Description",
  "nullable": false,
  "type": "integer"
},`,
  object: `"typeProp": {
  "displayName": "",
  "description": "",
  "documentation": "",
  "version": "",
  "summaryPattern": "Summary: {textProp}",
  "type": "object",
  "properties": {
    "textProp": {
      "displayName": "Text Field",
      "description": "Description",
      "nullable": false,
      "type": "text",
      "default": "..."
    }
  }
}`,
  text: `"field_name": {
  "displayName": "Text Field",
  "description": "Description",
  "nullable": false,
  "type": "text"
},`,
  hiVictor: "😎",
  secret: `"field_name": {
  "displayName": "Secret",
  "description": "Description",
  "nullable": false,
  "type": "secret",
  "default": "***123***"
},`,
  float: `"field_name": {
  "displayName": "Integer Field",
  "description": "Description",
  "nullable": false,
  "type": "float"
},`,
  set: `"field_name": {
  "displayName": "Set",
  "description": "Description",
  "nullable": false,
  "items": {
    "displayName": "Text Field",
    "description": "Description",
    "nullable": false,
    "type": "text",
    "default": ""
  },
  "type": "set"
}`,
  list: `"props": {
  "displayName": "List",
  "description": "Description",
  "nullable": false,
  "items": {
    "displayName": "Text Field",
    "description": "Description",
    "nullable": false,
    "type": "text",
    "default": ""
  },
  "type": "list"
}`,
  color: `"field_name": {
  "displayName": "Color",
  "description": "Description",
  "nullable": false,
  "type": "text",
  "subType": "color"
}`,
  reference: `"props": {
  "displayName": "Object Reference",
  "description": "Description",
  "nullable": false,
  "type": "set",
  "items": {
    "type": {
      "$ref": "#/types/typeProp"
    }
  }
}`,
};

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

    const lineIndex = document.lineAt(range.start.line).lineNumber;
    const lineList = getPropertyValidLines(document.getText());
    const lineList2 = getComponentValidLines(document.getText());

    logger.info("Full list:");
    logger.info(lineList);
    logger.info(lineList2);

    if (lineList.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, true));
    }

    if (lineList2.includes(lineIndex)) {
      codeActions.push(...this.createMetadataInsertions(document, range, false));
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
    const bracketMatch = /[{}]/i.exec(document.lineAt(range.start.line).text);
    if (bracketMatch) {
      const indent = bracketMatch.index;
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
    property: boolean,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    let fieldType: keyof FieldMap;
    if (property) {
      for (fieldType in propertyTemplates) {
        const propertyTemplate = propertyTemplates[fieldType];
        const action = this.createInsertAction(fieldType, propertyTemplate, document, range);
        if (action) {
          codeActions.push(action);
        }
      }
    } else {
      for (fieldType in componentTemplates) {
        const componentTemplate = componentTemplates[fieldType];
        const action = this.createInsertAction(fieldType, componentTemplate, document, range);
        if (action) {
          codeActions.push(action);
        }
      }
    }
    return codeActions;
  }
}
