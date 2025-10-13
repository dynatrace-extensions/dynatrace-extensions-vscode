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

import { ViewType, PanelData, WebviewEvent, WebviewEventType, PanelDataType } from "@common";
import * as vscode from "vscode";
import { getActivationContext } from "../extension";
import * as logger from "../utils/logging";
import { getNonce, getColumn, getDtShellDefaults } from "./webview-utils";

/**
 * Provides singleton access to the WebviewPanelManager instance.
 */
export const getWebviewPanelManager = (() => {
  let instance: WebviewPanelManager | undefined;

  return () => {
    instance = instance === undefined ? new WebviewPanelManager() : instance;
    return instance;
  };
})();

/**
 * This class manages the state and behavior of webview panels rendered as a React app.
 * There will be a single global instance of this class managing all panels.
 * Handling of each data type individually should be done within the React components.
 */
class WebviewPanelManager implements vscode.WebviewPanelSerializer {
  private readonly logTrace = ["webviews", "webviewPanel", "WebviewPanelManager"];
  private currentPanels: Map<ViewType, vscode.WebviewPanel>;
  private disposables: Map<ViewType, vscode.Disposable[]>;

  private readonly extensionUri: vscode.Uri;

  constructor() {
    this.currentPanels = new Map<ViewType, vscode.WebviewPanel>();
    this.disposables = new Map<ViewType, vscode.Disposable[]>();
    this.extensionUri = getActivationContext().extensionUri;
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
  private async _getWebviewContent(webview: vscode.Webview, data: PanelData) {
    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, "webview-ui", "build", "assets", "index.js"),
      )
      .toString();
    const nonce = getNonce();
    const cspString =
      '"' +
      [
        `default-src ${webview.cspSource} https://dt-cdn.net`,
        `img-src ${webview.cspSource} https://dt-cdn.net`,
        `style-src 'unsafe-inline' ${webview.cspSource} https://dt-cdn.net`,
        `script-src 'nonce-${nonce}'`,
      ].join("; ") +
      ';"';
    const shellDefaults = await getDtShellDefaults();

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
              window.appShellDefaults = ${JSON.stringify(shellDefaults)};
            </script>
          </head>
          <body>
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
  private dispose(viewType: ViewType) {
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
  private setupPanel(viewType: ViewType, panel: vscode.WebviewPanel, data: PanelData) {
    // Event listener for disposing the panel
    panel.onDidDispose(
      () => {
        this.dispose(viewType);
      },
      null,
      this.disposables.get(viewType),
    );

    // Set the HTML content for the panel
    this._getWebviewContent(panel.webview, data)
      .then(html => {
        panel.webview.html = html;

        // Keep track of panel reference
        this.currentPanels.set(viewType, panel);
      })
      .catch(err => {
        logger.error(`Error setting webview content: ${err}`, ...this.logTrace);
      });
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel will be created
   * and displayed.
   * @param viewType string representing the view type (id) of the panel
   * @param title title of the panel
   * @param data data to be sent to the webview
   */
  public render(viewType: ViewType, title: string, data: PanelData) {
    const fnLogTrace = [...this.logTrace, "render"];
    if (this.currentPanels.has(viewType)) {
      // If a webview panel of this view type exists, send it the new data
      const existingPanel = this.currentPanels.get(viewType);
      existingPanel?.webview.postMessage({ messageType: WebviewEventType.UpdateData, data }).then(
        () => {},
        err => {
          logger.error(err, ...fnLogTrace);
          logger.error(
            `Could not post message to webview. ${(err as Error).message}`,
            ...fnLogTrace,
          );
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
  public postMessage(viewType: ViewType, message: WebviewEvent) {
    const fnLogTrace = [...this.logTrace, "postMessage"];
    if (this.currentPanels.has(viewType)) {
      const existingPanel = this.currentPanels.get(viewType);
      existingPanel?.webview.postMessage(message).then(
        () => {},
        err => {
          logger.error(err, ...fnLogTrace);
          logger.error(
            `Could not post message to webview. ${(err as Error).message}`,
            ...fnLogTrace,
          );
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
      panel.viewType as ViewType,
      panel,
      state ?? {
        dataType: PanelDataType.Empty,
        data: undefined,
      },
    );
  }
}
