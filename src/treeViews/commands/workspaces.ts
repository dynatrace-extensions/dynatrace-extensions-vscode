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

import { GlobalCommand, VSCodeCommand, WorkspaceCommand, WorkspaceCommandPrefix } from "@common";
import vscode from "vscode";
import { getActivationContext } from "../../extension";
import { WorkspaceTreeItem } from "../../interfaces/treeViews";
import { removeWorkspace } from "../../utils/fileSystem";
import logger from "../../utils/logging";
import { ConfirmOption, showQuickPickConfirm } from "../../utils/vscode";
import { refreshWorkspacesTreeView } from "../workspacesTreeView";

/**
 * Registers commands that can be triggered from the extension workspaces tree view.
 */
export const registerWorkspaceViewCommands = (): vscode.Disposable[] => {
  return [
    vscode.commands.registerCommand(WorkspaceCommand.Refresh, refreshWorkspacesTreeView),
    vscode.commands.registerCommand(WorkspaceCommand.Add, () =>
      getActivationContext()
        .globalState.update(GlobalCommand.InitPending, true)
        .then(() => vscode.commands.executeCommand(VSCodeCommand.OpenFolder)),
    ),
    vscode.commands.registerCommand(WorkspaceCommand.Open, (workspace: WorkspaceTreeItem) =>
      vscode.commands.executeCommand(VSCodeCommand.OpenFolder, workspace.path),
    ),
    vscode.commands.registerCommand(WorkspaceCommand.Delete, (workspace: WorkspaceTreeItem) =>
      deleteWorkspace(workspace).then(refreshWorkspacesTreeView),
    ),
    vscode.commands.registerCommand(
      WorkspaceCommand.EditExtension,
      (extension: WorkspaceTreeItem) =>
        vscode.commands.executeCommand(VSCodeCommand.Open, extension.path),
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
  const confirm = await showQuickPickConfirm({
    title: `Delete workspace ${workspace.label?.toString() ?? workspace.id}?`,
    ignoreFocusOut: true,
  });

  if (confirm !== ConfirmOption.Yes) {
    logger.notify("INFO", "Operation cancelled.", ...fnLogTrace);
    return;
  }

  await removeWorkspace(workspace.id);
}

/**
 * Registers two commands for enabling and disabling a feature by modifying extension settings.
 * The feature name will be prefixed with `enable` and `disable`.
 */
const registerFeatureSwitchCommands = (featureName: string, ...settingIds: string[]) => {
  const enableCommandId = `${WorkspaceCommandPrefix}.enable${featureName}`;
  const disableCommandId = `${WorkspaceCommandPrefix}.disable${featureName}`;
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
