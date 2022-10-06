import * as vscode from "vscode";
import * as path from "path";
import axios from "axios";
import * as yaml from "yaml";
import { existsSync, mkdirSync, readFileSync, writeFile, writeFileSync } from "fs";
import { Dynatrace } from "../dynatrace-api/dynatrace";

/**
 * Delivers the "Load schemas" command functionality.
 * Prompts the user to select a schema version, then downloads all schema files for that version.
 * Files are written in the global shared storage.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @returns boolean - the success of the command
 */
export async function loadSchemas(context: vscode.ExtensionContext, dt: Dynatrace): Promise<boolean> {
  // Fetch available schema versions from cluster
  const availableVersions = await dt.extensionsV2.listSchemaVersions().catch((err) => {
    vscode.window.showErrorMessage(err.message);
    return [];
  });
  if (availableVersions.length === 0) {
    vscode.window.showErrorMessage("No schemas available. Operation cancelled.");
    return false;
  }

  // Prompt user for version selection
  const version = (await vscode.window.showQuickPick(availableVersions, {
    placeHolder: "Choose a schema version",
    title: "Extension workspace: Load Schemas"
  })) as string;
  if (!version) {
    vscode.window.showErrorMessage("No schema was selected. Operation cancelled.");
    return false;
  }
  var location = path.join(context.globalStorageUri.fsPath, version);

  // If directory exists, assume schemas already present
  if (!existsSync(location)) {
    downloadSchemaFiles(location, version, dt);
  } else {
    const download = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Schema version already available. Do you wish to download again?",
    });

    if (download === "Yes") {
      downloadSchemaFiles(location, version, dt);
    }
  }

  // Update the YAML Schema extension to use the new version
  var mainSchema = path.join(location, "extension.schema.json");
  vscode.workspace.getConfiguration().update("yaml.schemas", { [mainSchema]: "extension.yaml" });
  context.workspaceState.update("schemaVersion", version);

  try {
    // If extension.yaml already exists, update the version there too
    vscode.workspace.findFiles("**/extension/extension.yaml").then((files) => {
      if (files.length > 0) {
        files.forEach((file) => {
          var lineCounter = new yaml.LineCounter();
          var extensionYaml: ExtensionStub = yaml.parse(readFileSync(file.fsPath).toString(), {lineCounter: lineCounter});
          extensionYaml.minDynatraceVersion = version;
          writeFileSync(file.fsPath, yaml.stringify(extensionYaml, {lineWidth: 0, lineCounter: lineCounter}));
        });
      }
    });
  } catch (err: any) {
    vscode.window.showErrorMessage("Extension YAML was not updated. Schema loading only partially complete.");
    vscode.window.showErrorMessage(err.message);
    return false;
  }

  vscode.window.showInformationMessage("Schema loading complete.");
  return true;
}

function downloadSchemaFiles(location: string, version: string, dt: Dynatrace) {
  // Download all schemas of that version
  mkdirSync(location, { recursive: true });
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Loading schemas ${version}`,
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
          axios.spread((...responses) => {
            responses.forEach((resp) => {
              try {
                let parts = resp.$id.split("/");
                let fileName = parts[parts.length - 1];
                writeFile(`${location}/${fileName}`, JSON.stringify(resp), (err) => {
                  if (err) {
                    vscode.window.showErrorMessage(`Error writing file ${fileName}:\n${err.message}`);
                  }
                });
              } catch (err) {
                vscode.window.showErrorMessage(`Error writing file:\n${(err as Error).message}`);
              }
            });
          })
        )
        .catch((err) => vscode.window.showErrorMessage(err.message));
    }
  );
}
