import * as vscode from "vscode";
import * as path from "path";
import AdmZip = require("adm-zip");
import * as yaml from "yaml";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { sign } from "../utils/cryptography";
import { checkValidExtensionName } from "../utils/conditionCheckers";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { normalizeExtensionVersion } from "../utils/extensionParsing";

/**
 * Builds an Extension 2.0 and its artefacts into a .zip package ready to upload to Dynatrace.
 * The extension files must all be in an extension folder in the workspace, and developer
 * certificates must be available - either from settings (via file paths) or generated
 * through this extension. If successful, the command is linked to uploading the package
 * to Dynatrace.
 * Note: Only custom extensions may be built/signed using this method.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client if proper validation is to be done
 * @returns
 */
export async function buildExtension(context: vscode.ExtensionContext, dt?: Dynatrace) {
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
      const lineCounter = new yaml.LineCounter();
      const extension = yaml.parse(readFileSync(extensionFile).toString(), { lineCounter: lineCounter });
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
        let versionParts = extensionVersion.split(".");
        if (versionParts.length > 1) {
          extension.version = [
            ...versionParts.slice(0, versionParts.length - 1),
            Number(versionParts[versionParts.length - 1]) + 1,
          ].join(".");
        } else {
          extension.version = Number(extension.version) + 1;
        }
        writeFileSync(extensionFile, yaml.stringify(extension, { lineWidth: 0, lineCounter: lineCounter }));
        vscode.window.showInformationMessage("Extension version was increased automatically.");
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
          var oc = vscode.window.createOutputChannel("Dynatrace", "json");
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
