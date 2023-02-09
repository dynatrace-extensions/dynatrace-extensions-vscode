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

export class WmiCompletionProvider implements vscode.CompletionItemProvider {
  // The cached data provider, contains results of WMI queries previously executed by WmiCodeLens
  private readonly cachedData: CachedDataProvider;

  /**
   * Provides a list of completion items based on a WMI query result
   * The query result is previously cached in the CachedDataProvider by WmiCodeLens
   *
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<
    vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
  > {
    const extension = yaml.parse(document.getText()) as ExtensionStub;

    // Exit early if different datasource
    if (!extension.wmi) {
      return [];
    }

    // Get the current line
    const line = document
      .lineAt(position.line)
      .text.substring(0, position.character);

    // If the line contains 'value:' or 'column:' the user is editing a dimension or metric
    if (line.includes("value: ") || line.includes("column:")) {
      // Find the first query definition found before this line
      const closestQueryLine = this.findClosestOcurrence(
        "query:",
        position,
        document
      );

      // Check that we found a query definition before proceeding
      if (closestQueryLine) {

        // The line would look something like 'query: SELECT Name FROM Win32_OperatingSystem
        // So we grab the portion after 'query:' 
        const queryString = closestQueryLine.split("query:")[1].trim();

        // Find out if we have a query result for this query
        // This is only true if the query was executed by WmiCodeLens
        const cachedQueryResults =
          this.cachedData.getWmiQueryResult(queryString);
        if (!cachedQueryResults || cachedQueryResults.results.length === 0) {
          return [];
        }

        // We use the first result to determine the columns, all results have the same columns
        const firstResult = cachedQueryResults.results[0];
        const colummnNames = Object.keys(firstResult);

        // Builds a list of completion items for each column
        return colummnNames.map((name) => {
          const suggestion = `column:${name}`;
          const value = firstResult[name];

          // This will look like 'column:Name (explorer.exe) <string>'
          const displayText = `${suggestion} (${value}) <${typeof value}>`;
          const completionItem = new vscode.CompletionItem(
            displayText,
            vscode.CompletionItemKind.Field
          );
          completionItem.insertText = suggestion;
          completionItem.detail = `WMI result suggestion`;
          completionItem.documentation = new vscode.MarkdownString(
            `Suggestion: **${suggestion}**\n\nValue: **${value}**\n\nType: **${typeof value}**`
          );
          return completionItem;
        });
      }
    }
  }

  /**
   * Find the first occurence of a string in the document before a given position
   * @param target The string to find
   * @param position The position to start searching from
   * @param document The current document
   * @returns The line containing the target string or undefined if not found
   */
  findClosestOcurrence(
    target: string,
    position: vscode.Position,
    document: vscode.TextDocument
  ): string | undefined {
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      if (line.includes(target)) {
        return line;
      }
    }
    return undefined;
  }
}
