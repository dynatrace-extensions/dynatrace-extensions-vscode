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

import { CodeLensCommand } from "@common";
import vscode from "vscode";
import { isConnectedToSaaS } from "../treeViews/tenantsTreeView";
import { getCachedDqlStatus, setCachedDqlStatus } from "../utils/caching";
import { createSingletonProvider } from "../utils/singleton";
import { prepareDqlQuery } from "./utils/dqlUtils";
import { ValidationStatus } from "./utils/selectorUtils";

const DQL_KEY_REGEX = /"dqlQuery"\s*:/g;

// Module-level reference used by updateDqlValidationStatus
let providerInstance: DqlCodeLensProvider | undefined;

/**
 * Updates the cached validation status for a DQL query and triggers a lens refresh.
 */
export const updateDqlValidationStatus = (query: string, status: ValidationStatus) => {
  providerInstance?.updateValidationStatus(query, status);
};

/**
 * Code Lens provider for DQL queries found in extension screen JSON files.
 * Targets "dqlQuery" keys and provides Validate and Query Data lenses.
 * Only active when connected to a SaaS tenant.
 */
class DqlCodeLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "dqlCodeLens", "DqlCodeLensProvider"];
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];

    if (
      !vscode.workspace.getConfiguration("dynatraceExtensions", null).get("dqlQueriesCodeLens") ||
      !(await isConnectedToSaaS())
    ) {
      return [];
    }

    const text = document.getText();

    for (const match of text.matchAll(new RegExp(DQL_KEY_REGEX))) {
      if (match.index === undefined) continue;

      const dqlQuery = prepareDqlQuery(text, match.index);
      if (!dqlQuery) {
        continue;
      }

      const lineNumber = document.positionAt(match.index).line;
      const line = document.lineAt(lineNumber);
      const keyStart = line.text.indexOf('"dqlQuery"');
      if (keyStart === -1) continue;

      const position = new vscode.Position(lineNumber, keyStart);
      const range = document.getWordRangeAtPosition(position, /"dqlQuery"/);
      if (!range) continue;

      const cachedStatus = getCachedDqlStatus(dqlQuery) ?? { status: "unknown" as const };
      this.codeLenses.push(
        new DqlRunnerLens(range, dqlQuery),
        new DqlValidationLens(range, dqlQuery),
        new DqlValidationStatusLens(range, dqlQuery, cachedStatus),
      );
    }

    return this.codeLenses;
  }

  public updateValidationStatus(query: string, status: ValidationStatus): void {
    setCachedDqlStatus(query, status);
    this._onDidChangeCodeLenses.fire();
  }
}

class DqlValidationStatusLens extends vscode.CodeLens {
  constructor(range: vscode.Range, _query: string, status: ValidationStatus) {
    super(range, statusToCommand(status));
  }
}

class DqlValidationLens extends vscode.CodeLens {
  constructor(range: vscode.Range, dqlQuery: string) {
    super(range, {
      title: "Validate query",
      tooltip: "Verify the DQL query syntax without executing it",
      command: CodeLensCommand.ValidateDqlQuery,
      arguments: [dqlQuery],
    });
  }
}

class DqlRunnerLens extends vscode.CodeLens {
  constructor(range: vscode.Range, dqlQuery: string) {
    super(range, {
      title: "Query data",
      tooltip: "Execute the DQL query and display results",
      command: CodeLensCommand.RunDqlQuery,
      arguments: [dqlQuery],
    });
  }
}

function statusToCommand(status: ValidationStatus): vscode.Command {
  switch (status.status) {
    case "valid":
      return { title: "✅", tooltip: "Query is valid", command: "" };
    case "invalid":
      return {
        title: `❌ (${status.error?.code ?? ""})`,
        tooltip: `Query is invalid. ${status.error?.message ?? ""}`,
        command: "",
      };
    case "loading":
      return { title: "⏳", tooltip: "Validating...", command: "" };
    default:
      return { title: "❔", tooltip: "Query has not been validated yet.", command: "" };
  }
}

const createDqlCodeLensProvider = createSingletonProvider(DqlCodeLensProvider);

export const getDqlCodeLensProvider = () => {
  const instance = createDqlCodeLensProvider();
  providerInstance = instance;
  return instance;
};
