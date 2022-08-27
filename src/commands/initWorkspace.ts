import * as vscode from "vscode";
import * as path from "path";
import { TextEncoder } from "util";
import { checkSettings } from "../utils/conditionCheckers";
import { initWorkspaceStorage, registerWorkspace } from "../utils/fileSystem";
import { loadSchemas } from "./loadSchemas";
import { Dynatrace } from "../dynatrace-api/dynatrace";

/**
 * Delivers the "Initialize workspace" command functionality.
 * This function is meant to be triggered from a newly opened workspace. As part of the initialization,
 * schemas are downloaded and set up for validation, extension directory along with a stub will be
 * generated, and a "dist" directory is created.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @param callback optional callback function to call once initialization complete
 * @returns
 */
export async function initWorkspace(context: vscode.ExtensionContext, dt: Dynatrace, callback?: () => any) {
  // Load schemas if needed
  var schemaVersion = context.workspaceState.get("schemaVersion") as string;
  if (!schemaVersion) {
    await loadSchemas(context, dt);
    schemaVersion = context.workspaceState.get("schemaVersion") as string;
    vscode.window.showInformationMessage(`Loaded schemas version ${schemaVersion}`);
  } else {
    vscode.window.showInformationMessage(`Using cached schema version ${schemaVersion}`);
  }

  // Set up schema validation
  if (!schemaVersion) {
    vscode.window.showErrorMessage("No schema found. Workspace not initialized.");
    return;
  }
  var schemaLocation = path.join(context.globalStorageUri.fsPath, schemaVersion);
  var schemaPath = path.join(schemaLocation, "extension.schema.json");
  vscode.workspace.getConfiguration().update("yaml.schemas", { [schemaPath]: "extension.yaml" });

  // Create the working directories
  var rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
  // Create dist directory
  var distDir = vscode.Uri.file(path.resolve(path.join(rootPath, "dist")));
  vscode.workspace.fs.createDirectory(distDir);

  vscode.workspace.findFiles("**/extension/extension.yaml").then((files) => {
    if (files.length === 0) {
      // Create extension directory
      var extensionDir = vscode.Uri.file(path.resolve(path.join(rootPath, "extension")));
      vscode.workspace.fs.createDirectory(extensionDir);
      // Add a basic extension stub
      const extensionStub = `name: custom:my.awesome.extension\nversion: "0.0.1"\nminDynatraceVersion: "${schemaVersion}"\nauthor:\n  name: Your Name Here`;
      vscode.workspace.fs.writeFile(
        vscode.Uri.file(path.join(extensionDir.fsPath, "extension.yaml")),
        new TextEncoder().encode(extensionStub)
      );
    }
  });

  // Now that the workspace exists, storage can be created
  initWorkspaceStorage(context);

  // Which certificates to use?
  var certChoice = await vscode.window.showQuickPick(["Use your own certificates", "Generate new ones"], {
    canPickMany: false,
    ignoreFocusOut: true,
    title: "Certificate selection",
    placeHolder: "What certificates would you like to use for signing extensions in this workspace?",
  });
  switch (certChoice) {
    case "Use your own certificates":
      if (
        !checkSettings(
          "dynatrace.certificate.location.developerKey",
          "dynatrace.certificate.location.developerCertificate"
        )
      ) {
        vscode.window.showErrorMessage("Personal certificates not found. Workspace not initialized.");
        return;
      }
      break;
    case "Generate new ones":
      await vscode.commands.executeCommand("dynatrace-extension-developer.generateCertificates");
      break;
    default:
      vscode.window.showErrorMessage("No certificate choice made. Workspace not initialized.");
      return;
  }

  // Register the workspace by saving its metadata
  registerWorkspace(context);

  // Run any callbacks as needed
  if (callback) {
    callback();
  }

  vscode.window.showInformationMessage("Workspace successfully initialized.");
}
