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

/******************************************************
 * UTILITY FUNCTIONS FOR WORKING WITH WEBVIEW PANELS
 ******************************************************/

import * as vscode from "vscode";
import { PanelData, WebviewMessage } from "../interfaces/webview";
import { getConnectedTenant } from "../treeViews/tenantsTreeView";
import { REGISTERED_PANELS, getWebviewPanelManager } from "./webview-panel-manager";

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 * This function is primarily used to help enforce content security policies for resources/scripts
 * being executed in a webview context.
 */
export function getNonce() {
  let text = "";
  /* eslint-disable-next-line no-secrets/no-secrets */
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Returns an appropriate column for the webview panel.
 * The panel is shown beside the active editor if there is one,
 */
export function getColumn() {
  return vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
}

/**
 * Renders a specific type of webview panel.
 */
export const renderPanel = (viewType: REGISTERED_PANELS, title: string, data: PanelData) => {
  getWebviewPanelManager().render(viewType, title, data);
};

/**
 * Posts a message to the given type of webview panel.
 */
export const postMessageToPanel = (viewType: REGISTERED_PANELS, message: WebviewMessage) => {
  getWebviewPanelManager().postMessage(viewType, message);
};

/**
 * Prepares a mock set of default values for the AppEngine Shell which the webviews will be expecting.
 */
export const getDtShellDefaults = async () => {
  const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const dtTenant = await getConnectedTenant();

  return {
    appId: "my.extensions.webivew.ui",
    appName: "Extensions Webview UI",
    appVersion: "0.0.0",
    language: vscode.env.language.split("-")[0],
    regionalFormat: locale,
    timezone: timeZone,
    theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? "dark" : "light",
    environmentId: dtTenant?.id || "abc12345",
    environmentUrl: dtTenant?.url?.includes("apps") ? dtTenant.url : "",
  };
};
