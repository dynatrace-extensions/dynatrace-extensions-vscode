import { lstatSync, readdirSync, readFile, readFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import AdmZip = require("adm-zip");
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";

/**
 * Uploads the latest avaialable extension 2.0 package from the `dist` folder of
 * a registered extensions workspace. In case the maximum number of versions is reached,
 * the user is prompted for deletion. At the end, the activate extension command is linked.
 * @param dt Dynatrace API Client
 * @returns void
 */
export async function uploadExtension(dt: Dynatrace) {
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
  var extension = yaml.parse(
    zip
      .getEntries()
      .filter((entry) => entry.entryName === "extension.yaml")[0]
      .getData()
      .toString("utf-8")
  ) as ExtensionStub;
  var extensionVersion = extension.version;
  var extensionName = extension.name;

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
          });
      });
    if (!success) {
      return;
    }
  }

  // Upload extension and prompt for activation
  dt.extensionsV2
    .upload(readFileSync(path.join(distDir, extensionZip)))
    .then(async () => {
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
    })
    .catch((err: DynatraceAPIError) => {
      vscode.window.showErrorMessage(err.errorParams.message);
      vscode.window.showErrorMessage("Extension upload failed.");
    });
}
