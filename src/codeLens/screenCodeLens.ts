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
import * as yaml from "yaml";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
const open = require("open");

/**
 * Implementation of a Code Lens Provider to allow opening Dynatrace screens in the browser.
 */
export class ScreenLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private readonly environments: EnvironmentsTreeDataProvider;

  /**
   * @param environmentsProvider - a provider of Dynatrace environments data
   */
  constructor(environmentsProvider: EnvironmentsTreeDataProvider) {
    this.codeLenses = [];
    this.regex = /^  - ./gm;
    this.environments = environmentsProvider;
    vscode.commands.registerCommand(
      "dt-ext-copilot.openScreen",
      (entityType: string, screenType: "list" | "details") => {
        this.openScreen(entityType, screenType);
      }
    );
  }

  /**
   * Provides the actual code lenses relevant for each screen defined in the yaml.
   * @param document VSCode Text Document - this should be the extension.yaml
   * @param token Cancellation Token
   * @returns list of code lenses
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();

    // If no screens, don't continue
    if (!text.includes("screens:")) {
      return this.codeLenses;
    }

    let matches;
    const extension: ExtensionStub = yaml.parse(text);
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      // Check we're inside the list of screens
      const parentBlocks = getParentBlocks(line.lineNumber, text);
      if (parentBlocks[parentBlocks.length - 1] !== "screens") {
        continue;
      }
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
      if (range) {
        // Get the entity type
        const screenIdx = getBlockItemIndexAtLine("screens", line.lineNumber, text);
        const entityType = extension.screens![screenIdx].entityType;
        // Create the lenses
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Open List View",
            tooltip: "Open this entity's List View in Dynatrace",
            command: "dt-ext-copilot.openScreen",
            arguments: [entityType, "list"],
          }),
          new vscode.CodeLens(range, {
            title: "Open Details View",
            tooltip: "Open this entity's Details View in Dynatrace",
            command: "dt-ext-copilot.openScreen",
            arguments: [entityType, "details"],
          })
        );
      }
    }
    return this.codeLenses;
  }

  /**
   * Opens a webpage pointing to either a List or Details Screen for a given entity type.
   * The screen opens in the currently connected environment (if any). If the environments
   * provider doesn't return an API client, nothing happens.
   * @param entityType type of entity who's screens we're accessing
   * @param screenType type of screen to open
   */
  private async openScreen(entityType: string, screenType: "list" | "details") {
    try {
      const tenant = await this.environments.getCurrentEnvironment();
      if (tenant) {
        if (screenType === "list") {
          open(`${tenant.url}/ui/entity/list/${entityType}`);
        }
        if (screenType === "details") {
          const entityId = (await tenant.dt.entitiesV2.list(`type("${entityType}")`, "now-5m"))[0].entityId;
          open(`${tenant.url}/ui/entity/${entityId}`);
        }
      }
      // Things can fail. We don't care.
    } catch {
      console.log("Couldn't open screen.");
    }
  }
}
