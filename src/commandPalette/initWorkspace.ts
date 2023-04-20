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
import { checkDtSdkPresent, checkSettings, checkUrlReachable } from "../utils/conditionCheckers";
import { getExtensionFilePath, initWorkspaceStorage, registerWorkspace } from "../utils/fileSystem";
import { loadSchemas } from "./loadSchemas";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { runCommand } from "../utils/subprocesses";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "fs";
import AdmZip = require("adm-zip");

const PROJECT_TYPES = {
  defaultExtension: {
    label: "Extension 2.0",
    detail: "Default choice for existing projects and most new ones. If unsure, choose this.",
    description: "⭐",
  },
  pythonExtension: {
    label: "Python Extension 2.0",
    detail: "Develop an Extension 2.0 based on the Python datasource.",
  },
  jmxConversion: {
    label: "JMX 1.0 Conversion",
    detail: "Start by converting a 1.0 JMX extension to the 2.0 framework.",
  },
  existingExtension: {
    label: "Existing 2.0 Extension",
    detail: "Start by downloading an extension already deployed in your tenant.",
  },
};

/**
 * Register a new or existing extension workspace with the Copilot.
 * For new workspaces, it creates the mandatory folders (e.g. dist, config, extension),
 * sets up the certificates needed for signing (can use existing or generate new ones), and
 * finally creates some basic artifacts that should form the base of the project.
 * Types of projects currently supported - new extension stub, new python extension,
 * conversion from 1.0 JMX extension, or existing extension downloaded from tenant.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @param callback optional callback function to call once initialization complete
 * @returns
 */
export async function initWorkspace(context: vscode.ExtensionContext, dt: Dynatrace, callback?: () => any) {
  // First, we set up the common aspects that apply to all extension projects
  let schemaVersion: string;
  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Initializing workspace",
    },
    async progress => {
      // Load schemas if needed, otherwise use cached version and just update yaml schema
      progress.report({ message: "Setting up workspace schemas" });
      schemaVersion = context.workspaceState.get("schemaVersion") as string;
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
        const mainSchema = path.join(
          path.join(context.globalStorageUri.fsPath, schemaVersion),
          "extension.schema.json"
        );
        vscode.workspace.getConfiguration().update("yaml.schemas", { [mainSchema]: "extension.yaml" });
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
          const hasCertificates = checkSettings("developerCertKeyLocation");
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

  // Then, we create some the extension artefacts for the specific project type
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating project artefacts",
    },
    async progress => {
      progress.report({ message: "Creating standard folders" });

      // Create the working directories
      const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
      vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(rootPath, "dist")));
      vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(rootPath, "config")));

      progress.report({ message: "Generating content for your project" });

      // Determine type of extension project
      let projectType;
      if (getExtensionFilePath()) {
        projectType = PROJECT_TYPES.defaultExtension;
      } else {
        projectType = await vscode.window.showQuickPick(Object.values(PROJECT_TYPES), {
          canPickMany: false,
          title: "What type of project are you starting?",
          placeHolder: "Extension 2.0",
          ignoreFocusOut: true,
        });
      }
      if (!projectType) {
        vscode.window.showErrorMessage("No selection made. Operation cancelled.");
        return;
      }

      // Setup based on type of project
      switch (projectType) {
        case PROJECT_TYPES.pythonExtension:
          await pythonExtensionSetup(rootPath, context.storageUri!.fsPath);
          break;
        case PROJECT_TYPES.jmxConversion:
          const extensionDir = path.resolve(rootPath, "extension");
          if (!existsSync(extensionDir)) {
            mkdirSync(extensionDir);
          }
          await vscode.commands.executeCommand(
            "dt-ext-copilot.convertJmxExtension",
            path.resolve(extensionDir, "extension.yaml")
          );
          break;
        case PROJECT_TYPES.existingExtension:
          await existingExtensionSetup(dt, rootPath);
          break;
        default:
          defaultExtensionSetup(schemaVersion, rootPath);
      }
    }
  );

  vscode.window.showInformationMessage("Workspace initialization completed successfully.");
}

/**
 * Sets up the workspace for a new Python extension.
 * Checks whether dt-sdk or VPN available, installs dt-sdk if needed, and creates a python extension.
 * @param rootPath path of the workspace (extension is created in its root)
 * @param tempPath the workspace storage (provided by vscode) for temporary work
 * @returns
 */
async function pythonExtensionSetup(rootPath: string, tempPath: string) {
  // Check: dt-sdk or VPN available
  const artifactoryUrl = "https://artifactory.lab.dynatrace.org/artifactory/api/pypi/pypi-extensions-release/simple";
  if (!(await checkDtSdkPresent())) {
    if (await checkUrlReachable(artifactoryUrl)) {
      await runCommand(`pip install --upgrade dynatrace-extensions-python-sdk --extra-index-url ${artifactoryUrl}`);
    } else {
      vscode.window.showErrorMessage(
        "The dt-sdk module is not installed and you are not on VPN. Python extension setup is not possible."
      );
      return;
    }
  }
  // Name for the Python extension
  const chosenName =
    (await vscode.window.showInputBox({
      title: "Provide a name for your extension",
      placeHolder: "my_python_extension",
      ignoreFocusOut: true,
      validateInput: value => {
        if (!/^[a-z][a-zA-Z0-9_]*/.test(value)) {
          return "The name must be a valid Python module: use letters, digits, and underscores only.";
        }
      },
    })) ?? "my_python_extension";
  // Generate artefacts
  await runCommand(`dt-sdk create -o ${tempPath} ${chosenName}`);
  // Tidy up
  readdirSync(path.resolve(tempPath, chosenName)).forEach(p =>
    renameSync(path.resolve(tempPath, chosenName, p), path.resolve(rootPath, p))
  );
  rmSync(path.resolve(tempPath, chosenName));
}

/**
 * Sets up the workspace for continuing work on an existing extension.
 * User is prompted to select an extension from their tenant, which is then downloaded
 * and unpacked in the workspace root folder. Requires an environment connection.
 * @param dt Dynatrace API Client
 * @param rootPath path to the workspace root folder
 * @returns
 */
async function existingExtensionSetup(dt: Dynatrace, rootPath: string) {
  const download = await vscode.window.showQuickPick(
    (
      await dt.extensionsV2.list()
    ).map(ext => ({
      label: `${ext.extensionName} (${ext.version})`,
      extension: ext,
    })),
    {
      title: "Choose an extension to download",
      canPickMany: false,
      ignoreFocusOut: true,
    }
  );
  if (!download) {
    vscode.window.showErrorMessage("No selection made. Operation aborted.");
    return;
  }

  const extensionDir = path.resolve(rootPath, "extension");
  if (!existsSync(extensionDir)) {
    mkdirSync(extensionDir);
  }

  const zipData = await dt.extensionsV2.getExtension(
    download.extension.extensionName,
    download.extension.version,
    true
  );
  const extensionPackage = new AdmZip(zipData);
  const extensionZip = new AdmZip(extensionPackage.getEntry("extension.zip")?.getData());
  extensionZip.extractAllTo(extensionDir);

  // Additional extraction is needed for python extensions
  const extensionYaml = readFileSync(path.resolve(extensionDir, "extension.yaml")).toString();
  try {
    if (/^python:/gm.test(extensionYaml)) {
      const moduleName = /^ *module: (.*?)$/gm.exec(extensionYaml)![1];
      extensionZip
        .getEntries()
        .filter(e => {
          console.log(e.name);
          return e.name.startsWith(moduleName);
        })
        .forEach(e => {
          const moduleZip = new AdmZip(e.getData());
          moduleZip.extractAllTo(rootPath);
        });
    }
  } catch (err) {
    console.log(err);
    vscode.window.showWarningMessage("Not all files were extracted successfully. Manual edits are still needed.");
  }
}

/**
 * Sets up the workspace for a new Extension 2.0.
 * Generates a small stub with the minimum mandatory details for any extension.
 * @param schemaVersion version of schema for this workspace
 * @param rootPath the root of the workspace
 */
function defaultExtensionSetup(schemaVersion: string, rootPath: string) {
  // Only modify artefacts if extension.yaml not already present in workspace
  if (!getExtensionFilePath()) {
    // Create extension directory
    const extensionDir = vscode.Uri.file(path.resolve(path.join(rootPath, "extension")));
    vscode.workspace.fs.createDirectory(extensionDir);
    // Add a basic extension stub
    const extensionStub = `name: custom:my.awesome.extension\nversion: "0.0.1"\nminDynatraceVersion: "${schemaVersion}"\nauthor:\n  name: Your Name Here`;
    vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(extensionDir.fsPath, "extension.yaml")),
      new TextEncoder().encode(extensionStub)
    );
  }
}
