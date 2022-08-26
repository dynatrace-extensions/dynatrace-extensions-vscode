import * as vscode from "vscode";
import { removeWorkspace } from "../../utils/fileSystem";
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
  workspace: ExtensionProjectItem
) {
  const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
    title: `Delete workspace ${workspace.label}?`,
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    vscode.window.showInformationMessage("Operation cancelled.");
    return;
  }

  removeWorkspace(context, workspace.id);
}
