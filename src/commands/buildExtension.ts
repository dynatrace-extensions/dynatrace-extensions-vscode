import * as vscode from "vscode";
import * as path from "path";
import AdmZip = require("adm-zip");
import * as yaml from "yaml";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { sign } from "../utils/cryptography";
import { checkValidExtensionName } from "../utils/conditionCheckers";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { normalizeExtensionVersion, incrementExtensionVersion } from "../utils/extensionParsing";
import { FastModeStatus } from "../statusBar/fastMode";

/**
 * Builds an Extension 2.0 and its artefacts into a .zip package ready to upload to Dynatrace.
 * The extension files must all be in an extension folder in the workspace, and developer
 * certificates must be available - either from settings (via file paths) or generated
 * through this extension. If successful, the command is linked to uploading the package
 * to Dynatrace.
 * Note: Only custom extensions may be built/signed using this method.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client if proper validation is to be done
 * @param oc JSON OutputChannel where detailed errors can be logged
 * @returns
 */
export async function buildExtension(context: vscode.ExtensionContext, oc: vscode.OutputChannel, dt?: Dynatrace) {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Building extension",
    },
    async (progress) => {
      progress.report({ message: "Checking the dist folder" });
      // Create the dist folder if it doesn't exist
      const distDir = path.resolve(workspaceRoot, "dist");
      if (!existsSync(distDir)) {
        mkdirSync(distDir);
      }

      progress.report({ message: "Checking your certificates" });
      // Either user's certificates or generated ones will be set in settings
      const devKeyPath = vscode.workspace.getConfiguration("dynatrace", null).get("developerKeyLocation") as string;
      const devCertPath = vscode.workspace
        .getConfiguration("dynatrace", null)
        .get("developerCertificateLocation") as string;

      progress.report({ message: "Validating your extension name" });
      // Extension meta
      const extensionFile = await vscode.workspace
        .findFiles("**/extension/extension.yaml")
        .then((files) => files[0].fsPath);
      const extensionDir = path.resolve(extensionFile, "..");
      const extension = yaml.parse(readFileSync(extensionFile).toString());
      // We can only build custom extensions this way
      if (!checkValidExtensionName(extension.name)) {
        vscode.window.showErrorMessage("Build extension: operation aborted.");
        return false;
      }

      // If extension version conflicts with one on tenant, increment automatically
      progress.report({ message: "Checking version conflicts for extension" });
      const extensionVersion = normalizeExtensionVersion(extension.version);
      const versions = await dt!.extensionsV2
        .listVersions(extension.name)
        .then((ext) => ext.map((e) => e.version))
        .catch(() => [] as string[]);
      if (versions.includes(extensionVersion)) {
        extension.version = incrementExtensionVersion(extensionVersion);
        writeFileSync(extensionFile, yaml.stringify(extension, { lineWidth: 0 }));
        vscode.window.showInformationMessage("Extension version automatically increased.");
      }

      // Build the inner .zip archive
      progress.report({ message: "Building the .zip archive" });
      const innerZip = new AdmZip();
      innerZip.addLocalFolder(extensionDir);
      const innerZipPath = path.resolve(context.storageUri!.fsPath, "extension.zip");
      innerZip.writeZip(innerZipPath);
      console.log(`Built the inner archive: ${innerZipPath}`);

      // Sign the inner .zip archive and write the signature file
      progress.report({ message: "Signing the .zip archive" });
      const signature = sign(innerZipPath, devKeyPath, devCertPath);
      const sigatureFilePath = path.resolve(context.storageUri!.fsPath, "extension.zip.sig");
      writeFileSync(sigatureFilePath, signature);
      console.log(`Wrote the signature file: ${sigatureFilePath}`);

      // Build the outer .zip that includes the inner .zip and the signature file
      progress.report({ message: "Building the final package" });
      const outerZip = new AdmZip();
      const outerZipFilename = `${extension.name.replace(":", "_")}-${extension.version}.zip`;
      const outerZipPath = path.resolve(context.storageUri!.fsPath, outerZipFilename);
      outerZip.addLocalFile(innerZipPath);
      outerZip.addLocalFile(sigatureFilePath);
      outerZip.writeZip(outerZipPath);
      console.log(`Wrote initial outer zip at: ${outerZipPath}`);

      // Validating with the cluster, otherwise no point linking the upload command
      var valid = true;
      const finalZipPath = path.resolve(distDir, outerZipFilename);
      if (dt) {
        progress.report({ message: "Validating the final package contents" });
        await dt.extensionsV2.upload(readFileSync(outerZipPath), true).catch((err: DynatraceAPIError) => {
          vscode.window.showErrorMessage("Extension validation failed.");
          oc.clear();
          oc.appendLine(
            JSON.stringify(
              {
                extension: extension.name,
                version: extension.version,
                message: err.errorParams.message,
                issues: err.errorParams.data.constraintViolations,
              },
              null,
              2
            )
          );
          oc.show();
          valid = false;
        });
      } else {
        vscode.window.showWarningMessage(
          "Your final package was not validated, since you are not connected to a Dynatrace tenant."
        );
      }
      // Copy .zip archive into dist dir
      if (valid) {
        copyFileSync(outerZipPath, finalZipPath);
      }
      // Always remove from extension storage
      rmSync(outerZipPath);

      return valid;
    }
  );

  if (success) {
    // Link to the upload command
    vscode.window
      .showInformationMessage("Extension built successfully. Would you like to upload it to Dynatrace?", "Yes", "No")
      .then((choice) => {
        if (choice === "Yes") {
          vscode.commands.executeCommand("dt-ext-copilot.uploadExtension");
        }
      });
  }
}

/**
 * Builds an extension 2.0 package in Fast Development Mode.
 * This workflow assumes it will be triggerred on document Save so it expects the document
 * (i.e. extension.yaml) as its arguments. The extension is built, signed, and automatically
 * uploaded and activated on the tenant. If the maximum number of versions was reached, the
 * workflow automatically removes either the oldest or the newest version before uploading it.
 * A companion status bar is updated to reflect the status.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @param doc The document that triggered the "Save" (i.e. extension.yaml)
 * @param oc Output Channel where error details can be communicated
 * @param status StatusBar that can be notified of build status
 */
export async function fastModeBuild(
  context: vscode.ExtensionContext,
  dt: Dynatrace,
  doc: vscode.TextDocument,
  oc: vscode.OutputChannel,
  status: FastModeStatus
) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Building extension",
    },
    async (progress) => {
      try {
        // Increment version
        progress.report({ message: "Icrementing version" });
        var extension = yaml.parse(doc.getText().toString());
        extension.version = incrementExtensionVersion(extension.version);
        writeFileSync(doc.fileName, yaml.stringify(extension, { lineWidth: 0 }));
        // Certificates
        progress.report({ message: "Getting certificates" });
        const workspaceConfig = vscode.workspace.getConfiguration("dynatrace", null);
        const devKeyPath = workspaceConfig.get("developerKeyLocation") as string;
        const devCertPath = workspaceConfig.get("developerCertificateLocation") as string;
        // Paths
        progress.report({ message: "Setting file paths" });
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const distDir = path.resolve(workspaceRoot, "dist");
        if (!existsSync(distDir)) {
          mkdirSync(distDir);
        }
        const extensionFile = doc.fileName;
        const extensionDir = path.resolve(extensionFile, "..");
        // Create inner .zip
        progress.report({ message: "Creating archive" });
        const innerZip = new AdmZip();
        innerZip.addLocalFolder(extensionDir);
        const innerZipPath = path.resolve(context.storageUri!.fsPath, "extension.zip");
        innerZip.writeZip(innerZipPath);
        // Sign the inner .zip
        progress.report({ message: "Signing archive" });
        const signature = sign(innerZipPath, devKeyPath, devCertPath);
        const sigatureFilePath = path.resolve(context.storageUri!.fsPath, "extension.zip.sig");
        writeFileSync(sigatureFilePath, signature);
        // Create outer .zip
        progress.report({ message: "Creating package" });
        const outerZip = new AdmZip();
        const outerZipFilename = `${extension.name.replace(":", "_")}-${extension.version}.zip`;
        const outerZipPath = path.resolve(distDir, outerZipFilename);
        outerZip.addLocalFile(innerZipPath);
        outerZip.addLocalFile(sigatureFilePath);
        outerZip.writeZip(outerZipPath);
        // Check upload possible
        progress.report({ message: "Uploading to Dynatrace" });
        var existingVersions = await dt.extensionsV2.listVersions(extension.name).catch((err) => {
          return [];
        });
        if (existingVersions.length >= 10) {
          // Try delete oldest version
          await dt.extensionsV2.deleteVersion(extension.name, existingVersions[0].version).catch(async () => {
            // Try delete newest version
            await dt.extensionsV2.deleteVersion(extension.name, existingVersions[existingVersions.length - 1].version);
          });
        }
        // Upload to Dynatrace & activate version
        await dt.extensionsV2.upload(readFileSync(outerZipPath)).then(() => {
          progress.report({ message: "Activating extension" });
          dt.extensionsV2.putEnvironmentConfiguration(extension.name, extension.version);
        });
        status.updateStatusBar(true, extension.version, true);
        oc.clear();
      } catch (err) {
        // Mark the status bar as build failing
        status.updateStatusBar(true, extension.version, false);
        // Provide details in output channel
        oc.clear();
        if (err instanceof DynatraceAPIError) {
          oc.appendLine(
            JSON.stringify(
              {
                extension: extension.name,
                version: extension.version,
                errorDetails: err.errorParams.data,
              },
              null,
              2
            )
          );
        } else {
          oc.appendLine(
            JSON.stringify(
              {
                extension: extension.name,
                version: extension.version,
                errorDetails: err,
              },
              null,
              2
            )
          );
        }
        oc.show();
      }
    }
  );
}
