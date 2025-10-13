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

import vscode from "vscode";
import { getFastModeChannel } from "../utils/logging";

/**
 * Creates a status bar item to reflect the status of builds when Fast Development Mode is enabled.
 */
export const getFastModeStatusBar = (() => {
  let fastModeStatusBar: vscode.StatusBarItem | undefined;
  const commandId = "dynatrace-extensions-fastmode.openOutput";

  return () => {
    if (!fastModeStatusBar) {
      vscode.commands.registerCommand(commandId, () => getFastModeChannel().show());
      fastModeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
      fastModeStatusBar.command = commandId;
      updateBasedOnConfig();
      vscode.workspace.onDidChangeConfiguration(() => updateBasedOnConfig());
    }
    return fastModeStatusBar;
  };
})();

const isFastModeEnabled = () =>
  vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<boolean>("fastDevelopmentMode");

const updateBasedOnConfig = () => {
  if (isFastModeEnabled()) {
    showFastModeStatusBar();
  } else {
    hideFastModeStatusBar();
  }
};

/**
 * Hides the Fast Mode status bar.
 */
export const hideFastModeStatusBar = () => {
  getFastModeStatusBar().hide();
};

/**
 * Shows the Fast Mode status bar with a message to refelct the current status of builds.
 * @param version The version of the last build attempted
 * @param passing Whether the last build passed or not
 */
export const showFastModeStatusBar = (version?: string, passing?: boolean) => {
  const statusBar = getFastModeStatusBar();

  statusBar.text = "🔥 Fast Mode Enabled";
  if (version !== undefined) {
    statusBar.text += ` | Version ${version}`;
  }
  if (passing !== undefined) {
    statusBar.text += ` | ${passing ? "✅" : "$(error)"}`;
  }
  statusBar.tooltip =
    passing === undefined
      ? "Builds are triggered whenever you save changes."
      : passing
        ? "Build passed!"
        : "Build has failed. Click to see last known failure details.";
  statusBar.backgroundColor =
    passing === false ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
  statusBar.show();
};
