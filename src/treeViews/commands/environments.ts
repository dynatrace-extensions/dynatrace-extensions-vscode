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

import { readFileSync, rmSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DynatraceAPIError } from "../../dynatrace-api/errors";
import { showMessage } from "../../utils/code";
import { encryptToken } from "../../utils/cryptography";
import { getAllEnvironments, registerEnvironment, removeEnvironment } from "../../utils/fileSystem";
import { createObjectFromSchema } from "../../utils/schemaParsing";
import {
  DeployedExtension,
  DynatraceEnvironment,
  MonitoringConfiguration,
} from "../environmentsTreeView";

/**
 * A workflow for registering a new Dynatrace Environment within the VSCode extension.
 * URL, Token, and an optional label are collected. The user can also set this as the
 * currently used environment.
 * @param context VSCode Extension Context
 * @returns
 */
export async function addEnvironment(context: vscode.ExtensionContext) {
  let url = await vscode.window.showInputBox({
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
        return !/^https?:\/\/[a-z0-9]*?\.(?:live|dev|sprint)\.dynatrace(?:labs)*.*?\.com+?(?:\/|$)$/.test(
          value,
        )
          ? "This does not look right. It should be the base URL to your SaaS tenant."
          : null;
      }
      return "This does not look like a Dynatrace tenant URL";
    },
  });
  if (!url || url === "") {
    showMessage("error", "URL cannot be blank. Operation was cancelled.");
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
    showMessage("error", "Token cannot be blank. Operation was cancelled");
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

  await registerEnvironment(context, url, encryptToken(token), name, current === "Yes");
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
  environment: DynatraceEnvironment,
) {
  let url = await vscode.window.showInputBox({
    title: "The new URL for this environment",
    placeHolder: "The URL at which this environment is accessible...",
    value: environment.url,
    prompt: "Mandatory",
    ignoreFocusOut: true,
  });
  if (!url || url === "") {
    showMessage("error", "URL cannot be blank. Operation was cancelled.");
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
    showMessage("error", "Token cannot be blank. Operation was cancelled");
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

  await registerEnvironment(context, url, encryptToken(token), name, current === "Yes");
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
  environment: DynatraceEnvironment,
) {
  const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
    title: `Delete environment ${environment.label?.toString() ?? environment.id}?`,
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    showMessage("info", "Operation cancelled.");
    return;
  }

  await removeEnvironment(context, environment.id);
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
export async function changeConnection(
  context: vscode.ExtensionContext,
): Promise<[boolean, string]> {
  const environments = getAllEnvironments(context);
  const currentEnv = environments.find(e => e.current);
  const choice = await vscode.window.showQuickPick(
    environments.map(e => (e.current ? `⭐ ${e.name ?? e.id}` : e.name ?? e.id)),
    {
      canPickMany: false,
      ignoreFocusOut: true,
      title: "Connect to a different environment",
      placeHolder: "Select an environment from the list",
    },
  );

  // Use the newly selected environment
  if (choice) {
    const environment = environments.find(e => e.name === choice);
    if (environment) {
      await registerEnvironment(
        context,
        environment.url,
        environment.token,
        environment.name,
        true,
      );
      return [true, environment.name ?? environment.id];
    }
  }

  // If no choice made, persist the current connection if any
  if (currentEnv) {
    return [true, currentEnv.name ?? currentEnv.id];
  }
  return [false, ""];
}

/**
 * Create a temporary file and serve it to the user as an interface for collecting changes.
 * The file is removed once the user closes it.
 * @param headerContent informational content (comments) to inform the user about usage
 * @param defaultDetails existing details as stringified JSON
 * @param rejectNoChanges if true, the promise is rejected if the file content is unchanged
 * @param context vscode.ExtensionContext
 * @returns a Promise that will either resolve with the stringified content of the configuration
 * or will reject with the message "No changes.".
 */
async function getConfigurationDetailsViaFile(
  headerContent: string,
  defaultDetails: string,
  context: vscode.ExtensionContext,
  rejectNoChanges: boolean = true,
): Promise<string> {
  // Create a file to act as an interface for making changes
  const tempConfigFile = path.resolve(context.globalStorageUri.fsPath, "tempConfigFile.jsonc");
  const configFileContent = headerContent + "\n" + defaultDetails;
  writeFileSync(tempConfigFile, configFileContent);

  // Open the file for the user to edit
  await vscode.workspace.openTextDocument(vscode.Uri.file(tempConfigFile)).then(async doc => {
    await vscode.window.showTextDocument(doc);
  });

  // Create a promise based on the file
  return new Promise<string>((resolve, reject) => {
    const disposable = vscode.window.onDidChangeVisibleTextEditors(editors => {
      // When the file closes, extract the content
      if (!editors.map(editor => editor.document.fileName).includes(tempConfigFile)) {
        disposable.dispose();
        // Grab all lines that don't start with '//'
        const newDetails = readFileSync(tempConfigFile)
          .toString()
          .split("\n")
          .filter(line => !line.startsWith("//") && line !== "")
          .join("\n");
        // Remove the file since no longer needed
        rmSync(tempConfigFile);
        // Resolve or reject the promise
        if (newDetails === defaultDetails && rejectNoChanges) {
          reject("No changes.");
        } else {
          resolve(newDetails);
        }
      }
    });
  });
}

/**
 * Make changes to the monitoring configuration associated with the MonitoringConfiguration tree
 * item. Changes are collected via a temporary file.
 * @param config the MonitoringConfiguration to be updated
 * @param context vscode.ExtensionContext
 * @param oc a JSON output channel to communicate errors to
 * @returns success of the command
 */
export async function editMonitoringConfiguration(
  config: MonitoringConfiguration,
  context: vscode.ExtensionContext,
  oc: vscode.OutputChannel,
): Promise<boolean> {
  // Fetch the current configuration details
  const existingConfig = await config.dt.extensionsV2
    .getMonitoringConfiguration(config.extensionName, config.id)
    .then(configDetails => {
      delete configDetails.objectId;
      delete configDetails.scope;
      return JSON.stringify(configDetails, undefined, 4);
    });

  const headerContent =
    `
// This is your monitoring configuration. Make any changes as needed below.
// Lines starting with '//' will be ignored. The configuration will be updated ` +
    "once you save and close this tab.";

  // Allow the user to make changes
  const status = await getConfigurationDetailsViaFile(headerContent, existingConfig, context).then(
    // Push the changes
    response =>
      config.dt.extensionsV2
        .putMonitoringConfiguration(
          config.extensionName,
          config.id,
          JSON.parse(response) as Record<string, unknown>,
        )
        .then(() => {
          showMessage("info", "Configuration updated successfully.");
          return true;
        })
        .catch((err: DynatraceAPIError) => {
          showMessage("error", `Update operation failed: ${err.message}`);
          oc.replace(JSON.stringify(err.errorParams.data, undefined, 2));
          oc.show();
          return false;
        }),
    // Otherwise cancel operation
    response => {
      if (response === "No changes.") {
        showMessage("info", "No changes were made. Operation cancelled.");
      }
      return false;
    },
  );

  return status;
}

/**
 * Deletes the extension monitoring configuration associated with the MonitoringConfiguration
 * tree item.
 * @param config the MonitoringConfiguration to be deleted
 * @returns the success of the operation
 */
export async function deleteMonitoringConfiguration(
  config: MonitoringConfiguration,
): Promise<boolean> {
  const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
    title: `Delete configuration ${config.label?.toString() ?? config.id}?`,
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (confirm !== "Yes") {
    showMessage("info", "Operation cancelled.");
    return false;
  }

  return config.dt.extensionsV2
    .deleteMonitoringConfiguration(config.extensionName, config.id)
    .then(() => {
      showMessage("info", "Configuration deleted successfully.");
      return true;
    })
    .catch((err: DynatraceAPIError) => {
      showMessage("error", `Delete operation failed: ${err.message}`);
      return false;
    });
}

/**
 * Adds a new configuration to the extension associated with the DeployedExtension tree view item.
 * A temporary file is used to generate a monitoring configuration template that the user can edit
 * before it's sent to Dynatrace. Once the file is saved & closed, the details are POST-ed.
 * @param extension the deployed extension to add a configuration to
 * @param context vscode.ExtensionContext
 * @param oc a JSON output channel to communicate errors to
 * @returns success of the operation
 */
export async function addMonitoringConfiguration(
  extension: DeployedExtension,
  context: vscode.ExtensionContext,
  oc: vscode.OutputChannel,
) {
  // Create a monitoring configuration template
  const extensionSchema = await extension.dt.extensionsV2.getExtensionSchema(
    extension.id,
    extension.extensionVersion,
  );
  const configObject = [{ value: createObjectFromSchema(extensionSchema), scope: "" }];
  const headerContent =
    `
// This a simple monitoring configuration template. Make any changes as needed below.
// Lines starting with '//' will be ignored. A configuration instance will be created ` +
    "once you save and close this tab.";

  // Allow the user to make changes
  const response = await getConfigurationDetailsViaFile(
    headerContent,
    JSON.stringify(configObject, undefined, 4),
    context,
    false,
  );
  const status = await extension.dt.extensionsV2
    .postMonitoringConfiguration(extension.id, JSON.parse(response) as Record<string, unknown>)
    .then(() => {
      showMessage("info", "Configuration successfully created.");
      return true;
    })
    .catch((err: DynatraceAPIError) => {
      showMessage("error", "Create operation failed.");
      oc.replace(JSON.stringify(err.errorParams.data, undefined, 2));
      oc.show();
      return false;
    });

  return status;
}
