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
import { getCachedWmiStatus, setCachedWmiStatus, setCachedWmiQueryResult } from "../utils/caching";
import * as logger from "../utils/logging";
import { getBlockRange } from "../utils/yamlParsing";
import { ValidationStatus } from "./utils/selectorUtils";
import { WmiQueryResult, runWMIQuery } from "./utils/wmiUtils";

/**
 * Provides singleton access to the WmiCodeLensProvider
 */
export const getWmiCodeLensProvider = (() => {
  let instance: WmiCodeLensProvider | undefined;

  return () => {
    instance = instance === undefined ? new WmiCodeLensProvider() : instance;
    return instance;
  };
})();

/**
 * Implementation of a Code Lens provider for WMI Queries. It creates two lenses, for executing a
 * WMI Query against the local Windows machine and checking the last execution status.
 */
class WmiCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private readonly controlSetting = "wmiCodeLens";
  private readonly regex = new RegExp("query:", "g");

  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    const commandId = "dynatrace-extensions.codelens.runWMIQuery";
    vscode.commands.registerCommand(commandId, async (query: string) => {
      runWMIQuery(query, (checkedQuery, status, result) => {
        this.updateQueryData(checkedQuery, status, result);
      }).catch(err =>
        logger.error(`Running WMI Query failed unexpectedly. ${(err as Error).message}`, commandId),
      );
    });
  }

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();

    // Bail early if feature disabled or no wmi in manifest
    if (
      !text.includes("wmi:") ||
      !vscode.workspace.getConfiguration("dynatraceExtensions", null).get(this.controlSetting)
    ) {
      return [];
    }

    // Create lenses
    const { startIndex, endIndex } = getBlockRange("wmi", document);
    const wmiContent = text.slice(startIndex, endIndex);
    await Promise.all(
      Array.from(wmiContent.matchAll(regex)).map(match =>
        this.createLenses(match, startIndex, document).then(lenses =>
          this.codeLenses.push(...lenses),
        ),
      ),
    );

    return this.codeLenses;
  }

  /**
   * Creates two lenses for a query
   * @param match match of our regular expression on the extension manifest
   * @param matchOffest offset, in case the match was done on trimmed content
   * @param document extension manifest
   * @returns list of code lenses
   */
  private async createLenses(
    match: RegExpMatchArray,
    matchOffest: number,
    document: vscode.TextDocument,
  ) {
    if (match.index) {
      const line = document.lineAt(document.positionAt(matchOffest + match.index).line);
      const indexOf = line.text.indexOf(match[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));

      if (range) {
        const query = line.text.split("query: ")[1];
        return [
          new WmiQueryExecutionLens(range, query),
          new WmiQueryStatusLens(range, query, getCachedWmiStatus(query) ?? { status: "unknown" }),
        ];
      }
    }

    return [];
  }

  /**
   * Updates the last known execution status and result data for a given WMI query and notifies
   * this provider that the code lenses have changed.
   * @param query wmi query to update status for
   * @param status current status
   * @param result the query execution result, if new
   */
  public updateQueryData(query: string, status: ValidationStatus, result?: WmiQueryResult) {
    setCachedWmiStatus(query, status);
    if (result) {
      setCachedWmiQueryResult(result);
    }
    this._onDidChangeCodeLenses.fire();
  }
}
/**
 * Implements a Code Lens that shows the status of a WMI Query execution
 */
class WmiQueryStatusLens extends vscode.CodeLens {
  query: string;

  /**
   * @param range range at which the lens should be created
   * @param query the query associated with this lens
   * @param status the last known status to be displayed
   */
  constructor(range: vscode.Range, query: string, status: ValidationStatus) {
    super(range);
    this.query = query;
    this.command = this.getStatusAsCommand(status);
  }

  /**
   * Interprets a ValidationStatus and translates it to a vscode.Command to be used inside the lens.
   * @param status status of the query
   * @returns command object
   */
  private getStatusAsCommand(status: ValidationStatus): vscode.Command {
    switch (status.status) {
      case "valid":
        return {
          title: "✅",
          tooltip: "Query is valid",
          command: "",
        };
      case "invalid":
        return {
          title: "❌",
          tooltip: "Query is invalid",
          command: "",
        };
      case "loading":
        return {
          title: "⌛ Running query...",
          tooltip: "Query exeucution in progress.",
          command: "",
        };
      default:
        return {
          title: "❔",
          tooltip: "Run the query to validate it.",
          command: "",
        };
    }
  }
}

/**
 * Implements a Code Lens that can be used to execute a WMI Query
 */
class WmiQueryExecutionLens extends vscode.CodeLens {
  query: string;

  constructor(range: vscode.Range, query: string) {
    super(range, {
      title: "▶️ Run WMI Query",
      tooltip: "Run a WMI query on this host",
      command: "dynatrace-extensions.codelens.runWMIQuery",
      arguments: [query],
    });
    this.query = query;
  }
}
