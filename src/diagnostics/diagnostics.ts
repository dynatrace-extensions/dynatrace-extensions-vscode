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
import { ExtensionStub } from "../interfaces/extensionMeta";
import { showMessage } from "../utils/code";
import { checkDtInternalProperties } from "../utils/conditionCheckers";
import { CachedData, CachedDataProducer } from "../utils/dataCaching";
import {
  getDefinedCardsMeta,
  getDimensionsFromDataSource,
  getMetricsFromDataSource,
  getReferencedCardsMeta,
} from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import * as logger from "../utils/logging";
import { isOidReadable, isTable, oidFromMetriValue, OidInformation } from "../utils/snmp";
import {
  getBlockItemIndexAtLine,
  getListItemIndexes,
  getNextElementIdx,
  isSameList,
} from "../utils/yamlParsing";
import {
  extensionDiagnostic,
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
  OID_DOT_ZERO_IN_TABLE,
  OID_DOT_ZERO_MISSING,
  OID_GAUGE_AS_COUNTER,
  OID_NOT_READABLE,
  OID_STATIC_OBJ_IN_TABLE,
  OID_STRING_AS_METRIC,
  OID_SYNTAX_INVALID,
  OID_TABLE_OBJ_AS_STATIC,
  REFERENCED_CARD_NOT_DEFINED,
} from "./diagnosticData";

/**
 * Utility class implemented for providing diagnostics information regarding the contents
 * of an Extensions 2.0 YAML file.
 */
export class DiagnosticsProvider extends CachedDataProducer {
  private readonly logTrace = ["diagnostics", "diagnostics", this.constructor.name];
  private readonly collection: vscode.DiagnosticCollection;

  /**
   * @param context VSCode Extension Context
   * @param cachedDataProvider Provider for cacheable data
   */
  constructor(cachedData: CachedData) {
    super(cachedData);
    this.collection = vscode.languages.createDiagnosticCollection("Dynatrace");
  }

  /**
   * Collects Extension 2.0 diagnostics and updates the collection managed by this provider.
   * @param document text document to provide diagnostics for
   */
  public async provideDiagnostics(document: vscode.TextDocument) {
    // If feature disabled, don't continue
    if (!vscode.workspace.getConfiguration("dynatraceExtensions", null).get("diagnostics")) {
      this.collection.set(document.uri, []);
      return;
    }

    // Diagnostic collections should be awaited all in parallel
    const diagnostics = await Promise.all([
      this.diagnoseExtensionName(document),
      this.diagnoseMetricKeys(document, this.parsedExtension),
      this.diagnoseCardKeys(document, this.parsedExtension),
      this.diagnoseMetricOids(document, this.parsedExtension),
      this.diagnoseDimensionOids(document, this.parsedExtension),
    ]).then(results => results.reduce((collection, result) => collection.concat(result), []));

    this.collection.set(document.uri, diagnostics);
  }

  /**
   * Retrieve the currently logged Diagnostics.
   * @param uri URI of the extension.yaml file
   * @returns list of diagnostic items
   */
  public getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    return [...(this.collection.get(uri) ?? [])];
  }

  /**
   * Checks whether extension is valid for building.
   * Essentially checks whether there are any diagnostics created with severity "Error".
   * @returns true if extension will Build, false otherwise
   */
  public async isValidForBuilding(): Promise<boolean> {
    let status = true;
    const extensionYamlFile = getExtensionFilePath();
    if (!extensionYamlFile) {
      return false;
    }
    const diagnostics = this.collection.get(vscode.Uri.file(extensionYamlFile));

    if (
      diagnostics &&
      diagnostics.findIndex(diag => diag.severity === vscode.DiagnosticSeverity.Error) > -1
    ) {
      showMessage("error", "Extension cannot be built. Fix problems first.");
      await vscode.commands.executeCommand("workbench.action.problems.focus");
      status = false;
    }

    logger.info(
      `Check - diagnostics collection clear? > ${String(status)}`,
      ...this.logTrace,
      "isValidForBuilding",
    );
    return status;
  }

  /**
   * Provides diagnostics related to the name of an extension
   * @param content extension.yaml text content
   * @returns list of diagnostic items
   */
  private async diagnoseExtensionName(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const content = document.getText();
    const contentLines = content.split("\n");
    const lineNo = contentLines.findIndex(line => line.startsWith("name:"));

    // Honor the user's settings
    if (
      !vscode.workspace
        .getConfiguration("dynatraceExtensions, null")
        .get("diagnostics.extensionName", false) as boolean
    ) {
      return [];
    }

    if (lineNo === -1) {
      diagnostics.push(
        extensionDiagnostic(
          new vscode.Position(1, 0),
          new vscode.Position(1, 0),
          EXTENSION_NAME_MISSING,
        ),
      );
    } else {
      const nameRegex = /^(custom:)*(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9-_.]+$/;
      const extensionName = contentLines[lineNo].split("name:")[1].trim();
      const nameStart = new vscode.Position(lineNo, contentLines[lineNo].indexOf(extensionName));
      const nameEnd = new vscode.Position(lineNo, contentLines[lineNo].length);
      if (extensionName.length > 50) {
        diagnostics.push(extensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_TOO_LONG));
      }
      if (!nameRegex.test(extensionName)) {
        diagnostics.push(extensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_INVALID));
      }
      const bitBucketRepo = await checkDtInternalProperties();
      if (!extensionName.startsWith("custom:") && !bitBucketRepo) {
        diagnostics.push(extensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_NON_CUSTOM));
      }
      if (extensionName.startsWith("custom:") && bitBucketRepo) {
        diagnostics.push(
          extensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_CUSTOM_ON_BITBUCKET),
        );
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
  private async diagnoseMetricKeys(
    document: vscode.TextDocument,
    extension: ExtensionStub,
  ): Promise<vscode.Diagnostic[]> {
    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Honor the user's settings
    if (
      !vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("diagnostics.metricKeys", false) as boolean
    ) {
      return [];
    }

    getMetricsFromDataSource(extension, true)
      .filter(
        m =>
          (m.type === "count" && !(m.key.endsWith(".count") || m.key.endsWith("_count"))) ||
          (m.type === "gauge" && (m.key.endsWith(".count") || m.key.endsWith("_count"))),
      )
      .forEach(m => {
        const metricRegex = new RegExp(
          `key: "?${m.key.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`,
          "gm",
        );
        let match;
        while ((match = metricRegex.exec(content)) !== null) {
          diagnostics.push(
            extensionDiagnostic(
              document.positionAt(match.index + match[0].indexOf(m.key)),
              document.positionAt(match.index + match[0].indexOf(m.key) + m.key.length),
              m.type === "count" ? COUNT_METRIC_KEY_SUFFIX : GAUGE_METRIC_KEY_SUFFIX,
            ),
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
  private async diagnoseCardKeys(
    document: vscode.TextDocument,
    extension: ExtensionStub,
  ): Promise<vscode.Diagnostic[]> {
    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Honor the user's settings and bail early if no screens
    if (
      (!vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("diagnostics.cardKeys", false) as boolean) ||
      !extension.screens
    ) {
      return [];
    }

    const screenBounds = getListItemIndexes("screens", content);
    extension.screens.forEach((_, idx) => {
      const refCards = getReferencedCardsMeta(idx, extension);
      const defCards = getDefinedCardsMeta(idx, extension);
      refCards
        .filter(rc => defCards.findIndex(dc => dc.key === rc.key) === -1)
        .forEach(rc => {
          const keyStart = content.indexOf(`key: ${rc.key}`, screenBounds[idx].start);
          diagnostics.push(
            extensionDiagnostic(
              document.positionAt(keyStart),
              document.positionAt(keyStart + `key: ${rc.key}`.length),
              REFERENCED_CARD_NOT_DEFINED,
            ),
          );
        });
      defCards
        .filter(dc => refCards.findIndex(rc => rc.key === dc.key) === -1)
        .forEach(dc => {
          const keyStart = content.indexOf(`key: ${dc.key}`, screenBounds[idx].start);
          diagnostics.push(
            extensionDiagnostic(
              document.positionAt(keyStart),
              document.positionAt(keyStart + `key: ${dc.key}`.length),
              DEFINED_CARD_NOT_REFERENCED,
            ),
          );
        });
    });

    return diagnostics;
  }

  /**
   * Provide diagnostics related to OIDs in the context of metrics.
   * @param document text document where diagnostics should be applied
   * @param extension extension.yaml serialized as object
   * @returns list of diagnostics
   */
  private async diagnoseMetricOids(
    document: vscode.TextDocument,
    extension: ExtensionStub,
  ): Promise<vscode.Diagnostic[]> {
    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Honor the user's settings and bail early if no screens
    if (
      (!vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("diagnostics.snmp", false) as boolean) ||
      !extension.snmp
    ) {
      return [];
    }

    // Get metrics and keep the OID-based ones
    const metrics = (
      getMetricsFromDataSource(extension, true) as {
        type: string;
        key: string;
        value: string;
      }[]
    ).filter(m => m.value.startsWith("oid:"));

    // Reduce the time by bulk fetching all required OIDs
    await this.cachedData.updateSnmpData(metrics.map(m => oidFromMetriValue(m.value)));
    const metricInfos = metrics.map(m => ({
      key: m.key,
      type: m.type,
      value: m.value,
      info: this.snmpData[oidFromMetriValue(m.value)],
    }));

    for (const metric of metricInfos) {
      const oid = metric.value.slice(4);
      const oidRegex = new RegExp(
        `value: "?oid:${oid.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`,
        "gm",
      );

      let match;
      while ((match = oidRegex.exec(content)) !== null) {
        const startPos = document.positionAt(match.index + match[0].indexOf(oid));
        const endPos = document.positionAt(match.index + match[0].indexOf(oid) + oid.length);

        // Check if valid
        if (!/^\d[.\d]+\d$|^[\da-zA-Z]+$/.test(oid)) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_SYNTAX_INVALID));

          // Check we have online data
        } else if (!metric.info.objectType) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_DOES_NOT_EXIST));

          // Check things we can infer from online data
        } else {
          if (!isOidReadable(metric.info)) {
            diagnostics.push(extensionDiagnostic(startPos, endPos, OID_NOT_READABLE));
          }
          if (metric.info.syntax?.toLowerCase().includes("string")) {
            diagnostics.push(extensionDiagnostic(startPos, endPos, OID_STRING_AS_METRIC));
          }
          if (metric.info.syntax) {
            // Since OID & metric are re-usable we must get the whole yaml block and match both
            const blockStart = content.lastIndexOf("-", match.index);
            const nextDashIdx = content.indexOf("-", match.index);
            const blockEnd =
              nextDashIdx !== -1
                ? isSameList(nextDashIdx, document)
                  ? content.lastIndexOf("\n", nextDashIdx)
                  : content.indexOf(
                      document.lineAt(document.positionAt(nextDashIdx).line - 1).text,
                      match.index,
                    )
                : getNextElementIdx(
                    document.lineAt(document.positionAt(match.index)).lineNumber,
                    document,
                    match.index,
                  );

            if (metric.type === "gauge" && metric.info.syntax.startsWith("Counter")) {
              if (content.substring(blockStart, blockEnd).includes(metric.key)) {
                diagnostics.push(extensionDiagnostic(startPos, endPos, OID_COUNTER_AS_GAUGE));
              }
            }
            if (
              metric.type === "count" &&
              (metric.info.syntax === "Gauge" ||
                metric.info.syntax.toLowerCase().includes("integer"))
            ) {
              if (content.substring(blockStart, blockEnd).includes(metric.key)) {
                diagnostics.push(extensionDiagnostic(startPos, endPos, OID_GAUGE_AS_COUNTER));
              }
            }
            diagnostics.push(
              ...(await this.createTableOidDiagnostics(
                metric,
                oid,
                startPos,
                endPos,
                content,
                extension,
              )),
            );
          }
        }
      }
    }

    return diagnostics;
  }

  /**
   * Provide diagnostics related to OIDs in the context of metric dimensions.
   * @param document text document where diagnostics should be applied
   * @param extension extension.yaml serialized as object
   * @returns list of diagnostics
   */
  private async diagnoseDimensionOids(
    document: vscode.TextDocument,
    extension: ExtensionStub,
  ): Promise<vscode.Diagnostic[]> {
    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Honor the user's settings and bail early if no screens
    if (
      (!vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("diagnostics.snmp", false) as boolean) ||
      !extension.snmp
    ) {
      return [];
    }

    // Get dimensions and tidy up OIDs (.0 ending is not valid for lookups)
    const dimensions = (
      getDimensionsFromDataSource(extension, true) as { key: string; value: string }[]
    )
      .filter(d => d.value.startsWith("oid:"))
      .map(d => ({
        key: d.key,
        value: d.value.endsWith(".0") ? d.value.slice(0, d.value.length - 2) : d.value,
      }));
    // Reduce the time by bulk fetching all required OIDs
    await this.cachedData.updateSnmpData(dimensions.map(d => d.value.split("oid:")[1]));
    const dimensionInfos = dimensions.map(d => ({
      key: d.key,
      value: d.value,
      info: this.snmpData[d.value.split("oid:")[1]],
    }));

    for (const dimension of dimensionInfos) {
      const oid = dimension.value.slice(4);
      const oidRegex = new RegExp(
        `value: "?oid:${oid.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`,
        "gm",
      );

      let match;
      while ((match = oidRegex.exec(content)) !== null) {
        const startPos = document.positionAt(match.index + match[0].indexOf(oid));
        const endPos = document.positionAt(match.index + match[0].indexOf(oid) + oid.length);

        // Check if valid
        if (!/^\d[.\d]+\d$|^[\da-zA-Z]+$/.test(oid)) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_SYNTAX_INVALID));

          // Check if there is online data
        } else if (!dimension.info.objectType) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_DOES_NOT_EXIST));

          // Check things we can infer from the data
        } else {
          diagnostics.push(
            ...(await this.createTableOidDiagnostics(
              dimension,
              oid,
              startPos,
              endPos,
              content,
              extension,
            )),
          );
        }
      }
    }

    return diagnostics;
  }

  /**
   * Logic for checking whether a metric or dimension OID has any issues when it is related in some
   * way to a table: e.g. either subgroup defined as table but OID isn't or OID is for table but
   * subgroup isn't.
   * @param usageInfo
   * @param oid
   * @param startPos
   * @param endPos
   * @param content
   * @param extension
   * @param cachedData
   * @returns
   */
  private async createTableOidDiagnostics(
    usageInfo: {
      key: string;
      type?: string;
      value: string | undefined;
      info: OidInformation;
    },
    oid: string,
    startPos: vscode.Position,
    endPos: vscode.Position,
    content: string,
    extension: ExtensionStub,
  ): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const groupIdx = getBlockItemIndexAtLine("snmp", startPos.line, content);
    const subgroupIdx = getBlockItemIndexAtLine("subgroups", startPos.line, content);

    // Currently, table OID diagnostics only work with the ASN.1 notation for OIDs
    if (/^[\da-zA-Z]+$/.test(oid)) {
      return [];
    }

    // Honor the user's settings and bail early if no screens
    if (
      (!vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("diagnostics.snmp", false) as boolean) ||
      !extension.snmp
    ) {
      return [];
    }

    if (groupIdx !== -1 && subgroupIdx !== -1) {
      const subgroup = extension.snmp[groupIdx].subgroups?.[subgroupIdx];
      if (subgroup?.table) {
        if (usageInfo.value?.endsWith(".0")) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_DOT_ZERO_IN_TABLE));
        } else {
          // Get the second last index of '.' and slice oid from start
          const grandparentOid = oid.slice(0, oid.slice(0, oid.lastIndexOf(".")).lastIndexOf("."));
          // Get data for grandparent OID, then check for signs of table
          await this.cachedData.updateSnmpOid(grandparentOid);
          if (!isTable(this.snmpData[grandparentOid])) {
            diagnostics.push(extensionDiagnostic(startPos, endPos, OID_STATIC_OBJ_IN_TABLE));
          }
        }
      } else {
        if (!usageInfo.value?.endsWith(".0")) {
          diagnostics.push(extensionDiagnostic(startPos, endPos, OID_DOT_ZERO_MISSING));
        } else {
          // Remove '.0', get the second last index of '.' and slice oid from start
          const grandparentOid = oid.slice(
            0,
            oid.slice(0, oid.slice(0, oid.length - 2).lastIndexOf(".")).lastIndexOf("."),
          );
          // Get data for grandparent OID, then check for signs of table
          await this.cachedData.updateSnmpOid(grandparentOid);
          if (isTable(this.snmpData[grandparentOid])) {
            diagnostics.push(extensionDiagnostic(startPos, endPos, OID_TABLE_OBJ_AS_STATIC));
          }
        }
      }
    }
    return diagnostics;
  }
}
