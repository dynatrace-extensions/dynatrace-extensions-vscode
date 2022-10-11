import * as vscode from "vscode";
import {
  copilotDiagnostic,
  EXTENSION_NAME_INVALID,
  EXTENSION_NAME_MISSING,
  EXTENSION_NAME_NON_CUSTOM,
  EXTENSION_NAME_TOO_LONG,
} from "./diagnosticData";

/**
 * Utility class implemented for providing diagnostics information regarding the contents
 * of an Extensions 2.0 YAML file.
 */
export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("Dynatrace");
  }

  /**
   * Collects Extension 2.0 diagnostics and updates the collection managed by this provider.
   * @param document text document to provide diagnostics for
   */
  public provideDiagnostics(document: vscode.TextDocument) {
    const diagnostics = [...this.diagnoseExtensionName(document.getText())];
    this.collection.set(document.uri, diagnostics);
  }

  /**
   * Checks whether extension is valid for building.
   * Essentially checks whether there are any diagnostics created with severity "Error".
   * @returns true if extension will Build, false otherwise
   */
  public async isValidForBuilding(): Promise<boolean> {
    const valid = await vscode.workspace.findFiles("**/extension/extension.yaml", undefined, 1).then((files) => {
      if (files.length === 0) {
        return false;
      }
      const diagnostics = this.collection.get(files[0]);
      if (!diagnostics) {
        return true;
      }
      if (diagnostics.findIndex((diag) => diag.severity === vscode.DiagnosticSeverity.Error) > -1) {
        return false;
      }
      return true;
    });
    if (!valid) {
      vscode.window.showErrorMessage("Extension cannot be built. Fix problems first.");
      vscode.commands.executeCommand("workbench.action.problems.focus");
    }
    return valid;
  }

  /**
   * Provides diagnostics related to the name of an extension
   * @param content extension.yaml text content
   * @returns list of diagnostic items
   */
  private diagnoseExtensionName(content: string): vscode.Diagnostic[] {
    var diagnostics: vscode.Diagnostic[] = [];
    const contentLines = content.split("\n");
    const lineNo = contentLines.findIndex((line) => line.startsWith("name:"));

    if (lineNo === -1) {
      diagnostics.push(copilotDiagnostic(new vscode.Position(1, 0), new vscode.Position(1, 0), EXTENSION_NAME_MISSING));
    } else {
      const nameRegex = /^(custom:)*(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9-_\.]+$/;
      const extensionName = contentLines[lineNo].split("name:")[1].trim();
      const nameStart = new vscode.Position(lineNo, contentLines[lineNo].indexOf(extensionName));
      const nameEnd = new vscode.Position(lineNo, contentLines[lineNo].length);
      if (extensionName.length > 50) {
        diagnostics.push(copilotDiagnostic(nameStart, nameEnd, EXTENSION_NAME_TOO_LONG));
      }
      if (!nameRegex.test(extensionName)) {
        diagnostics.push(copilotDiagnostic(nameStart, nameEnd, EXTENSION_NAME_INVALID));
      }
      if (!extensionName.startsWith("custom:")) {
        diagnostics.push(copilotDiagnostic(nameStart, nameEnd, EXTENSION_NAME_NON_CUSTOM));
      }
    }
    return diagnostics;
  }
}
