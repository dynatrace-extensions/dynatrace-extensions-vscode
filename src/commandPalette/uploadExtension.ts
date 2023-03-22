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
import * as vscode from "vscode";
import AdmZip = require("adm-zip");
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
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
  var distDir = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, "dist");
  var extensionZip = readdirSync(distDir)
    .filter((file) => file.endsWith(".zip") && lstatSync(path.join(distDir, file)).isFile())
    .map((file) => ({ file, mtime: lstatSync(path.join(distDir, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0].file;

  // Browse extension archive and extract the extension name and version
  var zip = new AdmZip(path.join(distDir, extensionZip));
  zip = new AdmZip(
    zip
      .getEntries()
      .filter((entry) => entry.entryName === "extension.zip")[0]
      .getData()
  );
  const extension = cachedData.getExtensionYaml(
    zip
      .getEntries()
      .filter((entry) => entry.entryName === "extension.yaml")[0]
      .getData()
      .toString("utf-8")
  );
  const extensionVersion = extension.version;
  const extensionName = extension.name;

  // Check for maximum number of allowed versions and prompt for deletion
  var existingVersions = await dt.extensionsV2.listVersions(extensionName).catch((err) => {
    return [];
  });
  if (existingVersions.length >= 10) {
    var choice = await vscode.window.showWarningMessage(
      "Maximum number of extensions detected. Would you like to remove the last one?",
      "Yes",
      "No"
    );
    if (choice !== "Yes") {
      vscode.window.showErrorMessage("Operation cancelled.");
      return;
    }

    // Delete the oldest version
    const success = await dt.extensionsV2
      .deleteVersion(extensionName, existingVersions[0].version)
      .then(() => {
        vscode.window.showInformationMessage("Oldest version removed successfully");
        return true;
      })
      .catch((err) => {
        // Could not delete oldest version, prompt user to select another one
        vscode.window
          .showQuickPick(
            dt.extensionsV2
              .listVersions(extensionName)
              .then((versions) => versions.slice(1).map((version) => version.version)),
            {
              canPickMany: false,
              ignoreFocusOut: true,
              title: "Could not delete latest version",
              placeHolder: "Please choose an alternative",
            }
          )
          // Remove the user's chosen version
          .then((version) => {
            if (version) {
              dt.extensionsV2
                .deleteVersion(extensionName, version)
                .then(() => {
                  vscode.window.showInformationMessage(`Version ${version} removed successfully`);
                  return true;
                })
                .catch((err) => {
                  vscode.window.showErrorMessage(err.message);
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
  const status = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Uploading extension",
      cancellable: true,
    },
    async (progress) => {
      const file = readFileSync(path.join(distDir, extensionZip));
      progress.report({ message: "Waiting to complete" });
      do {
        var status: string = await dt.extensionsV2
          .upload(file)
          .then(() => "success")
          .catch((err: DynatraceAPIError) => err.errorParams.message);
        // Previous version deletion may not be complete yet, loop until done.
        if (status.startsWith("Extension versions quantity limit")) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } while (status.startsWith("Extension versions quantity limit"));
      return status;
    }
  );

  // Prompt for version activation
  if (status === "success") {
    var choice = await vscode.window.showInformationMessage(
      "Extension uploaded successfully. Do you want to activate this version?",
      "Yes",
      "No"
    );
    if (choice !== "Yes") {
      vscode.window.showInformationMessage("Operation completed.");
      return;
    }
    vscode.commands.executeCommand("dt-ext-copilot.activateExtension", extensionVersion);
  } else {
    vscode.window.showErrorMessage(status);
    vscode.window.showErrorMessage("Extension upload failed.");
  }
}
