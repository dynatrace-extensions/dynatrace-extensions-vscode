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
  copyFileSync,
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
import * as vscode from "vscode";
import {
  ExecutionSummary,
  LocalExecutionSummary,
  RemoteExecutionSummary,
  RemoteTarget,
} from "../interfaces/simulator";
import { DynatraceEnvironmentData, ExtensionWorkspace } from "../interfaces/treeViews";
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
 * @param context VSCode Extension Context
 */
export function initGlobalStorage(context: vscode.ExtensionContext) {
  const globalStoragePath = context.globalStorageUri.fsPath;
  const extensionWorkspacesJson = path.join(globalStoragePath, "extensionWorkspaces.json");
  const dynatraceEnvironmentsJson = path.join(globalStoragePath, "dynatraceEnvironments.json");
  const idTokenPath = path.join(globalStoragePath, "idToken.txt");
  const targetsJson = path.join(globalStoragePath, "targets.json");
  const summariesJson = path.join(globalStoragePath, "summaries.json");
  const logsDir = path.join(globalStoragePath, "logs");

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
 * @param context VSCode Extension Context
 */
export function initWorkspaceStorage(context: vscode.ExtensionContext) {
  const fnLogTrace = [...logTrace, "initWorkspaceStorage"];
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
 * @param context VSCode Extension Context
 */
export async function registerWorkspace(context: vscode.ExtensionContext) {
  if (!context.storageUri?.fsPath || !vscode.workspace.workspaceFolders) {
    logger.error(
      "No workspace to register. Check should be upstream.",
      ...logTrace,
      "registerWorkspace",
    );
    return;
  }
  const workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  const workspaces = JSON.parse(readFileSync(workspacesJson).toString()) as ExtensionWorkspace[];
  const workspace: ExtensionWorkspace = {
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

  writeFileSync(workspacesJson, JSON.stringify(workspaces));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numWorkspaces",
    workspaces.length,
  );
}

/**
 * Gets metadata of all extension workspaces currently registered in the global storage.
 * @param context VSCode Extension Context
 * @returns all workspaces
 */
export function getAllWorkspaces(context: vscode.ExtensionContext): ExtensionWorkspace[] {
  const workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  return (JSON.parse(readFileSync(workspacesJson).toString()) as ExtensionWorkspace[]).map(
    (extension: ExtensionWorkspace) =>
      ({
        id: extension.id,
        name: extension.name,
        folder: vscode.Uri.parse(decodeURI(extension.folder as string)),
      } as ExtensionWorkspace),
  );
}

/**
 * Finds a workspace (from globally stored metadata) by either its name or its id.
 * @param workspaceName Name of the workspace to find
 * @param workspaceId ID of the workspace to find
 * @param context VSCode Extension Context
 * @returns The workspace, if found, or undefined otherwise
 */
export function findWorkspace(
  context: vscode.ExtensionContext,
  workspaceName?: string,
  workspaceId?: string,
): ExtensionWorkspace | undefined {
  if (workspaceName) {
    return getAllWorkspaces(context).find(ws => ws.name === workspaceName);
  }
  if (workspaceId) {
    return getAllWorkspaces(context).find(ws => ws.id === workspaceId);
  }
}

/**
 * Gets metadata of all Dynatrace environments currently registered in the global storage.
 * @param context VSCode Extension Context
 * @returns all environments
 */
export function getAllEnvironments(context: vscode.ExtensionContext): DynatraceEnvironmentData[] {
  const environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  return JSON.parse(readFileSync(environmentsJson).toString()) as DynatraceEnvironmentData[];
}

/**
 * Saves the metadata of a workspace in the global storage. If previous metadata exists, it
 * will be overwritten.
 * @param context VSCode Extension Context
 * @param url URL for this environment
 * @param token API Token for Dynatrace API Calls. Note: this is stored as is, so encrypt it
 *              before sending it through
 * @param name An optional name/label for this environment
 * @param current if true, this will be set as the currently used environment
 */
export async function registerEnvironment(
  context: vscode.ExtensionContext,
  url: string,
  apiUrl: string,
  token: string,
  name?: string,
  current: boolean = false,
) {
  const environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  let environments = JSON.parse(
    readFileSync(environmentsJson).toString(),
  ) as DynatraceEnvironmentData[];
  const id = url.includes("/e/") ? url.split("/e/")[1] : url.split("https://")[1].substring(0, 8);
  const environment: DynatraceEnvironmentData = { id, url, apiUrl, token, name, current };

  // If this will be the currently used environment, deactivate others
  if (current) {
    environments = environments.map(e => {
      e.current = e.current ? !e.current : e.current;
      return e;
    });
  }

  // Update any existing entries, otherwise create new
  const index = environments.findIndex(e => e.id === id);
  if (index === -1) {
    environments.push(environment);
  } else {
    environments[index] = environment;
  }
  writeFileSync(environmentsJson, JSON.stringify(environments));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numEnvironments",
    environments.length,
  );
}

/**
 * Removes a Dynatrace Environment from global extension storage, thus unregistering it from the
 * extension. The environment is specified by ID.
 * @param context VSCode Extension Context
 * @param environmentId id of the environment to remove
 */
export async function removeEnvironment(context: vscode.ExtensionContext, environmentId: string) {
  const environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  const environments = JSON.parse(
    readFileSync(environmentsJson).toString(),
  ) as DynatraceEnvironmentData[];

  writeFileSync(environmentsJson, JSON.stringify(environments.filter(e => e.id !== environmentId)));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numEnvironments",
    environments.length - 1,
  );
}

/**
 * Removes an Extension Workspace from global extension storage, thus unregistering it from
 * the extension. The workspace is specified by path.
 * @param context VSCode Extension Context
 * @param workspaceId id of the workspace to remove
 */
export async function removeWorkspace(context: vscode.ExtensionContext, workspaceId: string) {
  const workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  const workspaces = JSON.parse(readFileSync(workspacesJson).toString()) as ExtensionWorkspace[];

  writeFileSync(workspacesJson, JSON.stringify(workspaces.filter(w => w.id !== workspaceId)));

  // Update the state
  await vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extensions.numWorkspaces",
    workspaces.length - 1,
  );
}

/**
 * Writes an extension simulator summary to the global storage.
 * @param context - VSCode Extension Context
 * @param summary - the summary to write
 */
export function registerSimulatorSummary(
  context: vscode.ExtensionContext,
  summary: LocalExecutionSummary | RemoteExecutionSummary,
) {
  const summariesJson = path.join(context.globalStorageUri.fsPath, "summaries.json");
  const summaries = JSON.parse(readFileSync(summariesJson).toString()) as (
    | LocalExecutionSummary
    | RemoteExecutionSummary
  )[];
  summaries.push(summary);
  writeFileSync(summariesJson, JSON.stringify(summaries));
}

/**
 * Gets all extension simulator summaries from the global storage.
 * @param context - VSCode Extension Context
 * @returns all summaries
 */
export function getSimulatorSummaries(
  context: vscode.ExtensionContext,
): (LocalExecutionSummary | RemoteExecutionSummary)[] {
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
 * @param context - Extension Context
 */
export function cleanUpSimulatorLogs(context: vscode.ExtensionContext) {
  // eslint-disable-next-line no-secrets/no-secrets
  const fnLogTrace = [...logTrace, "cleanUpSimulatorLogs"];
  const maxFiles = vscode.workspace
    .getConfiguration("dynatraceExtensions.simulator", null)
    .get<number>("maximumLogFiles");

  // No clean-up is done if user disabled it
  if (!maxFiles || maxFiles < 0) return;

  logger.debug(`Cleaning up simulator logs. Keeping only ${String(maxFiles)} files`, ...fnLogTrace);

  // Order summaries by workspace
  const newSummaries: ExecutionSummary[] = [];
  const summariesByWorkspace: Record<string, ExecutionSummary[] | undefined> = {};
  getSimulatorSummaries(context).forEach(s => {
    if (!summariesByWorkspace[s.workspace]) {
      summariesByWorkspace[s.workspace] = [];
    }
    summariesByWorkspace[s.workspace]?.push(s);
  });

  // Keep the summaries based on max number of files, delete the rest
  Object.values(summariesByWorkspace).forEach(summaryList => {
    if ((summaryList ?? []).length <= maxFiles - 1) {
      newSummaries.push(...(summaryList ?? []));
    } else {
      summaryList
        ?.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .forEach((summary, i) => {
          if (i < maxFiles - 1) {
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
  const summariesPath = path.join(context.globalStorageUri.fsPath, "summaries.json");
  writeFileSync(summariesPath, JSON.stringify(newSummaries));
}

/**
 * Registers a list of targets for the extension simulator in the global storage.
 * @param context - VSCode Extension Context
 * @param targets - the targets to write
 */
export function registerSimulatorTargets(
  context: vscode.ExtensionContext,
  targets: RemoteTarget[],
) {
  const targetsJson = path.join(context.globalStorageUri.fsPath, "targets.json");
  writeFileSync(targetsJson, JSON.stringify(targets));
}

/**
 * Registers a list of targets for the extension simulator in the global storage.
 * @param context - VSCode Extension Context
 * @param targets - the targets to write
 */
export function registerSimulatorTarget(context: vscode.ExtensionContext, target: RemoteTarget) {
  const targetsJson = path.join(context.globalStorageUri.fsPath, "targets.json");
  const currentTargets = JSON.parse(readFileSync(targetsJson).toString()) as RemoteTarget[];

  // If target already exists, update the details
  const foundIdx = currentTargets.findIndex(t => t.name === target.name);
  if (foundIdx >= 0) {
    currentTargets[foundIdx] = target;
  } else {
    currentTargets.push(target);
  }

  writeFileSync(targetsJson, JSON.stringify(currentTargets));
}

/**
 * Deletes a target from the extension's global storage.
 * @param context - VSCode Extension Context
 * @param target - the target to delete
 */
export function deleteSimulatorTarget(context: vscode.ExtensionContext, target: RemoteTarget) {
  const targetsJson = path.join(context.globalStorageUri.fsPath, "targets.json");
  const currentTargets = JSON.parse(readFileSync(targetsJson).toString()) as RemoteTarget[];

  const newTargets = currentTargets.filter(t => t.name !== target.name);

  writeFileSync(targetsJson, JSON.stringify(newTargets));
}

/**
 * Fetches all extension simulator summaries from the global storage.
 * @param context - VSCode Extension Context
 * @returns - all targets
 */
export function getSimulatorTargets(context: vscode.ExtensionContext): RemoteTarget[] {
  const targetsJson = path.join(context.globalStorageUri.fsPath, "targets.json");
  return JSON.parse(readFileSync(targetsJson).toString()) as RemoteTarget[];
}

/**
 * Uploads a given CA certificate to either a OneAgent or ActiveGate's designated certificates
 * folder. The folder gets created if it doesn't exist already.
 * @param certPath path to the CA Certificate file
 * @param component the component where the certificate will be written
 */
export function uploadComponentCert(certPath: string, component: "OneAgent" | "ActiveGate") {
  let certFilename = path.basename(path.resolve(certPath));

  const uploadDir =
    process.platform === "win32"
      ? component === "OneAgent"
        ? "C:\\ProgramData\\dynatrace\\oneagent\\agent\\config\\certificates"
        : "C:\\ProgramData\\dynatrace\\remotepluginmodule\\agent\\conf\\certificates"
      : component === "OneAgent"
      ? "/var/lib/dynatrace/oneagent/agent/config/certificates"
      : "/var/lib/dynatrace/remotepluginmodule/agent/conf/certificates";

  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir);
  }
  // Avoid potential overwrites to some degree
  if (
    (existsSync(path.join(uploadDir, certFilename)) &&
      !(
        readFileSync(certPath).toString() ===
        readFileSync(path.join(uploadDir, certFilename)).toString()
      )) ||
    !existsSync(path.join(uploadDir, certFilename))
  ) {
    logger.info(
      `Copying certificate file from ${certPath} to ${uploadDir}`,
      ...logTrace,
      "uploadComponentCert",
    );
    const [name, ext] = certFilename.split(".");
    certFilename = `${name}_${vscode.workspace.name ?? ""}.${ext}`;
    copyFileSync(certPath, path.join(uploadDir, certFilename));
  }
}

/**
 * Searches the known extension workspace path for the extension.yaml file and returns the
 * found result so long as the extension directory is in the root of the workspace or one
 * directory deep (e.g. src/extension/extension.yaml)
 * @returns
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
    statSync(path.resolve(rootPath, "extension")).isDirectory()
  ) {
    return path.resolve(rootPath, "extension");
  }

  // Look one level deep
  const rootFolders = rootEntries.filter(f => statSync(path.resolve(rootPath, f)).isDirectory());
  for (const folder of rootFolders) {
    const folderEntries = readdirSync(path.resolve(rootPath, folder));
    if (
      folderEntries.includes("extension") &&
      statSync(path.resolve(rootPath, folder, "extension")).isDirectory()
    ) {
      return path.resolve(rootPath, folder, "extension");
    }
  }
}

/**
 * Resolves relative paths correctly. This is needed because VS Code extensions do not have
 * correct awareness of path relativity - they are all rooted in vscode installation directory
 * e.g. "C:\Program Files\Microsoft VS Code"
 * @param pathToResolve
 * @returns resolved absolute path
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
 * This involves migra
 * @param context
 */
export async function migrateFromLegacyExtension(context: vscode.ExtensionContext) {
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
      const environments = getAllEnvironments(context);
      if (environments.length > 0) {
        writeFileSync(
          path.resolve(globalStoragePath, "dynatraceEnvironments.json"),
          JSON.stringify(environments.map(e => ({ ...{ ...e }, apiUrl: e.url }))),
        );
      }

      progress.report({ message: "Migrating workspace data" });
      const genericWorkspaceStorage = path.resolve(context.storageUri?.fsPath ?? "", "..", "..");
      // Move over all data stored in workspaces
      const workspaces = getAllWorkspaces(context);
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
        const settingsFilePath = path.resolve(
          (workspace.folder as vscode.Uri).fsPath,
          ".vscode",
          "settings.json",
        );
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
