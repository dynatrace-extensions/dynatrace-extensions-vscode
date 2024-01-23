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

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync } from "fs";
import * as path from "path";
import { TextEncoder } from "util";
import AdmZip = require("adm-zip");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { getActivationContext } from "../extension";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { refreshWorkspacesTreeView } from "../treeViews/workspacesTreeView";
import { pushManifestTextForParsing } from "../utils/caching";
import {
  checkDtSdkPresent,
  checkSettings,
  checkTenantConnected,
  checkWorkspaceOpen,
} from "../utils/conditionCheckers";
import {
  getExtensionFilePath,
  initWorkspaceStorage,
  registerWorkspace,
  writeGititnore,
} from "../utils/fileSystem";
import { notify } from "../utils/logging";
import * as logger from "../utils/logging";
import { getPythonVenvOpts } from "../utils/otherExtensions";
import { runCommand } from "../utils/subprocesses";
import { loadSchemas } from "./loadSchemas";

const logTrace = ["commandPalette", "initWorkspace"];

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

export const initWorkspaceWorkflow = async () => {
  const context = getActivationContext();
  if ((await checkWorkspaceOpen()) && (await checkTenantConnected())) {
    initWorkspaceStorage();
    try {
      const dtClient = await getDynatraceClient();
      if (dtClient) {
        await initWorkspace(dtClient, () => {
          refreshWorkspacesTreeView();
        });
      }
    } finally {
      await context.globalState.update("dynatrace-extensions.initPending", undefined);
    }
  }
};

/**
 * Sets up the workspace for a new Python extension.
 * Checks if dt-sdk is available, installs dt-sdk if needed, and creates a python
 * extension.
 * @param rootPath path of the workspace (extension is created in its root)
 * @param tempPath the workspace storage (provided by vscode) for temporary work
 * @returns
 */
async function pythonExtensionSetup(
  rootPath: string,
  tempPath: string,
  progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>,
) {
  const fnLogTrace = [...logTrace, "pythonExtensionSetup"];
  logger.debug("Setting up a new python extension", ...fnLogTrace);
  // Get correct python env
  const envOptions = await getPythonVenvOpts();
  // Check: dt-sdk available?
  const dtSdkAvailable = await checkDtSdkPresent(undefined, undefined, envOptions);
  if (!dtSdkAvailable) {
    progress.report({ message: "Installing dependencies. This may take a while." });
    await runCommand(
      "pip install --upgrade dt-extensions-sdk[cli]",
      undefined,
      undefined,
      envOptions,
    );
  }
  // Name for the Python extension
  progress.report({ message: "Waiting for your input..." });
  const chosenName =
    (await vscode.window.showInputBox({
      title: "Provide a name for your extension",
      placeHolder: "my_python_extension",
      ignoreFocusOut: true,
      validateInput: value => {
        if (!/^[a-z][a-zA-Z0-9_]*/.test(value)) {
          return (
            "The name must be a valid Python module: " +
            "use letters, digits, and underscores only."
          );
        }
        return undefined;
      },
    })) ?? "my_python_extension";
  logger.debug(`Generated extension name is "${chosenName}"`, ...fnLogTrace);
  // Generate artefacts
  progress.report({ message: "Creating folders and files" });
  await runCommand(
    `dt-sdk create -o "${tempPath}" ${chosenName}`,
    undefined,
    undefined,
    envOptions,
  );

  // Tidy up
  // TODO - This doesn't work if the workspace is in another drive in Windows.
  // Can't rename from C: to D: for example
  readdirSync(path.resolve(tempPath, chosenName)).forEach(p =>
    renameSync(path.resolve(tempPath, chosenName, p), path.resolve(rootPath, p)),
  );
  rmdirSync(path.resolve(tempPath, chosenName));
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
  const fnLogTrace = [...logTrace, "existingExtensionSetup"];
  logger.debug("Setting up workspace with an existing extension", ...fnLogTrace);

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
    },
  );
  if (!download) {
    notify("ERROR", "No selection made. Operation aborted.", ...fnLogTrace);
    return;
  }

  const extensionDir = path.resolve(rootPath, "extension");
  if (!existsSync(extensionDir)) {
    mkdirSync(extensionDir);
  }

  logger.debug(
    `Attempting to download "${download.extension.extensionName}" version ${download.extension.version}`,
    ...fnLogTrace,
  );
  const zipData = await dt.extensionsV2.getExtension(
    download.extension.extensionName,
    download.extension.version,
    true,
  );
  const extensionPackage = new AdmZip(zipData);
  const extensionZip = new AdmZip(extensionPackage.getEntry("extension.zip")?.getData());
  extensionZip.extractAllTo(extensionDir);

  // Additional extraction is needed for python extensions
  const extensionYaml = readFileSync(path.resolve(extensionDir, "extension.yaml")).toString();
  try {
    if (/^python:/gm.test(extensionYaml)) {
      logger.debug("This is a python extension. Extracting relevant contents", ...fnLogTrace);
      const moduleNameMatch = /^ *module: (.*?)$/gm.exec(extensionYaml);
      if (moduleNameMatch && moduleNameMatch.length > 1) {
        const moduleName = moduleNameMatch[1];
        extensionZip
          .getEntries()
          .filter(e => {
            logger.info(e.name, ...fnLogTrace);
            return e.name.startsWith(moduleName);
          })
          .forEach(e => {
            const moduleZip = new AdmZip(e.getData());
            moduleZip.extractAllTo(rootPath);
          });
      }
      await writeGititnore(true);
    }
  } catch (err) {
    logger.error(err, ...fnLogTrace);
    notify(
      "WARN",
      "Not all files were extracted successfully. Manual edits are still needed.",
      ...fnLogTrace,
    );
  }
}

/**
 * Sets up the workspace for a new Extension 2.0.
 * Generates a small stub with the minimum mandatory details for any extension.
 * @param schemaVersion version of schema for this workspace
 * @param rootPath the root of the workspace
 */
async function defaultExtensionSetup(schemaVersion: string, rootPath: string) {
  // Only modify artefacts if extension.yaml not already present in workspace
  const extensionFilePath = getExtensionFilePath();
  if (!extensionFilePath) {
    // Create extension directory
    const extensionDir = vscode.Uri.file(path.resolve(path.join(rootPath, "extension")));
    await vscode.workspace.fs.createDirectory(extensionDir);
    // Add a basic extension stub
    const extensionStub =
      'name: custom:my.awesome.extension\nversion: "0.0.1"\n' +
      `minDynatraceVersion: "${schemaVersion}"\nauthor:\n  name: Your Name Here`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(extensionDir.fsPath, "extension.yaml")),
      new TextEncoder().encode(extensionStub),
    );
  } else {
    if (/^python:/gm.test(readFileSync(extensionFilePath).toString())) {
      await writeGititnore(true);
    }
  }
}

/**
 * Register a new or existing extension workspace with the add-on.
 * For new workspaces, it creates the mandatory folders (e.g. dist, config, extension),
 * sets up the certificates needed for signing (can use existing or generate new ones), and
 * finally creates some basic artifacts that should form the base of the project.
 * Types of projects currently supported - new extension stub, new python extension,
 * conversion from 1.0 JMX extension, or existing extension downloaded from tenant.
 * @param dt Dynatrace API Client
 * @param callback optional callback function to call once initialization complete
 * @returns
 */
export async function initWorkspace(dt: Dynatrace, callback?: () => unknown) {
  const fnLogTrace = [...logTrace, "initWorkspace"];
  logger.info("Executing Initialize Workspace command", ...fnLogTrace);
  const context = getActivationContext();

  // First, we set up the common aspects that apply to all extension projects
  let schemaVersion: string | undefined;
  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Initializing workspace",
    },
    async progress => {
      // Load schemas if needed, otherwise use cached version and just update yaml schema
      progress.report({ message: "Setting up workspace schemas" });
      schemaVersion = context.workspaceState.get<string>("schemaVersion");
      if (!schemaVersion) {
        logger.debug("No schema version found in cache. Loading schemas now.", ...fnLogTrace);
        const cmdSuccess = await loadSchemas(dt);
        if (cmdSuccess) {
          schemaVersion = context.workspaceState.get<string>("schemaVersion");
          if (!schemaVersion) {
            notify(
              "ERROR",
              "Error loading schemas. Cannot continue initialization.",
              ...fnLogTrace,
            );
            return false;
          }
          notify("INFO", `Loaded schemas version ${schemaVersion}`, ...fnLogTrace);
        } else {
          notify("ERROR", "Cannot initialize workspace without schemas.", ...fnLogTrace);
          return false;
        }
      } else {
        notify("INFO", `Using cached schema version ${schemaVersion}`, ...fnLogTrace);
        const mainSchema = vscode.Uri.file(
          path.join(
            path.join(context.globalStorageUri.fsPath, schemaVersion),
            "extension.schema.json",
          ),
        ).toString();
        vscode.workspace
          .getConfiguration()
          .update("yaml.schemas", { [mainSchema]: "extension.yaml" })
          .then(undefined, () => {
            logger.error("Could not update configuration yaml.schemas", ...fnLogTrace);
          });
      }

      // Now that the workspace exists, storage can be created
      initWorkspaceStorage();

      // Which certificates to use?
      progress.report({ message: "Setting up workspace certificates" });
      const certChoice = await vscode.window.showQuickPick(["Use existing", "Generate new ones"], {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Initialize Workspace: Certificates",
        placeHolder:
          "What certificates would you like to use for signing extensions in this workspace?",
      });
      switch (certChoice) {
        case "Use existing": {
          logger.debug("Workspace will use existing certificates", ...fnLogTrace);
          const hasCertificates = await checkSettings("developerCertkeyLocation");
          if (!hasCertificates) {
            notify(
              "ERROR",
              "Personal certificates not found. Workspace not initialized.",
              ...fnLogTrace,
            );
            return false;
          }
          break;
        }
        case "Generate new ones": {
          logger.debug("Workspace will generate new certificates", ...fnLogTrace);
          const cmdSuccess = await vscode.commands.executeCommand(
            "dynatrace-extensions.generateCertificates",
          );
          if (!cmdSuccess) {
            notify("ERROR", "Cannot initialize workspace without certificates.", ...fnLogTrace);
            return false;
          }
          break;
        }
        default:
          notify("ERROR", "No certificate choice made. Workspace not initialized.", ...fnLogTrace);
          return false;
      }

      progress.report({ message: "Registering the workspace" });
      // Register the workspace by saving its metadata
      await registerWorkspace();

      progress.report({ message: "Finalizing setup" });
      // Run any callbacks as needed
      if (callback) {
        logger.debug("InitWorkspace was given callback, executing now.", ...fnLogTrace);
        callback();
      }
      return true;
    },
  );

  // Then, we create some the extension artefacts for the specific project type
  if (!success) {
    logger.error("Workspace initialization aborted due to earlier failure.", ...fnLogTrace);
    return;
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating project artefacts",
    },
    async progress => {
      progress.report({ message: "Creating standard folders" });
      logger.debug("Creating standard folders", ...fnLogTrace);

      // Create the working directories
      const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!rootPath) {
        return;
      }
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(rootPath, "dist")));
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(rootPath, "config")));

      progress.report({ message: "Generating content for your project" });

      // Determine type of extension project
      let projectType;
      if (getExtensionFilePath()) {
        logger.debug(
          "Extension manifest detected. Choosing 'default extension' starter template.",
          ...fnLogTrace,
        );
        projectType = PROJECT_TYPES.defaultExtension;
      } else {
        logger.debug("Prompting user for template selection", ...fnLogTrace);
        projectType = await vscode.window.showQuickPick(Object.values(PROJECT_TYPES), {
          canPickMany: false,
          title: "What type of project are you starting?",
          placeHolder: "Extension 2.0",
          ignoreFocusOut: true,
        });
      }
      if (!projectType) {
        notify("ERROR", "No selection made. Operation cancelled.", ...fnLogTrace);
        return;
      }
      // This was done earlier in the flow already.
      const storagePath = context.storageUri?.fsPath;
      if (!storagePath) {
        logger.error(
          "Missing workspace storage path. Workspace initialization aborted.",
          ...fnLogTrace,
        );
        return;
      }

      // Setup based on type of project
      switch (projectType) {
        case PROJECT_TYPES.pythonExtension:
          await pythonExtensionSetup(rootPath, storagePath, progress);
          break;
        case PROJECT_TYPES.jmxConversion: {
          logger.debug("JMX Conversion template selected. Triggering subflow", ...fnLogTrace);
          const extensionDir = path.resolve(rootPath, "extension");
          if (!existsSync(extensionDir)) {
            mkdirSync(extensionDir);
          }
          await vscode.commands.executeCommand(
            "dynatrace-extensions.convertJmxExtension",
            path.resolve(extensionDir, "extension.yaml"),
          );
          break;
        }
        case PROJECT_TYPES.existingExtension:
          await existingExtensionSetup(dt, rootPath);
          break;
        default:
          if (schemaVersion) {
            await defaultExtensionSetup(schemaVersion, rootPath);
          }
      }

      // Update parsed extension in the cache
      logger.debug("Parsed extension now updated in cache.", ...fnLogTrace);
      pushManifestTextForParsing();

      // Create or update the .gitignore
      await writeGititnore(projectType === PROJECT_TYPES.pythonExtension);
    },
  );

  notify("INFO", "Workspace initialization completed successfully.", ...fnLogTrace);
}
