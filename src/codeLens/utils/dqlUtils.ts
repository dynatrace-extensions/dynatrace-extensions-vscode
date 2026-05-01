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

import {
  CodeLensCommand,
  MetricSeriesCollection,
  MetricSeries,
  PanelDataType,
  ViewType,
  DqlResultsPanelData,
} from "@common";
import vscode from "vscode";
import { DynatraceClient } from "../../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../../dynatrace-api/errors";
import { DqlRecord } from "../../dynatrace-api/interfaces/dql";
import { getDynatraceClient } from "../../treeViews/tenantsTreeView";
import { checkTenantConnected } from "../../utils/conditionCheckers";
import logger from "../../utils/logging";
import { renderPanel } from "../../webviews/webview-utils";
import { updateDqlValidationStatus } from "../dqlCodeLens";
import { DqlSyntaxErrorPosition, ValidationStatus } from "./selectorUtils";

const logTrace = ["codeLens", "utils", "dqlUtils"];

/**
 * Extracts the JSON object substring starting at `start` (which must be `{`)
 * by tracking bracket depth while respecting JSON string literals.
 */
function extractJsonObjectText(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
        } else if (text[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
    i++;
  }
  return null;
}

type DqlObjectForm = {
  query: string;
  lookups?: Array<
    | { query: string; sourceField: string; lookupField: string; fields: string[] }
    | { builtInLookup: string; filterExpression?: string }
  >;
  additionalCommands?: Array<{ query: string }>;
};

/**
 * Composes an executable DQL string from an object-form dqlQuery, assembling
 * lookup sub-queries and additional commands into a single piped query.
 *
 * AlertLookup entries (builtInLookup) have no DQL representation and are skipped.
 */
function assembleObjectFormDql(obj: DqlObjectForm): string {
  const parts: string[] = [obj.query];

  for (const lookup of obj.lookups ?? []) {
    if (!("query" in lookup)) continue; // AlertLookup — no DQL form
    parts.push(
      `| lookup [ ${lookup.query} ], sourceField: ${lookup.sourceField}, lookupField: ${lookup.lookupField}, fields: { ${lookup.fields.join(", ")} }`,
    );
  }

  for (const cmd of obj.additionalCommands ?? []) {
    parts.push(`| ${cmd.query}`);
  }

  return parts.join("\n");
}

/**
 * Extracts the DQL query string from a "dqlQuery" occurrence in JSON document text.
 *
 * Handles two forms:
 *   - String:  "dqlQuery": "fetch logs | ..."
 *   - Object:  "dqlQuery": { "idField": "...", "query": "...", "lookups": [...], "additionalCommands": [...] }
 *
 * For the object form the full query is assembled: base query + lookup pipes + additional commands.
 * Returns null if the DQL string cannot be determined.
 */
export function prepareDqlQuery(text: string, matchIndex: number): string | null {
  const fragment = text.slice(matchIndex, matchIndex + 4096);

  // String form: "dqlQuery": "..."
  const stringMatch = fragment.match(/^"dqlQuery"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (stringMatch) {
    return stringMatch[1];
  }

  // Object form: "dqlQuery": { ... }
  const objectStart = fragment.indexOf("{");
  if (objectStart !== -1) {
    const objectText = extractJsonObjectText(fragment, objectStart);
    if (objectText) {
      try {
        const obj = JSON.parse(objectText) as DqlObjectForm;
        if (typeof obj.query === "string") {
          return assembleObjectFormDql(obj);
        }
      } catch {
        // Fallback: extract "query" field via regex
      }
    }
    // Fallback for malformed JSON: grab the "query" field directly
    const objectFragment = fragment.slice(objectStart, objectStart + 4096);
    const queryMatch = objectFragment.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (queryMatch) {
      return queryMatch[1];
    }
  }

  return null;
}

/**
 * Converts JSON string escape sequences in a raw DQL query to their actual characters
 * so that the DQL engine receives the unescaped string (it does not understand JSON escapes).
 * Order matters: backslash-backslash must be handled last to avoid double-processing.
 */
export function sanitizeDqlQuery(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Returns true when the DQL query's first command is "timeseries".
 */
export function isTimeseriesQuery(dql: string): boolean {
  return /^\s*timeseries\b/i.test(dql.split("|")[0]);
}

const TIMESERIES_SKIP_FIELDS = new Set(["timeframe", "interval", "timestamps"]);

/**
 * Converts DQL timeseries records into MetricSeriesCollection[] for the MetricResults panel.
 *
 * DQL timeseries records have: timestamps (number[]), one or more numeric array value fields,
 * and string dimension fields. Each record becomes one MetricSeries; all records are grouped
 * into a single MetricSeriesCollection keyed by the query string.
 */
export function normalizeDqlTimeseriesResult(
  query: string,
  records: DqlRecord[],
): MetricSeriesCollection[] {
  const series: MetricSeries[] = records.map(record => {
    const timestamps = Array.isArray(record.timestamps) ? (record.timestamps as number[]) : [];

    let values: number[] = [];
    for (const [key, val] of Object.entries(record)) {
      if (
        !TIMESERIES_SKIP_FIELDS.has(key) &&
        Array.isArray(val) &&
        val.length > 0 &&
        (typeof val[0] === "number" || val[0] === null)
      ) {
        values = (val as (number | null)[]).map(v => v ?? 0);
        break;
      }
    }

    const dimensionMap: Record<string, string> = {};
    for (const [key, val] of Object.entries(record)) {
      if (!TIMESERIES_SKIP_FIELDS.has(key) && typeof val === "string") {
        dimensionMap[key] = val;
      }
    }

    return { timestamps, values, dimensionMap, dimensions: Object.values(dimensionMap) };
  });

  return [{ metricId: query, dataPointCountRatio: 1, dimensionCountRatio: 1, data: series }];
}

/**
 * Resolves the $(entityId) template variable by fetching the first available
 * entity ID for the node type derived from the screen document's filename.
 *
 * The filename convention for generated screen files is `NODE_TYPE.*.json`,
 * so the first dot-separated segment is always the node type.
 * Returns null if the node type cannot be derived or no entities exist.
 */
export async function resolveEntityId(
  document: vscode.TextDocument,
  dtClient: DynatraceClient,
): Promise<string | null> {
  const fileName = document.fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const nodeType = fileName.split(".")[0];

  if (!nodeType) {
    logger.warn(
      "Cannot resolve $(entityId): could not derive node type from filename.",
      ...logTrace,
    );
    return null;
  }

  const result = await dtClient.dql
    .execute(`smartscapeNodes ${nodeType.toUpperCase()} | limit 1`)
    .catch(() => null);

  const id = result?.records[0]?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Attempts to parse `syntaxErrorPosition` from a DQL API error message string.
 * The API embeds position info as JSON within the plain-text message.
 */
export function parseSyntaxErrorPosition(message: string): DqlSyntaxErrorPosition | null {
  const match = message.match(/syntaxErrorPosition:\s*(\{.+\})/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (parsed !== null && typeof parsed === "object" && "start" in parsed && "end" in parsed) {
      return parsed as DqlSyntaxErrorPosition;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Maps a character index within a sanitized (unescaped) DQL query back to a VSCode Position
 * in the source document, accounting for JSON escape sequences in the raw string value.
 *
 * The document contains the DQL as a JSON string (escape sequences intact). We walk the raw
 * JSON value character-by-character, counting both raw and unescaped offsets, until we reach
 * the target unescaped index, then convert the raw document offset to a Position.
 */
export function mapQueryIndexToDocumentPosition(
  document: vscode.TextDocument,
  matchIndex: number,
  queryCharIndex: number,
): vscode.Position | null {
  const text = document.getText();

  // Find the opening quote of the string value after "dqlQuery":
  const fragment = text.slice(matchIndex, matchIndex + 4096);
  const valueQuoteOffset = fragment.indexOf('"', fragment.indexOf(":") + 1);
  if (valueQuoteOffset === -1) return null;

  const valueStart = matchIndex + valueQuoteOffset + 1; // first char inside the string
  let rawOffset = 0;
  let unescapedOffset = 0;

  while (unescapedOffset < queryCharIndex && valueStart + rawOffset < text.length) {
    const ch = text[valueStart + rawOffset];
    if (ch === "\\") {
      // Escape sequence: counts as 1 unescaped char regardless of raw length
      const next = text[valueStart + rawOffset + 1];
      rawOffset += next === "u" ? 6 : 2; // \uXXXX = 6 raw chars; others = 2
    } else {
      rawOffset++;
    }
    unescapedOffset++;
  }

  return document.positionAt(valueStart + rawOffset);
}

/**
 * Validates a DQL query using the verify API and returns a ValidationStatus.
 */
export async function validateDql(
  dqlQuery: string,
  dtClient: DynatraceClient,
): Promise<ValidationStatus> {
  return dtClient.dql
    .verify(dqlQuery)
    .then(
      (res): ValidationStatus =>
        res.valid
          ? { status: "valid" }
          : {
              status: "invalid",
              error: {
                code: "DQL_INVALID",
                message: res.notifications?.[0]?.message ?? "Invalid DQL query",
              },
            },
    )
    .catch(
      (err: DynatraceAPIError): ValidationStatus => ({
        status: "invalid",
        error: { code: err.errorParams.code, message: err.errorParams.message },
      }),
    );
}

/**
 * Executes a DQL query and displays results.
 *
 * - Resolves $entityId from the document's node type before executing when present.
 * - Timeseries queries: rendered in the MetricResults webview panel.
 * - All other queries: output channel as JSON records.
 */
export async function runDql(
  rawDqlQuery: string,
  document: vscode.TextDocument,
  dtClient: DynatraceClient,
  oc: vscode.OutputChannel,
  statusCallback: (query: string, status: ValidationStatus) => void,
): Promise<void> {
  let dqlQuery = rawDqlQuery;

  if (dqlQuery.includes("$(entityId)")) {
    const entityId = await resolveEntityId(document, dtClient);
    if (!entityId) {
      logger.notify(
        "WARN",
        "Could not resolve $(entityId): no entities found for the screen's node type.",
        ...logTrace,
      );
      return;
    }
    dqlQuery = dqlQuery.replace(/\$\(entityId\)/g, `"${entityId}"`);
  }

  try {
    const result = await dtClient.dql.execute(dqlQuery);
    statusCallback(rawDqlQuery, { status: "valid" });

    const timeseries = isTimeseriesQuery(dqlQuery);
    const panelData: DqlResultsPanelData = {
      dataType: PanelDataType.DqlResults,
      dqlQuery: rawDqlQuery,
      isTimeseries: timeseries,
      ...(timeseries
        ? { timeseriesData: normalizeDqlTimeseriesResult(rawDqlQuery, result.records) }
        : { records: result.records as Record<string, unknown>[] }),
    };
    renderPanel(ViewType.DqlQueryResults, "DQL Query Results", panelData);
  } catch (err: unknown) {
    const errorParams = (err as DynatraceAPIError).errorParams;
    statusCallback(rawDqlQuery, {
      status: "invalid",
      error: { code: errorParams.code, message: errorParams.message },
    });
    oc.clear();
    oc.appendLine(
      JSON.stringify(
        {
          query: rawDqlQuery,
          responseCode: errorParams.code,
          message: errorParams.message,
        },
        null,
        2,
      ),
    );
    oc.show();
  }
}

/**
 * Registers commands for the DQL code lens actions.
 */
export const registerDqlCommands = (): vscode.Disposable[] => {
  return [
    vscode.commands.registerCommand(CodeLensCommand.ValidateDqlQuery, async (dqlQuery: string) => {
      if (!(await checkTenantConnected())) return;
      const dtClient = await getDynatraceClient();
      if (!dtClient) return;

      updateDqlValidationStatus(dqlQuery, { status: "loading" });

      let sanitized = sanitizeDqlQuery(dqlQuery);
      if (sanitized.includes("$(entityId)")) {
        const document = vscode.window.activeTextEditor?.document;
        const entityId = document ? await resolveEntityId(document, dtClient) : null;
        if (!entityId) {
          updateDqlValidationStatus(dqlQuery, { status: "unknown" });
          logger.notify(
            "WARN",
            "Could not resolve $(entityId): no entities found for the screen's node type.",
            ...logTrace,
          );
          return;
        }
        sanitized = sanitized.replace(/\$\(entityId\)/g, `"${entityId}"`);
      }

      const status = await validateDql(sanitized, dtClient);
      updateDqlValidationStatus(dqlQuery, status);
    }),
    vscode.commands.registerCommand(CodeLensCommand.RunDqlQuery, async (dqlQuery: string) => {
      if (!(await checkTenantConnected())) return;
      const dtClient = await getDynatraceClient();
      if (!dtClient) return;

      const document = vscode.window.activeTextEditor?.document;
      if (!document) return;

      const statusCallback = (query: string, status: ValidationStatus) =>
        updateDqlValidationStatus(query, status);

      runDql(
        sanitizeDqlQuery(dqlQuery),
        document,
        dtClient,
        logger.getGenericChannel(),
        statusCallback,
      ).catch(err => {
        logger.info(`Running DQL query failed unexpectedly. ${(err as Error).message}`);
      });
    }),
  ];
};
