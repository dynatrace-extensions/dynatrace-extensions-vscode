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
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { loopSafeWait, showMessage } from "../utils/code";
import { CachedDataProvider } from "../utils/dataCaching";

/**
 * Uploads the latest avaialable extension 2.0 package from the `dist` folder of
 * a registered extensions workspace. In case the maximum number of versions is reached,
 * the user is prompted for deletion. At the end, the activate extension command is linked.
 * @param dt Dynatrace API Client
 * @param cachedData provider for cacheable data
 * @returns void
 */
export async function uploadExtension(dt: Dynatrace, cachedData: CachedDataProvider) {
  // Get the most recent entry in dist folder
  const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    return;
  }
  const distDir = path.join(rootPath, "dist");
  const extensionZip = readdirSync(distDir)
    .filter(file => file.endsWith(".zip") && lstatSync(path.join(distDir, file)).isFile())
    .map(file => ({ file, mtime: lstatSync(path.join(distDir, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0].file;

  // Browse extension archive and extract the extension name and version
  let zip = new AdmZip(path.join(distDir, extensionZip));
  zip = new AdmZip(
    zip
      .getEntries()
      .filter(entry => entry.entryName === "extension.zip")[0]
      .getData(),
  );
  const extension = cachedData.getExtensionYaml(
    zip
      .getEntries()
      .filter(entry => entry.entryName === "extension.yaml")[0]
      .getData()
      .toString("utf-8"),
  );
  const extensionVersion = extension.version;
  const extensionName = extension.name;

  // Check for maximum number of allowed versions and prompt for deletion
  const existingVersions = await dt.extensionsV2.listVersions(extensionName).catch(() => {
    return [];
  });
  if (existingVersions.length >= 10) {
    const choice = await vscode.window.showWarningMessage(
      "Maximum number of extensions detected. Would you like to remove the last one?",
      "Yes",
      "No",
    );
    if (choice !== "Yes") {
      showMessage("error", "Operation cancelled.");
      return;
    }

    // Delete the oldest version
    const success = await dt.extensionsV2
      .deleteVersion(extensionName, existingVersions[0].version)
      .then(() => {
        showMessage("info", "Oldest version removed successfully");
        return true;
      })
      .catch(async () => {
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
                  showMessage("info", `Version ${version} removed successfully`);
                  return true;
                })
                .catch(err => {
                  showMessage("error", (err as Error).message);
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
      showMessage("info", "Operation completed.");
      return;
    }
    await vscode.commands.executeCommand(
      "dynatrace-extensions.activateExtension",
      extensionVersion,
    );
  } else {
    showMessage("error", status);
    showMessage("error", "Extension upload failed.");
  }
}
