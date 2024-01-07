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
import { removeWorkspace } from "../../utils/fileSystem";
import { notify } from "../../utils/logging";
import { ExtensionProjectItem } from "../extensionsTreeView";

/**
 * Removes an Extensions Workspace from the tree view. The user is prompted for
 * confirmation before the workspace is forgotten.
 * Note: this does not delete the workspace folders and files from the user machine.
 * @param context VSCode Extension Context
 * @param workspace the existing environment
 * @returns
 */
export async function deleteWorkspace(
  context: vscode.ExtensionContext,
  workspace: ExtensionProjectItem,
) {
  const fnLogTrace = ["treeViews", "commands", "workspaces", "deleteWorkspace"];
  const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
    title: `Delete workspace ${workspace.label?.toString() ?? workspace.id}?`,
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    notify("INFO", "Operation cancelled.", ...fnLogTrace);
    return;
  }

  await removeWorkspace(context, workspace.id);
}
