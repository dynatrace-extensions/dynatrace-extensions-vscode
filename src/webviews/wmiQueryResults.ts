import * as vscode from "vscode";
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";

export class WMIQueryResultsPanel {
  public static currentPanel: WMIQueryResultsPanel | undefined;
  public static readonly viewType = "wmiQueryResults";
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(data: WmiQueryResult) {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : undefined;

    const panel = vscode.window.createWebviewPanel(
      WMIQueryResultsPanel.viewType,
      "WMI Query results",
      column || vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    WMIQueryResultsPanel.currentPanel = new WMIQueryResultsPanel(panel, data);
  }

  private constructor(panel: vscode.WebviewPanel, data: WmiQueryResult) {
    this._panel = panel;
    this._update(data);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      (e) => {
        if (this._panel.visible) {
          this._update(data);
        }
      },
      null,
      this._disposables
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

  private _update(data: WmiQueryResult) {
    const webview = this._panel.webview;
    this._panel.title = "WMI Query results";
    this._panel.webview.html = this._getHTMLForWmiData(webview, data);
  }

  private _getHTMLForWmiData(
    webview: vscode.Webview,
    data: WmiQueryResult
  ): string {
    const baseHtml = `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WMI Query Results</title>
        </head>
        <body>
            <h1>WMI Query Results</h1>
            <p> <b>Query: ${data.query || "No results to show, run a query"}</b></p>

            <!--result_table-->
            <!--result_error-->

        </body>
    </html>`;

    
    if (data.error) {
        return baseHtml.replace(
            "<!--result_error-->",
            `<p style="color:red;"><b>Error: ${data.errorMessage}</b></p>`
        );
    }

    if (!data.results || data.results.length === 0) {
      return baseHtml;
    }


    const tableHeader = Object.keys(data.results[0])
      .map((key) => `<th>${key}</th>`)
      .join("");
    const tableRows = data.results
      .map((row) => {
        const rowValues = Object.values(row)
          .map((value) => `<td>${value}</td>`)
          .join("");
        return `<tr style="height:30px">${rowValues}</tr>`;
      })
      .join("");

    const tableHtml = `<table style="cellpadding="5" cellspacing="0" border="2"">
        <thead>
            <tr style="height:30px">
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
