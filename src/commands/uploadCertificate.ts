import { readdirSync, readFileSync } from "fs";
import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";

/**
 * Delivers the "Upload certificate" command functionality.
 * Either uploads a new certificate to the Dynatrace credential vault or updates the content of an
 * existing credential if found.
 * @param context VSCode Extension Context
 * @param dt Dynatrace API Client
 * @returns void
 */
export async function uploadCertificate(
  context: vscode.ExtensionContext,
  dt: Dynatrace
): Promise<void> {
  if (context.storageUri) {
    var certFile = readdirSync(path.join(context.storageUri.fsPath, "certificates")).find(
      (f) => f === "ca.pem"
    );
    if (!certFile) {
      vscode.window.showErrorMessage(
        'This workspace does not have an associated certificate. Run the "Generate certificates" command first, then try again.'
      );
      return;
    }

    // TODO: This is not enough. What if ID is stale? Needs GET to confirm existence
    // Check certificate exists and prompt for overwrite
    var caCertId = context.workspaceState.get("caCertId") as string;
    var update = false;
    if (caCertId) {
      let choice = await vscode.window.showQuickPick(["Yes", "No"], {
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Certificate already exists in Dynatrace",
        placeHolder: "Would you like to overwrite it?",
      });
      update = choice === "Yes";
    }

    var pemCert = readFileSync(
      path.join(context.storageUri.fsPath, "certificates", "ca.pem")
    ).toString();
    // Update existing certificate by replacing the content
    if (update) {
      var oldCert = await dt.credentialVault.getCertificate(caCertId);
      dt.credentialVault
        .putCertificate(caCertId, pemCert, oldCert.name, oldCert.description)
        .then(() => {
          vscode.window.showInformationMessage("Certificate uploaded successfully.");
        })
        .catch((err) => {
          console.log(err.message);
          console.log(err);
          vscode.window.showErrorMessage("Certificate upload failed.");
        });
      // Upload new certificate with given Name and Description
    } else {
      var certName = await vscode.window.showInputBox({
        title: "Upload certificate (1/2)",
        placeHolder: "Name for this certificate...",
        prompt: "Mandatory",
        ignoreFocusOut: true,
      });
      if (!certName || certName === "") {
        vscode.window.showErrorMessage(
          "Certificate name cannot be blank. Operation was cancelled."
        );
        return;
      }
      var certDescr = await vscode.window.showInputBox({
        title: "Upload certificate (2/2)",
        placeHolder: "Description for this certificate...",
        prompt: "Optional",
        ignoreFocusOut: true,
      });
      certDescr = certDescr ? certDescr : "";

      dt.credentialVault
        .postCertificate(pemCert, certName, certDescr)
        .then((res) => {
          context.workspaceState.update("caCertId", res.id);
          vscode.window.showInformationMessage("Certificate uploaded successfully.");
        })
        .catch((err) => {
          vscode.window.showErrorMessage(`Certificate upload failed: ${err.message}`);
        });
    }
  }
}
