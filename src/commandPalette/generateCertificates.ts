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

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path = require("path");
import { md, pki, random, util } from "node-forge";
import * as vscode from "vscode";
import { showMessage } from "../utils/code";
import * as logger from "../utils/logging";

const logTrace = ["commandPalette", "generateCertificates"];

/**
 * Generates a random serial number, valid for X.509 Certificates.
 * @returns hex encoded number
 */
function generateSerialNo(): string {
  const number = util.bytesToHex(random.getBytesSync(20));
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
  const config = vscode.workspace.getConfiguration("dynatraceExtensions", null);
  const certCN = config.get<string>("certificateCommonName");
  const certO = config.get<string>("certificateOrganization");
  const certOU = config.get<string>("certificateOrganizationUnit");
  const certST = config.get<string>("certificateStateOrProvince");
  const certC = config.get<string>("certificateCountryCode");

  const attrs = [{ shortName: "CN", value: `${certCN ?? ""} ${type === "ca" ? "Root" : "Dev"}` }];
  if (certO) {
    attrs.push({ shortName: "O", value: certO });
  }
  if (certOU) {
    attrs.push({ shortName: "OU", value: certOU });
  }
  if (certST) {
    attrs.push({ shortName: "ST", value: certST });
  }
  if (certC) {
    attrs.push({ shortName: "C", value: certC });
  }

  return attrs;
}

/**
 * Delivers the "Generate certificates" command functionality.
 * Will generate an RSA key pair and X.509 Ceritifcate both for Root (acting as CA) as well
 * as Developer. The resulting files are stored in the workspace shared storage.
 * The logic ends with a link to "Upload certificate" command.
 * @param context VSCode Extension Context
 * @returns boolean - success of the command
 */
export async function generateCerts(context: vscode.ExtensionContext): Promise<boolean> {
  const fnLogTrace = [...logTrace, "generateCerts"];
  const storagePath = context.storageUri?.fsPath;
  if (!storagePath) {
    return false;
  }
  const certsDir = path.join(storagePath, "certificates");
  const success = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating certificates",
    },
    async progress => {
      // Generate CA RSA key pair
      progress.report({ message: "Generating RSA key pair for CA certificate" });
      let caKey;
      try {
        caKey = pki.rsa.generateKeyPair({ bits: 4096, e: 0x10001 });
      } catch (err) {
        showMessage("error", "Error generating the RSA key pair for the CA certificate");
        logger.error((err as Error).message, ...fnLogTrace);
        return false;
      }

      // Generate CA certificate
      progress.report({ message: "Generating the CA certificate" });
      let caCert;
      try {
        caCert = pki.createCertificate();
        const caAttrs = getCertAttributes("ca");
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
        logger.info("CA Cert created successfully", ...fnLogTrace);
      } catch (err) {
        showMessage("error", "Error generating the CA certificate");
        logger.error((err as Error).message, ...fnLogTrace);
        return false;
      }

      // Generate DEV RSA key pair
      progress.report({ message: "Generating RSA key pair for Developer certificate" });
      let devKey;
      try {
        devKey = pki.rsa.generateKeyPair({ bits: 4096, e: 0x10001 });
      } catch (err) {
        showMessage("error", "Error generating the RSA key pair for the Developer certificate");
        logger.error((err as Error).message, ...fnLogTrace);
        return false;
      }

      // Generate DEV certificate
      progress.report({ message: "Generating the Developer certificate" });
      let devCert;
      try {
        devCert = pki.createCertificate();
        devCert.serialNumber = generateSerialNo();
        const devAttrs = getCertAttributes("dev");
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
        logger.info("DEV Cert created successfully", ...fnLogTrace);
      } catch (err) {
        showMessage("error", "Error generating the Developer certificate");
        logger.error((err as Error).message, ...fnLogTrace);
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
      logger.info(`Wrote all certificates at location ${certsDir}`, ...fnLogTrace);

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
      .getConfiguration("dynatraceExtensions", null)
      .update(
        "developerCertkeyLocation",
        path.join(certsDir, "developer.pem"),
        useGlobal === "Yes" ? true : undefined,
      )
      .then(undefined, () => {
        logger.info("Could not update setting developerCertkeyLocation", ...fnLogTrace);
      });
    vscode.workspace
      .getConfiguration("dynatraceExtensions", null)
      .update(
        "rootOrCaCertificateLocation",
        path.join(certsDir, "ca.pem"),
        useGlobal === "Yes" ? true : undefined,
      )
      .then(undefined, () => {
        logger.info("Could not update setting rootOrCaCertificateLocation", ...fnLogTrace);
      });

    // Link command - Upload Certificates
    const choice = await vscode.window.showInformationMessage(
      "Settings updated. Would you like to upload the CA certificate to Dynatrace?",
      "Yes",
      "No",
    );
    if (choice === "Yes") {
      await vscode.commands.executeCommand("dynatrace-extensions.distributeCertificate");
    }
    // We don't care about success of upload for the success of this command
    return true;
  }
  return false;
}
