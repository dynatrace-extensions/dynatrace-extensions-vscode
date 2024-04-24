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
import { getActivationContext } from "../extension";
import { showFastModeStatusBar } from "../statusBar/fastMode";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { useMemo } from "../utils/caching";
import { loopSafeWait } from "../utils/general";
import {
  checkCertificateExists,
  checkDtSdkPresent,
  checkNoProblemsInManifest,
  checkTenantConnected,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "../utils/conditionCheckers";
import { sign } from "../utils/cryptography";
import { normalizeExtensionVersion, incrementExtensionVersion } from "../utils/extensionParsing";
import { getExtensionFilePath, removeOldestFiles, resolveRealPath } from "../utils/fileSystem";
import * as logger from "../utils/logging";
import { getPythonVenvOpts } from "../utils/otherExtensions";
import { runCommand } from "../utils/subprocesses";

const logTrace = ["commandPalette", "buildExtension"];

/**
 * A workflow that builds an extension 2.0 package from the user's workspace.
 */
export const buildExtensionWorkflow = async () => {
  if (
    (await checkWorkspaceOpen()) &&
    (await isExtensionsWorkspace()) &&
    (await checkCertificateExists("dev")) &&
    (await checkNoProblemsInManifest())
  ) {
    await buildExtension();
  }
};

/**
 * A workflow that should be used with a document change event.
 * It triggers a faster build workflow that automatically uploads the package to Dynatrace.
 */
export const fastModeBuildWorkflow = async (doc: vscode.TextDocument) => {
  if (
    vscode.workspace
      .getConfiguration("dynatraceExtensions", null)
      .get<boolean>("fastDevelopmentMode") &&
    doc.fileName.endsWith("extension.yaml") &&
    (await isExtensionsWorkspace(false)) &&
    (await checkTenantConnected())
  ) {
    await buildExtension(doc.fileName, true);
  }
};

/**
 * Builds an Extension 2.0 and its artefacts into a .zip package ready to upload to Dynatrace.
 * If successful, the command is linked to uploading the package to Dynatrace.
 */
async function buildExtension(filePath?: string, fastMode: boolean = false) {
  const manifestFilePath = await filePathMemo(filePath ?? getExtensionFilePath());

  const fnLogTrace = [...logTrace, "buildExtension"];
  logger.info("Executing Build Extension command", ...fnLogTrace);
  const oc = fastMode ? logger.getFastModeChannel() : logger.getGenericChannel();
  const manifestFileContent = readFileSync(manifestFilePath).toString();

  const promptForUpload = await vscode.window
    .withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Building extension",
        cancellable: true,
      },
      async (progress, cancelToken) => {
        const abortController = new AbortController();
        const signal = abortController.signal;
        cancelToken.onCancellationRequested(async () => {
          logger.notify("WARN", "Operation cancelled.", ...fnLogTrace);
          abortController.abort();
          throw Error("Operation cancelled.");
        });

        await saveFileChanges();

        progress.report({ message: "Checking prerequisites" });
        await preBuildTasks(manifestFileContent, fastMode, signal);
        const extensionVersion = getExtensionVersion(readFileSync(manifestFilePath).toString());

        progress.report({ message: "Building extension package" });
        if (isPythonExtension(manifestFileContent)) {
          await assemblePython(oc, cancelToken);
        } else {
          await assembleStandard(manifestFileContent, extensionVersion);
        }

        if (fastMode) {
          progress.report({ message: "Uploading & activating extension" });
          await uploadAndActivate(manifestFileContent, extensionVersion, signal);
          return false;
        } else {
          progress.report({ message: "Validating extension" });
          const zipFileName = getZipFilename(manifestFileContent, extensionVersion);
          const isValid = await validateExtension(zipFileName, oc, signal);
          return isValid;
        }
      },
    )
    .then(
      status => status,
      err => {
        logger.notify("ERROR", (err as Error).message, ...fnLogTrace);
        return false;
      },
    );

  removeOldBuildFiles();
  await clearFilePathMemo();
  await clearDtMemo();

  // Follow-up is carried out separately to keep notification messages cleaner
  if (promptForUpload) {
    logger.debug("Follow-up flow available. Prompting for upload.", ...fnLogTrace);
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

const saveFileChanges = async () => {
  const fnLogTrace = [...logTrace, "saveFileChanges"];
  const manifestFilePath = await filePathMemo();
  const extensionDocument = vscode.workspace.textDocuments.find(
    doc => doc.fileName === manifestFilePath,
  );
  if (extensionDocument?.isDirty) {
    const saved = await extensionDocument.save();
    if (saved) {
      logger.notify("INFO", "Document saved automatically.", ...fnLogTrace);
    } else {
      throw Error("Manifest file has unsaved changes that could not be saved.");
    }
  }
};

const filePathMemo = async (manifestFilePath?: string) => {
  const value = await useMemo<string | undefined>(() => manifestFilePath, []);
  if (!value) throw Error("Extension manifest file does not exist.");
  return value;
};

const clearFilePathMemo = async (manifestFilePath?: string) => {
  await useMemo(() => manifestFilePath, [], true);
};

const dtMemo = async () => {
  const value = await useMemo<Dynatrace | undefined>(getDynatraceClient, []);
  return value;
};

const clearDtMemo = async () => {
  await useMemo(getDynatraceClient, [], true);
};

/**
 * Carries out general tasks that should be executed before the build workflow.
 * @param manifestFileContent content of the manifest file
 * @param forceIncrement whether to enforce the increment of currentVersion
 */
async function preBuildTasks(
  manifestFileContent: string,
  forceIncrement: boolean = false,
  signal?: AbortSignal,
) {
  try {
    ensureDistDirExists();
    removeInvalidDsStoreFiles(await getManifestDirPath());

    const extensionName = getExtensionName(manifestFileContent);
    const currentVersion = getExtensionVersion(manifestFileContent);

    if (forceIncrement || (await shouldIncrementVersion(extensionName, currentVersion, signal))) {
      const incrementedVersion = incrementExtensionVersion(currentVersion);
      writeFileSync(
        await filePathMemo(),
        manifestFileContent.replace(/^version: ("?[0-9.]+"?)/gm, `version: ${incrementedVersion}`),
      );
      logger.notify("INFO", "Extension version automatically increased.");
    }
  } catch (err) {
    throw Error(`Error during pre-build phase: ${(err as Error).message}`);
  }
}

/**
 * Ensures the dist directory exists by creating it if needed.
 */
const ensureDistDirExists = () => {
  const distDir = getDistDir();
  if (!existsSync(distDir)) {
    mkdirSync(distDir);
  }
};

/**
 * Deletes any .DS_Store files (created automatically on MAC) from the extension directory.
 */
const removeInvalidDsStoreFiles = (extensionDir: string) => {
  const dsFiles = glob.sync("**/.DS_Store", { cwd: extensionDir });
  dsFiles.forEach(file => {
    try {
      unlinkSync(path.join(extensionDir, file));
    } catch {
      throw Error(`Extension directory contains an invalid file that couldn't be deleted: ${file}`);
    }
  });
};

/**
 * Checks whether the extension version should be incremented to avoid a conflict on cluster side.
 */
const shouldIncrementVersion = async (
  extensionName: string,
  extensionVersion: string,
  signal?: AbortSignal,
) => {
  const dt = await dtMemo();
  if (!dt) return false;

  const fnLogTrace = [...logTrace, "shouldIncrementVersion"];
  logger.debug(
    `Checking version ${extensionVersion} doesn't already exist on tenant.`,
    ...fnLogTrace,
  );
  const deployedVersions = await dt.extensionsV2
    .listVersions(extensionName, signal)
    .then(ext => ext.map(e => e.version))
    .catch(() => [] as string[]);

  return deployedVersions.includes(extensionVersion);
};

const getExtensionVersion = (manifestFileContent: string) => {
  const versionMatch = /^version: "?([0-9.]+)"?/gm.exec(manifestFileContent);
  if (!versionMatch?.[1]) throw Error("Extension version missing from manifest.");
  return normalizeExtensionVersion(versionMatch[1]);
};

const isPythonExtension = (manifestFileContent: string) => /^python:$/gm.test(manifestFileContent);

/**
 * Archives and signs a python extension using `dt-sdk`
 * @param oc JSON output channel for communicating errors
 * @param cancelToken workflow cancellation token
 */
async function assemblePython(oc: vscode.OutputChannel, cancelToken: vscode.CancellationToken) {
  try {
    const fnLogTrace = [...logTrace, "assemblePython"];
    logger.debug("Building package for a python extension", ...fnLogTrace);

    const envOptions = await getPythonVenvOpts();
    const sdkAvailable = await checkDtSdkPresent(oc, cancelToken, envOptions);
    if (!sdkAvailable) throw Error("Cannot continue without SDK");

    const platformsParam = getExtraPlatformsParameter();
    logger.debug(`Assembling for python with platform param "${platformsParam}"`, ...fnLogTrace);
    const workspaceStorage = getWorkspaceStorage();
    const certKeyPath = getDevCertKey();
    const setupPyDir = path.resolve(await getManifestDirPath(), "..");

    await runCommand(
      `dt-sdk build -k "${certKeyPath}" -t "${workspaceStorage}" ${platformsParam} "${setupPyDir}"`,
      oc,
      cancelToken,
      envOptions,
    );

    const libDir = path.join(await getManifestDirPath(), "lib");
    if (existsSync(libDir)) {
      try {
        rmSync(libDir, { recursive: true, force: true });
      } catch (e) {
        logger.warn(`Could not remove 'lib' directory: ${(e as Error).message}`, ...fnLogTrace);
      }
    }
  } catch (err) {
    throw Error(`Error during python build phase: ${(err as Error).message}`);
  }
}

const getWorkspaceStorage = () => {
  const workspaceStorage = getActivationContext().storageUri?.fsPath;
  if (!workspaceStorage) throw Error("Workspace storage path does not exist.");
  return workspaceStorage;
};

const getDevCertKey = () => {
  const devCertKeySetting = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string>("developerCertkeyLocation");
  if (!devCertKeySetting) throw Error("Developer certificate setting does not exist.");
  return resolveRealPath(devCertKeySetting);
};

const getDistDir = () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) throw Error("Workspace root path does not exist.");
  return path.resolve(workspaceRoot, "dist");
};

const getManifestDirPath = async () => path.resolve(await filePathMemo(), "..");

const getExtraPlatformsParameter = () => {
  // By default, we add the linux_x86_64 and/or win_amd64 platforms
  let platformString =
    process.platform === "win32"
      ? '-e "linux_x86_64"'
      : process.platform === "linux"
      ? '-e "win_amd64"'
      : '-e "linux_x86_64" -e "win_amd64"';

  // The user's configuration can override this
  const extraPlatforms = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string[]>("pythonExtraPlatforms");
  if (extraPlatforms && extraPlatforms.length > 0) {
    platformString = extraPlatforms.map(extraPlatform => `-e "${extraPlatform}"`).join(" ");
  }

  return platformString;
};

/**
 * Archives and signs a non-python extension.
 * @param manifestFileContent content of the extension manifest
 * @param extensionVersion version of the extension being packaged
 */
async function assembleStandard(manifestFileContent: string, extensionVersion: string) {
  try {
    const fnLogTrace = [...logTrace, "assembleStandard"];
    logger.debug("Building package for a non-python extension", ...fnLogTrace);

    const workspaceStorage = getWorkspaceStorage();
    const zipFileName = getZipFilename(manifestFileContent, extensionVersion);

    // Build the inner .zip archive
    const innerZip = new AdmZip();
    innerZip.addLocalFolder(await getManifestDirPath());
    const innerZipPath = path.resolve(workspaceStorage, "extension.zip");
    innerZip.writeZip(innerZipPath);
    logger.info(`Built the inner archive: ${innerZipPath}`, ...fnLogTrace);

    // Sign the inner .zip archive and write the signature file
    const signature = sign(innerZipPath, getDevCertKey());
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
  } catch (err) {
    throw Error(`Error during standard build phase: ${(err as Error).message}`);
  }
}

const getExtensionName = (manifestFileContent: string) => {
  const nameMatch = /^name: "?([:a-zA-Z0-9.\-_]+)"?/gm.exec(manifestFileContent);
  if (!nameMatch?.[1]) throw Error("Extension name missing from manifest.");
  return nameMatch[1];
};

const getZipFilename = (manifestFileContent: string, version: string) =>
  `${getExtensionName(manifestFileContent).replace(":", "_")}-${version}.zip`;

const removeOldBuildFiles = () => {
  const maxFiles = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<number>("maxBuildFiles");
  if (maxFiles && maxFiles > 0) {
    removeOldestFiles(getDistDir(), maxFiles);
  }
};

/**
 * An all-in-one upload & activation flow designed to be used for fast mode builds.
 * If the extension limit has been reached on tenant, either the first or the last version is
 * removed automatically, the extension uploaded, and immediately activated.
 * This skips any prompts compared to regular flow and does not preform any validation.
 * @param manifestFileContent content of the extension manifest
 * @param extensionVersion version of the extension
 */
async function uploadAndActivate(
  manifestFileContent: string,
  extensionVersion: string,
  signal: AbortSignal,
) {
  const fnLogTrace = [...logTrace, "uploadAndActivate"];
  const dt = await dtMemo();
  if (!dt) {
    logger.warn("Dynatrace client unavailable. Upload not possible", ...fnLogTrace);
    return;
  }
  const oc = logger.getFastModeChannel();
  const workspaceStorage = getWorkspaceStorage();
  const extensionName = getExtensionName(manifestFileContent);
  const zipFileName = getZipFilename(manifestFileContent, extensionVersion);
  try {
    await ensureVersionUploadPossible(extensionName, dt, signal);
    await uploadExtension(zipFileName, dt, signal);
    logger.debug("Activating environment configuration.", ...fnLogTrace);
    await dt.extensionsV2.putEnvironmentConfiguration(extensionName, extensionVersion, signal);

    // Copy .zip archive into dist dir
    copyFileSync(
      path.resolve(workspaceStorage, zipFileName),
      path.resolve(getDistDir(), zipFileName),
    );
    showFastModeStatusBar(extensionVersion, true);
    oc.clear();
  } catch (err: unknown) {
    // Mark the status bar as build failing
    showFastModeStatusBar(extensionVersion, false);
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
 * Ensures uploading a new version of the extension will be possible by checking the maximum limit.
 * If the limit is reached, it will automatically delete either the oldest or newest deployed version.
 */
const ensureVersionUploadPossible = async (
  extensionName: string,
  dt: Dynatrace,
  signal: AbortSignal,
) => {
  const fnLogTrace = [...logTrace, "ensureVersionUploadPossible"];
  const existingVersions = await dt.extensionsV2.listVersions(extensionName, signal).catch(() => {
    return [];
  });
  if (existingVersions.length >= 10) {
    logger.debug(
      "10 Extension versions already on tenant. Attempting to delete oldest one.",
      ...fnLogTrace,
    );
    await dt.extensionsV2
      .deleteVersion(extensionName, existingVersions[0].version, signal)
      .catch(async () => {
        logger.debug("Couldn't delete oldest version. Trying to delete newest one.", ...fnLogTrace);
        await dt.extensionsV2.deleteVersion(
          extensionName,
          existingVersions[existingVersions.length - 1].version,
          signal,
        );
      });
  }
};

/**
 * Uploads an extension package to the Dynatrace tenant.
 */
const uploadExtension = async (fileName: string, dt: Dynatrace, signal: AbortSignal) => {
  const fnLogTrace = [...logTrace, "uploadExtension"];
  const workspaceStorage = getWorkspaceStorage();
  const file = readFileSync(path.resolve(workspaceStorage, fileName));

  let lastError: DynatraceAPIError | undefined;
  let uploadStatus: string;
  do {
    [uploadStatus, lastError] = await dt.extensionsV2
      .upload(file, false, signal)
      .then(() => ["success", undefined] as [string, undefined])
      .catch(
        (err: DynatraceAPIError) => [err.errorParams.message, err] as [string, DynatraceAPIError],
      );
    // Previous version deletion may not be complete yet, loop until done.
    if (uploadStatus.startsWith("Extension versions quantity limit")) {
      await loopSafeWait(1000);
    }
  } while (uploadStatus.startsWith("Extension versions quantity limit"));

  if (uploadStatus !== "success" && lastError) {
    logger.error(`Extension upload failed: ${lastError.message}`, ...fnLogTrace);
    throw lastError;
  }
  logger.debug("Extension upload successful.", ...fnLogTrace);
};

/**
 * Validates a finalized extension archive against a Dynatrace tenant, if one is connected.
 * Returns true if either the extension passed validation or no API client is connected.
 * Upon success, the final extension archive is moved into the workspace's "dist" folder and
 * removed from the VSCode workspace storage folder (intermediary location).
 * @param zipFileName the name of the .zip file for this build
 * @param oc JSON output channel for communicating errors
 * @param signal optional AbortSignal
 * @returns validation status
 */
async function validateExtension(
  zipFileName: string,
  oc: vscode.OutputChannel,
  signal?: AbortSignal,
) {
  let valid = true;
  const outerZipPath = path.resolve(getWorkspaceStorage(), zipFileName);
  const finalZipPath = path.resolve(getDistDir(), zipFileName);
  const dt = await dtMemo();
  if (dt) {
    valid = await dt.extensionsV2
      .upload(readFileSync(outerZipPath), true, signal)
      .then(() => true)
      .catch((err: DynatraceAPIError) => {
        if (err.errorParams.message === "canceled") {
          logger.notify("WARN", "Operation cancelled.");
        } else {
          logger.notify("ERROR", "Extension validation failed.");
          oc.replace(JSON.stringify(err.errorParams, null, 2));
          oc.show();
        }
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
