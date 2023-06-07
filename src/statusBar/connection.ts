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
 * Helper class for managing the Connection Status Bar Item.
 */
export class ConnectionStatusManager {
  statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBarItem.command = "dynatrace-extensions-environments.changeConnection";
    this.updateStatusBar(false);
  }

  /**
   * Gets an instance of {@link vscode.StatusBarItem} that will be used to
   * keep track of the currently connected (in use) Dynatrace environment.
   * @returns the status bar item
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  /**
   * Updates the status bar item to show whether any specific Dynatrace environment
   * is currently being used or not.
   * @param connected whether any environment is in use
   * @param environment optional label for the environment, in case one is in use
   */
  updateStatusBar(connected: boolean, environment?: string) {
    if (connected) {
      if (environment) {
        this.statusBarItem.text = `$(dt-platform-light) Connected to ${environment}`;
      }
      this.statusBarItem.tooltip = "Using this environment for API calls";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
    } else {
      this.statusBarItem.text = "$(dt-platform-light) Not connected";
      this.statusBarItem.tooltip = "No API calls are currently possible";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.statusBarItem.color = undefined;
    }
    this.statusBarItem.show();
  }
}
