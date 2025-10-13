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
 * UTILITIES FOR CHECKING CONDITIONS AND RETURNING A SIMPLE STATUS OF THE CHECK
 ********************************************************************************/

import { ExecOptions } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import axios from "axios";
import vscode from "vscode";
import { getActivationContext } from "../extension";
import { getConnectedTenant } from "../treeViews/tenantsTreeView";
import { getDiagnostics } from "./diagnostics";
import { getExtensionFilePath, resolveRealPath } from "./fileSystem";
import { setHttpsAgent } from "./general";
import logger from "./logging";
import { runCommand } from "./subprocesses";
import { ConfirmOption, showQuickPickConfirm } from "./vscode";

const logTrace = ["utils", "conditionCheckers"];

/**
 * Checks whether one or more VSCode settings are configured.
 * Does not differentiate whether the setting has been set at global or workspace level.
 * @param settings VSCode settings IDs
 * @returns check status
 */
export async function checkSettings(...settings: string[]): Promise<boolean> {
  const fnLogTrace = [...logTrace, "checkSettings"];
  const config = vscode.workspace.getConfiguration("dynatraceExtensions", null);
  let status = true;
  for (const setting of settings) {
    if (!config.get(setting)) {
      logger.debug(`Setting ${setting} not found. Check failed.`, ...fnLogTrace);
      await vscode.window
        .showErrorMessage(
          `Missing one or more required settings. Check ${setting}`,
          "Open settings",
        )
        .then(async opt => {
          if (opt === "Open settings") {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "@ext:DynatracePlatformExtensions.dynatrace-extensions",
            );
          }
        });
      status = false;
      break;
    }
  }

  logger.info(`Settings ${settings.join(", ")} exist? ${String(status)}`, ...fnLogTrace);
  return status;
}

/**
 * Checks whether a Dynatrace Environment is selected for use.
 * @param environmentsTree environments tree data provider
 * @returns check status
 */
export async function checkTenantConnected(): Promise<boolean> {
  const fnLogTrace = [...logTrace, "checkEnvironmentConnected"];
  let status = true;
  if (!(await getConnectedTenant())) {
    logger.notify(
      "ERROR",
      "You must be connected to a Dynatrace Environment to use this command.",
      ...fnLogTrace,
    );
    status = false;
  }

  logger.info(`Is a tenant connected? ${String(status)}`, ...fnLogTrace);
  return status;
}

/**
 * Checks whether a workspace is open within the current window or not.
 * @param suppressMessaging if false, a message notification will be displayed to the user
 * @returns check status
 */
export async function checkWorkspaceOpen(suppressMessaging: boolean = false): Promise<boolean> {
  let status = true;
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    if (!suppressMessaging) {
      await vscode.window
        .showErrorMessage("You must be inside a workspace to use this command.", "Open folder")
        .then(async opt => {
          if (opt === "Open folder") {
            await vscode.commands.executeCommand("vscode.openFolder");
          }
        });
    }
    status = false;
  }
  logger.info(`Is a workspace open? ${String(status)}`, ...logTrace, "checkWorkspaceOpen");
  return status;
}

/**
 * Checks whether the currently opened workspace is an Extensions 2.0 workspace or not.
 * @param showWarningMessage when true, displays a warning message to the user
 * @returns check status
 */
export async function isExtensionsWorkspace(showWarningMessage: boolean = true): Promise<boolean> {
  const context = getActivationContext();
  const fnLogTrace = [...logTrace, "isExtensionsWorkspace"];
  let status = false;
  if (context.storageUri && existsSync(context.storageUri.fsPath)) {
    const extensionYaml = getExtensionFilePath();
    if (!extensionYaml) {
      if (showWarningMessage) {
        logger.notify(
          "WARN",
          "This command must be run from an Extensions Workspace. " +
            "Ensure your `extension` folder is within the root of the workspace.",
          ...fnLogTrace,
        );
      }
    } else {
      status = true;
    }
  }

  logger.info(`Is this an extensions workspace? ${String(status)}`, ...fnLogTrace);
  return status;
}

/**
 * Checks whether the workspace storage already has certificate files and prompts for overwriting.
 * Assumes the workspace storage has already been setup (i.e. path exists).
 * @returns true if operation should continue, false for cancellation
 */
export async function checkOverwriteCertificates(): Promise<boolean> {
  let status = true;
  const context = getActivationContext();
  const storageUri = context.storageUri?.fsPath;
  if (!storageUri) {
    return false;
  }
  const certsDir = path.join(storageUri, "certificates");
  if (existsSync(certsDir)) {
    if (existsSync(path.join(certsDir, "dev.pem")) || existsSync(path.join(certsDir, "ca.pem"))) {
      const choice = await showQuickPickConfirm({
        title: "Workspace already has certificates.",
        placeHolder: "Would you like to generate new ones?",
        ignoreFocusOut: true,
      });
      if (choice !== ConfirmOption.Yes) {
        status = false;
      }
    }
  }
  logger.info(
    `Can continue and overwrite certificates? ${String(status)}`,
    ...logTrace,
    "checkOverwriteCertificates",
  );
  return status;
}

/**
 * Checks whether the workspace has certificates associated with it.
 * Assumes the workspace storage has already been setup (i.e. path exists).
 * @param type type of certificates to check for
 * @param context VSCode Extension Context
 * @returns status of check
 */
export async function checkCertificateExists(type: "ca" | "dev" | "all"): Promise<boolean> {
  let allExist = true;
  const devCertkeyPath = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string>("developerCertkeyLocation");
  const caCertPath = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string>("rootOrCaCertificateLocation");

  if (type === "ca" || type === "all") {
    if (!caCertPath) {
      allExist = false;
    } else if (!existsSync(resolveRealPath(caCertPath))) {
      allExist = false;
    }
  }
  if (type === "dev" || type === "all") {
    if (!devCertkeyPath) {
      allExist = false;
    } else if (!existsSync(resolveRealPath(devCertkeyPath))) {
      allExist = false;
    }
  }
  logger.info(
    `Does ${type.toUpperCase()} certificates exist? ${String(allExist)}`,
    ...logTrace,
    "checkCertificateExists",
  );

  if (!allExist) {
    await vscode.window
      .showErrorMessage(
        "Workspace does not have the required certificates associated with it.",
        "Generate new ones",
        "Open settings",
      )
      .then(async opt => {
        switch (opt) {
          case "Generate new ones":
            await vscode.commands.executeCommand("dynatrace-extensions.generateCertificates");
            break;
          case "Open settings":
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "Dynatrace Location",
            );
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
export async function checkExtensionZipExists(): Promise<boolean> {
  if (vscode.workspace.workspaceFolders) {
    const distDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "dist");
    if (readdirSync(distDir).filter(i => i.endsWith(".zip")).length === 0) {
      logger.notify(
        "ERROR",
        "No extension archive was found. Try building one first.",
        ...logTrace,
        "checkExtensionZipExists",
      );
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Checks whether a URL returns a 200 response code.
 * @param url the URL to check
 * @param showError whether to print the error received or just supress it
 * @returns status of check
 */
export async function checkUrlReachable(
  baseUrl: string,
  urlPath: string,
  showError: boolean = false,
): Promise<boolean> {
  const url = `${baseUrl}${urlPath}`;
  const fnLogTrace = [...logTrace, "checkUrlReachable"];
  setHttpsAgent(baseUrl);
  const status = await axios
    .get(url, { maxRedirects: 20 })
    .then(res => res.status === 200)
    .catch(err => {
      if (showError) {
        logger.notify("ERROR", (err as Error).message, ...fnLogTrace);
      }
      logger.error(JSON.stringify(err), ...fnLogTrace);
      return false;
    });

  logger.info(`Is URL ${url} reachable? ${String(status)}`, ...fnLogTrace);

  return status;
}

/**
 * Checks whether either gradle.properties (all other extensions) or Jenkinsfile (python extensions)
 * exists and the details map back to the Dynatrace Artifactory server.
 * @returns status of check
 */
export async function checkDtInternalProperties(): Promise<boolean> {
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

  logger.info(
    `Is this an internal Dynatrace repo? ${String(status)}`,
    ...logTrace,
    "checkDtInternalProperties",
  );

  return status;
}

/**
 * Checks whether the OneAgent is installed on the local machine.
 * Note - it is a shallow check, dependent only on installation directory existence!
 * @returns status of check
 */
export function checkOneAgentInstalled(): boolean {
  const oaWinPath = "C:\\ProgramData\\dynatrace\\oneagent\\agent\\config";
  const oaLinPath = "/var/lib/dynatrace/oneagent/agent/config";
  const status = process.platform === "win32" ? existsSync(oaWinPath) : existsSync(oaLinPath);

  logger.info(
    `Is OneAgent installed locally? > ${String(status)}`,
    ...logTrace,
    "checkOneAgentInstalled",
  );
  return status;
}

/**
 * Checks whether the ActiveGate is installed on the local machine.
 * Note - it is a shallow check, dependent only on installation directory existence!
 * @returns status of check
 */
export function checkActiveGateInstalled(): boolean {
  const agWinPath = "C:\\ProgramData\\dynatrace\\remotepluginmodule\\agent\\conf";
  const agLinPath = "/var/lib/dynatrace/remotepluginmodule/agent/conf";
  const status = process.platform === "win32" ? existsSync(agWinPath) : existsSync(agLinPath);

  logger.info(
    `Is ActiveGate installed locally? ${String(status)}`,
    ...logTrace,
    "checkActiveGateInstalled",
  );
  return status;
}

/**
 * Checks whether the DT-SDK is installed on the Python environment.
 * Doesn't care so much about reasoning, just provides the status of the check.
 * @param oc output channel to print to
 * @param cancelToken cancellation token to cancel the process
 * @param envOptions environment options to pass to the subprocess
 * @returns status of check
 */
export async function checkDtSdkPresent(
  oc?: vscode.OutputChannel,
  cancelToken?: vscode.CancellationToken,
  envOptions?: ExecOptions,
): Promise<boolean> {
  const status = await runCommand("dt-sdk version", oc, cancelToken, envOptions)
    .then(() => true)
    .catch(() => false);

  logger.info(`Is dt-sdk available? ${String(status)}`, ...logTrace, "checkDtSdkPresent");

  return status;
}

/**
 * Checks whether VSCode has any diagnostics (problems) registered on the extension manifest
 * with severity "Error". This can be used if to check if extension should be built or not.
 * @returns true if no problems, false otherwise
 */
export const checkNoProblemsInManifest = async (): Promise<boolean> => {
  const fnLogTrace = [...logTrace, "checkNoProblemsInManifest"];
  let status = true;

  const extensionYamlFile = getExtensionFilePath();
  if (!extensionYamlFile) return false;
  const extensionYamlFileUri = vscode.Uri.file(extensionYamlFile);

  const diagnostics = [
    ...getDiagnostics(extensionYamlFileUri),
    ...vscode.languages.getDiagnostics(extensionYamlFileUri),
  ];

  if (
    diagnostics.length > 0 &&
    diagnostics.findIndex(diag => diag.severity === vscode.DiagnosticSeverity.Error) > -1
  ) {
    logger.notify("ERROR", "Extension cannot be built. Fix problems first.", ...fnLogTrace);
    await vscode.commands.executeCommand("workbench.action.problems.focus");
    status = false;
  }

  logger.info(`Are there problems in the manifest? ${String(status)}`, ...fnLogTrace);
  return status;
};
