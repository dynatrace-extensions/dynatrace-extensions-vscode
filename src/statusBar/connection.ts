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

import { EnvironmentCommand } from "@common";
import vscode from "vscode";
import { DynatraceTenantDto } from "../interfaces/treeViews";
import { checkUrlReachable } from "../utils/conditionCheckers";

/**
 * Creates a status bar item to reflect the connectivity status of the Dynatrace tenant used for
 * API operations (or lack of if none is selected).
 */
export const getConnectionStatusBar = (() => {
  let connectionStatusBar: vscode.StatusBarItem | undefined;

  return () => {
    if (!connectionStatusBar) {
      connectionStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
      connectionStatusBar.command = EnvironmentCommand.ChangeConnection;
      showDisconnectedStatusBar();
    }
    return connectionStatusBar;
  };
})();

/**
 * Updates the connection status bar to reflect a specific tenant. It performs a check for the
 * tenant's API endpoint to see if it is reachable.
 */
export const showConnectedStatusBar = async (tenant: DynatraceTenantDto) => {
  const statusBar = getConnectionStatusBar();
  statusBar.text = `$(dt-platform) Using ${tenant.label}`;
  const reachable = await checkUrlReachable(tenant.apiUrl, "/api/v1/time", false);
  if (reachable) {
    statusBar.tooltip = "Using this environment for API calls";
    statusBar.backgroundColor = undefined;
    statusBar.color = undefined;
    stopConnectionChecks();
  } else {
    statusBar.tooltip = "This environment is not reachable.";
    statusBar.backgroundColor = new vscode.ThemeColor("statusBar.errorBackground");
    statusBar.color = new vscode.ThemeColor("statusBar.errorForeground");
    startConnectionChecks(tenant);
  }
  statusBar.show();
};

/**
 * Updates the connection status bar to reflect that no tenant is selected.
 */
export const showDisconnectedStatusBar = () => {
  const statusBar = getConnectionStatusBar();
  stopConnectionChecks();
  statusBar.text = "$(dt-platform) No environment selected";
  statusBar.tooltip = "No API calls are currently possible";
  statusBar.backgroundColor = new vscode.ThemeColor("statusBar.warningBackground");
  statusBar.color = new vscode.ThemeColor("statusBar.warningForeground");
  statusBar.show();
};

let connectionInterval: NodeJS.Timeout | undefined;

const startConnectionChecks = (tenant: DynatraceTenantDto) => {
  if (!connectionInterval) {
    connectionInterval = setInterval(() => {
      showConnectedStatusBar(tenant).catch(() => {});
    }, 5_000);
  }
};

const stopConnectionChecks = () => {
  if (connectionInterval) {
    clearInterval(connectionInterval);
    connectionInterval = undefined;
  }
};
