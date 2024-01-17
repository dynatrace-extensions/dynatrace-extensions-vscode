import * as path from "path";
import AdmZip = require("adm-zip");
import * as vscode from "vscode";
import * as logger from "../utils/logging";

export const downloadSupportArchiveWorkflow = async (context: vscode.ExtensionContext) => {
  const logsDir = path.join(context.globalStorageUri.fsPath, "logs");
  await downloadSupportArchive(logsDir);
};

/**
 * Packages the logs directory into a zip file and prompts the user to save it.
 * @param logsDir path to the logs directory
 */
export async function downloadSupportArchive(logsDir: string) {
  const fnLogTrace = ["commandPalette", "downloadSupportArchive"];
  logger.info("Executing Download Support Archive command", ...fnLogTrace);
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
    logger.notify("ERROR", "No save destination selected. Operation cancelled.", ...fnLogTrace);
    return;
  }

  zip.writeZip(saveDestination);
}
