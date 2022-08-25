import * as vscode from "vscode";
import * as path from "path";
import axios from "axios";
import { existsSync, mkdirSync, writeFile } from "fs";
import { Dynatrace } from "../dynatrace-api/dynatrace";

/**
 * Delivers the "Load schemas" command functionality.
 * Prompts the user to select a schema version, then downloads all schema files for that version.
 * Files are written in the global shared storage.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @returns void
 */
export async function loadSchemas(context: vscode.ExtensionContext, dt: Dynatrace) {
  // Fetch available schema versions from cluster
  const availableVersions = await dt.extensionsV2
    .listSchemaVersions()
    .catch((err) => {
      vscode.window.showErrorMessage(err.message);
      return [];
    });
  if (availableVersions.length === 0) {
    return;
  }

  // Prompt user for version selection
  const version = (await vscode.window.showQuickPick(availableVersions, {
    placeHolder: "Choose a schema version",
  })) as string;
  if (!version) {
    return;
  }
  context.workspaceState.update("schemaVersion", version);
  var location = path.join(context.globalStorageUri.fsPath, version);

  // Confirm download again
  if (existsSync(location)) {
    const download = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Schema version already available. Do you wish to download again?",
    });

    if (download !== "Yes") {
      return;
    }
  }

  // Download all schemas of that version
  mkdirSync(location, { recursive: true });
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading schemas version ${version}`,
    },
    async (progress) => {
      progress.report({ message: "Fetching file names" });
      const schemaFiles = (await dt.extensionsV2
        .listSchemaFiles(version)
        .catch((err) => vscode.window.showErrorMessage(err.message))) as string[];

      progress.report({ message: "Downloading files" });
      await axios
        .all(schemaFiles.map((file) => dt.extensionsV2.getSchemaFile(version, file)))
        .then(
          axios.spread((...responses) =>
            responses.forEach((resp) => {
              try {
                let parts = resp.$id.split("/");
                let fileName = parts[parts.length - 1];
                writeFile(`${location}/${fileName}`, JSON.stringify(resp), (err) => {
                  if (err) {
                    vscode.window.showErrorMessage(
                      `Error writing file ${fileName}:\n${err.message}`
                    );
                  }
                });
              } catch (err) {
                vscode.window.showErrorMessage(`Error writing file:\n${(err as Error).message}`);
              }
            })
          )
        )
        .catch((err) => vscode.window.showErrorMessage(err.message));
    }
  );
}
