import * as vscode from "vscode";
import { decryptToken, encryptToken } from "../../utils/cryptography";
import { registerEnvironment, removeEnvironment } from "../../utils/fileSystem";
import { EnvironmentTreeItem } from "../environmentsTreeView";

/**
 * A workflow for registering a new Dynatrace Environment within the VSCode extension.
 * URL, Token, and an optional label are collected. The user can also set this as the
 * currently used environment.
 * @param context VSCode Extension Context
 * @returns
 */
export async function addEnvironment(context: vscode.ExtensionContext) {
  var url = await vscode.window.showInputBox({
    title: "Add a Dynatrace environment (1/3)",
    placeHolder: "The URL at which this environment is accessible...",
    prompt: "Mandatory",
    ignoreFocusOut: true,
  });
  if (!url || url === "") {
    vscode.window.showErrorMessage("URL cannot be blank. Operation was cancelled.");
    return;
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  const token = await vscode.window.showInputBox({
    title: "Add a Dynatrace environment (2/3)",
    placeHolder: "An access token, to use when autheticating API calls...",
    prompt: "Mandatory",
    ignoreFocusOut: true,
  });
  if (!token || token === "") {
    vscode.window.showErrorMessage("Token cannot be blank. Operation was cancelled");
    return;
  }

  const name = await vscode.window.showInputBox({
    title: "Add a Dynatrace environment (3/3)",
    placeHolder: "A name or label for this environment...",
    prompt: "Optional",
    ignoreFocusOut: true,
  });

  const current = await vscode.window.showQuickPick(["Yes", "No"], {
    title: "Set this as your currrent environment?",
    canPickMany: false,
    ignoreFocusOut: true,
  });

  registerEnvironment(context, url, encryptToken(token), name, current === "Yes");
}

/**
 * A workflow for modifying the details of a registered Dynatrace Environment within
 * the VS Code extension. The users walks through providing URL, Token, and optionally
 * a label, but the fields are pre-populated with the current details of the environment.
 * At the end, this can also be set as the currently used environment.
 * @param context VSCode Extension Context
 * @param environment the existing environment
 * @returns
 */
export async function editEnvironment(
  context: vscode.ExtensionContext,
  environment: EnvironmentTreeItem
) {
  var url = await vscode.window.showInputBox({
    title: "The new URL for this environment",
    placeHolder: "The URL at which this environment is accessible...",
    value: environment.url,
    prompt: "Mandatory",
    ignoreFocusOut: true,
  });
  if (!url || url === "") {
    vscode.window.showErrorMessage("URL cannot be blank. Operation was cancelled.");
    return;
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  const token = await vscode.window.showInputBox({
    title: "The new access token for this environment",
    placeHolder: "An access token, to use when autheticating API calls...",
    value: environment.token,
    prompt: "Mandatory",
    ignoreFocusOut: true,
  });
  if (!token || token === "") {
    vscode.window.showErrorMessage("Token cannot be blank. Operation was cancelled");
    return;
  }

  const name = await vscode.window.showInputBox({
    title: "The new name or label for this environment",
    placeHolder: "A name or label for this environment...",
    value: environment.label?.toString(),
    prompt: "Optional",
    ignoreFocusOut: true,
  });

  const current = await vscode.window.showQuickPick(["Yes", "No"], {
    title: "Set this as your currrent environment?",
    canPickMany: false,
    ignoreFocusOut: true,
  });

  registerEnvironment(context, url, encryptToken(token), name, current === "Yes");
}

/**
 * Removes a Dynatrace environment from the tree view. The user is prompted for
 * confirmation before the saved details are deleted from the global storage.
 * @param context VSCode Extension Context
 * @param environment the existing environment
 * @returns
 */
export async function deleteEnvironment(
  context: vscode.ExtensionContext,
  environment: EnvironmentTreeItem
) {
  const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
    title: `Delete environment ${environment.label}?`,
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    vscode.window.showInformationMessage("Operation cancelled.");
    return;
  }

  removeEnvironment(context, environment.id);
}
