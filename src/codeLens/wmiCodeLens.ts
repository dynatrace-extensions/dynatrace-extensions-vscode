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
import { CachedDataProvider } from "../utils/dataCaching";
import { WMIQueryResultsPanel } from "../webviews/wmiQueryResults";
import { WmiQueryResult } from "./utils/wmiUtils";

class WmiQueryLens extends vscode.CodeLens {
  wmiQuery: string;

  /**
   * Creates a new WMI query code lens
   * @param range VSCode Range at which lens should be created
   * @param wmiQuery The WMI query to execute
   */
  constructor(range: vscode.Range, wmiQuery: string) {
    super(range, {
      title: "▶️ Run WMI Query",
      tooltip: "Run a WMI query on this host",
      command: "dt-ext-copilot.codelens.runWMIQuery",
      arguments: [wmiQuery],
    });
    this.wmiQuery = wmiQuery;
  }
}

class WmiQueryResultLens extends vscode.CodeLens {
  wmiQuery: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param wmiQuery The WMI query to execute
   */
  constructor(range: vscode.Range, wmiQuery: string) {
    super(range, {
      title: "❔",
      tooltip: "Run the query to see the results",
      command: "",
      arguments: [],
    });
    this.wmiQuery = wmiQuery;
  }

  /**
   * Called when the user clicks on the '▶️ Run WMI Query' code lens
   */
  setQueryRunning = () => {
    this.command = {
      title: "⏳ Running query...",
      tooltip: "Running query...",
      command: "",
      arguments: [],
    };
  };

  /**
   * Callback function to update the code lens with the results of the query
   * */
  updateResult = (result: WmiQueryResult) => {
    switch (result.error) {
      case true:
        this.command = {
          title: "❌ Query failed",
          tooltip: `Query failed. ${result.errorMessage}`,
          command: "",
          arguments: [],
        };
        break;
      case false:
        this.command = {
          title: `📊 ${result.results.length} instances found`,
          tooltip: "",
          command: "",
          arguments: [result],
        };
    }
  };
}

export class WmiCodeLensProvider implements vscode.CodeLensProvider {
  private wmiQueryLens: WmiQueryLens[] = [];
  private wmiQueryResultLens: WmiQueryResultLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const text = document.getText();

    // Return early because it is cheaper than parsing the yaml
    if (!text.includes("wmi:") || !vscode.workspace.getConfiguration("dynatrace", null).get("dynatrace.diagnostics")) {
      return [];
    }

    const extension = yaml.parse(text) as ExtensionStub;

    // Find all query: definitions
    // They can be under the list of groups, or under the list subgroups
    // Example:
    // wmi:
    // - group: Host
    //   interval:
    //     minutes: 1
    //   dimensions:
    //     - key: host
    //       value: this:device.host
    //   subgroups:
    //     - subgroup: Queue
    //       query: SELECT Name, MessagesinQueue, BytesInQueue FROM Win32_PerfRawData_msmq_MSMQQueue

    if (!extension.wmi) {
      // This is never true because we already checked above, but Typescript is angry
      return;
    }
    for (const group of extension.wmi) {
      if (group.query) {
        const newLens = this.createLens(group.query, document);
      }

      if (group.subgroups) {
        for (const subgroup of group.subgroups) {
          if (subgroup.query) {
            this.createLens(subgroup.query, document);
          }
        }
      }
    }

    return [...this.wmiQueryLens, ...this.wmiQueryResultLens];
  }

  /**
   * This receives a WMI query like 'SELECT Name, MessagesinQueue, BytesInQueue FROM Win32_PerfRawData_msmq_MSMQQueue'
   * It finds all the ocurrences of this text on the document and creates a code lens for each one
   *
   * @param lineToMatch The line that we want to match
   * @param document the document to search for the query
   */
  createLens(lineToMatch: string, document: vscode.TextDocument) {
    // If this exact query string was already added, return
    // Needed in the rare case the user has the same query more than once
    if (this.wmiQueryLens.find(lens => (lens as WmiQueryLens).wmiQuery === lineToMatch)) {
      return;
    }
    const text = document.getText();
    // Find the indexes where lineToMatch is on text
    const matches = [];
    let i = -1;
    while ((i = text.indexOf(lineToMatch, i + 1)) !== -1) {
      matches.push({ line: lineToMatch, index: i });
    }

    for (const match of matches) {
      const range = new vscode.Range(
        document.positionAt(match.index),
        document.positionAt(match.index + match.line.length)
      );

      if (range) {
        this.wmiQueryLens.push(new WmiQueryLens(range, lineToMatch));
        this.wmiQueryResultLens.push(new WmiQueryResultLens(range, lineToMatch));
      }
    }
  }

  processQueryResults = (query: string, result: WmiQueryResult) => {
    this.cachedData.addWmiQueryResult(result);

    // Find the WmiQueryResultLens that matches this query
    const ownerLens = this.wmiQueryResultLens.find(
      lens => (lens as WmiQueryResultLens).wmiQuery === query
    ) as WmiQueryResultLens;

    if (ownerLens) {
      ownerLens.updateResult(result);
      WMIQueryResultsPanel.createOrShow(result);
      this._onDidChangeCodeLenses.fire();
    }
  };

  setQueryRunning = (query: string) => {
    // Find the WmiQueryResultLens that matches this query
    const ownerLens = this.wmiQueryResultLens.find(
      lens => (lens as WmiQueryResultLens).wmiQuery === query
    ) as WmiQueryResultLens;

    if (ownerLens) {
      ownerLens.setQueryRunning();
      this._onDidChangeCodeLenses.fire();
    }
  };
}
