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

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "fs";
import path from "path";
import { TextEncoder } from "util";
import { GlobalCommand } from "@common";
import axios from "axios";
import { moveSync } from "fs-extra";
import JSZip from "jszip";
import vscode from "vscode";
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
  extractZip,
  getExtensionFilePath,
  initWorkspaceStorage,
  registerWorkspace,
  writeGititnore,
} from "../utils/fileSystem";
import logger from "../utils/logging";
import { getPythonVenvOpts } from "../utils/otherExtensions";
import { runCommand } from "../utils/subprocesses";
import { showQuickPick } from "../utils/vscode";
import { configureOpenPipelineJSONSchemas, loadSchemas } from "./loadSchemas";

const logTrace = ["commandPalette", "initWorkspace"];

const PROJECT_TYPE: Record<string, vscode.QuickPickItem> = {
  defaultExtension: {
    label: "YAML Extension",
    iconPath: new vscode.ThemeIcon("file-code"),
    detail: "Default choice for existing projects and most new ones. If unsure, choose this.",
    description: "⭐",
  },
  pythonExtension: {
    label: "Python Extension",
    iconPath: new vscode.ThemeIcon("terminal"),
    detail: "Develop an Extension based on the Python datasource. Requires python 3.10",
  },
  jmxConversion: {
    label: "JMX 1.0 Conversion",
    iconPath: new vscode.ThemeIcon("references"),
    detail: "Start by converting a legacy JMX extension to the new framework.",
  },
  existingExtension: {
    label: "Download an Extension",
    iconPath: new vscode.ThemeIcon("cloud-download"),
    detail: "Start by downloading an extension already deployed in your tenant.",
  },
};

if (
  !vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<boolean>("disableExternalCalls", false)
) {
  PROJECT_TYPE.exampleExtension = {
    label: "Download an Example",
    iconPath: new vscode.ThemeIcon("github"),
    detail: "Download one of our example extensions from GitHub.",
  };
}

PROJECT_TYPE satisfies Record<string, vscode.QuickPickItem>;

const PROJECT_TYPES = Object.values(PROJECT_TYPE);
const EXAMPLE_SELECTION = {
  python_example: { label: "Python" },
  snmp_example: { label: "SNMP" },
  jmx_example: { label: "JMX" },
  prometheus_example: { label: "Prometheus" },
  sql_example: { label: "SQL" },
  wmi_example: { label: "WMI" },
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
      await context.globalState.update(GlobalCommand.InitPending, undefined);
    }
  }
};

/**
 * Registers a workspace with the VS Code extension.
 * Initialization also involves creating a directory structure and some starter files depending on
 * the project template chosen.
 * @param dt Dynatrace API Client
 * @param callback optional callback function to call once initialization complete
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
            logger.notify(
              "ERROR",
              "Error loading schemas. Cannot continue initialization.",
              ...fnLogTrace,
            );
            return false;
          }
          logger.notify("INFO", `Loaded schemas version ${schemaVersion}`, ...fnLogTrace);
        } else {
          logger.notify("ERROR", "Cannot initialize workspace without schemas.", ...fnLogTrace);
          return false;
        }
      } else {
        logger.notify("INFO", `Using cached schema version ${schemaVersion}`, ...fnLogTrace);
        const schemaLocation = path.join(context.globalStorageUri.fsPath, schemaVersion);
        const mainSchema = vscode.Uri.file(
          path.join(schemaLocation, "extension.schema.json"),
        ).toString();
        vscode.workspace
          .getConfiguration()
          .update("yaml.schemas", { [mainSchema]: "extension.yaml" })
          .then(undefined, () => {
            logger.error("Could not update configuration yaml.schemas", ...fnLogTrace);
          });

        // Configure JSON schemas for OpenPipeline files
        configureOpenPipelineJSONSchemas(schemaLocation);
      }

      // Now that the workspace exists, storage can be created
      initWorkspaceStorage();

      // Which certificates to use?
      progress.report({ message: "Setting up workspace certificates" });
      const certChoice = await showQuickPick(["Use existing", "Generate new ones"], {
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
            logger.notify(
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
            GlobalCommand.GenerateCertificates,
          );
          if (!cmdSuccess) {
            logger.notify(
              "ERROR",
              "Cannot initialize workspace without certificates.",
              ...fnLogTrace,
            );
            return false;
          }
          break;
        }
        default:
          logger.notify(
            "ERROR",
            "No certificate choice made. Workspace not initialized.",
            ...fnLogTrace,
          );
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
      let projectType: vscode.QuickPickItem | undefined = PROJECT_TYPE.defaultExtension;
      let exampleType;

      if (getExtensionFilePath()) {
        logger.debug(
          "Extension manifest detected. Choosing 'default extension' starter template.",
          ...fnLogTrace,
        );
      } else {
        logger.debug("Prompting user for template selection", ...fnLogTrace);
        projectType = await showQuickPick(PROJECT_TYPES, {
          title: "What type of project are you starting?",
          placeHolder: "YAML Extension",
          ignoreFocusOut: true,
        });
      }
      if (!projectType) {
        logger.notify("ERROR", "No selection made. Operation cancelled.", ...fnLogTrace);
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
        case PROJECT_TYPE.pythonExtension:
          await pythonExtensionSetup(rootPath, storagePath, progress);
          break;
        case PROJECT_TYPE.jmxConversion: {
          logger.debug("JMX Conversion template selected. Triggering subflow", ...fnLogTrace);
          const extensionDir = path.resolve(rootPath, "extension");
          if (!existsSync(extensionDir)) {
            mkdirSync(extensionDir);
          }
          await vscode.commands.executeCommand(
            GlobalCommand.ConvertJmxExtension,
            path.resolve(extensionDir, "extension.yaml"),
          );
          break;
        }
        case PROJECT_TYPE.existingExtension:
          await existingExtensionSetup(dt, rootPath);
          break;
        case PROJECT_TYPE.exampleExtension:
          logger.debug("Prompting user for example selection", ...fnLogTrace);
          exampleType = await vscode.window.showQuickPick(Object.values(EXAMPLE_SELECTION), {
            canPickMany: false,
            title: "What datasource should the example use?",
            placeHolder: "Python",
            ignoreFocusOut: true,
          });
          switch (exampleType) {
            case EXAMPLE_SELECTION.python_example:
              await pythonExampleExtensionSetup(rootPath, progress);
              break;
            case EXAMPLE_SELECTION.sql_example:
              await declarativeExampleExtensionSetup(rootPath, "sql", "sql-vscode-example");
              break;
            case EXAMPLE_SELECTION.jmx_example:
              await declarativeExampleExtensionSetup(rootPath, "jmx", "jmx-vscode-example");
              break;
            case EXAMPLE_SELECTION.prometheus_example:
              await declarativeExampleExtensionSetup(
                rootPath,
                "prometheus",
                "prometheus-vscode-example",
              );
              break;
            case EXAMPLE_SELECTION.snmp_example:
              await declarativeExampleExtensionSetup(rootPath, "snmp", "snmp-vscode-example");
              break;
            case EXAMPLE_SELECTION.wmi_example:
              await declarativeExampleExtensionSetup(rootPath, "wmi", "wmi-vscode-example");
              break;
          }
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
      await writeGititnore(projectType === PROJECT_TYPE.pythonExtension);
    },
  );

  logger.notify("INFO", "Workspace initialization completed successfully.", ...fnLogTrace);
}

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

  readdirSync(path.resolve(tempPath, chosenName)).forEach(p =>
    moveSync(path.resolve(tempPath, chosenName, p), path.resolve(rootPath, p)),
  );
  rmdirSync(path.resolve(tempPath, chosenName));
}
/**
 * Sets up the workspace for the example Python extension.
 * Downloads the extension files from the github repo as a zip and unpacks them.
 * Checks if dt-sdk is available, installs dt-sdk if needed.
 * @param rootPath path of the workspace (extension is created in its root)
 * @returns
 */

async function pythonExampleExtensionSetup(
  rootPath: string,
  progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>,
) {
  const extensionName = "python-vscode-example";
  const fnLogTrace = [...logTrace, "pythonExampleExtensionSetup"];
  logger.debug("Setting up the example python extension", ...fnLogTrace);
  await unzipExampleExtension(fnLogTrace, rootPath, "python", extensionName);
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

    logger.notify("INFO", "Python example downloaded and unzipped successfully.", ...fnLogTrace);
  }
  await changeSchemaExampleExtension(fnLogTrace);
}

/**
 * Sets up the workspace for the example declarative extension chosen.
 * Downloads the extension files from the github repo as a zip and unpacks them.
 * @param rootPath path of the workspace (extension is created in its root)
 * @param dataSource dataSource of the declarative extension being used.
 * @param extensionName name of the extension repository
 * @returns
 */
async function declarativeExampleExtensionSetup(
  rootPath: string,
  dataSource: string,
  extensionName: string,
) {
  const fnLogTrace = [...logTrace, "decalarativeExampleExtensionSetup"];
  logger.debug(`Setting up the example ${dataSource} extension`, ...fnLogTrace);
  await unzipExampleExtension(fnLogTrace, rootPath, dataSource, extensionName);
  await changeSchemaExampleExtension(fnLogTrace);
}

/**
 * Downloads and unzips the example extensions from github into the rootpath
 * @param fnLogTrace log trace
 * @param rootPath path of the workspace (extension is created in its root)
 * @param dataSource dataSource of the declarative extension being used.
 * @param extensionName name of the extension repository
 * @returns
 */
async function unzipExampleExtension(
  fnLogTrace: string[],
  rootPath: string,
  dataSource: string,
  extensionName: string,
) {
  // 'Clone' repo from github
  const url = `https://github.com/dynatrace-extensions/${extensionName}/archive/refs/heads/main.zip`;
  try {
    const resp = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
    if (resp.status === 200) {
      const exampleZip = resp.data;
      logger.debug("Unzipping downloaded file.");
      try {
        const zip = await new JSZip().loadAsync(exampleZip);
        logger.info(`Extracting zip into ${rootPath}`, ...logTrace, "extractZip");
        const files = zip.files;
        for (const relativePath in files) {
          const file = files[relativePath];
          // Unpack the directory to the rootPath directly.
          const pathArr = relativePath.split(path.sep);
          pathArr[0] = `.${path.sep}`;
          const newPath = pathArr.join(path.sep);
          if (file) {
            const filePath = path.join(rootPath, newPath);
            if (file.dir) {
              if (!existsSync(filePath)) {
                logger.info(`Creating dir: ${filePath}`);
                mkdirSync(filePath, { recursive: true });
              }
            } else {
              const fileContent = await file.async("nodebuffer");

              if (relativePath.endsWith(".zip")) {
                const innerZip = await JSZip.loadAsync(Uint8Array.from(fileContent));
                await extractZip(innerZip, rootPath);
              } else {
                const basePath = filePath.split(path.sep).slice(0, -1).join(path.sep);
                if (!existsSync(basePath)) {
                  mkdirSync(basePath, { recursive: true });
                }
                writeFileSync(filePath, Uint8Array.from(fileContent));
              }
            }
          }
        }
      } catch (err) {
        logger.warn(
          `Could not unzip file to ${rootPath}, it will have to be downloaded and unzipped manually from ${url}.`,
          ...fnLogTrace,
        );
        logger.notify(
          "ERROR",
          `Could not unzip file. It will have to be downloaded and unzipped manually from: ${url}`,
        );
      }
    }
  } catch (err) {
    logger.warn(
      `Could not download repo, this will have to be manually downloaded from ${url}`,
      ...fnLogTrace,
    );
    logger.notify(
      "ERROR",
      `Could not download files. They will have to be downloaded and unzipped manually from: ${url}`,
    );
  }
  logger.notify(
    "INFO",
    `${dataSource} example downloaded and unzipped successfully.`,
    ...fnLogTrace,
  );
}

/**
 * Sets schema version to the one set in the initWorkspace flow.
 * This function is necessary because the yaml asset pulled from github
 * has its own version set and is pulled after loadScehma is initially handled.
 * @param fnLogTrace
 * @returns
 */
async function changeSchemaExampleExtension(fnLogTrace: string[]) {
  const context = getActivationContext();
  const schemaVersion: string | undefined = context.workspaceState.get<string>("schemaVersion");
  if (!schemaVersion) {
    logger.notify("ERROR", "Could not get schema");
    return false;
  }
  const schemaLocation = path.join(context.globalStorageUri.fsPath, schemaVersion);
  const mainSchema = vscode.Uri.file(path.join(schemaLocation, "extension.schema.json")).toString();
  vscode.workspace
    .getConfiguration()
    .update("yaml.schemas", { [mainSchema]: "extension.yaml" })
    .then(undefined, () => {
      logger.error("Could not update configuration yaml.schemas", ...fnLogTrace);
    });

  // Configure JSON schemas for OpenPipeline files
  configureOpenPipelineJSONSchemas(schemaLocation);
  try {
    // If extension.yaml already exists, update the version there too
    const extensionFile = getExtensionFilePath();
    if (extensionFile) {
      const extensionContent = readFileSync(extensionFile).toString();
      writeFileSync(
        extensionFile,
        extensionContent.replace(
          /^minDynatraceVersion: ("?[0-9.]+"?)/gm,
          `minDynatraceVersion: ${schemaVersion}`,
        ),
      );
    }
  } catch (err) {
    logger.notify(
      "ERROR",
      "Extension YAML was not updated. Schema loading only partially complete.",
      ...logTrace,
    );
    logger.notify("ERROR", (err as Error).message, ...logTrace);
    return false;
  }

  logger.notify("INFO", "Schema loading complete.", ...logTrace);
  return true;
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

  const download = await showQuickPick(
    (await dt.extensionsV2.list()).map(ext => ({
      label: `${ext.extensionName} (${ext.version})`,
      extension: ext,
    })),
    {
      title: "Choose an extension to download",
      ignoreFocusOut: true,
    },
  );
  if (!download) {
    logger.notify("ERROR", "No selection made. Operation aborted.", ...fnLogTrace);
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
  await extractZip(await new JSZip().loadAsync(zipData), extensionDir);
  rmSync(path.join(extensionDir, "extension.zip.sig"));

  // Additional extraction is needed for python extensions
  const extensionYaml = readFileSync(path.resolve(extensionDir, "extension.yaml")).toString();
  try {
    if (/^python:/gm.test(extensionYaml)) {
      logger.debug("This is a python extension. Extracting relevant contents", ...fnLogTrace);
      const moduleNameMatch = /^ *module: (.*?)$/gm.exec(extensionYaml);
      if (moduleNameMatch && moduleNameMatch.length > 1) {
        const libPath = path.join(extensionDir, "lib");
        const moduleName = moduleNameMatch[1];
        const whlPath = readdirSync(libPath).filter(
          f => f.startsWith(moduleName) && f.endsWith(".whl"),
        );
        if (whlPath[0]) {
          await extractZip(
            await new JSZip().loadAsync(
              Uint8Array.from(readFileSync(path.join(libPath, whlPath[0]))),
            ),
            rootPath,
          );
          rmSync(path.join(rootPath, `${moduleName}-${download.extension.version}.dist-info`), {
            recursive: true,
            force: true,
          });
        }
        rmSync(libPath, { recursive: true, force: true });
        await writeSetupPy(moduleName, rootPath);
      }
      await writeGititnore(true);
    }
  } catch (err) {
    logger.error(err, ...fnLogTrace);
    logger.notify(
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
 * Writes a setup.py file. This is needed when downloading python extensions as the user cannot
 * build the project without one.
 * @param extensionName name to use in file
 * @param rootPath path to write the file to
 */
const writeSetupPy = async (extensionName: string, rootPath: string) => {
  const fnLogTrace = [...logTrace, "writeSetupPy"];
  const note = "# This was autogenerated. Add to the list all other packages required";
  const url =
    "https://raw.githubusercontent.com/dynatrace-extensions/dt-extensions-python-sdk/main/dynatrace_extension/cli/create/extension_template/setup.py.template";

  if (
    vscode.workspace
      .getConfiguration("dynatraceExtensions", null)
      .get<boolean>("disableExternalCalls", false)
  ) {
    logger.warn(
      `External calls are blocked. setup.py will have to be manually downloaded from ${url}`,
      ...fnLogTrace,
    );
    return;
  }

  try {
    const resp = await axios.get<string>(url);
    if (resp.status === 200) {
      const setupPyContent = resp.data
        .replace("%extension_name%", extensionName)
        .replace("%Extension_Name%", extensionName)
        .replace("install_requires", `${note}\n      install_requires`);

      const setupPyPath = path.resolve(rootPath, "setup.py");
      writeFileSync(setupPyPath, setupPyContent);
    }
  } catch (err) {
    logger.warn(
      `Could not write setup.py file, this will have to be manually downloaded from ${url}`,
      ...fnLogTrace,
    );
  }
};
