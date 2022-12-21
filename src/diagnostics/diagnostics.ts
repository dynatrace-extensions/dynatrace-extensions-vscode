import * as vscode from "vscode";
import * as yaml from "yaml";
import { checkGradleProperties } from "../utils/conditionCheckers";
import { getMetricsFromDataSource } from "../utils/extensionParsing";
import { getParentBlocks } from "../utils/yamlParsing";
import {
  copilotDiagnostic,
  COUNT_METRIC_KEY_SUFFIX,
  EXTENSION_NAME_CUSTOM_ON_BITBUCKET,
  EXTENSION_NAME_INVALID,
  EXTENSION_NAME_MISSING,
  EXTENSION_NAME_NON_CUSTOM,
  EXTENSION_NAME_TOO_LONG,
  GAUGE_METRIC_KEY_SUFFIX,
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
  public async provideDiagnostics(document: vscode.TextDocument) {
    const extension = yaml.parse(document.getText());
    const diagnostics = [
      ...(await this.diagnoseExtensionName(document.getText())),
      ...this.diagnoseMetricKeys(document, extension),
    ];
    this.collection.set(document.uri, diagnostics);
  }

  /**
   * Retrieve the Diagnostics currently logged by the Extensions Copilot.
   * @param uri URI of the extension.yaml file
   * @returns list of diagnostic items
   */
  public getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    return [...(this.collection.get(uri) || [])];
  }

  /**
   * Checks whether extension is valid for building.
   * Essentially checks whether there are any diagnostics created with severity "Error".
   * @returns true if extension will Build, false otherwise
   */
  public async isValidForBuilding(): Promise<boolean> {
    const valid = await vscode.workspace.findFiles("extension/extension.yaml", undefined, 1).then((files) => {
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
  private async diagnoseExtensionName(content: string): Promise<vscode.Diagnostic[]> {
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
      const bitBucketRepo = await checkGradleProperties();
      if (!extensionName.startsWith("custom:") && !bitBucketRepo) {
        diagnostics.push(copilotDiagnostic(nameStart, nameEnd, EXTENSION_NAME_NON_CUSTOM));
      }
      if (extensionName.startsWith("custom:") && bitBucketRepo) {
        diagnostics.push(copilotDiagnostic(nameStart, nameEnd, EXTENSION_NAME_CUSTOM_ON_BITBUCKET));
      }
    }
    return diagnostics;
  }

  /**
   * Provides diagnostics related to the keys of metrics.
   * To fully comply with the metric protocol, count metrics should end in `.count` and
   * gauge metrics should not end in `.count`. This is not only best practice but will
   * also screw with some of our automated functions.
   * @param document text document where diagnostics should be applied
   * @param extension extension.yaml serialized as object
   * @returns list of diagnostics
   */
  private diagnoseMetricKeys(document: vscode.TextDocument, extension: ExtensionStub): vscode.Diagnostic[] {
    const content = document.getText();
    var diagnostics: vscode.Diagnostic[] = [];
    getMetricsFromDataSource(extension)
      .filter(
        (m) =>
          (m.type === "count" && !(m.key.endsWith(".count") || m.key.endsWith("_count"))) ||
          (m.type === "gauge" && (m.key.endsWith(".count") || m.key.endsWith("_count")))
      )
      .forEach((m) => {
        const metricRegex = new RegExp(`key: "?${m.key.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`, "gm");
        let match;
        while ((match = metricRegex.exec(content)) !== null) {
          diagnostics.push(
            copilotDiagnostic(
              document.positionAt(match.index + match[0].indexOf(m.key)),
              document.positionAt(match.index + match[0].indexOf(m.key) + m.key.length),
              m.type === "count" ? COUNT_METRIC_KEY_SUFFIX : GAUGE_METRIC_KEY_SUFFIX
            )
          );
        }
      });

    return diagnostics;
  }
}
