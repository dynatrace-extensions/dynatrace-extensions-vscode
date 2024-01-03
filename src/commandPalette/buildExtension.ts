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

import { ExecOptions } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import * as path from "path";
import AdmZip = require("adm-zip");
import { glob } from "glob";
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { FastModeStatus } from "../statusBar/fastMode";
import { loopSafeWait } from "../utils/code";
import { checkDtSdkPresent } from "../utils/conditionCheckers";
import { sign } from "../utils/cryptography";
import { normalizeExtensionVersion, incrementExtensionVersion } from "../utils/extensionParsing";
import { getExtensionFilePath, removeOldestFiles, resolveRealPath } from "../utils/fileSystem";
import * as logger from "../utils/logging";
import { getPythonVenvOpts } from "../utils/otherExtensions";
import { runCommand } from "../utils/subprocesses";

const logTrace = ["commandPalette", "buildExtension"];

type FastModeOptions = {
  status: FastModeStatus;
  document: vscode.TextDocument;
};

/**
 * Carries out general tasks that should be executed before the build workflow.
 * Ensures the dist folder exists and increments the extension version in case there might
 * be a conflict on the tenant (if dt is provided). We also delete any .DS_Store files that
 * will mess up the extension archive for MAC users.
 * @param distDir path to the "dist" directory within the workspace
 * @param extensionFile path to the extension.yaml file
 * @param extensionContent contents of the extension.yaml file
 * @param extensionName the name of the extension
 * @param currentVersion the current version of the extension
 * @param forceIncrement whether to enforce the increment of currentVersion
 * @param dt optional Dynatrace API Client
 */
async function preBuildTasks(
  distDir: string,
  extensionFile: string,
  extensionContent: string,
  extensionName: string,
  currentVersion: string,
  forceIncrement: boolean = false,
  dt?: Dynatrace,
): Promise<string> {
  const fnLogTrace = [...logTrace, "preBuildTasks"];
  // Create the dist folder if it doesn't exist
  if (!existsSync(distDir)) {
    mkdirSync(distDir);
  }

  const versionRegex = /^version: ("?[0-9.]+"?)/gm;
  const nextVersion = incrementExtensionVersion(currentVersion);

  // Delete any .DS_Store files found
  const extensionDir = path.resolve(extensionFile, "..");
  const dsFiles = glob.sync("**/.DS_Store", { cwd: extensionDir });
  dsFiles.forEach(file => {
    try {
      unlinkSync(path.join(extensionDir, file));
    } catch {
      logger.error(`Couldn't delete file ${file}`, ...fnLogTrace);
    }
  });

  if (forceIncrement) {
    // Always increment the version
    writeFileSync(extensionFile, extensionContent.replace(versionRegex, `version: ${nextVersion}`));
    logger.notify("INFO", "Extension version automatically increased.");
    return nextVersion;
  } else if (dt) {
    // Increment the version if there is clash on the tenant
    const versions = await dt.extensionsV2
      .listVersions(extensionName)
      .then(ext => ext.map(e => e.version))
      .catch(() => [] as string[]);
    if (versions.includes(currentVersion)) {
      writeFileSync(
        extensionFile,
        extensionContent.replace(versionRegex, `version: ${nextVersion}`),
      );
      logger.notify("INFO", "Extension version automatically increased.");
      return nextVersion;
    }
  }
  return currentVersion;
}

/**
 * Carries out the archiving and signing parts of the extension build workflow.
 * The intermediary files (inner & outer .zips and signature) are created and stored
 * within the VS Code workspace storage folder to not crowd the user's workspace.
 * @param workspaceStorage path to the VS Code folder for this workspace's storage
 * @param extensionDir path to the "extension" folder within the workspace
 * @param zipFileName the name of the .zip file for this build
 * @param devCertKeyPath the path to the developer's fused credential file
 */
function assembleStandard(
  workspaceStorage: string,
  extensionDir: string,
  zipFileName: string,
  devCertKeyPath: string,
) {
  const fnLogTrace = [...logTrace, "assembleStandard"];
  // Build the inner .zip archive
  const innerZip = new AdmZip();
  innerZip.addLocalFolder(extensionDir);
  const innerZipPath = path.resolve(workspaceStorage, "extension.zip");
  innerZip.writeZip(innerZipPath);
  logger.info(`Built the inner archive: ${innerZipPath}`, ...fnLogTrace);

  // Sign the inner .zip archive and write the signature file
  const signature = sign(innerZipPath, devCertKeyPath);
  const sigatureFilePath = path.resolve(workspaceStorage, "extension.zip.sig");
  writeFileSync(sigatureFilePath, signature);
  logger.info(`Wrote the signature file: ${sigatureFilePath}`, ...fnLogTrace);

  // Build the outer .zip that includes the inner .zip and the signature file
  const outerZip = new AdmZip();
  const outerZipPath = path.resolve(workspaceStorage, zipFileName);
  outerZip.addLocalFile(innerZipPath);
  outerZip.addLocalFile(sigatureFilePath);
  outerZip.writeZip(outerZipPath);
  logger.info(`Wrote initial outer zip at: ${outerZipPath}`, ...fnLogTrace);
}

/**
 * Carries out the archiving and signing parts of the extension build workflow.
 * This function is meant for Python extesnions 2.0, therefore all the steps are carried
 * out through `dt-sdk` which must be available on the machine.
 * @param workspaceStorage path to the VS Code folder for this workspace's storage
 * @param extensionDir path to the root folder of the workspace
 * @param certKeyPath the path to the developer's fused private key & certificate
 * @param oc JSON output channel for communicating errors
 */
async function assemblePython(
  workspaceStorage: string,
  extensionDir: string,
  extraPlatforms: string[] | undefined,
  certKeyPath: string,
  envOptions: ExecOptions,
  oc: vscode.OutputChannel,
  cancelToken: vscode.CancellationToken,
) {
  // By default, we add the linux_x86_64 and/or win_amd64 platforms
  let platformString =
    process.platform === "win32"
      ? "-e linux_x86_64"
      : process.platform === "linux"
      ? "-e win_amd64"
      : "-e linux_x86_64 -e win_amd64";

  // The user's configuration can override this
  if (extraPlatforms && extraPlatforms.length > 0) {
    platformString = `-e ${extraPlatforms.join(" -e ")}`;
  }

  // Build
  await runCommand(
    `dt-sdk build -k "${certKeyPath}" "${extensionDir}" -t "${workspaceStorage}" ${platformString}`,
    oc,
    cancelToken,
    envOptions,
  );
}

/**
 * Validates a finalized extension archive against a Dynatrace tenant, if one is connected.
 * Returns true if either the extension passed validation or no API client is connected.
 * Upon success, the final extension archive is moved into the workspace's "dist" folder and
 * removed from the VSCode workspace storage folder (intermediary location).
 * @param workspaceStorage path to the VS Code folder for this workspace's storage
 * @param zipFileName the name of the .zip file for this build
 * @param distDir path to the "dist" folder within the workspace
 * @param oc JSON output channel for communicating errors
 * @param dt optional Dynatrace API Client (needed for real validation)
 * @returns validation status
 */
async function validateExtension(
  workspaceStorage: string,
  zipFileName: string,
  distDir: string,
  oc: vscode.OutputChannel,
  dt?: Dynatrace,
) {
  let valid = true;
  const outerZipPath = path.resolve(workspaceStorage, zipFileName);
  const finalZipPath = path.resolve(distDir, zipFileName);
  if (dt) {
    valid = await dt.extensionsV2
      .upload(readFileSync(outerZipPath), true)
      .then(() => true)
      .catch(async (err: DynatraceAPIError) => {
        logger.notify("ERROR", "Extension validation failed.");
        oc.replace(JSON.stringify(err.errorParams, null, 2));
        oc.show();
        return false;
      });
  }
  // Copy .zip archive into dist dir
  if (valid) {
    copyFileSync(outerZipPath, finalZipPath);
  }
  // Always remove from extension storage
  rmSync(outerZipPath);

  return valid;
}

/**
 * An all-in-one upload & activation flow designed to be used for fast mode builds.
 * If the extension limit has been reached on tenant, either the first or the last version is
 * removed automatically, the extension uploaded, and immediately activated.
 * This skips any prompts compared to regular flow and does not preform any validation.
 * @param workspaceStorage path to the VS Code folder for this workspace's storage
 * @param zipFileName the name of the .zip file for this build
 * @param distDir path to the "dist" folder within the workspace
 * @param extensionName name of the extension
 * @param extensionVersion version of the extension
 * @param dt Dynatrace API Client
 * @param status status bar to be updated with build status
 * @param oc JSON output channel for communicating errors
 * @param cancelToken command cancellation token
 */
async function uploadAndActivate(
  workspaceStorage: string,
  zipFileName: string,
  distDir: string,
  extensionName: string,
  extensionVersion: string,
  dt: Dynatrace,
  status: FastModeStatus,
  oc: vscode.OutputChannel,
  cancelToken: vscode.CancellationToken,
) {
  try {
    // Check upload possible
    const existingVersions = await dt.extensionsV2.listVersions(extensionName).catch(() => {
      return [];
    });
    if (existingVersions.length >= 10) {
      // Try delete oldest version
      await dt.extensionsV2
        .deleteVersion(extensionName, existingVersions[0].version)
        .catch(async () => {
          // Try delete newest version
          await dt.extensionsV2.deleteVersion(
            extensionName,
            existingVersions[existingVersions.length - 1].version,
          );
        });
    }

    const file = readFileSync(path.resolve(workspaceStorage, zipFileName));
    // Upload to Dynatrace
    let lastError: DynatraceAPIError | undefined;
    let uploadStatus: string;
    do {
      if (cancelToken.isCancellationRequested) {
        return;
      }
      [uploadStatus, lastError] = await dt.extensionsV2
        .upload(file)
        .then(() => ["success", undefined] as [string, undefined])
        .catch(
          (err: DynatraceAPIError) => [err.errorParams.message, err] as [string, DynatraceAPIError],
        );
      // Previous version deletion may not be complete yet, loop until done.
      if (uploadStatus.startsWith("Extension versions quantity limit")) {
        await loopSafeWait(1000);
      }
    } while (uploadStatus.startsWith("Extension versions quantity limit"));

    // Activate extension or throw error
    if (uploadStatus === "success") {
      await dt.extensionsV2.putEnvironmentConfiguration(extensionName, extensionVersion);
    } else {
      if (lastError) {
        throw lastError;
      }
    }

    // Copy .zip archive into dist dir
    copyFileSync(path.resolve(workspaceStorage, zipFileName), path.resolve(distDir, zipFileName));
    status.updateStatusBar(true, extensionVersion, true);
    oc.clear();
  } catch (err: unknown) {
    // Mark the status bar as build failing
    status.updateStatusBar(true, extensionVersion, false);
    // Provide details in output channel
    oc.replace(
      JSON.stringify(
        {
          extension: extensionName,
          version: extensionVersion,
          errorDetails: (err as DynatraceAPIError).errorParams,
        },
        null,
        2,
      ),
    );
    oc.show();
  } finally {
    if (existsSync(path.resolve(workspaceStorage, zipFileName))) {
      rmSync(path.resolve(workspaceStorage, zipFileName));
    }
  }
}

/**
 * Builds an Extension 2.0 and its artefacts into a .zip package ready to upload to Dynatrace.
 * The extension files must all be in an extension folder in the workspace, and developer
 * certificates must be available - either user's own or generated by this extension.
 * If successful, the command is linked to uploading the package to Dynatrace.
 * Note: Only custom extensions may be built/signed using this method.
 * @param context VSCode Extension Context
 * @param oc JSON OutputChannel where detailed errors can be logged
 * @param dt Dynatrace API Client if proper validation is to be done
 * @returns
 */
export async function buildExtension(
  context: vscode.ExtensionContext,
  oc: vscode.OutputChannel,
  dt?: Dynatrace,
  fastMode?: FastModeOptions,
) {
  const fnLogTrace = [...logTrace, "buildExtension"];
  // Basic details we already know exist
  const workspaceStorage = context.storageUri?.fsPath;
  if (!workspaceStorage) {
    return;
  }
  const devCertKeySetting = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string>("developerCertkeyLocation");
  if (!devCertKeySetting) {
    return;
  }
  const devCertKey = resolveRealPath(devCertKeySetting);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return;
  }
  const distDir = path.resolve(workspaceRoot, "dist");
  const extensionFile = fastMode ? fastMode.document.fileName : getExtensionFilePath();
  if (!extensionFile) {
    return;
  }
  const extensionDir = path.resolve(extensionFile, "..");
  // Current name and version
  const extension = readFileSync(extensionFile).toString();
  const nameMatch = /^name: "?([:a-zA-Z0-9.\-_]+)"?/gm.exec(extension);
  if (!nameMatch?.[1]) {
    return;
  }
  const extensionName = nameMatch[1];
  const versionMatch = /^version: "?([0-9.]+)"?/gm.exec(extension);
  if (!versionMatch?.[1]) {
    return;
  }
  const currentVersion = normalizeExtensionVersion(versionMatch[1]);

  const followUpFlow = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Building extension",
      cancellable: true,
    },
    async (progress, cancelToken) => {
      cancelToken.onCancellationRequested(async () => {
        logger.notify("WARN", "Operation cancelled by user.");
      });

      // Handle unsaved changes
      const extensionDocument = vscode.workspace.textDocuments.find(doc =>
        doc.fileName.endsWith("extension.yaml"),
      );
      if (extensionDocument?.isDirty) {
        const saved = await extensionDocument.save();
        if (saved) {
          logger.notify("INFO", "Document saved automatically.");
        } else {
          logger.notify("ERROR", "Failed to save extension manifest. Build command cancelled.");
          return false;
        }
      }
      if (cancelToken.isCancellationRequested) {
        return false;
      }

      // Pre-build workflow
      let updatedVersion = "";
      progress.report({ message: "Checking prerequisites" });
      try {
        updatedVersion = fastMode
          ? await preBuildTasks(
              distDir,
              extensionFile,
              extension,
              extensionName,
              currentVersion,
              true,
              dt,
            )
          : await preBuildTasks(
              distDir,
              extensionFile,
              extension,
              extensionName,
              currentVersion,
              false,
              dt,
            );
      } catch (err: unknown) {
        logger.notify("ERROR", `Error during pre-build phase: ${(err as Error).message}`);
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelToken.isCancellationRequested) {
        return false;
      }

      // Package assembly workflow
      progress.report({ message: "Building extension package" });
      const zipFilename = `${extensionName.replace(":", "_")}-${updatedVersion}.zip`;
      try {
        if (/^python:$/gm.test(extension)) {
          const envOptions = await getPythonVenvOpts();
          const sdkAvailable = await checkDtSdkPresent(oc, cancelToken, envOptions);
          const extraPlatforms = vscode.workspace
            .getConfiguration("dynatraceExtensions", null)
            .get<string[]>("pythonExtraPlatforms");

          if (sdkAvailable) {
            // Wait for the packaging to finish
            await assemblePython(
              workspaceStorage,
              path.resolve(extensionDir, ".."),
              extraPlatforms,
              devCertKey,
              envOptions,
              oc,
              cancelToken,
            );
            // Then, remove the lib folder
            const libDir = path.join(extensionDir, "lib");
            if (existsSync(libDir)) {
              try {
                rmSync(libDir, { recursive: true, force: true });
              } catch (e) {
                logger.error(
                  `Couldn't clean up 'lib' directory. ${(e as Error).message}`,
                  ...fnLogTrace,
                );
              }
            }
          } else {
            logger.notify("ERROR", "Cannot build Python extension - dt-sdk package not available");
            return false;
          }
        } else {
          assembleStandard(workspaceStorage, extensionDir, zipFilename, devCertKey);
        }
      } catch (err: unknown) {
        logger.notify("ERROR", `Error during archiving & signing: ${(err as Error).message}`);
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelToken.isCancellationRequested) {
        return false;
      }

      // Validation & upload workflow
      if (fastMode) {
        progress.report({ message: "Uploading & activating extension" });
        if (!dt) {
          return false;
        }
        await uploadAndActivate(
          workspaceStorage,
          zipFilename,
          distDir,
          extensionName,
          updatedVersion,
          dt,
          fastMode.status,
          oc,
          cancelToken,
        );
        return false;
      } else {
        progress.report({ message: "Validating extension" });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancelToken.isCancellationRequested) {
          return false;
        }
        const valid = await validateExtension(workspaceStorage, zipFilename, distDir, oc, dt);
        return valid;
      }
    },
  );

  // Perform any clean-up as needed
  const maxFiles = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<number>("maxBuildFiles");
  if (maxFiles > 0) {
    removeOldestFiles(distDir, maxFiles);
  }

  // Follow-up is carried out separately to keep notification messages cleaner
  if (followUpFlow) {
    await vscode.window
      .showInformationMessage(
        "Extension built successfully. Would you like to upload it to Dynatrace?",
        "Yes",
        "No",
      )
      .then(async choice => {
        if (choice === "Yes") {
          await vscode.commands.executeCommand("dynatrace-extensions.uploadExtension");
        }
      });
  }
}
