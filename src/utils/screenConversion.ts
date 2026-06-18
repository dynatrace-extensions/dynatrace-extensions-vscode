/**
  Copyright 2025 Dynatrace LLC

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

/********************************************************************************
 * UTILITIES FOR SCREEN CONVERSION (YAML → JSON document format)
 ********************************************************************************/

import {
  BuiltInColumn,
  CardActions,
  CellRenderer,
  Chart,
  ChartGroup,
  ChartPieChartVisualization,
  ChartSeriesOverride,
  ChartSingleValueVisualization,
  ChartTimeseriesChartVisualization,
  ChartTimeseriesMetricVisualization,
  Condition,
  DqlConditionsContext,
  DqlTable,
  DqlTableColumn,
  DqlTableQuery,
  DqlVariableCondition,
  IntentAction,
  Message,
  Metadata,
  MetadataFieldConfig,
} from "@dynatrace/unified-analysis/documents";
import {
  ChartsCardStub,
  ChartMetric,
  ChartStub,
  DqlTableCardStub,
  DqlTableColumnStub,
  HealthCardStub,
  isAttributeProperty,
  isRelationProperty,
  MessageCardStub,
  MetricVisualizationType,
  PropertiesCard,
  ColorOverride,
  isDqlProperty,
} from "../interfaces/extensionMeta";
import {
  ConditionInfo,
  ConditionName,
  ConversionWarning,
  DqlParseResult,
  DqlQueryInfo,
  DqlTableColumnType,
  DqlTableColumnWidthType,
  EntityToNodeMap,
  FoldTransformation,
  MessageColor,
  NodeContext,
  ScreenConversionContext,
  TimeseriesDqlInfo,
  WarningCategory,
} from "../interfaces/screenConversion";
import { createIdHash } from "./cryptography";

/**
 * Generates a markdown conversion report for a single entity type.
 */
export function generateConversionReport(
  context: ScreenConversionContext,
  filesWritten: string[],
  warnings: ConversionWarning[],
): string {
  const lines: string[] = [
    "",
    `## ${context.entityType}`,
    "",
    `**Node type:** ${context.nodeType}`,
    "",
    "### Files Generated",
    "",
    ...(filesWritten.length === 0 ? ["None"] : filesWritten.map(f => `- \`${f}\``)),
    "",
  ];

  if (warnings.length > 0) {
    lines.push("### Warnings", "");

    const grouped = new Map<string, ConversionWarning[]>();
    for (const w of warnings) {
      const existing = grouped.get(w.category) ?? [];
      existing.push(w);
      grouped.set(w.category, existing);
    }

    for (const [category, categoryWarnings] of grouped) {
      lines.push(`#### ${formatCategoryTitle(category)}`, "");
      for (const w of categoryWarnings) {
        lines.push(`- ${w.message}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatCategoryTitle(category: string): string {
  return category
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Helper to push a warning into a warnings array.
 * When a hint is provided it is prepended as a location prefix: "[screenType.cardKey.element] message".
 */
export function addWarning(
  warnings: ConversionWarning[],
  category: WarningCategory,
  message: string,
  hint?: string,
): void {
  warnings.push({ category, message: hint ? `[${hint}] ${message}` : message });
}

// ---------------------------------------------------------------------------
// Target filtering
// ---------------------------------------------------------------------------

/**
 * Returns true if the item should be skipped.
 * Omitted target defaults to CLASSIC (the platform-native format never carries classic-only items).
 */
export function shouldSkipByTarget(target?: string): boolean {
  return target === undefined || target === "CLASSIC";
}

/**
 * Resolves the effective target for a child element: the child's own value takes precedence;
 * if absent, the parent's value is inherited.
 */
export function resolveTarget(
  own: string | undefined,
  parent: string | undefined,
): string | undefined {
  return own ?? parent;
}

// ---------------------------------------------------------------------------
// Charts card converter (chartsCards → chart-group)
// ---------------------------------------------------------------------------

export function convertChartsCard(
  context: ScreenConversionContext,
  card: ChartsCardStub,
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [ChartGroup | null, string[]] {
  let conditionIds: string[] = [];
  const effectiveTarget = resolveTarget(card.target, parentTarget);
  if (shouldSkipByTarget(effectiveTarget)) {
    addWarning(
      warnings,
      "skipped-classic",
      `chartsCard "${card.key}" skipped (target: CLASSIC)`,
      hint,
    );
    return [null, conditionIds];
  }

  const charts: Chart[] = [];
  for (let i = 0; i < card.charts.length; i++) {
    const chartHint = hint ? `${hint}.chart-${i}` : undefined;
    const converted = convertChart(card.charts[i], `${card.key}-chart-${i}`, warnings, chartHint);
    if (converted) charts.push(converted);
  }

  if (charts.length === 0) {
    addWarning(warnings, "no-dql", `chartsCard "${card.key}" produced no convertible charts`, hint);
    return [null, conditionIds];
  }

  const element: ChartGroup = {
    type: "chart-group",
    id: card.key,
    charts,
  };
  if (card.displayName) element.cardTitle = card.displayName;
  if (card.description) element.cardDescription = card.description;
  if (card.numberOfVisibleCharts) element.defaultVisibleChartsNumber = card.numberOfVisibleCharts;
  if (card.mode) element.mode = card.mode;

  if (card.conditions) {
    const [dqlConditions, foundIds] = convertConditions(context, card.conditions, warnings, hint);
    if (dqlConditions.length > 0) {
      element.conditions = dqlConditions;
      conditionIds = foundIds;
    }
  }

  return [element, conditionIds];
}

// ---------------------------------------------------------------------------
// Individual chart converters
// ---------------------------------------------------------------------------

function convertChart(
  chart: ChartStub,
  chartId: string,
  warnings: ConversionWarning[],
  hint?: string,
): Chart | null {
  switch (chart.visualizationType) {
    case "GRAPH_CHART":
      return convertGraphChart(chart, chartId, warnings, hint);
    case "PIE_CHART":
      return convertPieChart(chart, chartId, warnings, hint);
    case "SINGLE_VALUE":
      return convertSingleValueChart(chart, chartId, warnings, hint);
    default:
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Unknown visualization type "${chart.visualizationType}" in chart "${chartId}"`,
        hint,
      );
      return null;
  }
}

/**
 * Converts a GRAPH_CHART with one or more metrics into a TIMESERIES_CHART.
 * Multi-metric charts combine all DQL queries into a single timeseries block.
 */
function convertGraphChart(
  chart: ChartStub,
  chartId: string,
  warnings: ConversionWarning[],
  hint?: string,
): Chart | null {
  const config = chart.graphChartConfig;
  if (!config?.metrics || config.metrics.length === 0) return null;

  const dqlMetrics = graphChartMetricsToDqlInfo(config.metrics);
  const nonDqlMetrics = config.metrics.filter(m => !m.dqlQuery);

  if (nonDqlMetrics.length > 0) {
    const skippedNames = nonDqlMetrics.map(m => m.visualization?.displayName ?? m.metricSelector);
    if (dqlMetrics.length > 0) {
      addWarning(
        warnings,
        "multi-metric-partial",
        `Chart "${chartId}": ${nonDqlMetrics.length} metric(s) skipped (no dqlQuery): ${skippedNames.join(", ")}`,
        hint,
      );
    } else {
      addWarning(warnings, "no-dql", `Chart "${chartId}" skipped — no metrics have dqlQuery`, hint);
      return null;
    }
  }

  const dqlQuery = combineDqlQueries(dqlMetrics);
  const visualization: ChartTimeseriesChartVisualization = {
    type: "TIMESERIES_CHART",
    variant: mapSeriesType(config.visualization?.seriesType),
  };

  if (config.yAxes && config.yAxes.length > 0) {
    visualization.axesSettings = {
      yAxes: config.yAxes.map(axis => ({
        position: axis.position.toLowerCase() as "left" | "right",
        min: axis.min ? Number(axis.min) : undefined,
        max: axis.max ? Number(axis.max) : undefined,
      })),
    };
  }

  const metricOverrides: Record<string, ChartTimeseriesMetricVisualization> = {};
  for (const metric of dqlMetrics) {
    if (!metric.name) continue;
    if (metric.visualization) {
      metricOverrides[metric.name] = metric.visualization;
    }
  }
  if (Object.keys(metricOverrides).length > 0) {
    visualization.metrics = metricOverrides;
  }

  return {
    id: chartId,
    displayName: chart.displayName ?? "Graph chart",
    dqlQuery,
    visualization,
  };
}

// ---------------------------------------------------------------------------
// DQL query parsing — extracts metric fields and named args
// ---------------------------------------------------------------------------

/**
 * Parses a full DQL query string and returns the metric field names it exposes
 * plus any trailing named args (by:, filter:, etc.).
 *
 * - If the query ends with a `summarize` pipe stage, that stage determines the fields.
 * - Otherwise, the leading `timeseries` command determines the fields.
 * - Returns `{ metricFields: [] }` for unrecognised patterns.
 */
export function parseDqlQuery(dqlQuery: string): DqlQueryInfo {
  const segments = splitDqlPipes(dqlQuery);

  const lastSummarize = [...segments].reverse().find(s => /^summarize\b/i.test(s.trimStart()));
  if (lastSummarize) return { dqlQuery, ...parseSummarizeSegment(lastSummarize.trimStart()) };

  const firstSegment = segments[0]?.trimStart() ?? "";
  if (/^timeseries\b/i.test(firstSegment))
    return { dqlQuery, ...parseTimeseriesSegment(firstSegment) };

  return { dqlQuery, metricFields: [], seriesText: "" };
}

/**
 * Splits a DQL query on pipe characters (`|`) while respecting:
 * - brace nesting `{ }`
 * - parenthesis nesting `( )`
 * - bracket nesting `[ ]` (sub-query blocks for append/join/lookup)
 * - backtick-quoted identifiers
 */
export function splitDqlPipes(query: string): string[] {
  const segments: string[] = [];
  let current = "";
  let depth = 0;
  let inBacktick = false;

  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === "`") {
      inBacktick = !inBacktick;
      current += ch;
    } else if (inBacktick) {
      current += ch;
    } else if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      current += ch;
    } else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "|" && depth === 0) {
      segments.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments;
}

/**
 * Parses a `timeseries` pipe segment.
 * Handles both single-metric (`timeseries alias=func(m)`) and
 * multi-metric braced forms (`timeseries { alias=func(m), ... }`).
 */
function parseTimeseriesSegment(segment: string): DqlParseResult {
  const body = segment.replace(/^timeseries\s*/i, "");
  return parseMetricBody(body);
}

/**
 * Parses a `summarize` pipe segment.
 * Handles both single-metric (`summarize alias=expr`) and
 * braced forms (`summarize { alias=expr, ... }`).
 */
function parseSummarizeSegment(segment: string): DqlParseResult {
  const body = segment.replace(/^summarize\s*/i, "");
  return parseMetricBody(body);
}

/**
 * Parses a metric body — the part of a command after the keyword.
 * Separates the metric series (braced or single) from trailing named args.
 */
function parseMetricBody(body: string): DqlParseResult {
  const trimmed = body.trim();

  if (trimmed.startsWith("{")) {
    return parseBodyWithBracedSeries(trimmed);
  }
  return parseBodyWithSingleSeries(trimmed);
}

/**
 * Handles bodies where the metric series is a `{ ... }` block.
 * Named args follow after the closing `}`.
 */
function parseBodyWithBracedSeries(body: string): DqlParseResult {
  let depth = 0;
  let closeIdx = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }

  if (closeIdx === -1) return { metricFields: [], seriesText: "" };

  const seriesBlock = body.slice(1, closeIdx);
  const remainder = body
    .slice(closeIdx + 1)
    .replace(/^\s*,\s*/, "")
    .trim();

  return {
    metricFields: extractMetricNames(seriesBlock),
    seriesText: seriesBlock.trim(),
    args: remainder || undefined,
  };
}

/**
 * Handles bodies where the metric series is a single expression (no outer braces).
 * Named args are identified by the first `,` followed by `<word>:`.
 */
function parseBodyWithSingleSeries(body: string): DqlParseResult {
  // Find a comma that introduces a named arg (word:) at depth 0
  let depth = 0;
  let inBacktick = false;
  let splitAt = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "`") {
      inBacktick = !inBacktick;
    } else if (inBacktick) {
      // skip
    } else if (ch === "{" || ch === "(") {
      depth++;
    } else if (ch === "}" || ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      // Check if what follows is a named arg: optional whitespace, identifier, colon
      const after = body.slice(i + 1).trimStart();
      if (/^\w+\s*:/.test(after)) {
        splitAt = i;
        break;
      }
    }
  }

  if (splitAt === -1) {
    return { metricFields: extractMetricNames(body), seriesText: body.trim() };
  }

  const seriesBlock = body.slice(0, splitAt);
  const args = body.slice(splitAt + 1).trim();

  return {
    metricFields: extractMetricNames(seriesBlock),
    seriesText: seriesBlock.trim(),
    args: args || undefined,
  };
}

/**
 * Extracts metric names from a comma-separated series string.
 * - `alias=func(...)` → `"alias"`
 * - `func(metric.name)` → `"func(metric.name)"`
 *
 * Respects parenthesis/brace nesting and backtick quoting when splitting.
 */
function extractMetricNames(series: string): string[] {
  const tokens = splitByComma(series);
  return tokens
    .map(token => {
      const t = token.trim();
      // Find `=` that appears before the first `(` — that is an alias assignment
      const eqIdx = t.indexOf("=");
      const parenIdx = t.indexOf("(");
      if (eqIdx !== -1 && (parenIdx === -1 || eqIdx < parenIdx)) {
        return t.slice(0, eqIdx).trim();
      }
      return t;
    })
    .filter(name => name.length > 0);
}

/**
 * Splits a string by commas at depth 0 (respecting nesting and backticks).
 */
function splitByComma(s: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inBacktick = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "`") {
      inBacktick = !inBacktick;
      current += ch;
    } else if (inBacktick) {
      current += ch;
    } else if (ch === "{" || ch === "(") {
      depth++;
      current += ch;
    } else if (ch === "}" || ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// Resolves a theme color name to a Strato CSS variable, defaulting to blue
const resolveThemeColor = (themeColor: string): string => {
  const fallback = "#2e5bd6";
  return (
    {
      BLUE: `var(--dt-colors-charts-rainbow-blue-default, ${fallback})`,
      ROYALBLUE: `var(--dt-colors-charts-sequential-pink-purple-color-08-default, ${fallback})`,
      PURPLE: `var(--dt-colors-charts-sequential-purple-color-01-default, ${fallback})`,
      YELLOW: `var(--dt-colors-charts-rainbow-yellow-default, ${fallback})`,
      TURQUOISE: `var(--dt-colors-charts-sequential-turquoise-color-05-default, ${fallback})`,
      ORANGE: `var(--dt-colors-charts-rainbow-orange-default, ${fallback})`,
      GREEN: `var(--dt-colors-charts-rainbow-moss-default, ${fallback})`,
      RED: `var(--dt-colors-charts-rainbow-red-default, ${fallback})`,
      GRAY: `var(--dt-colors-charts-sequential-grey-color-04-default, ${fallback})`,
    }[themeColor] ?? `var(--dt-colors-theme-primary-90, ${fallback})`
  );
};

// Converts a chart metric to DQL metric info
const graphChartMetricsToDqlInfo = (metrics: ChartMetric[]): TimeseriesDqlInfo[] => {
  return metrics
    .filter(m => m.dqlQuery)
    .map(m => {
      const { metricFields, seriesText, args } = parseDqlQuery(m.dqlQuery ?? "");
      return {
        name: metricFields[0],
        dqlQuery: m.dqlQuery ?? "",
        seriesText,
        args,
        visualization: m.visualization
          ? {
              seriesType: m.visualization.seriesType
                ? mapSeriesType(m.visualization.seriesType)
                : undefined,
              color: m.visualization.themeColor
                ? resolveThemeColor(m.visualization.themeColor)
                : undefined,
              alias: m.visualization.displayName,
              seriesOverrides: m.visualization.colorOverride
                ? convertColorOverrides(m.visualization.colorOverride)
                : undefined,
            }
          : undefined,
      };
    });
};

/**
 * Combines multiple per-metric DQL queries into a single timeseries command.
 *
 * Single metric: returns its dqlQuery unchanged.
 * Multiple metrics: builds `timeseries { series1, series2, ... }` with common args
 * taken from the first metric that has them (args are expected to be identical across
 * metrics on the same chart).
 */
function combineDqlQueries(metrics: TimeseriesDqlInfo[]): string {
  if (metrics.length === 1) return metrics[0].dqlQuery ?? "";

  const seriesParts = metrics.map(m => m.seriesText).filter((s): s is string => !!s);

  if (seriesParts.length === 0) {
    return "";
  }

  const combined = `timeseries {\n  ${seriesParts.join(",\n  ")}\n}`;
  const commonArgs = metrics.find(m => m.args)?.args;
  return commonArgs ? `${combined},\n${commonArgs}` : combined;
}

function convertPieChart(
  chart: ChartStub,
  chartId: string,
  warnings: ConversionWarning[],
  hint?: string,
): Chart | null {
  const config = chart.pieChartConfig;
  if (!config) return null;

  const dqlQuery = config.metric.dqlQuery;
  if (!dqlQuery) {
    addWarning(warnings, "no-dql", `PIE_CHART "${chartId}" skipped — no dqlQuery`, hint);
    return null;
  }

  const visualization: ChartPieChartVisualization = { type: "PIE_CHART" };
  if (config.colorOverride && config.colorOverride.length > 0) {
    visualization.seriesOverrides = convertColorOverrides(config.colorOverride);
  }

  return {
    id: chartId,
    displayName: chart.displayName ?? "",
    dqlQuery,
    visualization,
  };
}

const convertColorOverrides = (colorOverrides: ColorOverride[]): ChartSeriesOverride[] =>
  colorOverrides.map(c => ({
    name: c.seriesName,
    color: c.color,
  }));

function convertSingleValueChart(
  chart: ChartStub,
  chartId: string,
  warnings: ConversionWarning[],
  hint?: string,
): Chart | null {
  const config = chart.singleValueConfig;
  if (!config) return null;

  const dqlQuery = config.metric.dqlQuery;
  if (!dqlQuery) {
    addWarning(warnings, "no-dql", `SINGLE_VALUE "${chartId}" skipped — no dqlQuery`, hint);
    return null;
  }

  const visualization: ChartSingleValueVisualization = { type: "SINGLE_VALUE" };
  if (config.foldTransformation) {
    visualization.metric = { foldTransformation: config.foldTransformation as FoldTransformation };
  }

  return {
    id: chartId,
    displayName: chart.displayName ?? "",
    dqlQuery,
    visualization,
  };
}

function mapSeriesType(type?: MetricVisualizationType): "line" | "area" | "bar" {
  if (!type) return "line";
  const mapping: Record<string, "line" | "area" | "bar"> = {
    LINE: "line",
    AREA: "area",
    COLUMN: "bar",
  };
  return mapping[type];
}

// ---------------------------------------------------------------------------
// DQL query object → string assembly
// ---------------------------------------------------------------------------

/**
 * Converts a DqlTableQuery object to an executable DQL string by assembling
 * the base query, lookup sub-queries, and additional commands into a single
 * piped query. AlertLookup entries (builtInLookup) are skipped — no DQL form.
 */
function assembleDqlQueryToString(dqlQuery: DqlTableQuery): string {
  const parts: string[] = [dqlQuery.query];
  for (const lookup of dqlQuery.lookups ?? []) {
    if (!("query" in lookup)) continue; // AlertLookup — no DQL form
    parts.push(
      `| lookup [ ${lookup.query} ], sourceField: ${lookup.sourceField}, lookupField: ${lookup.lookupField}, fields: { ${lookup.fields.join(", ")} }`,
    );
  }
  for (const cmd of dqlQuery.additionalCommands ?? []) {
    parts.push(`| ${cmd.query}`);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// DQL table card converter (dqlTableCards → dql-table)
// ---------------------------------------------------------------------------

/**
 * Updates structural field references in a DqlTable (column accessors and lookup
 * field names) after DQL field conversion. DQL query strings are handled separately
 * by adjustAllDql; this covers non-DQL field name references.
 */
function adjustDqlTableFields(
  table: DqlTable,
  mainInverseFieldMap: Record<string, string>,
  entityToNodeMap: EntityToNodeMap,
): DqlTable {
  const columns = table.columns?.map(col => {
    if (!("field" in col)) return col; // BuiltInColumn — skip
    const newField = mainInverseFieldMap[col.field];
    if (!newField) return col;
    return { ...col, field: newField, id: newField };
  });

  const lookups = table.dqlQuery.lookups?.map(lookup => {
    if (!("query" in lookup)) return lookup; // AlertLookup — skip

    // sourceField references the main query → use main entity's inverseFieldMap
    const newSourceField = mainInverseFieldMap[lookup.sourceField] ?? lookup.sourceField;

    // lookupField and fields[] reference the lookup query → use lookup entity's inverseFieldMap
    const lookupEntityMatch = lookup.query.match(/fetch\s+`dt\.entity\.(.+?)`/i);
    let lookupInverseMap = mainInverseFieldMap;
    if (lookupEntityMatch) {
      const lookupEntityType = lookupEntityMatch[1];
      const lookupNodeCtx = entityToNodeMap[lookupEntityType as keyof EntityToNodeMap];
      if (lookupNodeCtx) {
        lookupInverseMap = invertFieldMap(lookupNodeCtx.fieldMap);
      }
    }

    return {
      ...lookup,
      sourceField: newSourceField,
      lookupField: lookupInverseMap[lookup.lookupField] ?? lookup.lookupField,
      fields: lookup.fields.map(f => lookupInverseMap[f] ?? f),
    };
  });

  return {
    ...table,
    ...(columns && { columns }),
    dqlQuery: { ...table.dqlQuery, ...(lookups && { lookups }) },
  };
}

export function convertDqlTableCard(
  context: ScreenConversionContext,
  card: DqlTableCardStub,
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [DqlTable | null, string[]] {
  let conditionIds: string[] = [];
  const effectiveTarget = resolveTarget(card.target, parentTarget);
  if (shouldSkipByTarget(effectiveTarget)) {
    addWarning(
      warnings,
      "skipped-classic",
      `dqlTableCard "${card.key}" skipped (target: CLASSIC)`,
      hint,
    );
    return [null, conditionIds];
  }

  const columns = (card.columns ?? []).map(col => convertDqlTableColumn(col));
  columns.forEach((col, i) => {
    col.sortable = true;
    if (i === 0) col.sortDescFirst = true;
  });
  const idField = columns.length > 0 ? card.columns?.[0].field ?? "id" : "id";

  const dqlQuery: DqlTableQuery = {
    idField,
    query: card.query.query,
  };
  if (card.query.lookups) dqlQuery.lookups = card.query.lookups;
  if (card.query.additionalCommands) dqlQuery.additionalCommands = card.query.additionalCommands;

  const element: DqlTable = {
    type: "dql-table",
    id: card.key,
    title: card.displayName ?? card.key,
    dqlQuery,
    columns,
  };

  if (card.conditions) {
    const [dqlConditions, foundIds] = convertConditions(context, card.conditions, warnings, hint);
    if (dqlConditions.length > 0) {
      element.conditions = dqlConditions;
      conditionIds = foundIds;
    }
  }

  if (context.fieldMap && context.entityToNodeMap) {
    return [
      adjustDqlTableFields(element, invertFieldMap(context.fieldMap), context.entityToNodeMap),
      conditionIds,
    ];
  }
  return [element, conditionIds];
}

function convertDqlTableColumn(col: DqlTableColumnStub): DqlTableColumn {
  const result: DqlTableColumn = {
    id: col.field,
    field: col.field,
    displayName: col.displayName ?? col.field,
  };
  if (col.columnType) result.type = col.columnType.toLowerCase() as DqlTableColumnType;
  if (col.widthType) result.widthType = col.widthType.toLowerCase() as DqlTableColumnWidthType;
  if (col.widthValue !== undefined) result.widthValue = col.widthValue;
  if (col.sortable !== undefined) result.sortable = col.sortable;
  if (col.defaultColumn !== undefined) result.defaultColumn = col.defaultColumn;
  const cellRenderer = parseFormatter(col.formatter);
  if (cellRenderer) result.cellRenderer = cellRenderer;

  return result;
}

/**
 * Parses a YAML formatter string into a JSON cellRenderer object.
 * Known pattern: `unitRenderer|unit=<unit>|minimumFractionDigits=<n>`
 */
function parseFormatter(formatter?: string): CellRenderer | undefined {
  if (!formatter) return undefined;

  const parts = formatter.split("|");
  const renderer: Record<string, unknown> = { type: parts[0] };
  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].split("=");
    if (key && value) {
      if (value === "true" || value === "false") {
        renderer[key] = value === "true";
      } else {
        renderer[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }
  }
  return renderer as CellRenderer;
}

/**
 * Builds a default DQL table intended for an inventory explorer screen. The details are similar to
 * the IO App Technologies SDK.
 */
export const buildDefaultDqlTable = (
  { nodeType, fieldMap }: NodeContext,
  extensionName: string,
): DqlTable => {
  const fields = new Set(Object.keys(fieldMap));
  return {
    type: "dql-table",
    id: `${nodeType}-default-table`,
    title: `${nodeType} nodes`,
    displaySearch: false,
    interactiveRows: "id",
    tableMode: "normal",
    toolbarItems: [
      { builtInAction: "COLUMN_VISIBILITY" },
      { builtInAction: "RESET_ORDER" },
      { builtInAction: "LINE_WRAP" },
      { builtInAction: "EDIT_IN_NOTEBOOK" },
      { builtInAction: "PIN_TO_DASHBOARD" },
      { builtInAction: "OPEN_WITH" },
      { builtInAction: "DOWNLOAD_PAGE" },
      { builtInAction: "DOWNLOAD_SELECTED" },
      { builtInAction: "DOWNLOAD_ALL" },
      {
        displayName: "Configure extension",
        appId: "dynatrace.extensions.manager",
        intentId: "go-to-extensions-manager",
        intentPayload: {
          extensions: JSON.stringify([extensionName]),
          operation: "configure",
          appId: "dynatrace.infraops",
        },
      },
    ],
    dqlQuery: {
      idField: "id",
      query: `smartscapeNodes ${nodeType}\n| fieldsAdd ${Array.from(fields).join(", ")}`,
      lookups: [
        {
          builtInLookup: "ALERTS_LOOKUP",
          filterExpression: `in(smartscape.affected_entity_types, "${nodeType}")`,
        },
      ],
      additionalCommands: [],
    },
    columns: createDefaultDqlTableColumns(fields),
    perspectives: [
      {
        name: "health",
        displayName: "Health",
        description: "Health indicators and alerts for this node type",
      },
      {
        name: "metadata",
        displayName: "Metadata",
        description: "All attributes available for this node type",
      },
    ],
    alertGroups: [
      {
        groupName: "Metric alerts",
        alerts: [
          {
            displayName: "All metric alerts",
            matchConditions: {
              "event.type": ["*"],
            },
          },
        ],
      },
    ],
  };
};

const createDefaultDqlTableColumns = (fields: Set<string>): (DqlTableColumn | BuiltInColumn)[] => [
  {
    id: "name",
    field: "name",
    displayName: "Name",
    defaultColumn: true,
    sortable: true,
    sortDescFirst: true,
    perspectives: ["health", "metadata"],
  },
  {
    builtInColumn: "CUSTOM_ALERTS_COLUMN",
    overrides: {
      displayName: "Health",
      widthType: "pixels",
      widthValue: 200,
      defaultColumn: false,
      perspectives: ["health"],
    },
  },
  ...Array.from(fields)
    .filter(field => field !== "name")
    .map(field => createDqlTableColumn(field)),
];

const createDqlTableColumn = (field: string): DqlTableColumn => ({
  id: field,
  displayName: field,
  field,
  defaultColumn: field === "name",
  sortable: true,
  perspectives: ["id", "name", "type"].includes(field) ? ["health", "metadata"] : ["metadata"],
});

// ---------------------------------------------------------------------------
// Message card converter (messageCards → message)
// ---------------------------------------------------------------------------

export function convertMessageCard(
  context: ScreenConversionContext,
  card: MessageCardStub,
  keywords: string[] | undefined,
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [Message | null, string[]] {
  const effectiveTarget = resolveTarget(card.target, parentTarget);
  if (shouldSkipByTarget(effectiveTarget)) {
    addWarning(
      warnings,
      "skipped-classic",
      `messageCard "${card.key}" skipped (target: CLASSIC)`,
      hint,
    );
    return [null, []];
  }

  const [conditions, foundIds] = convertConditions(context, card.conditions ?? [], warnings, hint);
  if (card.type === "MESSAGE" && card.message) {
    return [
      {
        type: "message",
        id: card.key,
        content: {
          type: "MESSAGE",
          color: (card.message.theme === "ERROR" ? "CRITICAL" : card.message.theme) as MessageColor,
          text: card.message.text,
        },
        conditions,
      },
      foundIds,
    ];
  }
  if (card.type === "CARD" && card.card) {
    const actions = convertCardButtons(card.card.buttons, keywords, warnings);
    return [
      {
        type: "message",
        id: card.key,
        content: {
          type: "CARD",
          title: card.card.displayName ?? "",
          text: card.card.text,
          icon: card.card.icon,
          actions,
        },
        conditions,
      },
      foundIds,
    ];
  }

  addWarning(
    warnings,
    "skipped-out-of-scope",
    `messageCard "${card.key}" has unknown type "${card.type ?? "undefined"}"`,
    hint,
  );
  return [null, []];
}

function convertCardButtons(
  buttons: Array<{ actionExpression: string; text: string; color?: string }> | undefined,
  keywords: string[] | undefined,
  warnings: ConversionWarning[],
): CardActions {
  if (!buttons) return [];

  const actions: CardActions = [];
  for (const button of buttons) {
    const action = convertActionExpression(button.actionExpression, keywords, warnings);
    if (action) actions.push(action);
  }
  return actions;
}

/**
 * Converts a YAML actionExpression string to a JSON action object.
 * Known patterns:
 *   - `hubExtension|extensionId=<ID>|text=<label>` → IntentAction
 *   - `seaOtterLink|id=<URL>` → Skipped (no equivalent)
 */
function convertActionExpression(
  expression: string,
  keywords: string[] | undefined,
  warnings: ConversionWarning[],
): IntentAction | null {
  const parts = expression.split("|");
  const type = parts[0];

  if (type === "hubExtension") {
    const titleKeyword = keywords?.find(k => k.startsWith("title:"));
    if (!titleKeyword) {
      addWarning(
        warnings,
        "actions",
        "hubExtension action skipped — missing title keyword for search term",
      );
      return null;
    }

    return {
      displayName: "Open in Hub",
      appId: "dynatrace.hub",
      intentId: "search_in_catalogue",
      intentPayload: {
        type: "Extension",
        searchTerm: titleKeyword.slice("title:".length).trim(),
        resultFromPlatformSearch: "false",
      },
    };
  }

  if (type === "seaOtterLink") {
    addWarning(warnings, "actions", "seaOtter action skipped — no equivalent in the new format");
    return null;
  }

  addWarning(warnings, "actions", `Unknown action expression: "${expression}"`);
  return null;
}

// ---------------------------------------------------------------------------
// Health card converter (healthCards → chart-group COMPACT)
// TODO: Where did this come from? are we even using it??
// ---------------------------------------------------------------------------

export function convertHealthCard(
  card: HealthCardStub,
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [ChartGroup | null, string[]] {
  const effectiveTarget = resolveTarget(card.target, parentTarget);
  if (shouldSkipByTarget(effectiveTarget)) {
    addWarning(
      warnings,
      "skipped-classic",
      `healthCard "${card.key}" skipped (target: CLASSIC)`,
      hint,
    );
    return [null, []];
  }

  const charts: Chart[] = [];
  for (let i = 0; i < card.tiles.length; i++) {
    const tile = card.tiles[i];
    const tileHint = hint ? `${hint}.tile-${i}` : undefined;

    // Health cards use metricSelector — no DQL equivalent available
    addWarning(
      warnings,
      "no-dql",
      `healthCard "${card.key}" tile "${tile.displayName ?? i}" uses metricSelector only — manual DQL conversion needed`,
      tileHint,
    );

    charts.push({
      id: `${card.key}-tile-${i}`,
      displayName: tile.displayName ?? "",
      dqlQuery: `/* TODO: convert metricSelector to DQL */\n/* ${tile.metricSelecor} */`,
      visualization: {
        type: "SINGLE_VALUE",
        metric: { foldTransformation: tile.foldTransformation as FoldTransformation },
      },
    });
  }

  return [
    {
      type: "chart-group",
      id: card.key,
      mode: "COMPACT",
      charts,
    },
    [],
  ];
}

// ---------------------------------------------------------------------------
// Properties card converter (propertiesCard → metadata)
// ---------------------------------------------------------------------------

export function convertPropertiesCard(
  propertiesCard: PropertiesCard,
  entityType: string,
  warnings: ConversionWarning[],
  nodeContext?: NodeContext,
): Metadata | null {
  if (!nodeContext) {
    // Legacy path: no node context — use attribute keys directly
    const attributeProps = propertiesCard.properties.filter(isAttributeProperty);
    const relationProps = propertiesCard.properties.filter(isRelationProperty);

    if (relationProps.length > 0) {
      addWarning(
        warnings,
        "relation-properties",
        "Relation properties are not supported in metadata cards; they will be omitted",
        "propertiesCard",
      );
    }

    if (attributeProps.length === 0) {
      return null;
    }

    const fieldList = attributeProps.map(p => `\`${p.attribute.key}\``).join(", ");
    const overrideMetadataRegistry: Record<string, MetadataFieldConfig> = {};
    for (const prop of attributeProps) {
      overrideMetadataRegistry[prop.attribute.key] = { displayName: prop.attribute.displayName };
    }
    return {
      type: "metadata",
      id: `${entityType}-properties`,
      dqlQuery: `fetch \`dt.entity.${entityType}\` | filter id == $(entityId) | fields ${fieldList}`,
      overrideMetadataRegistry,
    };
  }

  const effectiveTarget = resolveTarget(propertiesCard.target, undefined);
  if (shouldSkipByTarget(effectiveTarget) || !propertiesCard.dqlQuery) {
    addWarning(
      warnings,
      "default-card",
      "card not gen3-enabled; creating default",
      "propertiesCard",
    );
    return createDefaultMetadataCard(propertiesCard, entityType, nodeContext, warnings);
  }

  const overrideMetadataRegistry: Record<string, MetadataFieldConfig> = {};
  propertiesCard.properties.filter(isDqlProperty).forEach(prop => {
    overrideMetadataRegistry[prop.dql.field] = {
      name: prop.dql.field,
      displayName: prop.dql.displayName,
    };
    if (prop.conditions && prop.conditions.length > 0) {
      addWarning(
        warnings,
        "conditions",
        "property-level conditions not supported; should be manually integrated in the DQL query",
        "propertiesCard",
      );
    }
  });

  return {
    type: "metadata",
    id: `${entityType}-properties`,
    dqlQuery: assembleDqlQueryToString(propertiesCard.dqlQuery),
    overrideMetadataRegistry,
  };
}

const createDefaultMetadataCard = (
  propertiesCard: PropertiesCard,
  entityType: string,
  nodeContext: NodeContext,
  warnings: ConversionWarning[],
): Metadata => {
  const inverseFieldMap = invertFieldMap(nodeContext.fieldMap);
  const overrideMetadataRegistry: Record<string, MetadataFieldConfig> = {};

  for (const prop of propertiesCard.properties) {
    if (isAttributeProperty(prop)) {
      const nodeField = inverseFieldMap[prop.attribute.key];
      if (nodeField) {
        overrideMetadataRegistry[nodeField] = { displayName: prop.attribute.displayName };
      } else {
        overrideMetadataRegistry[prop.attribute.key] = {
          displayName: prop.attribute.displayName,
        };
        addWarning(
          warnings,
          "dql-conversion",
          `Attribute key "${prop.attribute.key}" not found in node field map; using original key`,
          "propertiesCard",
        );
      }
    }
  }

  const result: Metadata = {
    type: "metadata",
    id: `${entityType}-properties`,
    dqlQuery: `smartscapeNodes ${nodeContext.nodeType} | filter id == $(entityId) | fieldsFlatten references | fieldsRemove id, lifetime, type, references`,
  };
  if (Object.keys(overrideMetadataRegistry).length > 0) {
    result.overrideMetadataRegistry = overrideMetadataRegistry;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Conditions converter — stub (deferred to separate iteration)
// ---------------------------------------------------------------------------

/**
 * Converts YAML condition strings to DQL variable conditions.
 */
export function convertConditions(
  context: ScreenConversionContext,
  conditions: string[] | undefined,
  warnings: ConversionWarning[],
  warningsTrace?: string,
): [Condition[], string[]] {
  const allConditions: Condition[] = [];
  const dqlConditions: DqlVariableCondition[] = [];
  const idsFound: string[] = [];
  if (!conditions || conditions.length === 0) return [dqlConditions, idsFound];

  conditions.forEach(condition => {
    const conditionId = createIdHash(condition);
    if (!Object.keys(context.conditions).includes(conditionId)) return;

    const extractedCondition: ConditionInfo = context.conditions[conditionId];

    // Built-in conditions (extensionConfigured only for now)
    if (extractedCondition.name === "extensionConfigured") {
      if (
        Object.keys(extractedCondition.parameters).includes("extensionName") &&
        context.extensionName !== extractedCondition.parameters.extensionName
      ) {
        addWarning(
          warnings,
          "conditions",
          "extensionConfigured condition no longer supports matching a different extension",
          warningsTrace,
        );
      } else {
        allConditions.push({
          type: "extensionConfigured",
          aboveOrEqualVersion: extractedCondition.parameters.aboveOrEqualVersion,
          belowOrEqualVersion: extractedCondition.parameters.belowOrEqualVersion,
          featureSets: Object.keys(extractedCondition.parameters).includes("featureSets")
            ? extractedCondition.parameters.featureSets.split(",").map(s => s.trim())
            : undefined,
          activatedOnHost:
            extractedCondition.parameters.activatedOnHost === "true" ? true : undefined,
        });
      }
      return;
    }

    // DQL Conditions

    if (!dqlConditions.some(c => c.variable === extractedCondition.field)) {
      dqlConditions.push({
        type: "dql-variable",
        variable: extractedCondition.field,
        value: true,
      });
    }

    // Store the found ID for building the condition context later
    if (!idsFound.includes(extractedCondition.id)) {
      idsFound.push(extractedCondition.id);
    }
    extractedCondition.warnings.forEach(warning => {
      addWarning(warnings, warning.category, warning.message, warningsTrace);
    });
  });

  return [dqlConditions, idsFound];
}

export const extractConditions = (context: NodeContext, content: string): ConditionInfo[] => {
  const conditions: ConditionInfo[] = [];
  const conditionRegex =
    /("!?(?:entityAttribute|relatedEntity|extensionConfigured|metricAvailable)\|.+"),?$/gm;
  let match;
  while ((match = conditionRegex.exec(content)) !== null) {
    const conditionStr = JSON.parse(match[1]) as string;
    const condition = extractCondition(context, conditionStr);
    if (condition) {
      conditions.push(condition);
    }
  }
  return conditions;
};

export const extractCondition = (context: NodeContext, condition: string): ConditionInfo | null => {
  const id = createIdHash(condition);
  const parts = condition.split("|");
  const name = parts[0] as ConditionName;
  const parameters = parts.slice(1).reduce(
    (acc, part) => {
      const [key, value] = part.split("=");
      if (key) {
        acc[key] = value ?? "";
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  let query: string | undefined;
  let field: string | undefined;
  const warnings: ConversionWarning[] = [];
  switch (name) {
    case "entityAttribute":
      [query, field] = entityAttributeConditionDql(context, parameters);
      break;
    case "relatedEntity":
      [query, field] = relatedEntityConditionDql(context, parameters);
      warnings.push({
        category: "conditions",
        message: `relatedEntity condition needs manual translation to DQL; condition "${condition}"`,
      });
      break;
    case "metricAvailable":
      [query, field] = metricAvailableConditionDql(context, parameters);
      warnings.push({
        category: "conditions",
        message: `metricAvailable condition needs manual translation to DQL; condition "${condition}"`,
      });
      break;
    case "extensionConfigured":
      [query, field] = ["null", "null"]; // Not applicable for this condition
      break;
  }

  if (!query || !field) {
    warnings.push({
      category: "conditions",
      message: `Condition "${condition}" could not be converted`,
    });
    return null;
  }

  return {
    id,
    name,
    parameters,
    query,
    field,
    original: condition,
    warnings,
  };
};

// Prepare DQL query for entityAttribute replacement.
// Return along with the unique field for it.
const entityAttributeConditionDql = (
  context: NodeContext,
  parameters: Record<string, string>,
): [string, string] => {
  let [paramKey, paramValue] = Object.entries(parameters)[0] ?? [];
  const gen2Togen3Fields = invertFieldMap(context.fieldMap);
  if (Object.keys(gen2Togen3Fields).includes(paramKey)) {
    paramKey = gen2Togen3Fields[paramKey];
  }

  const field = `entityAttribute.${paramKey}`;

  if (!paramValue) {
    return [
      `smartscapeNodes ${context.nodeType} | filter id == $(entityId) | fields ${field} = isNotNull(${paramKey})`,
      field,
    ];
  }

  if (Number.isNaN(Number(paramValue))) {
    paramValue = `"${paramValue}"`;
  }
  return [
    `smartscapeNodes ${context.nodeType} | filter id == $(entityId) and ${paramKey} == ${paramValue} | summarize ${field}=count()>0`,
    field,
  ];
};

const relatedEntityConditionDql = (
  context: NodeContext,
  parameters: Record<string, string>,
): [string, string] => {
  const entitySelectorTemplate = parameters["entitySelectorTemplate"];
  const entityMatch = entitySelectorTemplate.match(/type\((.+?)\),/);
  const entityType = entityMatch ? entityMatch[1] : "unknown";
  const field = `relatedEntity.${entityType.replace(":", "_")}`;
  return [
    `smartscapeNodes ${context.nodeType} | filter id == $(entityId) and in(id, classicEntitySelector("""${entitySelectorTemplate}""")) | summarize ${field}=count()>0`,
    field,
  ];
};

const metricAvailableConditionDql = (
  context: NodeContext,
  parameters: Record<string, string>,
): [string, string] => {
  const metric = parameters["metric"];
  const writtenWithinDays = parameters["lastWrittenWithinDays"];
  const metricName = metric.split(":")[0];
  const timeframe = writtenWithinDays ? `, from:now()-${writtenWithinDays}d` : "";
  const field = `metricAvailable.${metricName}`;
  return [
    `timeseries metric=count(${metricName}, scalar: true), nonempty: true${timeframe} | fields ${field}=isNotNull(metric)`,
    field,
  ];
};

function invertFieldMap(fieldMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fieldMap).map(([k, v]) => [v, k]));
}

/** Standard entity fields with well-known gen3 node field equivalents used as fallbacks */
const DEFAULT_FIELD_FALLBACKS: Record<string, string> = {
  "dt.ip_addresses": "ip",
  "dt.listen_ports": "port",
  "entity.name": "name",
};

/**
 * Applies field name and edge reference replacements to a single pipe segment
 * that has already been confirmed to be one of the targeted commands
 * (fieldsAdd, fields, summarize, filter).
 */
function adjustPipeSegmentContent(
  segment: string,
  inverseFieldMap: Record<string, string>,
  nodeContext: NodeContext,
  entityToNodeMap: EntityToNodeMap,
  warnings: ConversionWarning[],
): string {
  let result = segment;

  // Merge default fallbacks; inverseFieldMap takes priority for explicitly mapped fields
  const effectiveFieldMap = { ...DEFAULT_FIELD_FALLBACKS, ...inverseFieldMap };

  // Field replacement: entity field name → node field name (backtick-quoted and plain forms)
  for (const [entityField, nodeField] of Object.entries(effectiveFieldMap)) {
    const escaped = entityField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp("`" + escaped + "`", "g"), nodeField);
    result = result.replace(new RegExp("\\b" + escaped + "\\b", "g"), nodeField);
  }

  // Edge replacement: {relation_type}[`dt.entity.{entityType}`] → references[{relation_type}.{nodeType}]
  result = result.replace(/(\w+)\[`dt\.entity\.(.+?)`\]/g, (match, relationType, entityType) => {
    if (!Object.prototype.hasOwnProperty.call(entityToNodeMap, entityType)) {
      addWarning(
        warnings,
        "dql-conversion",
        `Edge target entity type "${entityType}" is external to extension; edge reference left as-is: "${match}"`,
      );
      return match;
    }
    const { nodeType } = entityToNodeMap[entityType as keyof EntityToNodeMap];
    const candidate = `${relationType}.${nodeType.toLowerCase()}`;
    if (!nodeContext.staticEdges.includes(candidate)) {
      addWarning(
        warnings,
        "dql-conversion",
        `No static edge found for relation "${relationType}" → "${nodeType}"; edge reference left as-is: "${match}"`,
      );
      return match;
    }
    return `references[${candidate}]`;
  });

  return result;
}

/**
 * Extracts a sub-query from the first `[...]` block in a pipe segment.
 * Tracks bracket depth and respects backtick-quoted identifiers.
 * Returns null if no bracket pair is found.
 */
function extractBracketedSubquery(
  segment: string,
): { prefix: string; subquery: string; suffix: string } | null {
  let bracketStart = -1;
  let inBacktick = false;

  for (let i = 0; i < segment.length; i++) {
    if (segment[i] === "`") {
      inBacktick = !inBacktick;
    } else if (!inBacktick && segment[i] === "[") {
      bracketStart = i;
      break;
    }
  }

  if (bracketStart === -1) return null;

  let depth = 0;
  inBacktick = false;
  for (let i = bracketStart; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "`") {
      inBacktick = !inBacktick;
    } else if (!inBacktick) {
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return {
            prefix: segment.slice(0, bracketStart + 1),
            subquery: segment.slice(bracketStart + 1, i),
            suffix: segment.slice(i),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Processes a complete DQL query string for a fetch-entity query:
 * converts the entity type to a smartscapeNodes command, then replaces
 * entity field names and edge references in the targeted pipe stages.
 * Sub-queries within append/join/lookup brackets are converted recursively.
 */
export function adjustEntityFetchDqlQuery(
  dqlQuery: string,
  entityToNodeMap: EntityToNodeMap,
  warnings: ConversionWarning[],
): string {
  if (!/^fetch\s+`dt\.entity\./i.test(dqlQuery.trimStart())) return dqlQuery;

  const entityTypeMatch = dqlQuery
    .trimStart()
    .match(/^fetch\s+`dt\.entity\.([a-zA-Z](?:[a-zA-Z0-9_\-:]*[a-zA-Z0-9])?)`/i);
  if (!entityTypeMatch) return dqlQuery;
  const entityType = entityTypeMatch[1];

  let nodeContext: NodeContext | null = null;
  let convertedFetch: string;

  if (Object.prototype.hasOwnProperty.call(entityToNodeMap, entityType)) {
    nodeContext = entityToNodeMap[entityType as keyof EntityToNodeMap];
    convertedFetch = `smartscapeNodes ${nodeContext.nodeType.toUpperCase()}`;
  } else {
    addWarning(
      warnings,
      "dql-conversion",
      `Entity type "${entityType}" in DQL query is external to extension; conversion may be inaccurate`,
    );
    convertedFetch = `smartscapeNodes ${String(entityType).toUpperCase()}`;
  }

  const segments = splitDqlPipes(dqlQuery);
  segments[0] = convertedFetch;

  const subQueryCommands = /^(append|join|lookup)\b/i;
  const targetedCommands = /^(fieldsAdd|fields|summarize|filter)\b/i;

  for (let i = 1; i < segments.length; i++) {
    const trimmed = segments[i].trimStart();

    if (subQueryCommands.test(trimmed)) {
      // Recursively convert entity fetch queries within sub-query brackets.
      // Sub-queries are at most one level deep (no further nesting).
      const parts = extractBracketedSubquery(trimmed);
      if (parts) {
        const convertedSubquery = adjustEntityFetchDqlQuery(
          parts.subquery.trim(),
          entityToNodeMap,
          warnings,
        );
        segments[i] = parts.prefix + convertedSubquery + parts.suffix;
      }
    } else if (nodeContext !== null && targetedCommands.test(trimmed)) {
      const inverseFieldMap = invertFieldMap(nodeContext.fieldMap);
      segments[i] = adjustPipeSegmentContent(
        segments[i],
        inverseFieldMap,
        nodeContext,
        entityToNodeMap,
        warnings,
      );
    }
  }

  return segments.map(s => s.trim()).join("\n| ");
}

export const adjustAllDql = (
  content: string,
  entityToNodeMap: EntityToNodeMap,
  warnings: ConversionWarning[],
): string => {
  let adjustedContent = content;

  // Pass 1: find JSON string values containing fetch-entity DQL queries and process them fully
  // (entity type conversion + field replacement + edge replacement in targeted pipe stages)
  adjustedContent = adjustedContent.replace(/"((?:[^"\\]|\\.)*)"/g, match => {
    let dql: unknown;
    try {
      dql = JSON.parse(match);
    } catch {
      return match;
    }
    if (typeof dql !== "string" || !dql.includes("fetch `dt.entity.")) return match;
    return JSON.stringify(adjustEntityFetchDqlQuery(dql, entityToNodeMap, warnings));
  });

  // Warn if any DQL still references classicEntitySelector — that must be converted manually
  if (content.includes("classicEntitySelector")) {
    addWarning(
      warnings,
      "dql-conversion",
      "DQL query contains 'classicEntitySelector' which must be converted manually",
    );
  }

  // Pass 2: change all remaining dimension values (e.g. in timeseries by:/filter: args)
  // dt.entity.<type>`  →  dt.smartscape.<type>` where type starts with a letter, contains only
  // [a-zA-Z0-9_-:], and ends with a letter or digit.
  adjustedContent = adjustedContent.replace(
    /dt\.entity\.([a-zA-Z](?:[a-zA-Z0-9_\-:]*[a-zA-Z0-9])?)`/g,
    (match, entityType) => {
      if (!entityType) return match;
      if (Object.keys(entityToNodeMap).includes(String(entityType))) {
        const { nodeType } = entityToNodeMap[entityType as keyof EntityToNodeMap];
        if (nodeType) {
          return `dt.smartscape.${nodeType.toLowerCase()}${match.endsWith("`") ? "`" : ""}`;
        } else {
          addWarning(
            warnings,
            "dql-conversion",
            `No node type mapping found for entity type "${entityType}" in DQL query: "${match}"`,
          );
          return match;
        }
      }
      // Try optimistic conversion
      addWarning(
        warnings,
        "dql-conversion",
        `Entity type "${entityType}" in DQL query is external to extension; conversion may be inaccurate: "${match}"`,
      );
      return `dt.smartscape.${String(entityType).toLowerCase()}${match.endsWith("`") ? "`" : ""}`;
    },
  );

  // Pass 3: wrap all `$(entityId)` as `toSmartscapeId($(entityId))`
  adjustedContent = adjustedContent.replace(/\$\(entityId\)/g, "toSmartscapeId($(entityId))");

  return adjustedContent;
};

export const createConditionContext = (
  context: ScreenConversionContext,
  conditionIds: string[],
): DqlConditionsContext | undefined => {
  let conditionContext: DqlConditionsContext | undefined = undefined;
  if (conditionIds.length > 0) {
    const uniqueIds = [...new Set(conditionIds)];
    conditionContext = {
      query: uniqueIds
        .filter(id => Object.keys(context.conditions).includes(id))
        .map(id => context.conditions[id].query),
      resultFields: uniqueIds
        .filter(id => Object.keys(context.conditions).includes(id))
        .map(id => context.conditions[id].field),
    };
  }
  return conditionContext;
};

export const extractExtensionCategory = (keywords: string[]): string => {
  const defaultCategories = [
    "analytics",
    "application",
    "compute",
    "security",
    "storage",
    "cloud",
    "database",
    "network",
    "virtualization",
  ];
  for (const keyword of keywords) {
    if (keyword.startsWith("category:")) {
      const category = keyword.slice("category:".length).trim();
      if (defaultCategories.includes(category)) {
        return category;
      }
    }
  }
  return "other";
};

export const extractExtensionTitle = (keywords: string[], extensionName: string): string => {
  for (const keyword of keywords) {
    if (keyword.startsWith("title:")) {
      return keyword
        .slice("title:".length)
        .trim()
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }
  return extensionName
    .replace("custom:", "")
    .replace("com.dynatrace.extension.", "")
    .replace("com.dynatrace.", "");
};
