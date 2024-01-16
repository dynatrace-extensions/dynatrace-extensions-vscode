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
import { DynatraceEnvironmentData } from "../interfaces/treeViews";
import { checkUrlReachable } from "../utils/conditionCheckers";

/**
 * Helper class for managing the Connection Status Bar Item.
 */
export class ConnectionStatusManager {
  statusBarItem: vscode.StatusBarItem;
  connectionInterval: NodeJS.Timer | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBarItem.command = "dynatrace-extensions-environments.changeConnection";
    this.updateStatusBar(false).catch(() => {});
  }

  /**
   * Gets an instance of {@link vscode.StatusBarItem} that will be used to
   * keep track of the currently connected (in use) Dynatrace environment.
   * @returns the status bar item
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  clearConnectionChecks() {
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
      this.connectionInterval = undefined;
    }
  }

  /**
   * Updates the status bar item to show whether any specific Dynatrace environment
   * is currently being used or not.
   * @param selected whether any environment is selected
   * @param environment optional label for the environment, in case one is in use
   */
  async updateStatusBar(selected: boolean, environment?: DynatraceEnvironmentData) {
    if (selected && environment) {
      this.statusBarItem.text = `$(dt-platform) Using ${environment.name ?? environment.id}`;
      const reachable = await checkUrlReachable(`${environment.apiUrl}/api/v1/time`);
      if (reachable) {
        this.statusBarItem.tooltip = "Using this environment for API calls";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
        this.clearConnectionChecks();
      } else {
        this.statusBarItem.tooltip = "This environment is not reachable.";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
        if (!this.connectionInterval) {
          this.connectionInterval = setInterval(() => {
            this.updateStatusBar(true, environment).catch(() => {});
          }, 5_000);
        }
      }
    } else {
      this.clearConnectionChecks();
      this.statusBarItem.text = "$(dt-platform) No environment selected";
      this.statusBarItem.tooltip = "No API calls are currently possible";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    }
    this.statusBarItem.show();
  }
}
