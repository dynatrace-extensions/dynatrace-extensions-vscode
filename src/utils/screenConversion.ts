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
  DqlTable,
  DqlTableColumn,
  DqlTableQuery,
  DqlVariableCondition,
  IntentAction,
  Message,
  Metadata,
} from "@dynatrace/unified-analysis/documents";
import {
  AttributeProperty,
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
} from "../interfaces/extensionMeta";
import {
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
 */
export function addWarning(
  warnings: ConversionWarning[],
  category: WarningCategory,
  message: string,
): void {
  warnings.push({ category, message });
}

// ---------------------------------------------------------------------------
// Target filtering
// ---------------------------------------------------------------------------

/** Returns true if the item should be skipped (CLASSIC-only target). */
export function shouldSkipByTarget(target?: string): boolean {
  return target === "CLASSIC";
}

// ---------------------------------------------------------------------------
// Charts card converter (chartsCards → chart-group)
// ---------------------------------------------------------------------------

export function convertChartsCard(
  card: ChartsCardStub,
  warnings: ConversionWarning[],
): ChartGroup | null {
  if (shouldSkipByTarget(card.target)) {
    addWarning(warnings, "skipped-classic", `chartsCard "${card.key}" skipped (target: CLASSIC)`);
    return null;
  }

  const charts: Chart[] = [];
  for (let i = 0; i < card.charts.length; i++) {
    const converted = convertChart(card.charts[i], `${card.key}-chart-${i}`, warnings);
    if (converted) charts.push(converted);
  }

  if (charts.length === 0) {
    addWarning(warnings, "no-dql", `chartsCard "${card.key}" produced no convertible charts`);
    return null;
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
  if (card.conditions) element.conditions = convertConditions(card.conditions, warnings);

  return element;
}

// ---------------------------------------------------------------------------
// Individual chart converters
// ---------------------------------------------------------------------------

function convertChart(
  chart: ChartStub,
  chartId: string,
  warnings: ConversionWarning[],
): Chart | null {
  switch (chart.visualizationType) {
    case "GRAPH_CHART":
      return convertGraphChart(chart, chartId, warnings);
    case "PIE_CHART":
      return convertPieChart(chart, chartId, warnings);
    case "SINGLE_VALUE":
      return convertSingleValueChart(chart, chartId, warnings);
    default:
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Unknown visualization type "${chart.visualizationType}" in chart "${chartId}"`,
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
      );
    } else {
      addWarning(warnings, "no-dql", `Chart "${chartId}" skipped — no metrics have dqlQuery`);
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
 * - backtick-quoted identifiers
 */
function splitDqlPipes(query: string): string[] {
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
    } else if (ch === "{" || ch === "(") {
      depth++;
      current += ch;
    } else if (ch === "}" || ch === ")") {
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
): Chart | null {
  const config = chart.pieChartConfig;
  if (!config) return null;

  const dqlQuery = config.metric.dqlQuery;
  if (!dqlQuery) {
    addWarning(warnings, "no-dql", `PIE_CHART "${chartId}" skipped — no dqlQuery`);
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
): Chart | null {
  const config = chart.singleValueConfig;
  if (!config) return null;

  const dqlQuery = config.metric.dqlQuery;
  if (!dqlQuery) {
    addWarning(warnings, "no-dql", `SINGLE_VALUE "${chartId}" skipped — no dqlQuery`);
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
// DQL table card converter (dqlTableCards → dql-table)
// ---------------------------------------------------------------------------

export function convertDqlTableCard(
  card: DqlTableCardStub,
  warnings: ConversionWarning[],
): DqlTable | null {
  if (shouldSkipByTarget(card.target)) {
    addWarning(warnings, "skipped-classic", `dqlTableCard "${card.key}" skipped (target: CLASSIC)`);
    return null;
  }

  const columns = (card.columns ?? []).map(col => convertDqlTableColumn(col));
  const idField = columns.length > 0 ? card.columns?.[0].field ?? "id" : "id";

  const dqlQuery: DqlTableQuery = {
    idField,
    query: card.query.query,
  };
  if (card.query.lookups) dqlQuery.lookups = card.query.lookups;
  // TODO: Check if needed

  const element: DqlTable = {
    type: "dql-table",
    id: card.key,
    title: card.displayName ?? card.key,
    dqlQuery,
    columns,
  };
  if (card.conditions) element.conditions = convertConditions(card.conditions, warnings);

  return element;
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
  if (col.defaultColumn !== undefined) result.sortable = col.sortable;
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
  { nodeType, fields }: NodeContext,
  extensionName: string,
): DqlTable => {
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
          operation: "configue",
          appId: "dynatrace.infraops",
        },
      },
    ],
    dqlQuery: {
      idField: "id",
      query: `smartscapeNodes ${nodeType}\n| fieldsAdd ${Array.from(fields).join(", ")}`,
      lookups: [],
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
    alertLookupParams: {
      lookupField: "id",
      filterExpression: `in(affected_entity_types, "${nodeType}")`,
    },
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
    perspectives: ["health", "metadata"],
  },
  {
    builtInColumn: "CUSTOM_ALERTS_COLUMN",
    displayName: "Health",
    widthType: "pixels",
    widthValue: 200,
    sortable: true,
    type: "text",
    defaultColumn: false,
    perspectives: ["health"],
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
  perspectives: ["id", "name", "type"].includes(field) ? ["health", "metadata"] : ["metadata"],
});

// ---------------------------------------------------------------------------
// Message card converter (messageCards → message)
// ---------------------------------------------------------------------------

export function convertMessageCard(
  card: MessageCardStub,
  keywords: string[] | undefined,
  warnings: ConversionWarning[],
): Message | null {
  if (shouldSkipByTarget(card.target)) {
    addWarning(warnings, "skipped-classic", `messageCard "${card.key}" skipped (target: CLASSIC)`);
    return null;
  }

  const conditions = convertConditions(card.conditions, warnings);
  if (card.type === "MESSAGE" && card.message) {
    return {
      type: "message",
      id: card.key,
      content: {
        type: "MESSAGE",
        color: (card.message.theme === "ERROR" ? "CRITICAL" : card.message.theme) as MessageColor,
        text: card.message.text,
      },
      conditions,
    };
  }
  if (card.type === "CARD" && card.card) {
    const actions = convertCardButtons(card.card.buttons, keywords, warnings);
    return {
      type: "message",
      id: card.key,
      content: {
        type: "CARD",
        title: card.card.displayName ?? "",
        text: card.card.text,
        icon: card.card.icon,
        actions,
      },
    };
  }

  addWarning(
    warnings,
    "skipped-out-of-scope",
    `messageCard "${card.key}" has unknown type "${card.type ?? "undefined"}"`,
  );
  return null;
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
): ChartGroup | null {
  if (shouldSkipByTarget(card.target)) {
    addWarning(warnings, "skipped-classic", `healthCard "${card.key}" skipped (target: CLASSIC)`);
    return null;
  }

  const charts: Chart[] = [];
  for (let i = 0; i < card.tiles.length; i++) {
    const tile = card.tiles[i];

    // Health cards use metricSelector — no DQL equivalent available
    addWarning(
      warnings,
      "no-dql",
      `healthCard "${card.key}" tile "${tile.displayName ?? i}" uses metricSelector only — manual DQL conversion needed`,
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

  return {
    type: "chart-group",
    id: card.key,
    mode: "COMPACT",
    charts,
  };
}

// ---------------------------------------------------------------------------
// Properties card converter (propertiesCard → metadata)
// ---------------------------------------------------------------------------

export function convertPropertiesCard(
  propertiesCard: PropertiesCard,
  entityType: string,
  warnings: ConversionWarning[],
): Metadata | null {
  // TODO:
  // Detect all node fields from pipeline, write a dql query to fetch all
  // relations could be added via static edges (references) while dynamic ones would be lookups
  //   - check how to render as link the related nodes
  // attributeProps should be parsed for hiding and removed from fields clause of dql query

  const attributeProps = propertiesCard.properties.filter(isAttributeProperty);
  const relationProps = propertiesCard.properties.filter(isRelationProperty);

  if (relationProps.length > 0) {
    for (const rel of relationProps) {
      addWarning(
        warnings,
        "relation-properties",
        `Property "${rel.relation.displayName}" (RELATION) needs manual DQL conversion — entity selector: ${rel.relation.entitySelectorTemplate}`,
      );
    }
  }

  if (attributeProps.length === 0) return null;

  const fields = attributeProps.map((p: AttributeProperty) => p.attribute.key);
  const dqlQuery = `fetch \`dt.entity.${entityType}\` | fields ${fields.map(f => `\`${f}\``).join(", ")}`;

  const overrideMetadataRegistry: Record<string, Record<string, unknown>> = {};
  for (const prop of attributeProps) {
    overrideMetadataRegistry[prop.attribute.key] = {
      displayName: prop.attribute.displayName,
    };
  }

  return {
    type: "metadata",
    id: `${entityType}-properties`,
    dqlQuery,
    overrideMetadataRegistry,
  };
}

// ---------------------------------------------------------------------------
// Conditions converter — stub (deferred to separate iteration)
// ---------------------------------------------------------------------------

/**
 * Converts YAML condition strings to DQL variable conditions.
 * Currently a placeholder that emits warnings — full implementation deferred.
 */
export function convertConditions(
  conditions: string[] | undefined,
  warnings: ConversionWarning[],
): DqlVariableCondition[] {
  if (!conditions || conditions.length === 0) return [];

  // TODO: implement condition mapping — requires DQL templates per condition pattern
  for (const condition of conditions) {
    addWarning(warnings, "conditions", `Condition needs manual DQL translation: "${condition}"`);
  }

  return conditions.map((condition, index) => ({
    type: "dql-variable",
    variable: `condition_${index}`,
    value: `/* TODO: ${condition} */`,
  }));
}

// General

export const adjustAllDql = (
  content: string,
  entityToNodeMap: EntityToNodeMap,
  warnings: ConversionWarning[],
): string => {
  // Change the command
  // fetch `dt.entity.someType`  →  smartscapeNodes SOMETYPE
  let adjustedContent = content;
  adjustedContent = adjustedContent.replace(/fetch\s+`dt\.entity\.(.+?)`/g, (match, entityType) => {
    if (!entityType) return match; // No entity type captured, return original
    if (Object.keys(entityToNodeMap).includes(String(entityType))) {
      const { nodeType } = entityToNodeMap[entityType as keyof EntityToNodeMap];
      if (nodeType) {
        return `smartscapeNodes ${nodeType.toUpperCase()}`;
      } else {
        addWarning(
          warnings,
          "dql-conversion",
          `No node type mapping found for entity type "${entityType}" in DQL query: "${match}"`,
        );
        return match; // No mapping found, return original
      }
    }
    // Try optimistic conversion
    addWarning(
      warnings,
      "dql-conversion",
      `Entity type "${entityType}" in DQL query is external to extension; conversion may be inaccurate: "${match}"`,
    );
    return `smartscapeNodes ${String(entityType).toUpperCase()}`; // Entity type not in mapping, return original
  });

  // Change all dimension values
  // dt.entity.someType  →  dt.smartscape.someType
  adjustedContent = adjustedContent.replace(/dt\.entity\.(.+?)`/g, (match, entityType) => {
    if (!entityType) return match; // No entity type captured, return original
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
        return match; // No mapping found, return original
      }
    }
    // Try optimistic conversion
    addWarning(
      warnings,
      "dql-conversion",
      `Entity type "${entityType}" in DQL query is external to extension; conversion may be inaccurate: "${match}"`,
    );
    return `dt.smartscape.${String(entityType).toLowerCase()}${match.endsWith("`") ? "`" : ""}`; // Entity type not in mapping, return original
  });

  return adjustedContent;
};
