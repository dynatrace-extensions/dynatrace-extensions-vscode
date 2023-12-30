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
import { PanelData, WebviewMessage } from "../interfaces/webview";
import { Logger, getLogger } from "../utils/logging";

/**
 * Registered viewType (id) values for known webivew panels.
 */
export enum REGISTERED_PANELS {
  METRIC_RESULTS = "dynatrace-extensions.MetricResults",
  WMI_RESULTS = "dynatrace-extensions.WmiResults",
  SIMULATOR_UI = "dynatrace-extensions.SimulatorUI",
}

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

/**
 * This class manages the state and behavior of webview panels rendered as a React app.
 * There will be a single global instance of this class managing all panels.
 * Handling of each data type individually should be done within the React components.
 */
export class WebviewPanelManager implements vscode.WebviewPanelSerializer {
  private readonly logger: Logger;
  private currentPanels: Map<REGISTERED_PANELS, vscode.WebviewPanel>;
  private disposables: Map<REGISTERED_PANELS, vscode.Disposable[]>;

  private readonly extensionUri: vscode.Uri;

  /**
   * @param extensionUri The URI of the directory containing the extension
   */
  constructor(extensionUri: vscode.Uri) {
    this.logger = getLogger("webviews", "webviewPanel", this.constructor.name);
    this.currentPanels = new Map<REGISTERED_PANELS, vscode.WebviewPanel>();
    this.disposables = new Map<REGISTERED_PANELS, vscode.Disposable[]>();
    this.extensionUri = extensionUri;
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   * This is also the place where references to the React webview build files are created and
   * inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @returns A template string literal containing the HTML that should be rendered within the
   * webview panel
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
            <title>Webview</title>
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
  private dispose(viewType: REGISTERED_PANELS) {
    const panel = this.currentPanels.get(viewType);
    const disposables = this.disposables.get(viewType);

    // Clear references
    this.currentPanels.delete(viewType);
    this.disposables.delete(viewType);

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
   * Updates a panel. Adds listeners, sets content, and sets it as current panel.
   * @param panel webview panel
   * @param data panel data
   */
  private setupPanel(viewType: REGISTERED_PANELS, panel: vscode.WebviewPanel, data: PanelData) {
    // Event listener for disposing the panel
    panel.onDidDispose(
      () => {
        this.dispose(viewType);
      },
      null,
      this.disposables.get(viewType),
    );

    // Set the HTML content for the panel
    panel.webview.html = this._getWebviewContent(panel.webview, data);

    // Keep track of panel reference
    this.currentPanels.set(viewType, panel);
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel will be created
   * and displayed.
   * @param viewType string representing the view type (id) of the panel
   * @param title title of the panel
   * @param data data to be sent to the webview
   */
  public render(viewType: REGISTERED_PANELS, title: string, data: PanelData) {
    if (this.currentPanels.has(viewType)) {
      // If a webview panel of this view type exists, send it the new data
      const existingPanel = this.currentPanels.get(viewType);
      existingPanel.webview.postMessage({ messageType: "updateData", data }).then(
        () => {},
        err => {
          this.logger.error(err);
          this.logger.error(`Could not post message to webview. ${(err as Error).message}`);
        },
      );
    } else {
      // Otherwise, create and show a new one
      const newPanel = vscode.window.createWebviewPanel(viewType, title, getColumn(), {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [
          // Enable JS in the webview
          vscode.Uri.joinPath(this.extensionUri, "out"),
          // Restrict webview to only load resouces from the out and build folsers
          vscode.Uri.joinPath(this.extensionUri, "webview-ui/build"),
        ],
      });

      this.setupPanel(viewType, newPanel, data);
    }
  }

  /**
   * Sends a message to the panel using the postMessage API.
   * @param viewType
   * @param message
   */
  public postMessage(viewType: REGISTERED_PANELS, message: WebviewMessage) {
    if (this.currentPanels.has(viewType)) {
      const existingPanel = this.currentPanels.get(viewType);
      existingPanel.webview.postMessage(message).then(
        () => {},
        err => {
          this.logger.error(err);
          this.logger.error(`Could not post message to webview. ${(err as Error).message}`);
        },
      );
    }
  }

  /**
   * Restores the contents of a webview from its persisted state.
   * @param panel webview panel being restored
   * @param state persisted state to restore from
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state?: PanelData) {
    this.setupPanel(
      panel.viewType as REGISTERED_PANELS,
      panel,
      state ?? {
        dataType: "EMPTY_STATE",
        data: undefined,
      },
    );
  }
}
