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
import { getActivationContext } from "../../extension";
import { WorkspaceTreeItem } from "../../interfaces/treeViews";
import { removeWorkspace } from "../../utils/fileSystem";
import logger, { notify } from "../../utils/logging";
import { showQuickPick } from "../../utils/vscode";
import { refreshWorkspacesTreeView } from "../workspacesTreeView";

/**
 * Registers commands that can be triggered from the extension workspaces tree view.
 */
export const registerWorkspaceViewCommands = (): vscode.Disposable[] => {
  const commandPrefix = "dynatrace-extensions-workspaces";
  return [
    vscode.commands.registerCommand(`${commandPrefix}.refresh`, refreshWorkspacesTreeView),
    vscode.commands.registerCommand(`${commandPrefix}.addWorkspace`, async () => {
      await getActivationContext().globalState.update("dynatrace-extensions.initPending", true);
      await vscode.commands.executeCommand("vscode.openFolder");
    }),
    vscode.commands.registerCommand(
      `${commandPrefix}.openWorkspace`,
      async (workspace: WorkspaceTreeItem) => {
        await vscode.commands.executeCommand("vscode.openFolder", workspace.path);
      },
    ),
    vscode.commands.registerCommand(
      `${commandPrefix}.deleteWorkspace`,
      async (workspace: WorkspaceTreeItem) => {
        await deleteWorkspace(workspace).then(refreshWorkspacesTreeView);
      },
    ),
    vscode.commands.registerCommand(
      `${commandPrefix}.editExtension`,
      async (extension: WorkspaceTreeItem) => {
        await vscode.commands.executeCommand("vscode.open", extension.path);
      },
    ),
    ...registerFeatureSwitchCommands("MetricSelectors", "metricSelectorsCodeLens"),
    ...registerFeatureSwitchCommands("EntitySelectors", "entitySelectorsCodeLens"),
    ...registerFeatureSwitchCommands("WmiCodelens", "wmiCodeLens"),
    ...registerFeatureSwitchCommands("ScreenCodelens", "screenCodeLens"),
    ...registerFeatureSwitchCommands("FastDevelopment", "fastDevelopmentMode"),
    ...registerFeatureSwitchCommands("NameDiagnostics", "diagnostics.extensionName"),
    ...registerFeatureSwitchCommands("MetricKeyDiagnostics", "diagnostics.metricKeys"),
    ...registerFeatureSwitchCommands("CardKeyDiagnostics", "diagnostics.cardKeys"),
    ...registerFeatureSwitchCommands("VariableDiagnostics", "diagnostics.variables"),
    ...registerFeatureSwitchCommands("SnmpDiagnostics", "diagnostics.snmp"),
    ...registerFeatureSwitchCommands(
      "AllDiagnostics",
      "diagnostics.all",
      "diagnostics.extensionName",
      "diagnostics.metricKeys",
      "diagnostics.cardKeys",
      "diagnostics.variables",
      "diagnostics.snmp",
    ),
  ];
};

/**
 * Removes an Extensions Workspace from the tree view. The user is prompted for
 * confirmation before the workspace is forgotten.
 * Note: this does not delete the workspace folders and files from the user machine.
 * @param workspace the existing environment
 */
async function deleteWorkspace(workspace: WorkspaceTreeItem) {
  const fnLogTrace = ["treeViews", "commands", "workspaces", "deleteWorkspace"];
  const confirm = await showQuickPick(["Yes", "No"], {
    title: `Delete workspace ${workspace.label?.toString() ?? workspace.id}?`,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    notify("INFO", "Operation cancelled.", ...fnLogTrace);
    return;
  }

  await removeWorkspace(workspace.id);
}

/**
 * Registers two commands for enabling and disabling a feature by modifying extension settings.
 * The feature name will be prefixed with `enable` and `disable`.
 */
const registerFeatureSwitchCommands = (featureName: string, ...settingIds: string[]) => {
  const enableCommandId = `dynatrace-extensions-workspaces.enable${featureName}`;
  const disableCommandId = `dynatrace-extensions-workspaces.disable${featureName}`;
  return [
    registerUpdateConfigCommand(enableCommandId, true, ...settingIds),
    registerUpdateConfigCommand(disableCommandId, false, ...settingIds),
  ];
};

/**
 * Registers a command that updates one or more configuration settings with a given value.
 * The setting ID is automatically prefixed with `dynatraceExtensions`
 */
const registerUpdateConfigCommand = (
  commandId: string,
  settingValue: string | boolean | number,
  ...settingNames: string[]
) =>
  vscode.commands.registerCommand(commandId, () => {
    settingNames.forEach(settingName => {
      const settingId = `dynatraceExtensions.${settingName}`;
      vscode.workspace
        .getConfiguration()
        .update(settingId, settingValue)
        .then(
          () => logger.debug(`Changed setting ${settingId} to ${String(settingValue)}`, commandId),
          () => logger.warn(`Failed to change setting ${settingId}`, commandId),
        );
    });
  });
