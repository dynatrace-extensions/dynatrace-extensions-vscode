import * as vscode from "vscode";
import * as yaml from "yaml";
import { checkDtInternalProperties } from "../utils/conditionCheckers";
import { getDefinedCardsMeta, getMetricsFromDataSource, getReferencedCardsMeta } from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import { getListItemIndexes } from "../utils/yamlParsing";
import {
  copilotDiagnostic,
  COUNT_METRIC_KEY_SUFFIX,
  DEFINED_CARD_NOT_REFERENCED,
  EXTENSION_NAME_CUSTOM_ON_BITBUCKET,
  EXTENSION_NAME_INVALID,
  EXTENSION_NAME_MISSING,
  EXTENSION_NAME_NON_CUSTOM,
  EXTENSION_NAME_TOO_LONG,
  GAUGE_METRIC_KEY_SUFFIX,
  REFERENCED_CARD_NOT_DEFINED,
} from "./diagnosticData";

/**
 * Utility class implemented for providing diagnostics information regarding the contents
 * of an Extensions 2.0 YAML file.
 */
export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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
      ...this.diagnoseCardKeys(document, extension),
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
    let status = true;
    const extensionYamlFile = getExtensionFilePath(this.context)!;
    const diagnostics = this.collection.get(vscode.Uri.file(extensionYamlFile));

    if (diagnostics && diagnostics.findIndex(diag => diag.severity === vscode.DiagnosticSeverity.Error) > -1) {
      vscode.window.showErrorMessage("Extension cannot be built. Fix problems first.");
      vscode.commands.executeCommand("workbench.action.problems.focus");
      status = false;
    }

    console.log(`Check - diagnostics collection clear? > ${status}`);
    return status;
  }

  /**
   * Provides diagnostics related to the name of an extension
   * @param content extension.yaml text content
   * @returns list of diagnostic items
   */
  private async diagnoseExtensionName(content: string): Promise<vscode.Diagnostic[]> {
    var diagnostics: vscode.Diagnostic[] = [];
    const contentLines = content.split("\n");
    const lineNo = contentLines.findIndex(line => line.startsWith("name:"));

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
      const bitBucketRepo = await checkDtInternalProperties();
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
        m =>
          (m.type === "count" && !(m.key.endsWith(".count") || m.key.endsWith("_count"))) ||
          (m.type === "gauge" && (m.key.endsWith(".count") || m.key.endsWith("_count")))
      )
      .forEach(m => {
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

  /**
   * Provide diagnostics related to card keys within a screen definition.
   * Users are warned if cards that have definitions are not used within layouts of the screen.
   * Errors are raised if cards are referenced within layouts but do not have a definition.
   * @param document text document where diagnostics should be applied
   * @param extension extension.yaml serialized as object
   * @returns list of diagnostics
   */
  private diagnoseCardKeys(document: vscode.TextDocument, extension: ExtensionStub): vscode.Diagnostic[] {
    const content = document.getText();
    let diagnostics: vscode.Diagnostic[] = [];
    const screenBounds = getListItemIndexes("screens", content);

    extension.screens?.forEach((_, idx) => {
      const refCards = getReferencedCardsMeta(idx, extension);
      const defCards = getDefinedCardsMeta(idx, extension);
      refCards
        .filter(rc => defCards.findIndex(dc => dc.key === rc.key) === -1)
        .forEach(rc => {
          const keyStart = content.indexOf(`key: ${rc.key}`, screenBounds[idx].start);
          diagnostics.push(
            copilotDiagnostic(
              document.positionAt(keyStart),
              document.positionAt(keyStart + `key: ${rc.key}`.length),
              REFERENCED_CARD_NOT_DEFINED
            )
          );
        });
      defCards
        .filter(dc => refCards.findIndex(rc => rc.key === dc.key) === -1)
        .forEach(dc => {
          const keyStart = content.indexOf(`key: ${dc.key}`, screenBounds[idx].start);
          diagnostics.push(
            copilotDiagnostic(
              document.positionAt(keyStart),
              document.positionAt(keyStart + `key: ${dc.key}`.length),
              DEFINED_CARD_NOT_REFERENCED
            )
          );
        });
    });

    return diagnostics;
  }
}
