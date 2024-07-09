import { writeFileSync } from "fs";
import JSZip from "jszip";
import * as vscode from "vscode";
import { getActivationContext } from "../extension";
import { bundleFolder } from "../utils/fileSystem";
import * as logger from "../utils/logging";

export const downloadSupportArchiveWorkflow = async () => {
  const context = getActivationContext();
  await downloadSupportArchive(context.logUri.fsPath);
};

/**
 * Packages the logs directory into a zip file and prompts the user to save it.
 * @param logsDir path to the logs directory
 */
export async function downloadSupportArchive(logsDir: string) {
  const fnLogTrace = ["commandPalette", "downloadSupportArchive"];
  logger.info("Executing Download Support Archive command", ...fnLogTrace);
  const zip = new JSZip();
  bundleFolder(zip, logsDir);

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

  const zipContent = await zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
  writeFileSync(saveDestination, zipContent);
}
