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

/********************************************************************************
 * UTILITIES FOR PARSING RAW JSON CONTENT
 ********************************************************************************/

import { writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Reads the contents of the actiovationSchema.json file and
 * provides a set of lists and maps that define the lines of the file
 * where we can perform code actions.
 * @param content full content of the activationSchema.json file as a string
 * @returns Four lists and one map containing the valid lines for code the different code actions
 */
export function validLinesForCodeActions(
  content: string,
): [number[], number[], number[], Record<string, number[]>, number[]] {
  const addPropertylines: number[] = [];
  const addObjectOnlyLines: number[] = [];
  const addEnumLines: number[] = [];
  const addConstraintsLines: Record<string, number[]> = {
    number: [],
    string: [],
  };
  const fileLines = content.split(/\r?\n/);
  let addPreconditionLines: number[] = [];
  let currentLine = 0;
  let linesInsideProperty: number[] = [];
  let typesFound = false;
  let insideTypeProperties = false;
  let insidePropertyBody = false;
  let currentObjectIndentLevel = 0;
  let currentPropertyIndentLevel = 0;
  let currentType = ""; // Keeps track of the type of the current property we are looking at
  let openBrackets = 0;
  let closedBrackets = 0;
  let inString = false;

  fileLines.forEach(element => {
    if (typesFound) {
      if (insidePropertyBody) {
        linesInsideProperty.push(currentLine);
        if (element.includes('"type": "text"') || element.includes('"type": "secret"')) {
          currentType = "string";
        }
        if (element.includes('"type": "integer"') || element.includes('"type": "float"')) {
          currentType = "number";
        }
        if (element.includes('"type": "object"') || element.includes('"type": "list"')) {
          currentType = "";
          insidePropertyBody = false;
          linesInsideProperty = [];
          currentPropertyIndentLevel = 0;
        }
      }
      if (openBrackets - closedBrackets == 1) {
        typesFound = false;
      } else {
        for (let j = 0; j < element.length; j++) {
          const char: string = element[j];
          if (char == '"' && !inString) {
            inString = true;
          }
          if (char == '"' && inString) {
            inString = false;
          }
          if (char == "{" && !inString) {
            openBrackets++;
          }
          if (char == "}" && !inString) {
            closedBrackets++;
          }
          if (
            char == "}" &&
            !inString &&
            insideTypeProperties &&
            openBrackets - closedBrackets == currentObjectIndentLevel
          ) {
            addPropertylines.push(currentLine);
          }
          if (
            insideTypeProperties &&
            char == "{" &&
            !inString &&
            !insidePropertyBody &&
            !element.includes('"properties"')
          ) {
            insidePropertyBody = true;
            currentPropertyIndentLevel = openBrackets - closedBrackets - 1;
          }
          if (
            insidePropertyBody &&
            char == "}" &&
            !inString &&
            openBrackets - closedBrackets == currentPropertyIndentLevel
          ) {
            if (currentType !== "") {
              addConstraintsLines[currentType] =
                addConstraintsLines[currentType].concat(linesInsideProperty);
            }
            currentType = "";
            linesInsideProperty.pop();
            addPreconditionLines = addPreconditionLines.concat(linesInsideProperty);
            insidePropertyBody = false;
            currentPropertyIndentLevel = 0;
            linesInsideProperty = [];
          }
          if (
            insideTypeProperties &&
            !inString &&
            openBrackets - closedBrackets == currentObjectIndentLevel - 1
          ) {
            insideTypeProperties = false;
          }
          if (
            char == "}" &&
            !inString &&
            openBrackets - closedBrackets == 2 &&
            !insideTypeProperties
          ) {
            addObjectOnlyLines.push(currentLine);
          }
        }
        if (element.includes('"properties"') || element.includes('"items"')) {
          insideTypeProperties = true;
          currentObjectIndentLevel = openBrackets - closedBrackets;
          addPropertylines.push(currentLine);
        }
      }
    } else {
      for (let j = 0; j < element.length; j++) {
        const char: string = element[j];
        if (char == '"' && !inString) {
          inString = true;
        }
        if (char == '"' && inString) {
          inString = false;
        }
        if (char == "{" && !inString) {
          openBrackets++;
        }
        if (char == "}" && !inString) {
          closedBrackets++;
        }
        if (char == "}" && !inString && openBrackets - closedBrackets == 1) {
          addEnumLines.push(currentLine);
        }
      }
    }
    if (element.includes('"types"')) {
      typesFound = true;
      addObjectOnlyLines.push(currentLine);
    }
    currentLine = currentLine + 1;
  });

  return [
    addPropertylines,
    addObjectOnlyLines,
    addEnumLines,
    addConstraintsLines,
    addPreconditionLines,
  ];
}

export async function checkJSONFormat(content: string) {
  content = content.replace(/(?:\r\n|\r|\n)/g, "\n");
  if (
    JSON.stringify(JSON.parse(content), undefined, 2) !== content &&
    JSON.stringify(JSON.parse(content), undefined, 4) !== content
  ) {
    await vscode.window
      .showInformationMessage(
        "This JSON document is not fully formatted. Completion suggestions may not work as expected.\nFormat before continuing?",
        "Yes",
        "No",
      )
      .then(async choice => {
        if (choice === "Yes") {
          await formatActivationSchema(JSON.stringify(JSON.parse(content), undefined, 2));
        }
      });
  }
}

async function formatActivationSchema(formattedContent: string) {
  if (vscode.workspace.workspaceFolders) {
    const activationLocation = path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      "/extension/activationSchema.json",
    );
    writeFileSync(activationLocation, formattedContent);
    const document = await vscode.workspace.openTextDocument(activationLocation);
    await vscode.window.showTextDocument(document);
  }
}
