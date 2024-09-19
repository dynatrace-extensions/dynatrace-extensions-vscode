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

import { indentSnippet } from "./utils/snippetBuildingUtils";

interface Map {
  [key: string]: string;
}

const humanReadableNames: Map = {
  boolean: "Add boolean field",
  integer: "Add integer field",
  object: "Add object field",
  text: "Add text field",
  secret: "Add secret field",
  float: "Add float field",
  set: "Add set field",
  list: "Add list field",
  color: "Add color field",
  list_reference: "Add reference list field",
  select: "Add dropdown field",
  radio_button: "Add radio button field",
  hiVictor: "Get a picture of Victor",
  enums: "Add enumeration field",
  credentials: "Add credential vault integration",
  base_precondition: "Add precondition",
  not_precondition: "Add negative precondition",
  recursive_precondition: "Add recursive precondition",
  range: "Add range constraints",
  length: "Add length constraints",
  notBlank: "Add not blank constraints",
  trimmed: "Add trimmed constraints",
  noWhitespace: "Add no whitespace constraints",
};

const componentTemplates: Map = {
  enums: `"enums": {
  "enum_name": {
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
}`,
};

const propertyTemplates: Map = {
  text: `"field_name": {
  "displayName": "Text Field",
  "description": "Description",
  "nullable": false,
  "type": "text",
  "default": ""
}`,
  secret: `"field_name": {
"displayName": "Secret",
"description": "Description",
"nullable": false,
"type": "secret",
"default": ""
}`,
  boolean: `"field_name": {
  "displayName": "Boolean Field",
  "description": "Description",
  "nullable": false,
  "type": "boolean",
  "default": true
}`,
  integer: `"field_name": {
  "displayName": "Integer Field",
  "description": "Description",
  "nullable": false,
  "type": "integer",
  "default": 1
}`,
  float: `"field_name": {
"displayName": "Float Field",
"description": "Description",
"nullable": false,
"type": "float",
"default": 1.00
}`,
  select: `"field_name": {
    "displayName": "Select",
    "description": "Description",
    "nullable": false,
    "type": {
      "$ref": "#/enums/enum_name"
    }
}`,
  radio_button: `"field_name": {
  "displayName": "Radio button",
  "description": "Description",
  "nullable": false,
  "type": {
    "$ref": "#/enums/enum_name"
  },
  "subType": "radio
}`,
  credentials: `"useCredentialVault": {
    "displayName": "Use credential vault",
    "type": "boolean",
    "nullable": false,
    "default": false,
    "maxObjects": 1
  },
  "credentialVaultId": {
    "displayName": "Select vault credentials",
    "nullable": true,
    "type": "text",
    "subType": "credential",
    "referencedType": "USERNAME_PASSWORD",
    "maxObjects": 1,
    "precondition": {
      "type": "EQUALS",
      "property": "useCredentialVault",
      "expectedValue": true
    }
  },
  "username": {
    "displayName": "User name",
    "type": "text",
    "nullable": false,
    "default": "",
    "constraints": [
      {
        "type": "LENGTH",
        "minLength": 1,
        "maxLength": 500
      }
    ],
    "precondition": {
      "type": "NOT",
      "precondition": {
        "type": "EQUALS",
        "property": "useCredentialVault",
        "expectedValue": true
      }
    },
  "maxItems": 1
  },
  "password": {
    "displayName": "Password",
    "type": "secret",
    "nullable": false,
    "default": "",
    "constraints": [
      {
        "type": "LENGTH",
        "minLength": 1,
        "maxLength": 500
      }
    ],
    "precondition": {
      "type": "NOT",
      "precondition": {
        "type": "EQUALS",
        "property": "useCredentialVault",
        "expectedValue": true
      }
    },
  "maxItems": 1
}`,
  color: `"field_name": {
"displayName": "Color",
"description": "Description",
"nullable": false,
"default": "#FFEE7C",
"type": "text",
"subType": "color"
}`,
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
  list: `"field_name": {
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
  list_reference: `"field_name": {
"displayName": "Object Reference",
"description": "Description",
"nullable": false,
"type": "list",
"items": {
  "type": {
    "$ref": "#/types/object_name"
  }
}
}`,
  object: `"object_name": {
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
  hiVictor: "😎",
};

const numberConstraintTemplates: Map = {
  range: `"constraints": [
    {
      "type": "RANGE",
      "minimum": 0,
      "maximum": 20,
      "customMessage": "My custom error message"
    }
  ]`,
};

const stringConstraintTemplates: Map = {
  length: `"constraints": [
  {
    "type": "LENGTH",
    "minLength": 1,
    "maxLength": 500,
    "customMessage": "My custom error message"
  }
]`,
  notBlank: `"constraints": [
  {
    "type": "NOT_BLANK",
    "customMessage": "My custom error message"
  }
]`,
  trimmed: `"constraints": [
  {
    "type": "TRIMMED",
    "customMessage": "My custom error message"
  }
]`,
  noWhitespace: `"constraints": [
  {
    "type": "NO_WHITESPACE",
    "customMessage": "My custom error message"
  }
]`,
};

const preconditionTemplates: Map = {
  base_precondition: `"precondition": {
  "type": "<EQUALS>/<IN>/<NULL>/<REGEX>",
  "property": "property name",
  "expectedValue": "value"
}`,
  not_precondition: `"precondition": {
  "type": "NOT",
  "precondition": {
    "type": "<EQUALS>/<IN>/<NULL>/<REGEX>",
    "property": "property name",
    "expectedValue": "value"
  }
}`,
  recursive_precondition: `"precondition": {
  "type": "<AND/OR>",
  "preconditions": [
    {
      "type": "<EQUALS>/<IN>/<NULL>/<REGEX>",
      "property": "property name",
      "expectedValue": "value"
    }
  ]
}`,
};

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
    let mapKey: keyof Map;

    if (propertyType !== "") {
      if (propertyType == "all") {
        for (mapKey in preconditionTemplates) {
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
          for (mapKey in numberConstraintTemplates) {
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
          for (mapKey in stringConstraintTemplates) {
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
          for (mapKey in propertyTemplates) {
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
        for (mapKey in componentTemplates) {
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
