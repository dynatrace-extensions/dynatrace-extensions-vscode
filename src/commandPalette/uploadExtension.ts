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

import { lstatSync, readdirSync, readFileSync } from "fs";
import * as path from "path";
import AdmZip = require("adm-zip");
import * as vscode from "vscode";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { getConnectedTenant, getDynatraceClient } from "../treeViews/tenantsTreeView";
import { loopSafeWait } from "../utils/code";
import {
  checkExtensionZipExists,
  checkTenantConnected,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "../utils/conditionCheckers";
import * as logger from "../utils/logging";
import { activateExtension } from "./activateExtension";

export const uploadExtensionWorkflow = async (context: vscode.ExtensionContext) => {
  if (
    (await checkWorkspaceOpen()) &&
    (await isExtensionsWorkspace(context)) &&
    (await checkTenantConnected()) &&
    (await checkExtensionZipExists())
  ) {
    const dtClient = await getDynatraceClient();
    const currentEnv = await getConnectedTenant();
    if (dtClient && currentEnv) {
      await uploadExtension(dtClient, currentEnv.url);
    }
  }
};

/**
 * Uploads the latest avaialable extension 2.0 package from the `dist` folder of
 * a registered extensions workspace. In case the maximum number of versions is reached,
 * the user is prompted for deletion. At the end, the activate extension command is linked.
 * @param dt Dynatrace API Client
 * @param tenantUrl Base URL to the Dynatrace environment
 * @returns void
 */
export async function uploadExtension(dt: Dynatrace, tenantUrl: string) {
  const fnLogTrace = ["commandPalette", "uploadExtension"];
  logger.info("Executing Upload Extension command", ...fnLogTrace);
  // Get the most recent entry in dist folder
  const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    logger.error("Workspace root path not found. Aborting command", ...fnLogTrace);
    return;
  }
  const distDir = path.join(rootPath, "dist");
  const extensionZip = readdirSync(distDir)
    .filter(file => file.endsWith(".zip") && lstatSync(path.join(distDir, file)).isFile())
    .map(file => ({ file, mtime: lstatSync(path.join(distDir, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0].file;

  logger.debug(`Zip file for upload is ${extensionZip}`, ...fnLogTrace);

  // Browse extension archive and extract the extension name and version
  let zip = new AdmZip(path.join(distDir, extensionZip));
  zip = new AdmZip(
    zip
      .getEntries()
      .filter(entry => entry.entryName === "extension.zip")[0]
      .getData(),
  );
  const extension = yaml.parse(
    zip
      .getEntries()
      .filter(entry => entry.entryName === "extension.yaml")[0]
      .getData()
      .toString("utf-8"),
  ) as ExtensionStub;
  const extensionVersion = extension.version;
  const extensionName = extension.name;

  // Check for maximum number of allowed versions and prompt for deletion
  const existingVersions = await dt.extensionsV2.listVersions(extensionName).catch(() => {
    return [];
  });
  if (existingVersions.length >= 10) {
    logger.debug("10 extensions already on tenant. Must delete one", ...fnLogTrace);
    const choice = await vscode.window.showWarningMessage(
      "Maximum number of extensions detected. Would you like to remove the last one?",
      "Yes",
      "No",
    );
    if (choice !== "Yes") {
      logger.notify("ERROR", "Operation cancelled.", ...fnLogTrace);
      return;
    }

    // Delete the oldest version
    const success = await dt.extensionsV2
      .deleteVersion(extensionName, existingVersions[0].version)
      .then(() => {
        logger.notify("INFO", "Oldest version removed successfully", ...fnLogTrace);
        return true;
      })
      .catch(async () => {
        logger.warn("Could not delete oldest version", ...fnLogTrace);
        // Could not delete oldest version, prompt user to select another one
        await vscode.window
          .showQuickPick(
            dt.extensionsV2
              .listVersions(extensionName)
              .then(versions => versions.slice(1).map(version => version.version)),
            {
              canPickMany: false,
              ignoreFocusOut: true,
              title: "Could not delete latest version",
              placeHolder: "Please choose an alternative",
            },
          )
          // Remove the user's chosen version
          .then(version => {
            if (version) {
              dt.extensionsV2
                .deleteVersion(extensionName, version)
                .then(() => {
                  logger.notify("INFO", `Version ${version} removed successfully`, ...fnLogTrace);
                  return true;
                })
                .catch(err => {
                  logger.notify("ERROR", (err as Error).message, ...fnLogTrace);
                  return false;
                });
            }
            return false;
          });
      });
    if (!success) {
      return;
    }
  }

  // Upload extension
  logger.info("Uploading extension", ...fnLogTrace);
  const status: string = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Uploading extension",
      cancellable: true,
    },
    async progress => {
      let uploadStatus = "";
      const file = readFileSync(path.join(distDir, extensionZip));
      progress.report({ message: "Waiting to complete" });
      do {
        uploadStatus = await dt.extensionsV2
          .upload(file)
          .then(() => "success")
          .catch((err: DynatraceAPIError) => err.errorParams.message);

        // Previous version deletion may not be complete yet, loop until done.
        if (uploadStatus.startsWith("Extension versions quantity limit")) {
          await loopSafeWait(1000);
        }
      } while (uploadStatus.startsWith("Extension versions quantity limit"));

      return uploadStatus;
    },
  );

  // Prompt for version activation
  if (status === "success") {
    const choice = await vscode.window.showInformationMessage(
      "Extension uploaded successfully. Do you want to activate this version?",
      "Yes",
      "No",
    );
    if (choice !== "Yes") {
      const open = await vscode.window.showInformationMessage("Operation completed.", "Open");
      if (open === "Open") {
        const baseUrl = tenantUrl.includes(".apps")
          ? `${tenantUrl}/ui/apps/dynatrace.classic.extensions`
          : tenantUrl;

        await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/ui/hub/ext/${extensionName}`));
      }
      return;
    }
    logger.debug("User chose to activate extension will trigger separate flow.", ...fnLogTrace);
    await activateExtension(dt, tenantUrl, extensionVersion);
  } else {
    logger.notify("ERROR", status, ...fnLogTrace);
    logger.notify("ERROR", "Extension upload failed.", ...fnLogTrace);
  }
}
