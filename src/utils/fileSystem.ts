import * as vscode from "vscode";
import * as path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
  if (!existsSync(context.storageUri!.fsPath)) {
    mkdirSync(context.storageUri!.fsPath);
  }
}

/**
 * Saves the metadata of an initialized workspace (assumed to be opened) within the global
 * storage path (extensionWorkspaces.json). If previous metadata exists, it will be overwritten.
 * @param context VSCode Extension Context
 */
export function registerWorkspace(context: vscode.ExtensionContext) {
  var workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  var workspaces: ExtensionWorkspace[] = JSON.parse(readFileSync(workspacesJson).toString());
  var workspace: ExtensionWorkspace = {
    name: vscode.workspace.name!,
    id: path.basename(path.dirname(context.storageUri!.fsPath)),
    folder: decodeURI(
      JSON.parse(
        readFileSync(
          path.join(path.dirname(context.storageUri!.fsPath), "workspace.json")
        ).toString()
      ).folder
    ),
  };

  var currentIndex = workspaces.findIndex((ws) => ws.id === workspace.id);
  if (currentIndex === -1) {
    workspaces.push(workspace);
  } else {
    workspaces[currentIndex] = workspace;
  }

  writeFileSync(workspacesJson, JSON.stringify(workspaces));

  // Update the state
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numWorkspaces",
    workspaces.length
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
  workspaceId?: string
): ExtensionWorkspace | undefined {
  if (workspaceName) {
    return getAllWorkspaces(context).find((ws) => ws.name === workspaceName);
  }
  if (workspaceId) {
    return getAllWorkspaces(context).find((ws) => ws.id === workspaceId);
  }
}

/**
 * Gets metadata of all extension workspaces currently registered in the global storage.
 * @param context VSCode Extension Context
 * @returns all workspaces
 */
export function getAllWorkspaces(context: vscode.ExtensionContext): ExtensionWorkspace[] {
  var workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  return JSON.parse(readFileSync(workspacesJson).toString()).map(
    (extension: ExtensionWorkspace) =>
      ({
        id: extension.id,
        name: extension.name,
        folder: vscode.Uri.parse(decodeURI(extension.folder as string)),
      } as ExtensionWorkspace)
  );
}

/**
 * Gets metadata of all Dynatrace environments currently registered in the global storage.
 * @param context VSCode Extension Context
 * @returns all environments
 */
export function getAllEnvironments(context: vscode.ExtensionContext): DynatraceEnvironmentData[] {
  var environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  return JSON.parse(readFileSync(environmentsJson).toString());
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
export function registerEnvironment(
  context: vscode.ExtensionContext,
  url: string,
  token: string,
  name?: string,
  current: boolean = false
) {
  var environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  var environments: DynatraceEnvironmentData[] = JSON.parse(
    readFileSync(environmentsJson).toString()
  );
  let id = url.includes("/e/") ? url.split("/e/")[1] : url.split("https://")[1].substring(0, 8);
  var environment: DynatraceEnvironmentData = {
    id: id,
    url: url,
    token: token,
    name: name,
    current: current,
  };

  // If this will be the currently used environment, deactivate others
  if (current) {
    environments = environments.map((e) => {
      e.current = e.current ? !e.current : e.current;
      return e;
    });
  }

  // Update any existing entries, otherwise create new
  let index = environments.findIndex((e) => e.id === id);
  if (index === -1) {
    environments.push(environment);
  } else {
    environments[index] = environment;
  }
  writeFileSync(environmentsJson, JSON.stringify(environments));

  // Update the state
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numEnvironments",
    environments.length
  );
}

/**
 * Removes a Dynatrace Environment from global extension storage, thus unregistering it from the
 * extension. The environment is specified by ID.
 * @param context VSCode Extension Context
 * @param environmentId id of the environment to remove
 */
export function removeEnvironment(context: vscode.ExtensionContext, environmentId: string) {
  var environmentsJson = path.join(context.globalStorageUri.fsPath, "dynatraceEnvironments.json");
  var environments: DynatraceEnvironmentData[] = JSON.parse(
    readFileSync(environmentsJson).toString()
  );

  writeFileSync(
    environmentsJson,
    JSON.stringify(environments.filter((e) => e.id !== environmentId))
  );

  // Update the state
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numEnvironments",
    environments.length - 1
  );
}

/**
 * Removes an Extension Workspace from global extension storage, thus unregistering it from
 * the extension. The workspace is specified by path.
 * @param context VSCode Extension Context
 * @param workspaceId id of the workspace to remove
 */
export function removeWorkspace(context: vscode.ExtensionContext, workspaceId: string) {
  var workspacesJson = path.join(context.globalStorageUri.fsPath, "extensionWorkspaces.json");
  var workspaces: ExtensionWorkspace[] = JSON.parse(readFileSync(workspacesJson).toString());

  writeFileSync(workspacesJson, JSON.stringify(workspaces.filter((w) => w.id !== workspaceId)));

  // Update the state
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numWorkspaces",
    workspaces.length - 1
  );
}
