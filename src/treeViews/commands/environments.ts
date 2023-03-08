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
import { encryptToken } from "../../utils/cryptography";
import { getAllEnvironments, registerEnvironment, removeEnvironment } from "../../utils/fileSystem";
import { DynatraceEnvironment, MonitoringConfiguration } from "../environmentsTreeView";

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
    validateInput: value => {
      if (!/^https?:\/\/.*/.test(value)) {
        return "This URL is invalid. Must start with http or https";
      }
      if (value.includes("/e/")) {
        return !/^https?:\/\/[a-zA-Z.0-9-]+?\/e\/[a-z0-9-]*?(?:\/|$)$/.test(value)
          ? "This does not look right. It should be the base URL to your Managed tenant."
          : null;
      }
      if ([".live.", ".dev.", ".sprint."].some(x => value.includes(x))) {
        return !/^https?:\/\/[a-z0-9]*?\.(?:live|dev|sprint)\.dynatrace(?:labs)*.*?\.com+?(?:\/|$)$/.test(value)
          ? "This does not look right. It should be the base URL to your SaaS tenant."
          : null;
      }
      return "This does not look like a Dynatrace tenant URL";
    },
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
    password: true,
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
export async function editEnvironment(context: vscode.ExtensionContext, environment: DynatraceEnvironment) {
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
    password: true,
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
export async function deleteEnvironment(context: vscode.ExtensionContext, environment: DynatraceEnvironment) {
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

/**
 * A workflow for changing the currently connected Dynatrace environment. The user is given
 * a list of all the currently registered environments and may select a different one to use
 * as the currently connected one.
 * This is useful when you don't want to visit the Dynatrace Activity Bar item - for example
 * when triggered from the global status bar.
 * @param context VSCode Extension Context
 * @returns the connected status as boolean, and name of connected environment or "" as string
 */
export async function changeConnection(context: vscode.ExtensionContext): Promise<[boolean, string]> {
  const environments = getAllEnvironments(context);
  const currentEnv = environments.find(e => e.current);
  const choice = await vscode.window.showQuickPick(
    environments.map(e => (e.current ? `⭐ ${e.name}` : (e.name as string))),
    {
      canPickMany: false,
      ignoreFocusOut: true,
      title: "Connect to a different environment",
      placeHolder: "Select an environment from the list",
    }
  );

  // Use the newly selected environment
  if (choice) {
    var environment = environments.find(e => e.name === choice);
    if (environment) {
      registerEnvironment(context, environment.url, environment.token, environment.name, true);
      return [true, environment.name as string];
    }
  }

  // If no choice made, persist the current connection if any
  if (currentEnv) {
    return [true, currentEnv.name as string];
  }
  return [false, ""];
}

export function editMonitoringConfiguration(config: MonitoringConfiguration) {
  console.log(config);
  vscode.window.showInformationMessage("You've hit Edit on this config. Congrats.");
}

export function deleteMonitoringConfiguration(config: MonitoringConfiguration) {
  console.log(config);
  vscode.window.showInformationMessage("You've hit Delete on this config. Congrats.");
}