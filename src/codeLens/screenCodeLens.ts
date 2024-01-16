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
import { getConnectedTenant } from "../treeViews/tenantsTreeView";
import { getCachedParsedExtension } from "../utils/caching";
import * as logger from "../utils/logging";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

/**
 * Implementation of a Code Lens Provider to allow opening Dynatrace screens in the browser.
 */
export class ScreenLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "screenCodeLens", this.constructor.name];
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.codeLenses = [];
    this.regex = /^ {2}- ./gm;
    vscode.commands.registerCommand(
      "dynatrace-extensions.openScreen",
      async (entityType: string, screenType: "list" | "details") => {
        await this.openScreen(entityType, screenType);
      },
    );
  }

  /**
   * Provides the actual code lenses relevant for each screen defined in the yaml.
   * @param document VSCode Text Document - this should be the extension.yaml
   * @returns list of code lenses
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();
    const parsedExtension = getCachedParsedExtension();

    // If no screens or feature disabled, don't continue
    if (
      !parsedExtension ||
      !text.includes("screens:") ||
      !vscode.workspace.getConfiguration("dynatraceExtensions", null).get("screenCodeLens")
    ) {
      return [];
    }

    let matches;
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
        const entityType = parsedExtension.screens?.[screenIdx].entityType;
        if (entityType) {
          // Create the lenses
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Open List View",
              tooltip: "Open this entity's List View in Dynatrace",
              command: "dynatrace-extensions.openScreen",
              arguments: [entityType, "list"],
            }),
            new vscode.CodeLens(range, {
              title: "Open Details View",
              tooltip: "Open this entity's Details View in Dynatrace",
              command: "dynatrace-extensions.openScreen",
              arguments: [entityType, "details"],
            }),
          );
        }
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
      const tenant = await getConnectedTenant();
      if (tenant) {
        const baseUrl = tenant.url.includes(".apps")
          ? `${tenant.url}/ui/apps/dynatrace.classic.technologies`
          : tenant.url;
        if (screenType === "list") {
          await vscode.env.openExternal(
            vscode.Uri.parse(`${baseUrl}/ui/entity/list/${entityType}`),
          );
        }
        if (screenType === "details") {
          const entities = await tenant.dt.entitiesV2.list(`type("${entityType}")`, "now-5m");
          if (entities.length > 0) {
            const entityId = entities[0].entityId;
            await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/ui/entity/${entityId}`));
          } else {
            logger.notify("ERROR", "No entities of this type were found in your tenant.");
          }
        }
        // Things can fail. We don't care.
      }
    } catch (err) {
      logger.warn(`Could not open screen: ${(err as Error).message}`, ...this.logTrace);
      logger.notify("WARN", "Could not open screen.");
    }
  }
}
