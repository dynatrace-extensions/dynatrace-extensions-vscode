import * as vscode from "vscode";
import * as path from "path";
import AdmZip = require("adm-zip");
import * as yaml from "yaml";
import { pki, md, util, asn1, pkcs7 } from "node-forge";
import { constants, createHash, createSign } from "crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { exec } from "child_process";

/**
 * THIS FUNCTIONALITY IS WORK IN PROGRESS. IT MAY OR MAY NOT WORK.
 * @param context
 * @returns
 */
export async function buildExtension(context: vscode.ExtensionContext) {
  var extensionFile = await vscode.workspace.findFiles("**/extension.yaml");

  if (vscode.workspace.workspaceFolders) {
    // Create the dist folder if it doesn't exist
    var rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    var distDir = vscode.Uri.file(path.resolve(path.join(rootPath, "dist")));
    if (!vscode.workspace.getWorkspaceFolder(distDir)) {
      vscode.workspace.fs.createDirectory(distDir);
    }
    var extensionDir = path.dirname(extensionFile[0].fsPath);
    var devKeyPath;
    var devCertPath;

    // WORKAROUND UNTIL DIY SNIPPET IS FIXED
    if (
      existsSync(path.join(context.storageUri!.fsPath, "certificates", "dev.key")) &&
      existsSync(path.join(context.storageUri!.fsPath, "certificates", "dev.pem"))
    ) {
      devKeyPath = path.join(context.storageUri!.fsPath, "certificates", "dev.key");
      devCertPath = path.join(context.storageUri!.fsPath, "certificates", "dev.pem");
    } else {
      devKeyPath = path.resolve(
        vscode.workspace
          .getConfiguration()
          .get("dynatrace.certificate.location.developerKey") as string
      );
      devCertPath = path.resolve(
        vscode.workspace
          .getConfiguration()
          .get("dynatrace.certificate.location.developerCertificate") as string
      );
    }

    exec(
      `dt ext build --extension-directory="${extensionDir}" --target-directory="${distDir.fsPath}" --certificate="${devCertPath}" --private-key="${devKeyPath}" --no-dev-passphrase`,
      (err, stdout, stderr) => {
        console.log("stdout: " + stdout);
        console.log("stderr: " + stderr);
        vscode.window.showInformationMessage("Extension built successfully.");
        if (err) {
          console.log("error: " + err);
          vscode.window.showErrorMessage("Failed to build extension.");
        }
      }
    );

    // ------------ DIY SNIPPET - NEEDS FIXING ------------------------------------
    //   // Extension meta
    //   var extension = yaml.parse(readFileSync(extensionFile[0].fsPath).toString());

    //   // Build the inner .zip archive
    //   var innerZip = new AdmZip();
    //   innerZip.addLocalFolder(extensionDir);
    //   innerZip.writeZip(path.join(context.storageUri!.fsPath, "extension.zip"));

    //   console.log("Built the inner archive");

    //   // Sign the inner .innerZip
    //   var devKey = pki.privateKeyFromPem(
    //     readFileSync(path.join(context.storageUri!.fsPath, "certificates", "dev.key")).toString()
    //   );
    //   var devCert = pki.certificateFromPem(
    //     readFileSync(path.join(context.storageUri!.fsPath, "certificates", "dev.pem")).toString()
    //   );
    //   var extensionHash = createHash("sha256").update(
    //     readFileSync(path.join(context.storageUri!.fsPath, "extension.zip"))
    //   );
    //   var digest = md.sha256.create();
    //   digest.update(util.encodeUtf8(extensionHash.digest().toString()), "utf8");
    //   var signedData = pkcs7.createSignedData();
    //   signedData.content = digest.digest();
    //   signedData.addCertificate(devCert);
    //   signedData.addSigner({
    //     key: devKey,
    //     certificate: devCert,
    //     digestAlgorithm: pki.oids.sha256,
    //     authenticatedAttributes: [
    //       {
    //         type: pki.oids.contentType,
    //         value: pki.oids.data,
    //       },
    //       {
    //         type: pki.oids.messageDigest,
    //       },
    //       {
    //         type: pki.oids.signingTime,
    //       },
    //     ],
    //   });
    //   signedData.sign({ detached: true });
    //   var signature = pkcs7.messageToPem(signedData);
    //   writeFileSync(path.join(context.storageUri!.fsPath, "extension.zip.sig"), signature);

    //   // Build the outer .zip
    //   var outerZip = new AdmZip();
    //   outerZip.addLocalFile(path.join(context.storageUri!.fsPath, "extension.zip"));
    //   outerZip.addLocalFile(path.join(context.storageUri!.fsPath, "extension.zip.sig"));
    //   outerZip.writeZip(
    //     path.join(distDir.fsPath, `${extension.name.replace(":", "_")}-${extension.version}.zip`)
    //   );

    //   console.log("Wrote the outer zip");
  }
}
