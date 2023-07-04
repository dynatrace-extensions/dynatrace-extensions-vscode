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

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
function getNonce() {
  let text = "";
  /* eslint-disable-next-line no-secrets/no-secrets */
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Helper function that returns an appropriate column for the webview panel
 * @returns
 */
function getColumn() {
  return vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
}

interface PanelData {
  // Used to match component on the React side
  dataType: string;
  // Holds actual data the panel works with
  data: unknown;
}

/**
 * This class manages the state and behavior of webview panels rendered as a React app.
 * There will be a single global instance of this class managing all panels.
 * Handling each data individually should be done within the React components.
 */
export class WebviewPanelManager {
  private currentPanels: Record<string, vscode.WebviewPanel | undefined> = {};
  private disposables: Record<string, vscode.Disposable[] | undefined> = {};
  private readonly extensionUri: vscode.Uri;

  /**
   * @param extensionUri The URI of the directory containing the extension
   */
  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the React webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private _getWebviewContent(webview: vscode.Webview, data: PanelData) {
    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, "webview-ui", "build", "static", "js", "main.js"),
      )
      .toString();
    const nonce = getNonce();
    const cspString = `"default-src ${webview.cspSource} https://dt-cdn.net; img-src ${webview.cspSource}; style-src 'unsafe-inline' https://dt-cdn.net; script-src 'nonce-${nonce}';"`;

    // es6-string-html extension is needed for HTML highlighting
    return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content=${cspString}>
            <title>Hello World</title>
            <script nonce="${nonce}">
              window.acquireVsCodeApi = acquireVsCodeApi;
              window.panelData = ${JSON.stringify(data)};
            </script>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `;
  }

  /**
   * Cleans up and disposes of webview resources of given view type panel
   * @param viewType string representing the view type (id) of the panel
   */
  private dispose(viewType: string) {
    const panel = this.currentPanels[viewType];
    const disposables = this.disposables[viewType];

    // Clear references
    this.currentPanels[viewType] = undefined;
    this.disposables[viewType] = undefined;

    if (panel) {
      // Dispose of the current panel
      panel.dispose();
    }
    if (disposables) {
      // Dispose of all disposables for the current panel
      while (disposables.length) {
        const disposable = disposables.pop();
        if (disposable) {
          disposable.dispose();
        }
      }
    }
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel will be created
   * and displayed.
   * @param viewType string representing the view type (id) of the panel
   * @param title title of the panel
   * @param data data to be sent to the webview
   */
  public render(viewType: string, title: string, data: PanelData) {
    if (this.currentPanels[viewType]) {
      // If a webview panel of this view type exists, show it
      this.currentPanels[viewType]?.reveal(getColumn());
    } else {
      // Otherwise, create and show a new one
      const panel = vscode.window.createWebviewPanel(viewType, title, getColumn(), {
        enableScripts: true,
        localResourceRoots: [
          // Enable JS in the webview
          vscode.Uri.joinPath(this.extensionUri, "out"),
          // Restrict webview to only load resouces from the out and build folsers
          vscode.Uri.joinPath(this.extensionUri, "webview-ui/build"),
        ],
      });
      this.disposables[viewType] = [];

      // Event listener for disposing the panel
      panel.onDidDispose(() => this.dispose(viewType), null, this.disposables[viewType]);

      // Set the HTML content for the panel
      panel.webview.html = this._getWebviewContent(panel.webview, data);

      // Keep track of panel reference
      this.currentPanels[viewType] = panel;
    }
  }
}
