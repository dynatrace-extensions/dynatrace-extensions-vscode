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
import path from "path";
import { SimulationLocation } from "@common";
import vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import {
  MinimalConfiguration,
  getConfigurationDetailsViaFile,
} from "../treeViews/commands/environments";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { getCachedParsedExtension } from "../utils/caching";
import {
  checkTenantConnected,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "../utils/conditionCheckers";
import { getDatasourceName } from "../utils/extensionParsing";
import { createUniqueFileName, getExtensionFilePath } from "../utils/fileSystem";
import { parseJSON } from "../utils/jsonParsing";
import logger from "../utils/logging";
import { createGenericConfigObject, createObjectFromSchema } from "../utils/schemaParsing";

export const createMonitoringConfigurationWorkflow = async () => {
  if (
    (await checkWorkspaceOpen()) &&
    (await isExtensionsWorkspace()) &&
    (await checkTenantConnected())
  ) {
    const dtClient = await getDynatraceClient();
    if (dtClient) {
      await createMonitoringConfiguration(dtClient);
    }
  }
};

/**
 * Command implements workflow for creating a Monitoring Configuration file for the extension in
 * this workspace. If the extension is deployed on tenant, a config object is generated from the
 * live schema. Otherwise, a generic schema for that datasource is applied. Except for python
 * where we read the activationSchema.json.
 * The user is prompted for LOCAL vs REMOTE context where applicable but otherwise should use
 * code completions for customizing the generated template.
 * @param dt Dyntrace client
 */
export async function createMonitoringConfiguration(dt: Dynatrace) {
  const fnLogTrace = ["commandPalette", "createConfiguration", "createMonitoringConfiguration"];
  logger.info("Executing Create Configuration command", ...fnLogTrace);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    logger.error("Missing workspace root path. Aborting command.", ...fnLogTrace);
    return;
  }
  const extensionFilePath = getExtensionFilePath();
  if (!extensionFilePath) {
    logger.error("Missing extension file. Aborting command.", ...fnLogTrace);
    return;
  }
  const configDir = path.join(workspaceRoot, "config");
  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension does not exist in cache. Command aborted.", ...fnLogTrace);
    return;
  }
  const deployedExtension = await dt.extensionsV2
    .getExtensionSchema(extension.name, extension.version)
    .catch(() => ({}));

  // If the extension is deployed, create config template from live schema
  let initialConfig: { value: Record<string, unknown>; scope: string };
  if (Object.keys(deployedExtension).length > 0) {
    logger.debug(
      "This extension is deployed. Parsing live schema to create base config object",
      ...fnLogTrace,
    );
    initialConfig = { value: createObjectFromSchema(deployedExtension), scope: "" };
  } else {
    logger.debug("Extension is not deployed. Need to build schema from scratch", ...fnLogTrace);
    const datasourceName = getDatasourceName(extension);
    let activationContext;
    activationContext = SimulationLocation.Remote;
    // For datasources that support both local and remote activation
    if (["wmi", "prometheus", "python"].includes(datasourceName)) {
      activationContext = await vscode.window.showQuickPick(Object.values(SimulationLocation), {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Where will this configuration run?",
      });
      if (!activationContext) {
        logger.notify("INFO", "Operation cancelled", ...fnLogTrace);
        return;
      }
    }
    logger.debug(`Activation type chosen as ${activationContext}`, ...fnLogTrace);
    // If this is a python extension, create template from activationSchema.json
    if (datasourceName === "python") {
      logger.debug(
        "Python extension - creating config object from activationSchema.json",
        ...fnLogTrace,
      );
      const activationSchemaFile = path.join(extensionFilePath, "..", "activationSchema.json");
      const activationSchema = parseJSON(readFileSync(activationSchemaFile).toString());
      initialConfig = {
        value: createObjectFromSchema(activationSchema, { activationContext: activationContext }),
        scope: "",
      };
    } else {
      // Otherwise, create a default config based on datasource
      logger.debug(
        "Non-python extension - creating config object based on datasource",
        ...fnLogTrace,
      );
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
  const configObject: MinimalConfiguration = parseJSON(
    await getConfigurationDetailsViaFile(
      headerContent,
      JSON.stringify(initialConfig, undefined, 4),
      false,
    ),
  );

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
    logger.notify("INFO", "Operation cancelled.", ...fnLogTrace);
  } else {
    writeFileSync(path.join(configDir, fileName), JSON.stringify(configObject, undefined, 4));
  }
}
