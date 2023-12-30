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

import { readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DynatraceAPIError } from "../../dynatrace-api/errors";
import { DynatraceEnvironmentData } from "../../interfaces/treeViewData";
import { notify } from "../../utils/logging";
import { checkUrlReachable } from "../../utils/conditionCheckers";
import { encryptToken } from "../../utils/cryptography";
import {
  createUniqueFileName,
  getAllEnvironments,
  getExtensionFilePath,
  registerEnvironment,
  removeEnvironment,
} from "../../utils/fileSystem";
import { createObjectFromSchema } from "../../utils/schemaParsing";
import {
  DeployedExtension,
  DynatraceEnvironment,
  MonitoringConfiguration,
} from "../environmentsTreeView";

export interface MinimalConfiguration {
  scope: string;
  value: {
    activationContext: "LOCAL" | "REMOTE";
    description: string;
    version: string;
    featureSets?: string[];
  };
}

/**
 * Applies regular expressions for known Dynatrace environment URL schemes.
 * @param value value to test
 * @returns null if value matches, an error message otherwise
 */
export function validateEnvironmentUrl(value: string): string | null {
  if (!/^https?:\/\/.*/.test(value)) {
    return "This URL is invalid. Must start with http:// or https://";
  }
  if (value.includes("/e/")) {
    return !/^https?:\/\/[a-zA-Z.0-9-]+?\/e\/[a-z0-9-]*?(?:\/|$)$/.test(value)
      ? "This does not look right. It should be the base URL to your Managed environment."
      : null;
  }
  if (value.includes(".apps")) {
    if (
      !(
        /^https:\/\/[a-z0-9]*?\.apps\.dynatrace\.com(?:\/|$)$/.test(value) ||
        /^https:\/\/[a-z0-9]*?\.(?:dev|sprint)\.apps\.dynatracelabs\.com(?:\/|$)$/.test(value)
      )
    ) {
      return "This does not look right. It should be the base URL to your Platform environment.";
    }
    return null;
  }
  if ([".live.", ".dev.", ".sprint."].some(x => value.includes(x))) {
    if (
      !(
        /^https:\/\/[a-z0-9]*?\.live\.dynatrace\.com(?:\/|$)$/.test(value) ||
        /^https:\/\/[a-z0-9]*?\.(?:dev|sprint)\.dynatracelabs\.com(?:\/|$)$/.test(value)
      )
    ) {
      return "This does not look right. It should be the base URL to your SaaS environment.";
    }
    return null;
  }
  return "This does not look like a Dynatrace environment URL";
}

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
    validateInput: value => validateEnvironmentUrl(value),
  });
  if (!url || url === "") {
    notify("ERROR", "URL cannot be blank. Operation was cancelled.");
    return;
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  let apiUrl = url;
  if (apiUrl.includes(".apps")) {
    apiUrl = apiUrl.replace(".apps.dynatrace.com", ".live.dynatrace.com");
    apiUrl = apiUrl.replace(".apps.dynatracelabs.com", ".dynatracelabs.com");
  }

  const reachable = await checkUrlReachable(`${apiUrl}/api/v1/time`, true);
  if (!reachable) {
    notify("ERROR", "The environment URL entered is not reachable.");
    return;
  }

  const token = await vscode.window.showInputBox({
    title: "Add a Dynatrace environment (2/3)",
    placeHolder: "An access token, to use when autheticating API calls...",
    prompt: "Mandatory",
    ignoreFocusOut: true,
    password: true,
  });
  if (!token || token === "") {
    notify("ERROR", "Token cannot be blank. Operation was cancelled");
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

  await registerEnvironment(context, url, apiUrl, encryptToken(token), name, current === "Yes");
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
    validateInput: value => validateEnvironmentUrl(value),
  });
  if (!url || url === "") {
    notify("ERROR", "URL cannot be blank. Operation was cancelled.");
    return;
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  let apiUrl = url;
  if (apiUrl.includes(".apps")) {
    apiUrl = apiUrl.replace(".apps.dynatrace.com", ".live.dynatrace.com");
    apiUrl = apiUrl.replace(".apps.dynatracelabs.com", ".dynatracelabs.com");
  }

  const reachable = await checkUrlReachable(`${apiUrl}/api/v1/time`, true);
  if (!reachable) {
    notify("ERROR", "The environment URL entered is not reachable.");
    return;
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
    notify("ERROR", "Token cannot be blank. Operation was cancelled");
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

  await registerEnvironment(context, url, apiUrl, encryptToken(token), name, current === "Yes");
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
    notify("INFO", "Operation cancelled.");
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
 * @returns the selected status as boolean, and name of connected environment or "" as string
 */
export async function changeConnection(
  context: vscode.ExtensionContext,
): Promise<[boolean, DynatraceEnvironmentData]> {
  const environments = getAllEnvironments(context);
  // No point showing a list of 1 or empty
  if (environments.length < 2) {
    notify("INFO", "No other environments available. Add one first");
    return [false, undefined];
  }
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
        environment.apiUrl,
        environment.token,
        environment.name,
        true,
      );
      return [true, environment];
    }
  }

  // If no choice made, persist the current connection if any
  if (currentEnv) {
    return [true, currentEnv];
  }
  return [false, undefined];
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
export async function getConfigurationDetailsViaFile(
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
    const disposable = vscode.window.tabGroups.onDidChangeTabs(tabs => {
      // When the file closes, extract the content
      if (
        tabs.closed.findIndex(
          t => (t.input as vscode.TextDocument).uri.fsPath === tempConfigFile,
        ) >= 0
      ) {
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
          notify("INFO", "Configuration updated successfully.");
          return true;
        })
        .catch((err: DynatraceAPIError) => {
          notify("ERROR", `Update operation failed: ${err.message}`);
          oc.replace(JSON.stringify(err.errorParams, undefined, 2));
          oc.show();
          return false;
        }),
    // Otherwise cancel operation
    response => {
      if (response === "No changes.") {
        notify("INFO", "No changes were made. Operation cancelled.");
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
    notify("INFO", "Operation cancelled.");
    return false;
  }

  return config.dt.extensionsV2
    .deleteMonitoringConfiguration(config.extensionName, config.id)
    .then(() => {
      notify("INFO", "Configuration deleted successfully.");
      return true;
    })
    .catch((err: DynatraceAPIError) => {
      notify("ERROR", `Delete operation failed: ${err.message}`);
      return false;
    });
}

/**
 * Adds a new configuration to the extension associated with the DeployedExtension tree view item.
 * If the currently opened workspace matches the DeployedExtension, and there are config files the
 * user can add the configuration from file. Otherwise, a temporary file is used to generate a
 * monitoring configuration template that the user can edit before it's sent to Dynatrace. Once the
 * file is saved & closed, the details are POST-ed.
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
  let configObject: MinimalConfiguration | undefined;
  // Check if workspace matches the extension
  let workspaceMatch = false;
  const extensionFilePath = getExtensionFilePath();
  if (extensionFilePath) {
    const workspaceExtension = readFileSync(extensionFilePath).toString();
    const nameMatch = /^name: (.*?)$/gm.exec(workspaceExtension);
    if (nameMatch.length > 1) {
      const workspaceExtensionName = nameMatch[1];
      workspaceMatch = workspaceExtensionName === extension.id;
    }
  }
  // If matched, check workspace for configs
  if (workspaceMatch) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (workspaceRoot) {
      const configDir = path.join(workspaceRoot, "config");
      const configFiles = readdirSync(configDir);

      // If there are config files
      if (configFiles.length > 0) {
        // Choose whether configuration comes from file or new content
        const choice = await vscode.window.showQuickPick([
          ...configFiles.map(file => {
            const filePath = path.join(configDir, file);
            const config = JSON.parse(readFileSync(filePath).toString()) as MinimalConfiguration;
            return {
              label: `From file ${file}`,
              detail: `Description: ${config.value.description}; ${
                config.value.featureSets?.length ?? 0
              } feature sets; Runs on: ${config.scope}`,
              filePath: filePath,
            };
          }),
          { label: "Create a new configuration" },
        ]);

        if (!choice) {
          notify("INFO", "Operation cancelled.");
          return false;
        }

        // If choice is file-based, read the config
        if ("filePath" in choice) {
          configObject = JSON.parse(
            readFileSync(choice.filePath).toString(),
          ) as MinimalConfiguration;
        }
      }
    }
  }

  // If by now we don't have a configObject, user wants to create a new one
  if (!configObject || Object.keys(configObject).length === 0) {
    // Create a monitoring configuration template
    const extensionSchema = await extension.dt.extensionsV2.getExtensionSchema(
      extension.id,
      extension.extensionVersion,
    );
    const configTemplate = { value: createObjectFromSchema(extensionSchema), scope: "" };
    const headerContent =
      `
// This a simple monitoring configuration template. Make any changes as needed below.
// Lines starting with '//' will be ignored. A configuration instance will be created ` +
      "once you save and close this tab.";

    // Allow the user to make changes
    configObject = JSON.parse(
      await getConfigurationDetailsViaFile(
        headerContent,
        JSON.stringify(configTemplate, undefined, 4),
        context,
        false,
      ),
    ) as MinimalConfiguration;
  }

  // Finally, create the configuration
  const status = await extension.dt.extensionsV2
    .postMonitoringConfiguration(extension.id, [configObject] as unknown as Record<string, unknown>)
    .then(() => {
      notify("INFO", "Configuration successfully created.");
      return true;
    })
    .catch((err: DynatraceAPIError) => {
      notify("ERROR", "Create operation failed.");
      oc.replace(JSON.stringify(err.errorParams, undefined, 2));
      oc.show();
      return false;
    });

  return status;
}

/**
 * Saves an existing Monitoring Configuration to file.
 * The file will be placed in the config directory.
 * @param config the MonitoringConfiguration item to save
 */
export async function saveMoniotringConfiguration(config: MonitoringConfiguration) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return;
  }
  // Fetch the current configuration details
  const existingConfig = await config.dt.extensionsV2
    .getMonitoringConfiguration(config.extensionName, config.id)
    .then(configDetails => {
      delete configDetails.objectId;
      return JSON.stringify(configDetails, undefined, 4);
    });

  // Prompt for file name and save it
  const configDir = path.join(workspaceRoot, "config");
  const fileName = await vscode.window.showInputBox({
    title: "Configuration file name",
    value: createUniqueFileName(configDir, "config", "monitoring"),
    prompt: "Must be unique",
    validateInput: value => {
      const configFiles = readdirSync(configDir);
      if (configFiles.includes(value)) {
        return "Name must be unique";
      }
      return undefined;
    },
    ignoreFocusOut: true,
  });
  if (!fileName) {
    notify("INFO", "Operation cancelled.");
    return;
  }
  writeFileSync(path.join(configDir, fileName), existingConfig);
  notify("INFO", "Configuration file saved successfully.");
}

/**
 * Opens the Extension configuration page in the browser.
 * @param extension extension clicked on
 */
export async function openExtension(extension: DeployedExtension) {
  const baseUrl = extension.tenantUrl.includes(".apps")
    ? `${extension.tenantUrl}/ui/apps/dynatrace.classic.extensions`
    : extension.tenantUrl;

  await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/ui/hub/ext/${extension.id}`));
}
