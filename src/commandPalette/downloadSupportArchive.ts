import AdmZip = require("adm-zip");
import * as vscode from "vscode";
import * as logger from "../utils/logging";

/**
 * Packages the logs directory into a zip file and prompts the user to save it.
 * @param logsDir path to the logs directory
 */
export async function downloadSupportArchive(logsDir: string) {
  const zip = new AdmZip();
  zip.addLocalFolder(logsDir);

  const saveDestination = await vscode.window
    .showSaveDialog({
      saveLabel: "Save",
      title: "Save support archive",
      filters: {
        "Zip files": ["zip"],
      },
      defaultUri: vscode.Uri.file("support_archive.zip"),
    })
    .then(uri => uri?.fsPath);

  if (!saveDestination) {
    logger.notify("ERROR", "No save destination selected. Operation cancelled.");
    return;
  }

  zip.writeZip(saveDestination);
}
