import * as path from "path";
import * as vscode from "vscode";
import { glob } from "glob";
import { existsSync, readdirSync, readFileSync } from "fs";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { env } from "process";
import axios from "axios";

/**
 * Checks whether one or more VSCode settings are configured.
 * Does not differentiate whether the setting has been set at global or workspace level.
 * @param settings VSCode settings IDs
 * @returns check status
 */
export function checkSettings(...settings: string[]): boolean {
  let config = vscode.workspace.getConfiguration("dynatrace", null);
  let status = true;
  settings.forEach((setting) => {
    if (!config.get(setting)) {
      vscode.window
        .showErrorMessage(`Missing one or more required settings. Check ${setting}`, "Open settings")
        .then((opt) => {
          if (opt === "Open settings") {
            vscode.commands.executeCommand("workbench.action.openSettings", "Dynatrace");
          }
        });
      status = false;
    }
  });
  return status;
}

/**
 * Checks whether a Dynatrace Environment is selected for use.
 * @param environmentsTree environments tree data provider
 * @returns check status
 */
export function checkEnvironmentConnected(environmentsTree: EnvironmentsTreeDataProvider): boolean {
  if (!environmentsTree.getCurrentEnvironment()) {
    vscode.window.showErrorMessage("You must be connected to a Dynatrace Environment to use this command.");
    return false;
  }

  return true;
}

/**
 * Checks whether a workspace is open within the current window or not.
 * @returns check status
 */
export function checkWorkspaceOpen(): boolean {
  var status = true;
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("You must be inside a workspace to use this command.", "Open folder").then((opt) => {
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
 * @returns check status
 */
export function isExtensionsWorkspace(context: vscode.ExtensionContext): boolean {
  var status = false;
  if (context.storageUri && existsSync(context.storageUri.fsPath)) {
    status =
      glob.sync("**/extension/extension.yaml", {
        cwd: vscode.Uri.parse(
          decodeURI(
            JSON.parse(readFileSync(path.join(path.dirname(context.storageUri.fsPath), "workspace.json")).toString())
              .folder
          )
        ).fsPath,
      }).length > 0;
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

  if (type === "ca" || type === "all") {
    if (!caCertPath) {
      allExist = false;
    } else if (!existsSync(caCertPath as string)) {
      allExist = false;
    }
  }
  if (type === "dev" || type === "all") {
    if (!(devKeyPath && devCertPath)) {
      allExist = false;
    } else if (!(existsSync(devKeyPath as string) && existsSync(devCertPath as string))) {
      allExist = false;
    }
  }

  if (!allExist) {
    vscode.window
      .showErrorMessage(
        "Workspace does not have the required certificates associated with it.",
        "Generate new ones",
        "Open settings"
      )
      .then((opt) => {
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
    if (readdirSync(distDir).filter((i) => i.endsWith(".zip")).length === 0) {
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
  if (!checkGradleProperties()) {
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
    .then((res) => res.status === 200)
    .catch(() => false);
}

/**
 * Checks the repo's Gradle properties and verifies it's pointing to artifactory.
 * @returns status of check
 */
async function checkGradleProperties(): Promise<Boolean> {
  // Must have gradle.properties file
  const files = await vscode.workspace.findFiles("**/gradle.properties");
  if (files.length === 0) {
    return false;
  }
  // Must have our repositoryBaseURL and releaseRepository
  const props = readFileSync(files[0].fsPath).toString();
  const baseUrlMatches = /repositoryBaseURL=(.*)/.exec(props);
  if (!baseUrlMatches || baseUrlMatches[1] !== "https://artifactory.lab.dynatrace.org/artifactory") {
    return false;
  }
  const repoMatches = /releaseRepository=(.*)/.exec(props);
  if (!repoMatches || repoMatches[1] !== "extensions-release") {
    return false;
  }
  return true;
}
