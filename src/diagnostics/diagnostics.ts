import * as vscode from "vscode";
import * as yaml from "yaml";
import { checkGradleProperties } from "../utils/conditionCheckers";
import { CachedDataProvider } from "../utils/dataCaching";
import {
  getDefinedCardsMeta,
  getDimensionOids,
  getMetricsFromDataSource,
  getReferencedCardsMeta,
} from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import { isOidReadable } from "../utils/snmp";
import { getListItemIndexes, getNextElementIdx, isSameList } from "../utils/yamlParsing";
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
  OID_COUNTER_AS_GAUGE,
  OID_DOES_NOT_EXIST,
  OID_NOT_READABLE,
  OID_STRING_AS_METRIC,
  REFERENCED_CARD_NOT_DEFINED,
} from "./diagnosticData";

/**
 * Utility class implemented for providing diagnostics information regarding the contents
 * of an Extensions 2.0 YAML file.
 */
export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly context: vscode.ExtensionContext;
  private readonly cachedData: CachedDataProvider;

  /**
   * @param context VSCode Extension Context
   * @param cachedDataProvider Provider for cacheable data
   */
  constructor(context: vscode.ExtensionContext, cachedDataProvider: CachedDataProvider) {
    this.context = context;
    this.cachedData = cachedDataProvider;
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
      ...(await this.diagnoseOIDs(document, extension)),
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
    const metrics = getMetricsFromDataSource(extension, true);

    metrics
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

    if (!extension.screens) {
      return diagnostics;
    }

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

  private async diagnoseOIDs(document: vscode.TextDocument, extension: ExtensionStub): Promise<vscode.Diagnostic[]> {
    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    if (!extension.snmp) {
      return diagnostics;
    }

    // Reduce the time by bulk fetching all required OIDs
    const metrics = getMetricsFromDataSource(extension, true).filter(m => m.value && m.value.startsWith("oid:"));
    const oidInfos = await this.cachedData.getBulkOidsInfo(metrics.map(m => m.value!.split("oid:")[1]));
    const metricInfos = metrics.map((m, i) => ({
      key: m.key,
      type: m.type,
      value: m.value,
      info: oidInfos[i],
    }));

    for (let metric of metricInfos) {
      const oid = metric.value!.slice(4);
      const oidRegex = new RegExp(`value: "?oid:${oid.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`, "gm");

      let match;
      while ((match = oidRegex.exec(content)) !== null) {
        const startPos = document.positionAt(match.index + match[0].indexOf(oid));
        const endPos = document.positionAt(match.index + match[0].indexOf(oid) + oid.length);

        if (!metric.info.objectType) {
          diagnostics.push(copilotDiagnostic(startPos, endPos, OID_DOES_NOT_EXIST));
        } else {
          if (!isOidReadable(metric.info)) {
            diagnostics.push(copilotDiagnostic(startPos, endPos, OID_NOT_READABLE));
          }
          if (metric.info.syntax && metric.info.syntax.toLowerCase().includes("string")) {
            diagnostics.push(copilotDiagnostic(startPos, endPos, OID_STRING_AS_METRIC));
          }
          if (metric.info.syntax) {
            if (metric.type === "gauge" && metric.info.syntax.startsWith("Counter")) {
              const blockStart = content.lastIndexOf("-", match.index);
              const nextDashIdx = content.indexOf("-", match.index);
              const blockEnd =
                nextDashIdx !== -1
                  ? isSameList(nextDashIdx, document)
                    ? content.lastIndexOf("\n", nextDashIdx)
                    : content.indexOf(document.lineAt(document.positionAt(nextDashIdx).line - 1).text, match.index)
                  : getNextElementIdx(
                      document.lineAt(document.positionAt(match.index)).lineNumber,
                      document,
                      match.index
                    );

              // Since both OID & metric key can technically be reused, we should ensure both match
              if (content.substring(blockStart, blockEnd).includes(metric.key)) {
                diagnostics.push(copilotDiagnostic(startPos, endPos, OID_COUNTER_AS_GAUGE));
              }
            }
          }
        }
      }
    }

    return diagnostics;
  }
}
