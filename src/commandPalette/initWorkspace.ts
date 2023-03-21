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

import * as vscode from "vscode";
import * as path from "path";
import { TextEncoder } from "util";
import { checkSettings } from "../utils/conditionCheckers";
import { getExtensionFilePath, initWorkspaceStorage, registerWorkspace } from "../utils/fileSystem";
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
  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Initializing workspace",
    },
    async progress => {
      // Load schemas if needed, otherwise use cached version and just update yaml schema
      progress.report({ message: "Setting up workspace schemas" });
      var schemaVersion = context.workspaceState.get("schemaVersion") as string;
      if (!schemaVersion) {
        const cmdSuccess = await loadSchemas(context, dt);
        if (cmdSuccess) {
          schemaVersion = context.workspaceState.get("schemaVersion") as string;
          vscode.window.showInformationMessage(`Loaded schemas version ${schemaVersion}`);
        } else {
          vscode.window.showErrorMessage("Cannot initialize workspace without schemas.");
          return false;
        }
      } else {
        vscode.window.showInformationMessage(`Using cached schema version ${schemaVersion}`);
        var mainSchema = path.join(path.join(context.globalStorageUri.fsPath, schemaVersion), "extension.schema.json");
        vscode.workspace.getConfiguration().update("yaml.schemas", { [mainSchema]: "extension.yaml" });
      }

      progress.report({ message: "Creating standard folders and files" });
      // Create the working directories
      var rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
      // Create dist directory
      var distDir = vscode.Uri.file(path.resolve(path.join(rootPath, "dist")));
      vscode.workspace.fs.createDirectory(distDir);

      if (!getExtensionFilePath(context)) {
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

      // Now that the workspace exists, storage can be created
      initWorkspaceStorage(context);

      // Which certificates to use?
      progress.report({ message: "Setting up workspace certificates" });
      var certChoice = await vscode.window.showQuickPick(["Use your own certificates", "Generate new ones"], {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Initialize Workspace: Certificates",
        placeHolder: "What certificates would you like to use for signing extensions in this workspace?",
      });
      switch (certChoice) {
        case "Use your own certificates":
          const hasCertificates = checkSettings("developerKeyLocation", "developerCertificateLocation");
          console.log(hasCertificates);
          if (!hasCertificates) {
            vscode.window.showErrorMessage("Personal certificates not found. Workspace not initialized.");
            return false;
          }
          break;
        case "Generate new ones":
          const cmdSuccess = await vscode.commands.executeCommand("dt-ext-copilot.generateCertificates");
          console.log(`CMD SUCCESS: ${cmdSuccess}`);
          if (!cmdSuccess) {
            vscode.window.showErrorMessage("Cannot initialize workspace without certificates.");
            return false;
          }
          break;
        default:
          vscode.window.showErrorMessage("No certificate choice made. Workspace not initialized.");
          return false;
      }

      progress.report({ message: "Registering the workspace" });
      // Register the workspace by saving its metadata
      registerWorkspace(context);

      progress.report({ message: "Finalizing setup" });
      // Run any callbacks as needed
      if (callback) {
        callback();
      }
      return true;
    }
  );

  if (success) {
    vscode.window.showInformationMessage("Workspace successfully initialized.");
  }
}
