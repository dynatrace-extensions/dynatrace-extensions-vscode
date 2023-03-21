import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
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
  const certPath = resolveRealPath(
    vscode.workspace.getConfiguration("dynatrace", null).get("rootOrCaCertificateLocation") as string
  );
  const certContent = readFileSync(certPath as string).toString();

  // TODO: This is not enough. What if ID is stale? Needs GET to confirm existence
  // Check certificate exists and prompt for overwrite
  const caCertId = context.workspaceState.get("caCertId") as string;
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
  if (update) {
    const oldCert = await dt.credentialVault.getCertificate(caCertId);
    await dt.credentialVault
      .putCertificate(caCertId, certContent, oldCert.name, oldCert.description)
      .then(() => {
        vscode.window.showInformationMessage("Certificate successfully updated in the Credential Vault.");
      })
      .catch((err: DynatraceAPIError) => {
        vscode.window.showErrorMessage(`Certificate update failed: ${err.message}`);
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
      vscode.window.showErrorMessage("Certificate name is mandatory. Skipping upload to Credentials Vault.");
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
        .then(res => {
          context.workspaceState.update("caCertId", res.id);
          vscode.window.showInformationMessage("Certificate successfully uploaded to Credentials Vault.");
        })
        .catch((err: DynatraceAPIError) => {
          vscode.window.showErrorMessage(`Certificate upload failed: ${err.message}`);
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
      "No"
    );
    if (choice === "Yes") {
      try {
        if (oaPresent) {
          uploadComponentCert(certPath as string, "OneAgent");
          vscode.window.showInformationMessage("Certificate successfully uploaded to local OneAgent.");
        }
        if (agPresent) {
          uploadComponentCert(certPath as string, "ActiveGate");
          vscode.window.showInformationMessage("Certificate successfully uploaded to local ActiveGate.");
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(
          err.code === "EPERM"
            ? "Writing certificate locally failed due to access permissions. Try again after running VS Code as Administrator."
            : `Writing certificate locally failed: ${err.message}`
        );
      }
    }
  }
}
