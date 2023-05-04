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
import { MetricSeriesCollection } from "../dynatrace-api/interfaces/metrics";

function timestampToStr(timeMillis: number) {
  const date = new Date(timeMillis);
  const hours = date.getHours() < 10 ? `0${date.getHours()}` : date.getHours();
  const minutes = date.getMinutes() < 10 ? `0${date.getMinutes()}` : date.getMinutes();

  return `${hours}:${minutes}`;
}

// function getNonce() {
//   let text = "";
// eslint-disable-next-line no-secrets/no-secrets
//   const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
//   for (let i = 0; i < 32; i++) {
//     text += possible.charAt(Math.floor(Math.random() * possible.length));
//   }
//   return text;
// }

/**
 * WebView Panel implementation for displaying metric query results.
 * The HTML view loads charts.js and builds a chart of the resulting data, along with some
 * details of the query itself.
 */
export class MetricResultsPanel {
  public static currentPanel: MetricResultsPanel | undefined;

  public static readonly viewType = "metricResults";
  private readonly panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(data?: MetricSeriesCollection[] | string) {
    if (!data) {
      data = [];
    }
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : undefined;

    // If we already have a panel, show it.
    if (MetricResultsPanel.currentPanel) {
      MetricResultsPanel.currentPanel.panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      MetricResultsPanel.viewType,
      "Query results",
      column ?? vscode.ViewColumn.Two,
      { enableScripts: true },
    );

    MetricResultsPanel.currentPanel = new MetricResultsPanel(panel, data);
  }

  public static revive(panel: vscode.WebviewPanel, data: MetricSeriesCollection[] | string) {
    MetricResultsPanel.currentPanel = new MetricResultsPanel(panel, data);
  }

  /**
   * @param panel the panel to show
   * @param data the data to provide the panel with
   */
  private constructor(panel: vscode.WebviewPanel, data: MetricSeriesCollection[] | string) {
    this.panel = panel;

    // Set the webview's initial html content
    this._update(data);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this.panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) {
          this._update(data);
        }
      },
      null,
      this._disposables,
    );

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message: { command: string; text: string }) => {
        switch (message.command) {
          case "alert":
            await vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  public async doRefactor() {
    // Send a message to the webview webview.
    // You can send any JSON serializable data.
    await this.panel.webview.postMessage({ command: "refactor" });
  }

  /**
   * Clean up all the resources.
   */
  public dispose() {
    MetricResultsPanel.currentPanel = undefined;

    this.panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(data: MetricSeriesCollection[] | string) {
    const webview = this.panel.webview;
    this.panel.title = "Metric query results";
    this.panel.webview.html = this._getHTMLForGraphData(webview, data);
  }

  private _getHTMLForGraphData(webview: vscode.Webview, data: MetricSeriesCollection[] | string) {
    if (Array.isArray(data)) {
      const timestamps: string[] = [];
      const values: unknown[] = [];
      data.forEach(metricCollection => {
        metricCollection.data.map(metricData => {
          timestamps.push(...metricData.timestamps.map(timestamp => timestampToStr(timestamp)));
        });
        metricCollection.data.map(metricData => {
          values.push(...metricData.values);
        });
      });

      // TODO: Add a more secure CSP that still allows inline style.
      return `<!DOCTYPE html>
         <html lang="en>
           <head>
             <meta charset="UTF-8">
             <meta name="viewport" content="width=device-width, initial-scale=1.0">

             <title>Metric results</title>
           </head>
           <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.4/Chart.js"></script>
           <body>
             <h1 id="lines-of-code-counter">Metric Query Results</h1>
             <div style="background-color: white; width: 100%; max-width: 600px; padding: 20px 0;">
               <canvas id="myChart"></canvas>
             </div>
             <h2>Query details:</h2>
             <ul>
               <li><h3>Metric selector: ${JSON.stringify(data[0].metricId)}</h3></li>
               <li><h3>Timeframe used: last 2 hours</h3></li>
               <li><h3>Resolution: 5 minutes</h3></li>
             </ul>
           </body>
           <script>
             var xValues = ${JSON.stringify(timestamps)};
             var yValues = ${JSON.stringify(values)};
             const dash = (ctx, value) => ctx.p0.skip || ctx.p1.skip ? value : undefined;

             new Chart("myChart", {
               type: "line",
               data: {
                 labels: xValues,
                 datasets: [{
                   fill: false,
                   label: "Metric query data",
                   data: yValues,
                   borderColor: "#008cdb",
                   borderWidth: 4,
                   tension: 0,
                   segment: {
                     borderColor: ctx => dash(ctx, 'rgb(0,0,0,0.2)') || "#008cdb",
                     borderDash: ctx => dash(ctx, [6, 6]) || [6, 0],
                   },
                   spanGaps: false
                 }]
               },
               options: {
                 legend: {display: true, position: "bottom"},
                 elements: {
                   point: {
                     backgroundColor: "rgba(0, 107, 186, 0.5)",
                     borderColor: "#008cdb",
                     borderWidth: 2,
                     hoverRadius: 5
                   }
                 }
               }
             });
           </script>
         </html>`;
    }

    return `<!DOCTYPE html>
            <html lang="en>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">

              <title>Metric results</title>
            </head>
            <body>
              <h1 id="lines-of-code-counter">Error retrieving metrics:</h1>
              <h2><pre>${data}</pre></h2>
            </body>
          </html>`;
  }
}
