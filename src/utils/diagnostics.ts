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
import {
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
} from "../constants";
import { ExtensionStub } from "../interfaces/extensionMeta";
import {
  getCachedOid,
  getCachedParsedExtension,
  updateCachedOid,
  updateCachedSnmpOids,
} from "../utils/caching";
import { checkDtInternalProperties } from "../utils/conditionCheckers";
import {
  getDefinedCardsMeta,
  getDimensionsFromDataSource,
  getMetricsFromDataSource,
  getReferencedCardsMeta,
} from "../utils/extensionParsing";
import { isOidReadable, isTable, oidFromMetriValue, OidInformation } from "../utils/snmp";
import {
  getBlockItemIndexAtLine,
  getListItemIndexes,
  getNextElementIdx,
  isSameList,
} from "../utils/yamlParsing";
import * as logger from "./logging";

export interface ExtensionDiagnosticDto {
  code: string | number | { value: string | number; target: vscode.Uri } | undefined;
  severity: vscode.DiagnosticSeverity;
  message: string;
}

/**
 * Sets up event-based diagnostic updates. Our diagnostic collection will be updated whenever the
 * extension manifest file is opened, or after every save (with a 0.5 sec delay to reduce frequency).
 */
export const registerDiagnosticsEventListeners = (() => {
  let initialized = false;
  let editTimeout: NodeJS.Timeout | undefined;

  return () => {
    if (!initialized) {
      initialized = true;
      return [
        vscode.window.onDidChangeActiveTextEditor(editor => {
          updateDiagnosticsCollection(editor?.document).catch(err => {
            logger.error(
              `Could not provide diagnostics. ${(err as Error).message}`,
              "updateDiagnosticsCollection",
            );
          });
        }),
        vscode.workspace.onDidChangeTextDocument(change => {
          if (editTimeout) {
            clearTimeout(editTimeout);
            editTimeout = undefined;
          }
          editTimeout = setTimeout(() => {
            updateDiagnosticsCollection(change.document).catch(err => {
              logger.error(
                `Could not provide diagnostics. ${(err as Error).message}`,
                "updateDiagnosticsCollection",
              );
            });
            editTimeout = undefined;
          }, 500);
        }),
      ];
    }
    return [];
  };
})();

/**
 * Collects Extension 2.0 diagnostics and updates the collection managed by this module.
 */
const updateDiagnosticsCollection = async (document?: vscode.TextDocument) => {
  if (!document?.fileName.endsWith("extension.yaml")) return;

  // Bail early if needed
  const parsedExtension = getCachedParsedExtension();
  if (
    !parsedExtension ||
    !vscode.workspace.getConfiguration("dynatraceExtensions", null).get("diagnostics")
  ) {
    getDiagnosticsCollection().set(document.uri, []);
    return;
  }

  // Diagnostic collections should be awaited all in parallel
  const diagnostics = await Promise.all([
    diagnoseExtensionName(document),
    diagnoseMetricKeys(document, parsedExtension),
    diagnoseCardKeys(document, parsedExtension),
    diagnoseMetricOids(document, parsedExtension),
    diagnoseDimensionOids(document, parsedExtension),
  ]).then(results => results.reduce((collection, result) => collection.concat(result), []));

  getDiagnosticsCollection().set(document.uri, diagnostics);
};

const getDiagnosticsCollection = (() => {
  let diagnosticsCollection: vscode.DiagnosticCollection | undefined;

  return () => {
    diagnosticsCollection =
      diagnosticsCollection === undefined
        ? vscode.languages.createDiagnosticCollection("DynatraceExtensions")
        : diagnosticsCollection;
    return diagnosticsCollection;
  };
})();

/**
 * Retrieve the Diagnostics for a given file.
 */
export const getDiagnostics = (uri: vscode.Uri): vscode.Diagnostic[] => {
  return [...(getDiagnosticsCollection().get(uri) ?? [])];
};

/**
 * Provides diagnostics related to the name of an extension
 * @param content extension.yaml text content
 * @returns list of diagnostic items
 */
const diagnoseExtensionName = async (
  document: vscode.TextDocument,
): Promise<vscode.Diagnostic[]> => {
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
      createExtensionDiagnostic(
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
      diagnostics.push(createExtensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_TOO_LONG));
    }
    if (!nameRegex.test(extensionName)) {
      diagnostics.push(createExtensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_INVALID));
    }
    const bitBucketRepo = await checkDtInternalProperties();
    if (!extensionName.startsWith("custom:") && !bitBucketRepo) {
      diagnostics.push(createExtensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_NON_CUSTOM));
    }
    if (extensionName.startsWith("custom:") && bitBucketRepo) {
      diagnostics.push(
        createExtensionDiagnostic(nameStart, nameEnd, EXTENSION_NAME_CUSTOM_ON_BITBUCKET),
      );
    }
  }
  return diagnostics;
};

/**
 * Provides diagnostics related to the keys of metrics.
 * To fully comply with the metric protocol, count metrics should end in `.count` and
 * gauge metrics should not end in `.count`. This is not only best practice but will
 * also screw with some of our automated functions.
 * @param document text document where diagnostics should be applied
 * @param extension extension.yaml serialized as object
 * @returns list of diagnostics
 */
const diagnoseMetricKeys = async (
  document: vscode.TextDocument,
  extension: ExtensionStub,
): Promise<vscode.Diagnostic[]> => {
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
      const metricRegex = new RegExp(`key: "?${m.key.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`, "gm");
      let match;
      while ((match = metricRegex.exec(content)) !== null) {
        diagnostics.push(
          createExtensionDiagnostic(
            document.positionAt(match.index + match[0].indexOf(m.key)),
            document.positionAt(match.index + match[0].indexOf(m.key) + m.key.length),
            m.type === "count" ? COUNT_METRIC_KEY_SUFFIX : GAUGE_METRIC_KEY_SUFFIX,
          ),
        );
      }
    });

  return diagnostics;
};

/**
 * Provide diagnostics related to card keys within a screen definition.
 * Users are warned if cards that have definitions are not used within layouts of the screen.
 * Errors are raised if cards are referenced within layouts but do not have a definition.
 * @param document text document where diagnostics should be applied
 * @param extension extension.yaml serialized as object
 * @returns list of diagnostics
 */
const diagnoseCardKeys = async (
  document: vscode.TextDocument,
  extension: ExtensionStub,
): Promise<vscode.Diagnostic[]> => {
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
          createExtensionDiagnostic(
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
          createExtensionDiagnostic(
            document.positionAt(keyStart),
            document.positionAt(keyStart + `key: ${dc.key}`.length),
            DEFINED_CARD_NOT_REFERENCED,
          ),
        );
      });
  });

  return diagnostics;
};

/**
 * Provide diagnostics related to OIDs in the context of metrics.
 * @param document text document where diagnostics should be applied
 * @param extension extension.yaml serialized as object
 * @returns list of diagnostics
 */
const diagnoseMetricOids = async (
  document: vscode.TextDocument,
  extension: ExtensionStub,
): Promise<vscode.Diagnostic[]> => {
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
  await updateCachedSnmpOids(metrics.map(m => oidFromMetriValue(m.value)));
  const metricInfos = metrics.map(m => ({
    key: m.key,
    type: m.type,
    value: m.value,
    info: getCachedOid(oidFromMetriValue(m.value)),
  }));

  for (const metric of metricInfos) {
    const oid = metric.value.slice(4);
    const oidRegex = new RegExp(`value: "?oid:${oid.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`, "gm");

    let match;
    while ((match = oidRegex.exec(content)) !== null) {
      const startPos = document.positionAt(match.index + match[0].indexOf(oid));
      const endPos = document.positionAt(match.index + match[0].indexOf(oid) + oid.length);

      // Check if valid
      if (!/^\d[.\d]+\d$|^[\da-zA-Z]+$/.test(oid)) {
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_SYNTAX_INVALID));

        // Check we have online data
      } else if (!metric.info?.objectType) {
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_DOES_NOT_EXIST));

        // Check things we can infer from online data
      } else {
        if (!isOidReadable(metric.info)) {
          diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_NOT_READABLE));
        }
        if (metric.info.syntax?.toLowerCase().includes("string")) {
          diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_STRING_AS_METRIC));
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
              diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_COUNTER_AS_GAUGE));
            }
          }
          if (
            metric.type === "count" &&
            (metric.info.syntax === "Gauge" || metric.info.syntax.toLowerCase().includes("integer"))
          ) {
            if (content.substring(blockStart, blockEnd).includes(metric.key)) {
              diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_GAUGE_AS_COUNTER));
            }
          }
          diagnostics.push(
            ...(await createTableOidDiagnostics(
              metric as { key: string; value: string; info: OidInformation },
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
};

/**
 * Provide diagnostics related to OIDs in the context of metric dimensions.
 * @param document text document where diagnostics should be applied
 * @param extension extension.yaml serialized as object
 * @returns list of diagnostics
 */
const diagnoseDimensionOids = async (
  document: vscode.TextDocument,
  extension: ExtensionStub,
): Promise<vscode.Diagnostic[]> => {
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
  await updateCachedSnmpOids(dimensions.map(d => d.value.split("oid:")[1]));
  const dimensionInfos = dimensions.map(d => ({
    key: d.key,
    value: d.value,
    info: getCachedOid(d.value.split("oid:")[1]),
  }));

  for (const dimension of dimensionInfos) {
    const oid = dimension.value.slice(4);
    const oidRegex = new RegExp(`value: "?oid:${oid.replace(/\./g, "\\.")}"?(?:$|(?: .*$))`, "gm");

    let match;
    while ((match = oidRegex.exec(content)) !== null) {
      const startPos = document.positionAt(match.index + match[0].indexOf(oid));
      const endPos = document.positionAt(match.index + match[0].indexOf(oid) + oid.length);

      // Check if valid
      if (!/^\d[.\d]+\d$|^[\da-zA-Z]+$/.test(oid)) {
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_SYNTAX_INVALID));

        // Check if there is online data
      } else if (!dimension.info?.objectType) {
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_DOES_NOT_EXIST));

        // Check things we can infer from the data
      } else {
        diagnostics.push(
          ...(await createTableOidDiagnostics(
            dimension as { key: string; value: string; info: OidInformation },
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
};

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
const createTableOidDiagnostics = async (
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
): Promise<vscode.Diagnostic[]> => {
  const diagnostics: vscode.Diagnostic[] = [];
  const groupIdx = getBlockItemIndexAtLine("snmp", startPos.line, content);
  const subgroupIdx = getBlockItemIndexAtLine("subgroups", startPos.line, content);

  // Currently, table OID diagnostics only work with the ASN.1 notation for OIDs
  if (/^[\da-zA-Z]+$/.test(oid)) {
    return [];
  }

  // Honor the user's settings and bail early if diagnostics disabled.
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
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_DOT_ZERO_IN_TABLE));
      } else {
        // Get the second last index of '.' and slice oid from start
        const grandparentOid = oid.slice(0, oid.slice(0, oid.lastIndexOf(".")).lastIndexOf("."));
        // Get data for grandparent OID, then check for signs of table
        await updateCachedOid(grandparentOid);
        const oidInfo = getCachedOid(grandparentOid);
        if (oidInfo) {
          if (!isTable(oidInfo)) {
            diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_STATIC_OBJ_IN_TABLE));
          }
        }
      }
    } else {
      if (!usageInfo.value?.endsWith(".0")) {
        diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_DOT_ZERO_MISSING));
      } else {
        // Remove '.0', get the second last index of '.' and slice oid from start
        const grandparentOid = oid.slice(
          0,
          oid.slice(0, oid.slice(0, oid.length - 2).lastIndexOf(".")).lastIndexOf("."),
        );
        // Get data for grandparent OID, then check for signs of table
        await updateCachedOid(grandparentOid);
        const oidInfo = getCachedOid(grandparentOid);
        if (oidInfo) {
          if (isTable(oidInfo)) {
            diagnostics.push(createExtensionDiagnostic(startPos, endPos, OID_TABLE_OBJ_AS_STATIC));
          }
        }
      }
    }
  }
  return diagnostics;
};

/**
 * Creates a {@link vscode.Diagnostic} from a known Extension Diagnostic
 */
function createExtensionDiagnostic(
  startPos: vscode.Position,
  endPos: vscode.Position,
  diagnostic: ExtensionDiagnosticDto,
): vscode.Diagnostic {
  return {
    range: new vscode.Range(startPos, endPos),
    message: diagnostic.message,
    code: diagnostic.code,
    severity: diagnostic.severity,
    source: "Dynatrace Extensions",
  };
}
