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

import { existsSync, mkdirSync, readFileSync, writeFile, writeFileSync } from "fs";
import path from "path";
import axios from "axios";
import vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { getActivationContext } from "../extension";
import { OPENPIPELINE_SCHEMA_CONFIGS } from "../interfaces/openPipelineSchemas";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { checkTenantConnected } from "../utils/conditionCheckers";
import { getExtensionFilePath } from "../utils/fileSystem";
import logger from "../utils/logging";
import { translateSchema } from "../utils/openPipelineSchemaTranslation";
import { ConfirmOption, showQuickPick, showQuickPickConfirm } from "../utils/vscode";

const logTrace = ["commandPalette", "loadSchemas"];

/**
 * Compares two dot-separated version strings numerically.
 * Returns a negative number if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Configures JSON schemas for OpenPipeline files by updating VSCode workspace settings.
 * Maps each schema config's file pattern to its converted schema file on disk.
 * @param schemaLocation - The path to the openpipeline schema folder in global storage
 */
export const configureOpenPipelineJSONSchemas = (schemaLocation: string): void => {
  const fnLogTrace = [...logTrace, "configureOpenPipelineJSONSchemas"];

  const config = vscode.workspace.getConfiguration();
  const existingSchemas =
    config.get<Array<{ fileMatch: string[]; url: string }>>("json.schemas") || [];

  // Remove any existing openpipeline schema entries to avoid duplicates
  const filteredSchemas = existingSchemas.filter(
    schema => !schema.fileMatch.some(match => match.includes("openpipeline")),
  );

  const newSchemas = [
    ...filteredSchemas,
    ...OPENPIPELINE_SCHEMA_CONFIGS.map(({ filePattern, outputFilename }) => ({
      fileMatch: [filePattern],
      url: vscode.Uri.file(path.join(schemaLocation, outputFilename)).toString(),
    })),
  ];

  config
    .update("json.schemas", newSchemas, vscode.ConfigurationTarget.Workspace)
    .then(undefined, () => {
      logger.error("Could not update configuration json.schemas", ...fnLogTrace);
    });

  logger.debug("OpenPipeline JSON schemas configured", ...fnLogTrace);
};

/**
 * Downloads OpenPipeline schemas from Dynatrace, converts them to JSON Schema,
 * and writes the converted files to the openpipeline folder in global storage.
 * Individual download failures are logged as warnings but do not affect overall success.
 */
async function downloadAndConvertOpenPipelineSchemas(
  dt: Dynatrace,
  context: vscode.ExtensionContext,
): Promise<void> {
  const fnLogTrace = [...logTrace, "downloadAndConvertOpenPipelineSchemas"];
  const openpipelineDir = path.join(context.globalStorageUri.fsPath, "openpipeline");
  mkdirSync(openpipelineDir, { recursive: true });

  for (const schemaConfig of OPENPIPELINE_SCHEMA_CONFIGS) {
    try {
      const rawSchema = await dt.settings.getSchema(schemaConfig.schemaId);
      const converted = translateSchema(rawSchema);
      const outputPath = path.join(openpipelineDir, schemaConfig.outputFilename);
      writeFileSync(outputPath, JSON.stringify(converted, null, 2));
      logger.debug(`Converted OpenPipeline schema: ${schemaConfig.schemaId}`, ...fnLogTrace);
    } catch (err) {
      logger.notify(
        "WARN",
        `Failed to download OpenPipeline schema ${schemaConfig.schemaId}: ${(err as Error).message}`,
        ...fnLogTrace,
      );
    }
  }

  configureOpenPipelineJSONSchemas(openpipelineDir);
}

export const loadSchemasWorkflow = async () => {
  if (await checkTenantConnected()) {
    const dtClient = await getDynatraceClient();
    if (!dtClient) {
      throw Error("Cannot continue without Dynatrace API client.");
    }
    await loadSchemas(dtClient);
  }
};

/**
 * Delivers the "Load schemas" command functionality.
 * Prompts the user to select a schema version, then downloads all schema files for that version.
 * Files are written in the global shared storage.
 * @param dt Dynatrace API Client
 * @returns boolean - the success of the command
 */
export async function loadSchemas(dt: Dynatrace): Promise<boolean> {
  const context = getActivationContext();
  logger.info("Executing Load Schemas command", ...logTrace);
  // Fetch available schema versions from cluster
  const availableVersions = await dt.extensionsV2
    .listSchemaVersions()
    .catch(async (err): Promise<string[]> => {
      logger.notify("ERROR", (err as Error).message, ...logTrace);
      return [];
    });
  if (availableVersions.length === 0) {
    logger.notify("ERROR", "No schemas available. Operation cancelled.", ...logTrace);
    return false;
  }

  // Prompt user for version selection
  const version = await showQuickPick(availableVersions, {
    placeHolder: "Choose a schema version",
    title: "Extension workspace: Load Schemas",
  });
  if (!version) {
    logger.notify("ERROR", "No schema was selected. Operation cancelled.", ...logTrace);
    return false;
  }
  const location = path.join(context.globalStorageUri.fsPath, version);

  // If directory exists, assume schemas already present
  let cancelled;
  cancelled = "";
  if (!existsSync(location)) {
    cancelled = await downloadSchemaFiles(location, version, dt);
  } else {
    const download = await showQuickPickConfirm({
      placeHolder: "Schema version already available. Do you wish to download again?",
    });

    if (download === ConfirmOption.Yes) {
      cancelled = await downloadSchemaFiles(location, version, dt);
    }
  }
  if (cancelled === "cancelled") {
    logger.notify("WARN", "Operation cancelled by user", ...logTrace);
    return false;
  }

  // Update the YAML Schema extension to use the new version
  const mainSchema = vscode.Uri.file(path.join(location, "extension.schema.json")).toString();
  vscode.workspace
    .getConfiguration()
    .update("yaml.schemas", { [mainSchema]: "extension.yaml" })
    .then(undefined, () => {
      logger.error("Could not update configuraton yaml.schema", ...logTrace);
    });
  context.workspaceState.update("schemaVersion", version).then(undefined, () => {
    logger.error("Could not update workspace state for schemaVersion", ...logTrace);
  });

  // Configure JSON schemas for OpenPipeline files
  const openpipelineDir = path.join(context.globalStorageUri.fsPath, "openpipeline");
  configureOpenPipelineJSONSchemas(openpipelineDir);

  try {
    // If extension.yaml already exists, update the version there too
    const extensionFile = getExtensionFilePath();
    if (extensionFile) {
      const extensionContent = readFileSync(extensionFile).toString();
      writeFileSync(
        extensionFile,
        extensionContent.replace(
          /^minDynatraceVersion: ("?[0-9.]+"?)/gm,
          `minDynatraceVersion: ${version}`,
        ),
      );
    }
  } catch (err) {
    logger.notify(
      "ERROR",
      "Extension YAML was not updated. Schema loading only partially complete.",
      ...logTrace,
    );
    logger.notify("ERROR", (err as Error).message, ...logTrace);
    return false;
  }

  logger.notify("INFO", "Schema loading complete.", ...logTrace);
  return true;
}

/**
 * Downloads (at the given location) all schema files of a given version.
 * @param location where to save schemas on disk
 * @param version version of schemas to download
 * @param dt Dynatrace API Client
 */
function downloadSchemaFiles(location: string, version: string, dt: Dynatrace) {
  const fnLogTrace = [...logTrace, "downloadSchemaFiles"];
  mkdirSync(location, { recursive: true });
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Loading schemas ${version}`,
      cancellable: true,
    },
    async (progress, cancelToken) => {
      progress.report({ message: "Fetching file names" });
      if (cancelToken.isCancellationRequested) {
        return "cancelled";
      }
      const schemaFiles = await dt.extensionsV2.listSchemaFiles(version).catch(async err => {
        logger.notify("ERROR", (err as Error).message, ...fnLogTrace);
        return [];
      });

      progress.report({ message: "Downloading files" });
      await axios
        .all(schemaFiles.map(file => dt.extensionsV2.getSchemaFile(version, file)))
        .then(
          axios.spread((...responses) => {
            responses.forEach(resp => {
              try {
                if (cancelToken.isCancellationRequested) {
                  return "cancelled";
                }
                let fileName = "unknownSchema";
                if (typeof resp.$id === "string") {
                  const parts = resp.$id.split("/");
                  fileName = parts[parts.length - 1];
                }
                writeFile(`${location}/${fileName}`, JSON.stringify(resp), err => {
                  if (err) {
                    logger.notify(
                      "ERROR",
                      `Error writing file ${fileName}:\n${err.message}`,
                      ...fnLogTrace,
                    );
                  }
                });
              } catch (err) {
                logger.notify(
                  "ERROR",
                  `Error writing file:\n${(err as Error).message}`,
                  ...fnLogTrace,
                );
              }
            });
          }),
        )
        .catch(async err => {
          logger.notify("ERROR", (err as Error).message, ...fnLogTrace);
        });

      // Download and convert OpenPipeline schemas for versions >= 1.330.0
      if (compareVersions(version, "1.330.0") >= 0) {
        progress.report({ message: "Downloading OpenPipeline schemas" });
        const context = getActivationContext();
        await downloadAndConvertOpenPipelineSchemas(dt, context);
      }
    },
  );
}
