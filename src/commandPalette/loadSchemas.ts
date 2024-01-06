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
import * as path from "path";
import axios from "axios";
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { getExtensionFilePath } from "../utils/fileSystem";
import * as logger from "../utils/logging";

const logTrace = ["commandPalette", "loadSchemas"];

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
                if (Object.prototype.hasOwnProperty.call(resp, "$id")) {
                  const parts = (resp.$id as string).split("/");
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
    },
  );
}

/**
 * Delivers the "Load schemas" command functionality.
 * Prompts the user to select a schema version, then downloads all schema files for that version.
 * Files are written in the global shared storage.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @returns boolean - the success of the command
 */
export async function loadSchemas(
  context: vscode.ExtensionContext,
  dt: Dynatrace,
): Promise<boolean> {
  logger.info("Executing Load Schemas command", ...logTrace);
  // Fetch available schema versions from cluster
  const availableVersions = await dt.extensionsV2.listSchemaVersions().catch(async err => {
    logger.notify("ERROR", (err as Error).message, ...logTrace);
    return [];
  });
  if (availableVersions.length === 0) {
    logger.notify("ERROR", "No schemas available. Operation cancelled.", ...logTrace);
    return false;
  }

  // Prompt user for version selection
  const version = await vscode.window.showQuickPick(availableVersions, {
    placeHolder: "Choose a schema version",
    title: "Extension workspace: Load Schemas",
  });
  if (!version) {
    logger.notify("ERROR", "No schema was selected. Operation cancelled.", ...logTrace);
    return false;
  }
  const location = path.join(context.globalStorageUri.fsPath, version);

  // If directory exists, assume schemas already present
  let cancelled = "";
  if (!existsSync(location)) {
    cancelled = await downloadSchemaFiles(location, version, dt);
  } else {
    const download = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Schema version already available. Do you wish to download again?",
    });

    if (download === "Yes") {
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
