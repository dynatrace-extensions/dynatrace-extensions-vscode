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

/********************************************************************************
 * UTILITIES FOR INTERACTING WITH THE USER'S FILE SYSTEM
 ********************************************************************************/

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import * as os from "os";
import * as path from "path";
import { copySync } from "fs-extra";
import { glob } from "glob";
import JSZip from "jszip";
import * as vscode from "vscode";
import { getActivationContext } from "../extension";
import {
  ExecutionSummary,
  LocalExecutionSummary,
  RemoteExecutionSummary,
  RemoteTarget,
} from "../interfaces/simulator";
import { DynatraceTenantDto, ExtensionWorkspaceDto } from "../interfaces/treeViews";
import { notify } from "./logging";
import * as logger from "./logging";

const logTrace = ["utils", "fileSystem"];

/**
 * Performs some basic clean-up by removing oldest files from the given directory.
 * @param dirPath path to the logs directory
 * @param count number of files to keep
 */
export function removeOldestFiles(dirPath: string, count: number) {
  const fnLogTrace = [...logTrace, "removeOldestFiles"];
  if (count < 0) {
    logger.debug(`Cannot remove files, count parameter is negative: ${count}`, ...fnLogTrace);
    return;
  }
  logger.debug(`Cleaning files from "${dirPath}" to keep only ${count}.`, ...fnLogTrace);
  // Sort files by date modified
  const files = readdirSync(dirPath).sort((f1: string, f2: string) => {
    const f1Stats = statSync(path.join(dirPath, f1));
    const f2Stats = statSync(path.join(dirPath, f2));
    return f2Stats.mtimeMs - f1Stats.mtimeMs;
  });
  // Remove oldest files until the desired count
  while (files.length > count) {
    const fileToDelete = files.pop();
    if (fileToDelete) {
      rmSync(path.join(dirPath, fileToDelete));
    }
  }
}

/**
 * Initializes the global storage path for the VS Code extension.
 * Given that VS Code storage paths may not exist yet, this function creates it if needed.
 * Also creates empty JSON files where all initialized repos' and tenants' metadata should be stored.
 */
export function initializeGlobalStorage() {
  const context = getActivationContext();
  const globalStoragePath = context.globalStorageUri.fsPath;
  const extensionWorkspacesJson = path.join(globalStoragePath, "extensionWorkspaces.json");
  const dynatraceEnvironmentsJson = path.join(globalStoragePath, "dynatraceEnvironments.json");
  const idTokenPath = path.join(globalStoragePath, "idToken.txt");
  const targetsJson = path.join(globalStoragePath, "targets.json");
  const summariesJson = path.join(globalStoragePath, "summaries.json");
  const logsDir = context.logUri.fsPath;

  // Create global storage folder if needed
  if (!existsSync(globalStoragePath)) {
    mkdirSync(globalStoragePath, { recursive: true });
  }

  // Create workspaces json if needed
  if (!existsSync(extensionWorkspacesJson)) {
    writeFileSync(extensionWorkspacesJson, "[]");
  }

  // Create environments json if needed
  if (!existsSync(dynatraceEnvironmentsJson)) {
    writeFileSync(dynatraceEnvironmentsJson, "[]");
  }

  // Create idToken file if needed
  if (!existsSync(idTokenPath)) {
    writeFileSync(idTokenPath, "1234");
  }

  // Create targets json if needed
  if (!existsSync(targetsJson)) {
    writeFileSync(targetsJson, "[]");
  }

  // Create summaries json if needed
  if (!existsSync(summariesJson)) {
    writeFileSync(summariesJson, "[]");
  }

  // Create logs folder if needed
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Initializes the workspace storage path for the current workspace (assumed to be opened).
 * Given that VS Code storage paths may not exist yet, this function creates it if needed.
 */
export function initWorkspaceStorage() {
  const fnLogTrace = [...logTrace, "initWorkspaceStorage"];
  const context = getActivationContext();
  const storagePath = context.storageUri?.fsPath;
  if (!storagePath) {
    logger.error("No workspace detected.", ...fnLogTrace);
    return;
  }

  if (!existsSync(storagePath)) {
    logger.info(`Workspace storage created at: ${storagePath}`, ...fnLogTrace);
    mkdirSync(storagePath, { recursive: true });
  }
}

/**
 * Saves the metadata of an initialized workspace (assumed to be opened) within the global
 * storage path (extensionWorkspaces.json). If previous metadata exists, it will be overwritten.
 */
export async function registerWorkspace() {
  const context = getActivationContext();
  if (!context.storageUri?.fsPath || !vscode.workspace.workspaceFolders) {
    logger.error(
      "No workspace to register. Check should be upstream.",
      ...logTrace,
      "registerWorkspace",
    );
    return;
  }
  const workspaces = getAllWorkspaces();
  const workspace: ExtensionWorkspaceDto = {
    name: vscode.workspace.name ?? "",
    id: path.basename(path.dirname(context.storageUri.fsPath)),
    folder: vscode.workspace.workspaceFolders[0].uri.toString(),
  };

  const currentIndex = workspaces.findIndex(ws => ws.id === workspace.id);
  if (currentIndex === -1) {
    workspaces.push(workspace);
  } else {
    workspaces[currentIndex] = workspace;
  }

  writeFileSync(getWorkspacesJsonPath(), JSON.stringify(workspaces));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numWorkspaces",
    workspaces.length,
  );
}

/**
 * Gets metadata of all extension workspaces currently registered in the global storage.
 */
export function getAllWorkspaces(): ExtensionWorkspaceDto[] {
  return JSON.parse(readFileSync(getWorkspacesJsonPath()).toString()) as ExtensionWorkspaceDto[];
}

/**
 * Finds a workspace (from globally stored metadata) by either its name or its id.
 * @returns The workspace, if found, or undefined otherwise
 */
export function findWorkspace(
  workspaceName?: string,
  workspaceId?: string,
): ExtensionWorkspaceDto | undefined {
  if (workspaceName) {
    return getAllWorkspaces().find(ws => ws.name === workspaceName);
  }
  if (workspaceId) {
    return getAllWorkspaces().find(ws => ws.id === workspaceId);
  }
}

/**
 * Gets metadata of all Dynatrace tenants currently registered in the global storage.
 */
export function getAllTenants(): DynatraceTenantDto[] {
  return JSON.parse(readFileSync(getTenantsJsonPath()).toString()) as DynatraceTenantDto[];
}

/**
 * Saves the metadata of a tenant in the global storage. Previous values are overwritten.
 * @param url URL for browser pages of the tenant
 * @param apiUrl URL for API calls to the tenant
 * @param token API Token for Dynatrace API Calls. Note: must be encrypted already.
 * @param name An optional name/label for this environment
 * @param current if true, this will be set as the currently used environment
 */
export async function registerTenant(
  url: string,
  apiUrl: string,
  token: string,
  name?: string,
  current: boolean = false,
) {
  const id = url.includes("/e/") ? url.split("/e/")[1] : url.split("https://")[1].substring(0, 8);
  const tenant: DynatraceTenantDto = { id, url, apiUrl, token, current, label: name ?? id };

  // If this will be the currently used environment, deactivate others
  let tenants = getAllTenants();
  if (current) {
    tenants = tenants.map(t => {
      t.current = t.current ? !t.current : t.current;
      return t;
    });
  }

  // Update any existing entries, otherwise create new
  const index = tenants.findIndex(t => t.id === id);
  if (index === -1) {
    tenants.push(tenant);
  } else {
    tenants[index] = tenant;
  }
  writeFileSync(getTenantsJsonPath(), JSON.stringify(tenants));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numEnvironments",
    tenants.length,
  );
}

/**
 * Removes a Dynatrace Tenant from global extension storage, thus unregistering it from the
 * extension. The tenant is specified by ID.
 */
export async function removeTenant(tenantId: string) {
  const tenants = getAllTenants();
  writeFileSync(getTenantsJsonPath(), JSON.stringify(tenants.filter(t => t.id !== tenantId)));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numEnvironments",
    getAllTenants().length,
  );
}

/**
 * Removes an Extension Workspace from global extension storage, thus unregistering it from
 * the extension. The workspace is specified by path.
 * @param workspaceId id of the workspace to remove
 */
export async function removeWorkspace(workspaceId: string) {
  const workspaces = getAllWorkspaces();
  writeFileSync(
    getWorkspacesJsonPath(),
    JSON.stringify(
      workspaces
        .filter(w => w.id !== workspaceId)
        .map(({ name, id, folder }) => ({
          name,
          id,
          folder: folder.toString(),
        })),
    ),
  );

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numWorkspaces",
    getAllWorkspaces().length,
  );
}

/**
 * Writes an extension simulator summary to the global storage.
 */
export function registerSimulatorSummary(summary: LocalExecutionSummary | RemoteExecutionSummary) {
  const summaries = getSimulatorSummaries();
  summaries.push(summary);
  writeFileSync(getSummariesJsonPath(), JSON.stringify(summaries));
}

/**
 * Gets all extension simulator summaries from the global storage.
 */
export function getSimulatorSummaries(): (LocalExecutionSummary | RemoteExecutionSummary)[] {
  const context = getActivationContext();
  const summariesJson = path.join(context.globalStorageUri.fsPath, "summaries.json");
  return (
    JSON.parse(readFileSync(summariesJson).toString()) as (
      | LocalExecutionSummary
      | RemoteExecutionSummary
    )[]
  ).map(s => ({
    ...s,
    startTime: new Date(s.startTime),
  })) as (LocalExecutionSummary | RemoteExecutionSummary)[];
}

/**
 * Does some basic clean-up of the simulator log files for the current workspace.
 * The user can disable the feature and also control the max number of files kept.
 * The max number of files is not handled per workspace yet.
 */
export function cleanUpSimulatorLogs() {
  const fnLogTrace = [...logTrace, "cleanUpSimulatorLogs"];
  const maxFiles = vscode.workspace
    .getConfiguration("dynatraceExtensions.simulator", null)
    .get<number>("maximumLogFiles");

  // No clean-up is done if user disabled it
  if (maxFiles === undefined || maxFiles < 0) return;

  logger.debug(`Cleaning up simulator logs. Keeping only ${String(maxFiles)} files`, ...fnLogTrace);

  // Order summaries by workspace
  const newSummaries: ExecutionSummary[] = [];
  const summariesByWorkspace: Record<string, ExecutionSummary[] | undefined> = {};
  getSimulatorSummaries().forEach(s => {
    if (!summariesByWorkspace[s.workspace]) {
      summariesByWorkspace[s.workspace] = [];
    }
    summariesByWorkspace[s.workspace]?.push(s);
  });

  // Keep the summaries based on max number of files, delete the rest
  Object.values(summariesByWorkspace).forEach(summaryList => {
    if ((summaryList ?? []).length <= maxFiles) {
      newSummaries.push(...(summaryList ?? []));
    } else {
      summaryList
        ?.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .forEach((summary, i) => {
          if (i < maxFiles) {
            newSummaries.push(summary);
          } else {
            try {
              rmSync(summary.logPath);
            } catch (err) {
              logger.error(
                `Error deleting file "${summary.logPath}": ${(err as Error).message}`,
                ...fnLogTrace,
              );
            }
          }
        });
    }
  });

  // Write the new summaries list to disk
  writeFileSync(getSummariesJsonPath(), JSON.stringify(newSummaries));
}

/**
 * Registers a list of targets for the extension simulator in the global storage.
 */
export function registerSimulatorTargets(targets: RemoteTarget[]) {
  writeFileSync(getTargetsJsonPath(), JSON.stringify(targets));
}

/**
 * Registers a list of targets for the extension simulator in the global storage.
 */
export function registerSimulatorTarget(target: RemoteTarget) {
  const currentTargets = getSimulatorTargets();

  // If target already exists, update the details
  const foundIdx = currentTargets.findIndex(t => t.name === target.name);
  if (foundIdx >= 0) {
    currentTargets[foundIdx] = target;
  } else {
    currentTargets.push(target);
  }

  registerSimulatorTargets(currentTargets);
}

/**
 * Deletes a target from the extension's global storage.
 */
export function deleteSimulatorTarget(target: RemoteTarget) {
  const currentTargets = getSimulatorTargets();
  const newTargets = currentTargets.filter(t => t.name !== target.name);

  writeFileSync(getTargetsJsonPath(), JSON.stringify(newTargets));
}

/**
 * Fetches all extension simulator summaries from the global storage.
 */
export function getSimulatorTargets(): RemoteTarget[] {
  return JSON.parse(readFileSync(getTargetsJsonPath()).toString()) as RemoteTarget[];
}

/**
 * Uploads a given CA certificate to either a OneAgent or ActiveGate's designated certificates
 * folder. The folder gets created if it doesn't exist already.
 * @param certPath path to the CA Certificate file
 * @param component the component where the certificate will be written
 */
export function uploadComponentCert(certPath: string, component: "OneAgent" | "ActiveGate") {
  // Transform filename for easy recognition
  let certFilename = path.basename(path.resolve(certPath));
  const [name, ext = ""] = certFilename.split(".");
  const workspaceName = vscode.workspace.name ?? "generic";
  const fileExtension = ext !== "" ? `.${ext}` : "";
  certFilename = `${name}_${workspaceName}${fileExtension}`;

  // Ensure directory exists
  const uploadDir = getExtensionCertLocation(component);
  const uploadPath = path.join(uploadDir, certFilename);
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // Avoid potential overwrites to some degree
  if (isDifferentFile(certPath, uploadPath)) {
    logger.info(
      `Copying certificate file from ${certPath} to ${uploadDir}`,
      ...logTrace,
      "uploadComponentCert",
    );
    writeFileSync(uploadPath, readFileSync(certPath));
  }
}

/**
 * Reads the extension manifest and returns the contents or an empty string
 * if the file doesn't exist.
 */
export const readExtensionManifest = () => {
  const manifestFilePath = getExtensionFilePath();
  if (manifestFilePath && existsSync(manifestFilePath)) {
    return readFileSync(manifestFilePath).toString();
  }
  return "";
};

/**
 * Searches the known extension workspace path for the extension.yaml file and returns the
 * found result so long as the extension directory is in the root of the workspace or one
 * directory deep (e.g. src/extension/extension.yaml)
 */
export function getExtensionFilePath(): string | undefined {
  if (!vscode.workspace.workspaceFolders) {
    return undefined;
  }
  const workspaceRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  let matches = glob.sync("extension/extension.yaml", { cwd: workspaceRootPath });
  if (matches.length === 0) {
    matches = glob.sync("*/extension/extension.yaml", { cwd: workspaceRootPath });
  }
  if (matches.length > 0) {
    return path.join(workspaceRootPath, matches[0]);
  }
  return undefined;
}

/**
 * Searches the known extension workspace path for the extension directory and returns the
 * found result so long as the extension directory is in the root of the workspace or one
 * directory deep (e.g. src/extension)
 * @returns
 */
export function getExtensionWorkspaceDir(): string | undefined {
  const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) return;

  // Look in root
  const rootEntries = readdirSync(rootPath);
  if (
    rootEntries.includes("extension") &&
    statSync(path.join(rootPath, "extension")).isDirectory()
  ) {
    return path.join(rootPath, "extension");
  }

  // Look one level deep
  const rootFolders = rootEntries.filter(f => statSync(path.join(rootPath, f)).isDirectory());
  for (const folder of rootFolders) {
    const folderEntries = readdirSync(path.join(rootPath, folder));
    if (
      folderEntries.includes("extension") &&
      statSync(path.join(rootPath, folder, "extension")).isDirectory()
    ) {
      return path.join(rootPath, folder, "extension");
    }
  }
}

/**
 * Resolves relative paths correctly. This is needed because VS Code extensions do not have
 * correct awareness of path relativity - they are all rooted in vscode installation directory
 * e.g. "C:\Program Files\Microsoft VS Code"
 */
export function resolveRealPath(pathToResolve: string): string {
  // Absolute paths return straight away
  if (!["~", "..", "."].some(symbol => pathToResolve.includes(symbol))) {
    return path.resolve(pathToResolve);
  }

  if (!vscode.workspace.workspaceFolders) {
    return pathToResolve;
  }

  // Relative paths to be processed further
  const [symbol, ...pathSegments] = pathToResolve.split(path.sep);
  switch (symbol) {
    case "~":
      return path.resolve(os.homedir(), ...pathSegments);
    case ".":
    case "..":
      return path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath, symbol, ...pathSegments);
    default:
      return pathToResolve;
  }
}

/**
 * Writes a .gitignore file for the workspace which applies to Dynatrace Extensions, VSCode, and optionally
 * Python. If the workspace already has a .gitignore, only the lines missing would get added.
 * @param includePython whether the .gitignore needs the Python content or not
 */
export async function writeGititnore(includePython: boolean = false) {
  const fnLogTrace = [...logTrace, "writeGitignore"];
  logger.debug("Writing the workspace's .gitignore file", ...fnLogTrace);

  const VSCODE_IGNORES = [
    ".vscode/*",
    "!.vscode/tasks.json",
    "!.vscode/launch.json",
    "!.vscode/extensions.json",
    "!.vscode/*.code-snippets",
    ".history/",
    "*.vsix",
  ];
  const PYTHON_IGNORES = [
    "*.log",
    "*.py[cod]",
    "*.egg-info",
    "__pycache__",
    "build",
    ".env",
    ".venv",
    "env/",
    "venv/",
  ];
  const COPILOT_IGNORES = ["dist", "config", "logs"];
  const BASE_GITIGNORE = `\
# VS Code
.vscode/*
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# Local History for Visual Studio Code
.history/

# Built Visual Studio Code Extensions
*.vsix

# Dynatrace Extensions builds & configs
config
dist
logs
`;

  const PYTHON_GITIGNORE = `\
# Log files
*.log

# Python
*.py[cod]
*.egg-info
__pycache__

# Environments
.env
.venv
env/
venv/
`;

  const gitignore = await vscode.workspace.findFiles(".gitignore", undefined, 1);

  if (gitignore.length > 0) {
    const existingLines = readFileSync(gitignore[0].fsPath)
      .toString()
      .split("\n")
      .map(l => l.trim());
    const gitignoreLines = [];

    // VS Code ignores
    const vscodeIgnores = VSCODE_IGNORES.filter(line => !existingLines.includes(line));
    if (vscodeIgnores.length > 0) {
      gitignoreLines.push("# VS Code");
      gitignoreLines.push(...vscodeIgnores, "");
    }

    // Dynatrace Extensions ignores
    const extensionIgnores = COPILOT_IGNORES.filter(line => !existingLines.includes(line));
    if (extensionIgnores.length > 0) {
      gitignoreLines.push("# Dynatrace Extensions builds & configs");
      gitignoreLines.push(...extensionIgnores, "");
    }

    // Python ignores
    if (includePython) {
      const pythonIgnores = PYTHON_IGNORES.filter(line => !existingLines.includes(line));
      if (pythonIgnores.length > 0) {
        gitignoreLines.push("# Python");
        gitignoreLines.push(...pythonIgnores, "");
      }
    }

    // Update the content if we added anything
    if (gitignoreLines.length > 0) {
      writeFileSync(gitignore[0].fsPath, [...existingLines, ...gitignoreLines].join("\n"));
    }
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }
    writeFileSync(
      path.join(workspaceFolders[0].uri.fsPath, ".gitignore"),
      BASE_GITIGNORE + (includePython ? PYTHON_GITIGNORE : ""),
    );
  }
}

/**
 * Converts a given string to a valid file name.
 * @param name string to convert
 * @returns valid file name based on string
 */
export function createValidFileName(name: string) {
  // Convert name to lowerCase, only allow \w and - characters
  // It must follow the pattern [a-zA-Z0-9]+([-_./][a-zA-Z0-9]+)*
  const nameForFile = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Only allow a-z, 0-9 and -
    .replace(/-+/g, "-") // Replace multiple '-' with a single '-'
    .replace(/^-+|-+$/g, ""); // Remove leading and trailing '-'

  return nameForFile;
}

/**
 * Creates a unique file name by incrementing an index appended to an initial file name to create a
 * unique combination within the given directory.
 * @param dir directory to check for existing files
 * @param prefix prefix for the file type (e.g. alert, config)
 * @param initialFileName the initial file name
 * @returns unique file name
 */
export function createUniqueFileName(dir: string, prefix: string, initialFileName: string): string {
  // Count how many files we have inside the directory
  const currentFiles = readdirSync(dir);
  let currentFileNumber = currentFiles.length;
  let fileName;

  do {
    currentFileNumber++;
    const nameForFile = createValidFileName(initialFileName);

    // Pad the number with zeros so the lenght is always 3
    const paddedFileNumber = currentFileNumber.toString().padStart(3, "0");
    fileName = `${prefix}-${paddedFileNumber}-${nameForFile}.json`;

    // Check if the file name is unique, otherwise we increment the counter and try again
  } while (currentFiles.includes(fileName));

  return fileName;
}

/**
 * Migrates from the legacy `dt-ext-copilot` extension to the current `dynatrace_extensions`.
 * This involves migrating all global & workspace level storage and settings.
 */
export async function migrateFromLegacyExtension() {
  const context = getActivationContext();
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification },
    async progress => {
      progress.report({ message: "Migrating workspaces and environments" });
      const globalStoragePath = context.globalStorageUri.fsPath;
      const legacyGlobalStoragePath = path.resolve(
        globalStoragePath,
        "..",
        "dynatraceplatformextensions.dt-ext-copilot",
      );
      copySync(legacyGlobalStoragePath, globalStoragePath, { overwrite: true });

      // Convert all environments to new format with apiUrl attribute
      const environments = getAllTenants();
      if (environments.length > 0) {
        writeFileSync(
          path.resolve(globalStoragePath, "dynatraceEnvironments.json"),
          JSON.stringify(environments.map(e => ({ ...{ ...e }, apiUrl: e.url }))),
        );
      }

      progress.report({ message: "Migrating workspace data" });
      const genericWorkspaceStorage = path.resolve(context.storageUri?.fsPath ?? "", "..", "..");
      // Move over all data stored in workspaces
      const workspaces = getAllWorkspaces();
      workspaces.forEach(workspace => {
        const legacyWorkspaceStorage = path.resolve(
          genericWorkspaceStorage,
          workspace.id,
          "DynatracePlatformExtensions.dt-ext-copilot",
        );
        const workspaceStorage = path.resolve(
          genericWorkspaceStorage,
          workspace.id,
          "DynatracePlatformExtensions.dynatrace-extensions",
        );
        copySync(legacyWorkspaceStorage, workspaceStorage, { overwrite: true });
      });

      progress.report({ message: "Migrating global settings" });
      // Change prefix on all global settings
      const settingsKeys = [
        "metricSelectorsCodeLens",
        "entitySelectorsCodeLens",
        "wmiCodeLens",
        "screenCodeLens",
        "fastDevelopmentMode",
        "diagnostics.all",
        "diagnostics.extensionName",
        "diagnostics.metricKeys",
        "diagnostics.cardKeys",
        "diagnostics.snmp",
        "developerCertkeyLocation",
        "rootOrCaCertificateLocation",
        "certificateCommonName",
        "certificateOrganization",
        "certificateOrganizationUnit",
        "certificateStateOrProvince",
        "certificateCountryCode",
      ];
      const legacyConfig = vscode.workspace.getConfiguration("dynatrace", null);
      const config = vscode.workspace.getConfiguration("dynatraceExtensions", null);
      for (const key of settingsKeys) {
        const legacyValue = legacyConfig.inspect(key)?.globalValue;
        if (legacyValue) {
          await config.update(key, legacyValue, true);
        }
      }

      progress.report({ message: "Migrating workspace settings" });
      for (const workspace of workspaces) {
        const settingsFilePath = path.resolve(workspace.folder, ".vscode", "settings.json");
        // For any workspace that has settings
        if (existsSync(settingsFilePath)) {
          // Change the old ID for new one
          let settingsContent = readFileSync(settingsFilePath).toString();
          settingsContent = settingsContent.replace(/dt-ext-copilot/g, "dynatrace-extensions");
          // Update all settings keys
          for (const key of settingsKeys) {
            settingsContent = settingsContent.replace(
              `dynatrace.${key}`,
              `dynatraceExtensions.${key}`,
            );
          }
          writeFileSync(settingsFilePath, settingsContent);
        }
      }

      // Forget Copilot ever existed
      progress.report({ message: "Uninstalling legacy extension" });
      await vscode.commands
        .executeCommand(
          "workbench.extensions.uninstallExtension",
          "DynatracePlatformExtensions.dt-ext-copilot",
        )
        .then(async () => {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        });
    },
  );
  notify("INFO", "Migration from legacy version complete.");
}

/**
 * Returns the path where extension's snmp folder should be.
 * Does not check if it exists.
 */
export function getSnmpDirPath(): string | undefined {
  const manifestFilePath = getExtensionFilePath();
  if (manifestFilePath) {
    return path.resolve(manifestFilePath, "..", "snmp");
  }
  return undefined;
}

/**
 * Looks for local SNMP Mib files bundled with the extension and returns the list of file paths.
 */
export function getSnmpMibFiles(): string[] {
  const snmpDir = getSnmpDirPath();
  if (snmpDir) {
    if (existsSync(snmpDir)) {
      return readdirSync(snmpDir).map(file => path.resolve(snmpDir, file));
    }
  }
  return [];
}

/**
 * Recursively bundles a folder and all its files into the given JSZip object.
 * Does this in a OS-agnostic way by normalizing paths.
 * @param zip zip to bundle into
 * @param folderPath path on the system to bundle
 * @param prev used internally for building the archive paths
 * @returns JSZip
 */
export const bundleFolder = (zip: JSZip, folderPath: string, prev: string = ""): JSZip => {
  readdirSync(folderPath).forEach(entryName => {
    const entryPath = path.join(folderPath, entryName);
    if (statSync(entryPath).isDirectory()) {
      const zipPath = `${prev}${entryName}/`;
      zip.folder(zipPath);
      bundleFolder(zip, entryPath, zipPath);
    } else {
      const zipPath = `${prev}${entryName}`;
      const content = readFileSync(entryPath);
      zip.file(zipPath, content, { unixPermissions: "644" });
    }
  });
  return zip;
};

/**
 * Extracts all contents of an archive into the give folder path.
 * @param zip archive to extract
 * @param destPath destination path
 */
export const extractZip = async (zip: JSZip, destPath: string) => {
  logger.info(`Extracting zip into ${destPath}`, ...logTrace, "extractZip");
  const files = zip.files;

  for (const relativePath in files) {
    const file = files[relativePath];
    if (file) {
      const filePath = path.join(destPath, relativePath);

      if (file.dir) {
        if (!existsSync(filePath)) {
          logger.info(`Creating dir: ${filePath}`);
          mkdirSync(filePath, { recursive: true });
        }
      } else {
        const fileContent = await file.async("nodebuffer");

        if (relativePath.endsWith(".zip")) {
          const innerZip = await JSZip.loadAsync(fileContent);
          await extractZip(innerZip, destPath);
        } else {
          const basePath = filePath.split(path.sep).slice(0, -1).join(path.sep);
          if (!existsSync(basePath)) {
            mkdirSync(basePath, { recursive: true });
          }
          writeFileSync(filePath, fileContent);
        }
      }
    }
  }
};

const getTenantsJsonPath = () => {
  const context = getActivationContext();
  return path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
};

const getWorkspacesJsonPath = () => {
  const context = getActivationContext();
  return path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
};

const getSummariesJsonPath = () => {
  const context = getActivationContext();
  return path.join(context.globalStorageUri.fsPath, "summaries.json");
};

const getTargetsJsonPath = () => {
  const context = getActivationContext();
  return path.join(context.globalStorageUri.fsPath, "targets.json");
};

const getExtensionCertLocation = (component: "OneAgent" | "ActiveGate") => {
  return process.platform === "win32"
    ? component === "OneAgent"
      ? "C:\\ProgramData\\dynatrace\\oneagent\\agent\\config\\certificates"
      : "C:\\ProgramData\\dynatrace\\remotepluginmodule\\agent\\conf\\certificates"
    : component === "OneAgent"
      ? "/var/lib/dynatrace/oneagent/agent/config/certificates"
      : "/var/lib/dynatrace/remotepluginmodule/agent/conf/certificates";
};

const isDifferentFile = (srcPath: string, destPath: string) => {
  return !existsSync(destPath) || (existsSync(destPath) && !hasSameContent(srcPath, destPath));
};

const hasSameContent = (srcPath: string, destPath: string) =>
  readFileSync(srcPath).toString() === readFileSync(destPath).toString();
