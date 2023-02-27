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

  // Keep a copy of the old lenses so that we can reuse them if the lines were moved around
  private previousWMIQueryLens: WmiQueryLens[] = [];
  private previousWMIQueryResultLens: WmiQueryResultLens[] = [];

  // When we modify lens ourselves, we don't clear the cache
  private selfUpdateTriggered = false;

  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;
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
    
    if (!this.selfUpdateTriggered) {
      // Clear the lenses, keep a saved copy of the old ones in case lines were moved around
      // We only do this if the lenses were not updated by us
      this.previousWMIQueryLens = this.wmiQueryLens;
      this.wmiQueryLens = [];
  
      this.previousWMIQueryResultLens = this.wmiQueryResultLens;
      this.wmiQueryResultLens = [];
    }

    this.selfUpdateTriggered = false;
    const text = document.getText();

    // Return early because it is cheaper than parsing the yaml
    if (
      !text.includes("wmi:") ||
      !vscode.workspace.getConfiguration("dynatrace", null).get("wmiCodeLens")
    ) {
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

    for (const group of extension.wmi!) {
      if (group.query) {
        const createdEarlier = this.previousWMIQueryLens.find(
          (lens) => lens.wmiQuery === group.query
        );
        this.createLens(group.query, document, createdEarlier);
      }

      if (group.subgroups) {
        for (const subgroup of group.subgroups) {
          if (subgroup.query) {
            const createdEarlier = this.previousWMIQueryLens.find(
              (lens) => lens.wmiQuery === subgroup.query
            );
            this.createLens(subgroup.query, document, createdEarlier);
          }
        }
      }
    }

    return [...this.wmiQueryLens, ...this.wmiQueryResultLens];
  }

  /**
   * This receives a WMI query like 'SELECT Name, MessagesinQueue, BytesInQueue FROM Win32_PerfRawData_msmq_MSMQQueue'
   * It finds all the ocurrences of this text on the document and creates a code lens for each one
   * If there was a code lens created earlier, it will reuse it and move it to the new position
   *
   * @param lineToMatch The line that we want to match
   * @param document the document to search for the query
   * @param createdEarlier a code lens that was created earlier, if it exists
   */
  createLens(
    lineToMatch: string,
    document: vscode.TextDocument,
    createdEarlier?: WmiQueryLens
  ) {
    // If this exact query string was already added, return
    // Needed in the rare case the user has the same query more than once
    if (
      this.wmiQueryLens.find(
        (lens) => (lens as WmiQueryLens).wmiQuery === lineToMatch
      )
    ) {
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
        if (createdEarlier) {
          // Update the range (this can change if the user moves lines around)
          createdEarlier.range = range;
          this.wmiQueryLens.push(createdEarlier);

          // Find the previous result lens and update the range
          const previousResultLens = this.previousWMIQueryResultLens.find(
            (lens) => lens.wmiQuery === lineToMatch
          );
          if (previousResultLens) { // This is always true
            previousResultLens.range = range;
            this.wmiQueryResultLens.push(previousResultLens);
          }

        } else {
          // This was not created earlier, create a new lens
          this.wmiQueryLens.push(new WmiQueryLens(range, lineToMatch));
          this.wmiQueryResultLens.push(
            new WmiQueryResultLens(range, lineToMatch)
          );
        }
      }
    }
  }

  processQueryResults = (query: string, result: WmiQueryResult) => {
    this.cachedData.addWmiQueryResult(result);

    // Find the WmiQueryResultLens that matches this query
    const ownerLens = this.previousWMIQueryResultLens.find(
        (lens) => lens.wmiQuery === query
      );

    if (ownerLens) {
      ownerLens.updateResult(result);
      WMIQueryResultsPanel.createOrShow(result);
      this.selfUpdateTriggered = true;
      this._onDidChangeCodeLenses.fire();
    }
  };

  setQueryRunning = (query: string) => {
    // Find the WmiQueryResultLens that matches this query
    const ownerLens = this.previousWMIQueryResultLens.find(
      (lens) => lens.wmiQuery === query
    );

    if (ownerLens) {
      ownerLens.setQueryRunning();
      this.selfUpdateTriggered = true;
      this._onDidChangeCodeLenses.fire();
    }
  };
}
