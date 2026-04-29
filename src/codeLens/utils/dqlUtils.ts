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
import { ValidationStatus } from "./selectorUtils";

const logTrace = ["codeLens", "utils", "dqlUtils"];

/**
 * Extracts the DQL query string from a "dqlQuery" occurrence in JSON document text.
 *
 * Handles two forms:
 *   - String:  "dqlQuery": "fetch logs | ..."
 *   - Object:  "dqlQuery": { "idField": "...", "query": "fetch logs | ..." }
 *
 * Returns null if the DQL string cannot be determined.
 * Note: the full query-building logic for object form (combining query, lookups,
 * additionalCommands) is deferred — currently only the base "query" field is used.
 */
export function prepareDqlQuery(text: string, matchIndex: number): string | null {
  const fragment = text.slice(matchIndex, matchIndex + 4096);

  // String form: "dqlQuery": "..."
  const stringMatch = fragment.match(/^"dqlQuery"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (stringMatch) {
    return stringMatch[1];
  }

  // Object form: "dqlQuery": { ... "query": "..." ... }
  const objectStart = fragment.indexOf("{");
  if (objectStart !== -1) {
    const objectFragment = fragment.slice(objectStart, objectStart + 4096);
    const queryMatch = objectFragment.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (queryMatch) {
      return queryMatch[1];
    }
  }

  return null;
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
 * Resolves the $entityId template variable by fetching the first available
 * entity ID for the node type declared in the screen document.
 *
 * Looks for "nodeType": "<type>" in the document text, then executes a DQL
 * query against smartscapeNodes to retrieve the first matching entity ID.
 * Returns null if the node type cannot be found or no entities exist.
 */
export async function resolveEntityId(
  document: vscode.TextDocument,
  dtClient: DynatraceClient,
): Promise<string | null> {
  const nodeTypeMatch = document.getText().match(/"nodeType"\s*:\s*"([^"]+)"/);
  if (!nodeTypeMatch) {
    logger.warn("Cannot resolve $entityId: no nodeType found in screen document.", ...logTrace);
    return null;
  }

  const nodeType = nodeTypeMatch[1];
  const result = await dtClient.dql
    .execute(`fetch smartscapeNodes | filter type == "${nodeType}" | fields id | limit 1`)
    .catch(() => null);

  const id = result?.records[0]?.id;
  return typeof id === "string" ? id : null;
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

  if (dqlQuery.includes("$entityId")) {
    const entityId = await resolveEntityId(document, dtClient);
    if (!entityId) {
      logger.notify(
        "WARN",
        "Could not resolve $entityId: no entities found for the screen's node type.",
        ...logTrace,
      );
      return;
    }
    dqlQuery = dqlQuery.replace(/\$entityId/g, entityId);
  }

  try {
    const result = await dtClient.dql.execute(dqlQuery);
    statusCallback(rawDqlQuery, { status: "valid" });

    if (isTimeseriesQuery(dqlQuery)) {
      renderPanel(ViewType.MetricResults, "DQL query results", {
        dataType: PanelDataType.MetricResults,
        sourceType: "dql",
        data: normalizeDqlTimeseriesResult(rawDqlQuery, result.records),
      });
    } else {
      oc.clear();
      oc.appendLine(JSON.stringify({ query: rawDqlQuery, records: result.records }, null, 2));
      oc.show();
    }
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
      const status = await validateDql(dqlQuery, dtClient);
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

      runDql(dqlQuery, document, dtClient, logger.getGenericChannel(), statusCallback).catch(
        err => {
          logger.info(`Running DQL query failed unexpectedly. ${(err as Error).message}`);
        },
      );
    }),
  ];
};
