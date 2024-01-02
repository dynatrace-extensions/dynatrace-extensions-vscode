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

import { readFileSync, readdirSync, writeFileSync } from "fs";
import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { ExtensionStub } from "../interfaces/extensionMeta";
import {
  MinimalConfiguration,
  getConfigurationDetailsViaFile,
} from "../treeViews/commands/environments";
import { CachedData } from "../utils/dataCaching";
import { getDatasourceName } from "../utils/extensionParsing";
import { createUniqueFileName, getExtensionFilePath } from "../utils/fileSystem";
import { notify } from "../utils/logging";
import { createGenericConfigObject, createObjectFromSchema } from "../utils/schemaParsing";

/**
 * Command implements workflow for creating a Monitoring Configuration file for the extension in
 * this workspace. If the extension is deployed on tenant, a config object is generated from the
 * live schema. Otherwise, a generic schema for that datasource is applied. Except for python
 * where we read the activationSchema.json.
 * The user is prompted for LOCAL vs REMOTE context where applicable but otherwise should use
 * code completions for customizing the generated template.
 * @param dt Dyntrace client
 * @param context vscode Extension Context
 * @param cachedData cached data provider
 */
export async function createMonitoringConfiguration(
  dt: Dynatrace,
  context: vscode.ExtensionContext,
  cachedData: CachedData,
) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return;
  }
  const extensionFilePath = getExtensionFilePath();
  if (!extensionFilePath) {
    return;
  }
  const configDir = path.join(workspaceRoot, "config");
  const extension = cachedData.getCached<ExtensionStub>("parsedExtension");
  const deployedExtension = await dt.extensionsV2
    .getExtensionSchema(extension.name, extension.version)
    .catch(() => ({}));

  // If the extension is deployed, create config template from live schema
  let initialConfig: { value: Record<string, unknown>; scope: string };
  if (Object.keys(deployedExtension).length > 0) {
    initialConfig = { value: createObjectFromSchema(deployedExtension), scope: "" };
  } else {
    // If this is a python extension, create template from activationSchema.json
    const datasourceName = getDatasourceName(extension);
    let activationContext = "REMOTE";
    if (["wmi", "prometheus", "python"].includes(datasourceName)) {
      activationContext = await vscode.window.showQuickPick(["LOCAL", "REMOTE"], {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Where will this configuration run?",
      });
      if (!activationContext) {
        notify("INFO", "Operation cancelled");
        return;
      }
    }
    if (datasourceName === "python") {
      const activationSchemaFile = path.join(extensionFilePath, "..", "activationSchema.json");
      const activationSchema = JSON.parse(readFileSync(activationSchemaFile).toString()) as unknown;
      initialConfig = {
        value: createObjectFromSchema(activationSchema, { activationContext: activationContext }),
        scope: "",
      };
    } else {
      // Otherwise, create a default config based on datasource
      initialConfig = {
        value: createGenericConfigObject(datasourceName, { activationContext: activationContext }),
        scope: "",
      };
    }
  }

  // Present the template to the user and allow for changes
  const headerContent =
    `
// This a simple monitoring configuration template. Make any changes as needed below.
// Lines starting with '//' will be ignored. This will be saved as a separate file ` +
    "once you save and close this tab.";
  const configObject = JSON.parse(
    await getConfigurationDetailsViaFile(
      headerContent,
      JSON.stringify(initialConfig, undefined, 4),
      context,
      false,
    ),
  ) as MinimalConfiguration;

  // Name and save the file
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
  } else {
    writeFileSync(path.join(configDir, fileName), JSON.stringify(configObject, undefined, 4));
  }
}
