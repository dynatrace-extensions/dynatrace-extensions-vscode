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

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import { glob } from "glob";
import * as vscode from "vscode";
import { DynatraceEnvironmentData, ExtensionWorkspace } from "../interfaces/treeViewData";

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
}

/**
 * Initializes the workspace storage path for the current workspace (assumed to be opened).
 * Given that VS Code storage paths may not exist yet, this function creates it if needed.
 * @param context VSCode Extension Context
 */
export function initWorkspaceStorage(context: vscode.ExtensionContext) {
  const storagePath = context.storageUri?.fsPath;
  if (!storagePath) {
    console.log("No workspace detected.");
    return;
  }
  console.log(`Workspace storage will be at: ${storagePath}`);
  if (!existsSync(storagePath)) {
    mkdirSync(storagePath);
  }
}

/**
 * Saves the metadata of an initialized workspace (assumed to be opened) within the global
 * storage path (extensionWorkspaces.json). If previous metadata exists, it will be overwritten.
 * @param context VSCode Extension Context
 */
export async function registerWorkspace(context: vscode.ExtensionContext) {
  if (!context.storageUri?.fsPath || !vscode.workspace.workspaceFolders) {
    console.log("No workspace to register. Check should be upstream.");
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
    "dt-ext-copilot.numWorkspaces",
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
  token: string,
  name?: string,
  current: boolean = false,
) {
  const environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  let environments = JSON.parse(
    readFileSync(environmentsJson).toString(),
  ) as DynatraceEnvironmentData[];
  const id = url.includes("/e/") ? url.split("/e/")[1] : url.split("https://")[1].substring(0, 8);
  const environment: DynatraceEnvironmentData = {
    id: id,
    url: url,
    token: token,
    name: name,
    current: current,
  };

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
    "dt-ext-copilot.numEnvironments",
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
    "dt-ext-copilot.numEnvironments",
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
    "dt-ext-copilot.numWorkspaces",
    workspaces.length - 1,
  );
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
    console.log(`Copying certificate file from ${certPath} to ${uploadDir}`);
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
  console.log(`Looking for extension.yaml in workspace root: ${workspaceRootPath}`);
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
 * Writes a .gitignore file for the workspace which applies to Copilot, VSCode, and optionally
 * Python. If the workspace already has a .gitignore, only the lines missing would get added.
 * @param includePython whether the .gitignore needs the Python content or not
 */
export async function writeGititnore(includePython: boolean = false) {
  const VSCODE_IGNORES = [
    ".vscode/*",
    "!.vscode/settings.json",
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
  const COPILOT_IGNORES = ["dist", "config"];
  const BASE_GITIGNORE = `\
# VS Code
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# Local History for Visual Studio Code
.history/

# Built Visual Studio Code Extensions
*.vsix

# Copilot builds & configs
config
dist
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

    // Copilot ignores
    const copilotIgnores = COPILOT_IGNORES.filter(line => !existingLines.includes(line));
    if (copilotIgnores.length > 0) {
      gitignoreLines.push("# Copilot builds & configs");
      gitignoreLines.push(...copilotIgnores, "");
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
    writeFileSync(
      path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath, ".gitignore"),
      BASE_GITIGNORE + (includePython ? PYTHON_GITIGNORE : ""),
    );
  }
}
