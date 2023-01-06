import { readFileSync } from "fs";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { getExtensionFilePath } from "../utils/fileSystem";

/**
 * Activates the extension found in the currently open workspace. If a version is not provided
 * already, the user is prompted for selection from the versions found on the tenant.
 * @param dt Dynatrace API Client
 * @param version optional version to activate
 */
export async function activateExtension(context: vscode.ExtensionContext, dt: Dynatrace, version?: string) {
  var extensionFile = getExtensionFilePath(context)!;
  var extension = yaml.parse(readFileSync(extensionFile).toString());

  // If version was not provided, prompt user for selection
  if (!version) {
    version = await vscode.window.showQuickPick(
      dt.extensionsV2.listVersions(extension.name).then((res) => res.map((me) => me.version)),
      {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Activate extension",
        placeHolder: "Choose a version to activate",
      }
    );
  }

  // Activate the given version of the extension
  if (version) {
    dt.extensionsV2
      .putEnvironmentConfiguration(extension.name, version)
      .then(() => {
        vscode.window.showInformationMessage("Extension activated successfully");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(err.message);
      });
  } else {
    vscode.window.showErrorMessage("Version not selected. Cancelling operation.");
  }
}
