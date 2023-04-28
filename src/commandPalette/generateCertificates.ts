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

import * as vscode from "vscode";
import { md, pki, random, util } from "node-forge";
import path = require("path");
import { existsSync, mkdirSync, writeFileSync } from "fs";

/**
 * Delivers the "Generate certificates" command functionality.
 * Will generate an RSA key pair and X.509 Ceritifcate both for Root (acting as CA) as well
 * as Developer. The resulting files are stored in the workspace shared storage.
 * The logic ends with a link to "Upload certificate" command.
 * @param context VSCode Extension Context
 * @returns boolean - success of the command
 */
export async function generateCerts(context: vscode.ExtensionContext): Promise<boolean> {
  const certsDir = path.join(context.storageUri!.fsPath, "certificates");
  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating certificates",
    },
    async progress => {
      // Generate CA RSA key pair
      progress.report({ message: "Generating RSA key pair for CA certificate" });
      try {
        var caKey = pki.rsa.generateKeyPair({ bits: 4096, e: 0x10001 });
      } catch (err: any) {
        vscode.window.showErrorMessage("Error generating the RSA key pair for the CA certificate");
        console.log(err.message);
        return false;
      }

      // Generate CA certificate
      progress.report({ message: "Generating the CA certificate" });
      try {
        var caAttrs = getCertAttributes("ca");
        var caCert = pki.createCertificate();
        caCert.serialNumber = generateSerialNo();
        caCert.setSubject(caAttrs);
        caCert.setIssuer(caAttrs);
        caCert.publicKey = caKey.publicKey;
        caCert.privateKey = caKey.privateKey;
        caCert.validity.notBefore = new Date();
        caCert.validity.notBefore.setDate(caCert.validity.notBefore.getDate() - 1);
        caCert.validity.notAfter = new Date();
        caCert.validity.notAfter.setFullYear(caCert.validity.notAfter.getFullYear() + 3);
        caCert.setExtensions([
          {
            name: "basicConstraints",
            cA: true,
            pathLength: 0,
          },
          {
            name: "keyUsage",
            digitalSignature: false,
            contentCommitment: false,
            keyEncipherment: false,
            dataEncipherment: false,
            keyAgreement: false,
            keyCertSign: true,
            cRLSign: false,
            encipherOnly: false,
            decipherOnly: false,
          },
          {
            name: "subjectKeyIdentifier",
          },
        ]);
        caCert.sign(caKey.privateKey, md.sha256.create());
        console.log("CA Cert created successfully");
      } catch (err: any) {
        vscode.window.showErrorMessage("Error generating the CA certificate");
        console.log(err.message);
        return false;
      }

      // Generate DEV RSA key pair
      progress.report({ message: "Generating RSA key pair for Developer certificate" });
      try {
        var devKey = pki.rsa.generateKeyPair({ bits: 4096, e: 0x10001 });
      } catch (err: any) {
        vscode.window.showErrorMessage(
          "Error generating the RSA key pair for the Developer certificate",
        );
        console.log(err.message);
        return false;
      }

      // Generate DEV certificate
      progress.report({ message: "Generating the Developer certificate" });
      try {
        var devCert = pki.createCertificate();
        devCert.serialNumber = generateSerialNo();
        var devAttrs = getCertAttributes("dev");
        devCert.setSubject(devAttrs);
        devCert.setIssuer(caCert.subject.attributes);
        devCert.publicKey = devKey.publicKey;
        devCert.validity.notBefore = new Date();
        devCert.validity.notBefore.setDate(caCert.validity.notBefore.getDate() - 1);
        devCert.validity.notAfter = new Date();
        devCert.validity.notAfter.setFullYear(caCert.validity.notAfter.getFullYear() + 3);
        devCert.setExtensions([
          {
            name: "keyUsage",
            digitalSignature: true,
            contentCommitment: false,
            keyEncipherment: false,
            dataEncipherment: false,
            keyAgreement: false,
            keyCertSign: false,
            cRLSign: false,
            encipherOnly: false,
            decipherOnly: false,
          },
          {
            name: "subjectKeyIdentifier",
          },
          {
            name: "authorityKeyIdentifier",
            authorityCertIssuer: true,
            serialNumber: caCert.serialNumber,
          },
        ]);
        devCert.sign(caKey.privateKey, md.sha256.create());
        console.log("DEV Cert created successfully");
      } catch (err: any) {
        vscode.window.showErrorMessage("Error generating the Developer certificate");
        console.log(err.message);
        return false;
      }

      // Write files to workspace storage
      progress.report({ message: "Writing your certificates to file system" });

      if (!existsSync(certsDir)) {
        mkdirSync(certsDir);
      }
      writeFileSync(path.join(certsDir, "dev.key"), pki.privateKeyToPem(devKey.privateKey));
      writeFileSync(path.join(certsDir, "dev.pub.key"), pki.publicKeyToPem(devKey.publicKey));
      writeFileSync(path.join(certsDir, "ca.key"), pki.privateKeyToPem(caKey.privateKey));
      writeFileSync(path.join(certsDir, "ca.pub.key"), pki.publicKeyToPem(caKey.publicKey));
      writeFileSync(path.join(certsDir, "dev.pem"), pki.certificateToPem(devCert));
      writeFileSync(path.join(certsDir, "ca.pem"), pki.certificateToPem(caCert));
      writeFileSync(
        path.join(certsDir, "developer.pem"),
        pki.certificateToPem(devCert) + pki.privateKeyToPem(devKey.privateKey),
      );
      console.log(`Wrote all certificates at location ${certsDir}`);

      return true;
    },
  );

  if (success) {
    // Write the credential settings at either global or workspace level
    const useGlobal = await vscode.window.showInformationMessage(
      "Certificates generated. Do you want to use these for all workspaces by default?",
      "Yes",
      "No",
    );
    vscode.workspace
      .getConfiguration("dynatrace", null)
      .update(
        "developerCertkeyLocation",
        path.join(certsDir, "developer.pem"),
        useGlobal === "Yes" ? true : undefined,
      );
    vscode.workspace
      .getConfiguration("dynatrace", null)
      .update(
        "rootOrCaCertificateLocation",
        path.join(certsDir, "ca.pem"),
        useGlobal === "Yes" ? true : undefined,
      );

    // Link command - Upload Certificates
    const choice = await vscode.window.showInformationMessage(
      "Settings updated. Would you like to upload the CA certificate to Dynatrace?",
      "Yes",
      "No",
    );
    if (choice === "Yes") {
      await vscode.commands.executeCommand("dt-ext-copilot.distributeCertificate");
    }
    // We don't care about success of upload for the success of this command
    return true;
  }
  return false;
}

/**
 * Generates a random serial number, valid for X.509 Certificates.
 * @returns hex encoded number
 */
function generateSerialNo(): string {
  var number = util.bytesToHex(random.getBytesSync(20));
  let mostSignificantHexDigit = parseInt(number[0], 16);

  if (mostSignificantHexDigit < 8) {
    return number;
  }

  mostSignificantHexDigit -= 8;
  return mostSignificantHexDigit.toString() + number.substring(1);
}

/**
 * Generates an X.509 Certificate Subject based on known supported attributes.
 * Attributes are fetched from vscode settings.
 * @param type "ca" or "dev" so that subjects can be minimally distinguished from each other
 * @returns Array of certificate subject attributes
 */
function getCertAttributes(type: "ca" | "dev"): pki.CertificateField[] {
  var config = vscode.workspace.getConfiguration("dynatrace", null);
  var attrs = [
    {
      shortName: "CN",
      value: `${config.get("certificateCommonName")} ${type === "ca" ? "Root" : "Dev"}`,
    },
  ];
  if (config.get("certificateOrganization")) {
    attrs.push({
      shortName: "O",
      value: config.get("certificateOrganization") as string,
    });
  }
  if (config.get("certificateOrganizationUnit")) {
    attrs.push({
      shortName: "OU",
      value: config.get("certificateOrganizationUnit") as string,
    });
  }
  if (config.get("certificateStateOrProvince")) {
    attrs.push({
      shortName: "ST",
      value: config.get("certificateStateOrProvince") as string,
    });
  }
  if (config.get("certificateCountryCode")) {
    attrs.push({
      shortName: "C",
      value: config.get("certificateCountryCode") as string,
    });
  }

  return attrs;
}
