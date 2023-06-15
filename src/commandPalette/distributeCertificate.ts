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

import { readFileSync } from "fs";
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { showMessage } from "../utils/code";
import { checkActiveGateInstalled, checkOneAgentInstalled } from "../utils/conditionCheckers";
import { resolveRealPath, uploadComponentCert } from "../utils/fileSystem";

/**
 * Delivers the "Distribute certificate" command functionality.
 * First, it either uploads a new certificate to the Dynatrace credential vault or updates
 * the content of an existing credential if found. After handling the Credential Vault, the
 * command continues with distributing the credential to any locally installed components.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @returns boolean - the success of the command
 */
export async function distributeCertificate(context: vscode.ExtensionContext, dt: Dynatrace) {
  const certSettingValue = vscode.workspace
    .getConfiguration("dynatraceExtensions", null)
    .get<string>("rootOrCaCertificateLocation");
  if (!certSettingValue) {
    return;
  }
  const certPath = resolveRealPath(certSettingValue);
  const certContent = readFileSync(certPath).toString();

  // TODO: This is not enough. What if ID is stale? Needs GET to confirm existence
  // Check certificate exists and prompt for overwrite
  const caCertId = context.workspaceState.get<string>("caCertId");
  let update = false;
  if (caCertId) {
    const choice = await vscode.window.showQuickPick(["Yes", "No"], {
      canPickMany: false,
      ignoreFocusOut: true,
      title: "Certificate already exists in Dynatrace",
      placeHolder: "Would you like to overwrite it?",
    });
    update = choice === "Yes";
  }

  // Update existing certificate by replacing the content
  if (update && caCertId) {
    const oldCert = await dt.credentialVault.getCertificate(caCertId);
    await dt.credentialVault
      .putCertificate(caCertId, certContent, oldCert.name, oldCert.description)
      .then(async () => {
        showMessage("info", "Certificate successfully updated in the Credential Vault.");
      })
      .catch(async (err: DynatraceAPIError) => {
        showMessage("error", `Certificate update failed: ${err.message}`);
      });
  } else {
    // Prompt user for Certificate Name
    const certName = await vscode.window.showInputBox({
      title: "Upload certificate (1/2)",
      placeHolder: "Name for this certificate...",
      prompt: "Mandatory",
      ignoreFocusOut: true,
    });
    if (!certName || certName === "") {
      showMessage("error", "Certificate name is mandatory. Skipping upload to Credentials Vault.");
    } else {
      // Prompt user for Certificate Description
      const certDescr = await vscode.window.showInputBox({
        title: "Upload certificate (2/2)",
        placeHolder: "Description for this certificate...",
        prompt: "Optional",
        ignoreFocusOut: true,
      });
      // Upload the new certificate to the Vault
      await dt.credentialVault
        .postCertificate(certContent, certName, certDescr ?? "")
        .then(async res => {
          await context.workspaceState.update("caCertId", res.id);
          showMessage("info", "Certificate successfully uploaded to Credentials Vault.");
        })
        .catch(async (err: DynatraceAPIError) => {
          showMessage("error", `Certificate upload failed: ${err.message}`);
        });
    }
  }

  // Continue flow with upload to local components
  const agPresent = checkActiveGateInstalled();
  const oaPresent = checkOneAgentInstalled();

  if (agPresent || oaPresent) {
    const choice = await vscode.window.showInformationMessage(
      "Do you want to also distribute this certificate to locally installed OneAgents/ActiveGates?",
      "Yes",
      "No",
    );
    if (choice === "Yes") {
      try {
        if (oaPresent) {
          uploadComponentCert(certPath, "OneAgent");
          showMessage("info", "Certificate successfully uploaded to local OneAgent.");
        }
        if (agPresent) {
          uploadComponentCert(certPath, "ActiveGate");
          showMessage("info", "Certificate successfully uploaded to local ActiveGate.");
        }
      } catch (err) {
        showMessage(
          "error",
          (err as Error).name === "EPERM"
            ? "Writing certificate locally failed due to access permissions. " +
                "Try again after running VS Code as Administrator."
            : `Writing certificate locally failed: ${(err as Error).message}`,
        );
      }
    }
  }
}
