import * as path from "path";
import * as vscode from "vscode";
import { existsSync, readdirSync, readFileSync } from "fs";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { env } from "process";
import axios from "axios";
import { getExtensionFilePath, resolveRealPath } from "./fileSystem";

/**
 * Checks whether one or more VSCode settings are configured.
 * Does not differentiate whether the setting has been set at global or workspace level.
 * @param settings VSCode settings IDs
 * @returns check status
 */
export function checkSettings(...settings: string[]): boolean {
  let config = vscode.workspace.getConfiguration("dynatrace", null);
  let status = true;
  settings.forEach(setting => {
    if (!config.get(setting)) {
      console.log(`Setting ${setting} not found. Check failed.`);
      vscode.window
        .showErrorMessage(`Missing one or more required settings. Check ${setting}`, "Open settings")
        .then(opt => {
          if (opt === "Open settings") {
            vscode.commands.executeCommand("workbench.action.openSettings", "Dynatrace");
          }
        });
      status = false;
    }
  });
  console.log(`Check - are required settings present? > ${status}`);
  return status;
}

/**
 * Checks whether a Dynatrace Environment is selected for use.
 * @param environmentsTree environments tree data provider
 * @returns check status
 */
export function checkEnvironmentConnected(environmentsTree: EnvironmentsTreeDataProvider): boolean {
  var status = true;
  if (!environmentsTree.getCurrentEnvironment()) {
    vscode.window.showErrorMessage("You must be connected to a Dynatrace Environment to use this command.");
    status = false;
  }

  console.log(`Check - is an environment connected? > ${status}`);
  return status;
}

/**
 * Checks whether a workspace is open within the current window or not.
 * @returns check status
 */
export function checkWorkspaceOpen(): boolean {
  var status = true;
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("You must be inside a workspace to use this command.", "Open folder").then(opt => {
      if (opt === "Open folder") {
        vscode.commands.executeCommand("vscode.openFolder");
      }
    });
    status = false;
  }
  console.log(`Check - is a workspace open? > ${status}`);
  return status;
}

/**
 * Checks whether the currently opened workspace is an Extensions 2.0 workspace or not.
 * @param context VSCode Extension Context
 * @param showWarningMessage when true, displays a warning message to the user
 * @returns check status
 */
export function isExtensionsWorkspace(context: vscode.ExtensionContext, showWarningMessage: boolean = true): boolean {
  var status = false;
  if (context.storageUri && existsSync(context.storageUri.fsPath)) {
    const extensionYaml = getExtensionFilePath(context);
    if (!extensionYaml) {
      if (showWarningMessage) {
        vscode.window.showWarningMessage(
          "This command must be run from an Extensions Workspace. Ensure your `extension` folder is within the root of the workspace."
        );
      }
    } else {
      status = true;
    }
  }

  console.log(`Check - is this an extensions workspace? > ${status}`);
  return status;
}

/**
 * Checks whether the workspace storage already has certificate files and prompts for overwriting.
 * Assumes the workspace storage has already been setup (i.e. path exists).
 * @param context
 * @returns true if operation should continue, false for cancellation
 */
export async function checkOverwriteCertificates(context: vscode.ExtensionContext): Promise<boolean> {
  var status = true;
  var certsDir = path.join(context.storageUri!.fsPath, "certificates");
  if (existsSync(certsDir)) {
    if (existsSync(path.join(certsDir, "dev.pem")) || existsSync(path.join(certsDir, "ca.pem"))) {
      var choice = await vscode.window.showQuickPick(["Yes", "No"], {
        canPickMany: false,
        title: "Workspace already has certificates.",
        placeHolder: "Would you like to generate new ones?",
        ignoreFocusOut: true,
      });
      if (!choice || choice === "No") {
        status = false;
      }
    }
  }
  console.log(`Check - can continue and/or overwrite certificates? > ${status}`);
  return status;
}

/**
 * Checks whether the workspace has certificates associated with it.
 * Assumes the workspace storage has already been setup (i.e. path exists).
 * @param type type of certificates to check for
 * @param context VSCode Extension Context
 * @returns status of check
 */
export function checkCertificateExists(type: "ca" | "dev" | "all"): boolean {
  var allExist = true;
  var devCertPath = vscode.workspace.getConfiguration("dynatrace", null).get("developerCertificateLocation");
  var devKeyPath = vscode.workspace.getConfiguration("dynatrace", null).get("developerKeyLocation");
  var caCertPath = vscode.workspace.getConfiguration("dynatrace", null).get("rootOrCaCertificateLocation");

  console.log(`DEV CERT: ${resolveRealPath(devCertPath as string)}`);
  console.log(`DEV KEY: ${resolveRealPath(devKeyPath as string)}`);

  if (type === "ca" || type === "all") {
    if (!caCertPath) {
      allExist = false;
    } else if (!existsSync(resolveRealPath(caCertPath as string))) {
      allExist = false;
    }
  }
  if (type === "dev" || type === "all") {
    if (!(devKeyPath && devCertPath)) {
      allExist = false;
    } else if (
      !(existsSync(resolveRealPath(devKeyPath as string)) && existsSync(resolveRealPath(devCertPath as string)))
    ) {
      allExist = false;
    }
  }
  console.log(`Check - ${type.toUpperCase()} certificates exist? > ${allExist}`);

  if (!allExist) {
    vscode.window
      .showErrorMessage(
        "Workspace does not have the required certificates associated with it.",
        "Generate new ones",
        "Open settings"
      )
      .then(opt => {
        switch (opt) {
          case "Generate new ones":
            vscode.commands.executeCommand("dt-ext-copilot.generateCertificates");
            break;
          case "Open settings":
            vscode.commands.executeCommand("workbench.action.openSettings", "Dynatrace Certificate Location");
            break;
        }
      });
  }
  return allExist;
}

/**
 * Checks whether the `dist` folder is found in the root of the workspace and
 * whether it has any .zip archives within its contents.
 * @returns status of check
 */
export function checkExtensionZipExists(): boolean {
  if (vscode.workspace.workspaceFolders) {
    var distDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "dist");
    if (readdirSync(distDir).filter(i => i.endsWith(".zip")).length === 0) {
      vscode.window.showErrorMessage("No extension archive was found. Try building one first.");
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Checks whether we're ready for BitBucket operations.
 * This means there is a DTBBPAT environment variable, we can reach the BitBucket URL
 * and we're in a repo that's pointing to artifactory for extensions release.
 * @returns status of check
 */
export async function checkBitBucketReady(): Promise<Boolean> {
  // DTBBPAT - Dynatrace BitBucket Personal Access Token
  if (!env.DTBBPAT) {
    console.log("DTBBPAT is missing. Can't do BB PRs.");
    return false;
  }
  // Dynatrace BitBucket URL
  if (!(await checkUrlReachable("https://bitbucket.lab.dynatrace.org"))) {
    console.log("BitBucket URL not reachable. Can't do BB PRs.");
    return false;
  }
  // Gradle points to artifactory
  if (!checkDtInternalProperties()) {
    console.log("Repo not mapped to artifactory. Can't do BB PRs.");
    return false;
  }
  return true;
}

/**
 * Checks whether a URL returns a 200 response code.
 * @param url the URL to check
 * @returns status of check
 */
export async function checkUrlReachable(url: string): Promise<Boolean> {
  return await axios
    .get(url)
    .then(res => res.status === 200)
    .catch(() => false);
}

/**
 * Checks whether either gradle.properties (all other extensions) or Jenkinsfile (python extensions)
 * exists and the details map back to the Dynatrace Artifactory server.
 * @returns status of check
 */
export async function checkDtInternalProperties(): Promise<Boolean> {
  let status = false;
  // Must have gradle.properties file or Jenkinsfile (for python)
  let hasGradleProps = false;
  let hasJenkinsProps = false;

  // Check if we have gradle.properties first
  let files = await vscode.workspace.findFiles("**/gradle.properties");
  if (files.length === 0) {
    // Check if we have Jenkinsfile instead
    files = await vscode.workspace.findFiles("**Jenkinsfile");
    if (files.length > 0) {
      hasJenkinsProps = true;
    }
  } else {
    hasGradleProps = true;
  }
  // Gradle properties must have our repositoryBaseURL and releaseRepository
  if (hasGradleProps) {
    const props = readFileSync(files[0].fsPath).toString();
    const baseUrlMatches = /repositoryBaseURL=(.*)/.exec(props);
    const repoMatches = /releaseRepository=(.*)/.exec(props);
    if (
      baseUrlMatches &&
      repoMatches &&
      baseUrlMatches[1] === "https://artifactory.lab.dynatrace.org/artifactory" &&
      repoMatches[1] === "extensions-release"
    ) {
      status = true;
    }
  }
  // Jenkins properties must have our rtServer details
  if (hasJenkinsProps) {
    const props = readFileSync(files[0].fsPath).toString();
    const rtServerId = /id: '(.*?)'/.exec(props);
    const rtUrl = /url: "(.*?)"/.exec(props);
    if (
      rtServerId &&
      rtUrl &&
      rtServerId[1] === "EXTENSION_ARTIFACTORY_SERVER" &&
      rtUrl[1] === "https://artifactory.lab.dynatrace.org/artifactory"
    ) {
      status = true;
    }
  }

  console.log(`Check - is this an internal Dynatrace repo? > ${status}`);

  return status;
}

export function checkOneAgentInstalled(): boolean {
  const oaWinPath = "C:\\ProgramData\\dynatrace\\oneagent\\agent\\config";
  const oaLinPath = "/var/lib/dynatrace/oneagent/agent/config";
  const status = process.platform === "win32" ? existsSync(oaWinPath) : existsSync(oaLinPath);

  console.log(`Check - is OneAgent installed locally? > ${status}`);
  return status;
}

export function checkActiveGateInstalled(): boolean {
  const agWinPath = "C:\\ProgramData\\dynatrace\\remotepluginmodule\\agent\\conf";
  const agLinPath = "/var/lib/dynatrace/remotepluginmodule/agent/conf";
  const status = process.platform === "win32" ? existsSync(agWinPath) : existsSync(agLinPath);

  console.log(`Check - is ActiveGate installed locally? > ${status}`);
  return status;
}
