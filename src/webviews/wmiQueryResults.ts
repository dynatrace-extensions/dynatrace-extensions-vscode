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
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";

export class WMIQueryResultsPanel {
  public static currentPanel: WMIQueryResultsPanel | undefined;
  public static readonly viewType = "wmiQueryResults";
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(data: WmiQueryResult) {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : undefined;

    // If we already have a panel, show it.
    if (WMIQueryResultsPanel.currentPanel) {
      WMIQueryResultsPanel.currentPanel.refresh(data);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      WMIQueryResultsPanel.viewType,
      "WMI Query results",
      column || vscode.ViewColumn.Two,
      { enableScripts: true },
    );

    WMIQueryResultsPanel.currentPanel = new WMIQueryResultsPanel(panel, data);
  }

  private constructor(panel: vscode.WebviewPanel, data: WmiQueryResult) {
    this._panel = panel;
    this._update(data);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) {
          this._update(data);
        }
      },
      null,
      this._disposables,
    );
  }

  /**
   * Clean up all the resources.
   */
  public dispose() {
    WMIQueryResultsPanel.currentPanel = undefined;

    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  public static revive(panel: vscode.WebviewPanel, data: WmiQueryResult) {
    WMIQueryResultsPanel.currentPanel = new WMIQueryResultsPanel(panel, data);
  }

  public refresh(data: WmiQueryResult) {
    this._update(data);
  }

  private _update(data: WmiQueryResult) {
    const webview = this._panel.webview;
    this._panel.title = "WMI Query results";
    this._panel.webview.html = this._getHTMLForWmiData(webview, data);
  }

  private _getHTMLForWmiData(webview: vscode.Webview, data: WmiQueryResult): string {
    const baseHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WMI Query Results</title>
        <style>
          body {
            background-color: #1b1c2e;
            color: #f0f0f5;
          }
          table {
            border-collapse: collapse;
            margin: auto;
            font-size: 0.9em;
            font-family: sans-serif;
            min-width: 400px;
          }
          th:first-of-type {
            border-top-left-radius: 10px;
          }
          th:last-of-type {
            border-top-right-radius: 10px;
          }
          tr:last-of-type td:first-of-type {
            border-bottom-left-radius: 10px;
          }
          tr:last-of-type td:last-of-type {
            border-bottom-right-radius: 10px;
          }
          table thead tr {
            background-color: #37384d;
            color: #ffffff;
            text-align: left;
          }
          th,
          td {
            padding: 12px 15px;
          }

          table tbody tr:nth-of-type(even) {
            background-color: #242538;
          }

          table tbody tr:hover {
            background-color: #2d2e49;
          }
          h1 {
            text-align: center;
            color: #f0f0f5;
          }

          .queryResults {
            display: block;
            margin: auto;
            max-width: fit-content;
          }
          .queryString {
            text-align: center;
            max-width: 500px;
            color: #f0f0f5;
            font-size: 1.5em;
            font-weight: bold;
          }
          .queryCard {
            width: 100%;
            background-color: #37384d;
            border-radius: 10px;
            padding: 10px;
            margin: 10px;
            padding-bottom: 10px;
          }
          .statistics {
            padding-top: 10px;
          }
          .errorResult {
            color: #ff0000;
            max-width: 400px;
            margin: auto;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="queryResults">
          <h1>WMI Query Results</h1>
          <div class="queryCard">
            <div class="queryString">
              ${data.query || "No results to show, run a query"}
            </div>
            <div class="statistics">Execution time: ${data.responseTime}s</div>
            <div class="statistics">Instances : ${data.results.length}</div>
          </div>
          <!--result_table-->

          <div class="errorResult">
            <!--result_error-->
          </div>

        </div>
      </body>
    </html>
    `;

    if (data.error) {
      return baseHtml.replace("<!--result_error-->", `${data.errorMessage}`);
    }

    if (!data.results || data.results.length === 0) {
      return baseHtml;
    }

    const tableHeader = Object.keys(data.results[0])
      .map(key => `<th>${key}</th>`)
      .join("");
    const tableRows = data.results
      .map(row => {
        const rowValues = Object.values(row)
          .map(value => `<td>${value}</td>`)
          .join("");
        return `<tr>${rowValues}</tr>`;
      })
      .join("");

    const tableHtml = `<table>
        <thead>
            <tr>
                ${tableHeader}
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>`;
    return baseHtml.replace("<!--result_table-->", tableHtml);
  }
}
