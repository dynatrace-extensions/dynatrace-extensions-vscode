import * as vscode from "vscode";

export class MetricResultsPanel {
  public static currentPanel: MetricResultsPanel | undefined;

  public static readonly viewType = "metricResults";
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(data: any) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    if (MetricResultsPanel.currentPanel) {
      MetricResultsPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      MetricResultsPanel.viewType,
      "Query results",
      column || vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    MetricResultsPanel.currentPanel = new MetricResultsPanel(panel, data);
  }

  public static revive(panel: vscode.WebviewPanel, data: any) {
    MetricResultsPanel.currentPanel = new MetricResultsPanel(panel, data);
  }

  private constructor(panel: vscode.WebviewPanel, data: any) {
    this._panel = panel;

    // Set the webview's initial html content
    this._update(data);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
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

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "alert":
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public doRefactor() {
    // Send a message to the webview webview.
    // You can send any JSON serializable data.
    this._panel.webview.postMessage({ command: "refactor" });
  }

  /**
   * Clean up all the resources.
   */
  public dispose() {
    MetricResultsPanel.currentPanel = undefined;

    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(data: any) {
    const webview = this._panel.webview;
    this._panel.title = "Metric query results";
    this._panel.webview.html = this._getHTMLForGraphData(webview, data);
  }

  private _getHTMLForGraphData(webview: vscode.Webview, data: any) {
    const nonce = getNonce();
    //<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
    
    return `<!DOCTYPE html>
            <html lang="en>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <title>Cat Coding</title>
              </head>
              <script nonce="${nonce}" src="${'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.4/Chart.js'}"></script>
              <body>
                <h1 id="lines-of-code-counter">Hello</h1>
                <div style="background-color:white;style=width:100%;max-width:600px">
                  <canvas id="myChart"></canvas>
                </div>
              </body>
              <script>
                var xValues = [50,60,70,80,90,100,110,120,130,140,150];
                var yValues = [7,8,8,9,9,9,10,11,14,14,15];
                
                new Chart("myChart", {
                  type: "line",
                  data: {
                    labels: xValues,
                    datasets: [{
                      fill: "origin",
                      label: 'Metric',
                      lineTension: 0,
                      backgroundColor: "rgba(0,0,255,1.0)",
                      borderColor: "rgba(0,0,255,0.1)",
                      data: yValues
                    }]
                  },
                  options: {
                    legend: {display: false},
                    scales: {
                      yAxes: [{ticks: {min: 6, max:16}}],
                    }
                  }
                });
              </script>
			      </html>`;
  }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
