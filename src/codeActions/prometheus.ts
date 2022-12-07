import * as vscode from "vscode";
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { CachedDataProvider } from "../utils/dataCaching";
import {
  getAllMetricKeysAndValuesFromDataSource,
  getAllMetricKeysFromDataSource,
  getDatasourceName,
  getPrometheusLabelKeys,
  getPrometheusMetricKeys,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";
import { buildMetricMetadataSnippet, indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provider for Code Actions that work with scraped Prometheus data to automatically
 * insert it in the Extension yaml.
 */
export class PrometheusActionProvider implements vscode.CodeActionProvider {
  private prometheusData: PromData = {};
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider provider of cached data (i.e. prometheus scraped data)
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  /**
   * Provides the Code Actions that insert details based on Prometheus scraped data.
   * @param document document that activated the provider
   * @param range range that activated the provider
   * @param context Code Action context
   * @param token cancellation token
   * @returns list of Code Actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    var codeActions: vscode.CodeAction[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var parentBlocks = getParentBlocks(range.start.line, document.getText());
    var lineText = document.lineAt(range.start.line).text;

    this.prometheusData = this.cachedData.getPrometheusData();

    // Bail early if different datasource or no scraped data
    if (getDatasourceName(extension) !== "prometheus" || !this.prometheusData) {
      return [];
    }

    // Metrics and dimensions
    if (
      parentBlocks[parentBlocks.length - 1] === "prometheus" ||
      parentBlocks[parentBlocks.length - 1] === "subgroups"
    ) {
      // Existing datasource yaml details
      const groupIdx = getBlockItemIndexAtLine("prometheus", range.start.line, document.getText());
      const subgroupIdx = getBlockItemIndexAtLine("subgroups", range.start.line, document.getText());
      const metricKeys = getPrometheusMetricKeys(extension, groupIdx, subgroupIdx);
      const labelKeys = getPrometheusLabelKeys(extension, groupIdx, subgroupIdx);
      if (lineText.includes("metrics:")) {
        codeActions.push(...this.createMetricInsertions(document, range, metricKeys));
      }
      if (lineText.includes("dimensions:")) {
        codeActions.push(...this.createDimensionInsertions(document, range, metricKeys, labelKeys));
      }
    }
    // Metadata
    if (lineText.startsWith("metrics:")) {
      codeActions.push(...this.createMetadataInsertions(document, range, extension));
    }

    return codeActions;
  }

  /**
   * Creates a Code Action that inserts a snippet of text on the next line at index 0.
   * @param actionName name of the Code Action
   * @param textToInsert the snippet to insert
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @returns Code Action
   */
  private createInsertAction(
    actionName: string,
    textToInsert: string,
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    if (document.lineCount === range.start.line + 1) {
      textToInsert = "\n" + textToInsert;
    }
    var indent = /[a-z]/i.exec(document.lineAt(range.start.line).text)!.index;
    var insertPosition = new vscode.Position(range.start.line + 1, 0);
    const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPosition, indentSnippet(textToInsert, indent));
    return action;
  }

  /**
   * Creates Code Actions for inserting metrics from scraped Prometheus data.
   * Actions are created for individual metrics as well as all-in-one.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param existingKeys keys that have already been inserted in yaml (to be excluded)
   * @returns list of code actions
   */
  private createMetricInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    existingKeys: string[]
  ): vscode.CodeAction[] {
    var codeActions: vscode.CodeAction[] = [];
    const availableKeys = Object.keys(this.prometheusData).filter((key) => !existingKeys.includes(key));

    // Insert all metrics in one go
    if (availableKeys.length > 1) {
      codeActions.push(
        this.createInsertAction(
          "Insert all scraped metrics",
          availableKeys
            .map((key) => `- key: ${key}\n  value: metric:${key}\n  type: ${this.prometheusData[key].type}`)
            .join("\n"),
          document,
          range
        )
      );
    }

    // Insert individual metrics
    availableKeys.forEach((key) => {
      codeActions.push(
        this.createInsertAction(
          `Insert ${key} metric`,
          `- key: ${key}\n  value: metric:${key}\n  type: ${this.prometheusData[key].type}`,
          document,
          range
        )
      );
    });

    return codeActions;
  }

  /**
   * Creates Code Actions for inserting dimensions from scraped Prometheus data.
   * Dimensions are filtered by metric keys, so that suggestions apply only to the metrics already
   * inserted in the YAML. Existing keys should be provided to not duplicated labels already in YAML.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param metricKeys metric keys to use in filtering Prometheus labels
   * @param existingKeys keys that have already been inserted in yaml (to be excluded)
   * @returns list of code actions
   */
  private createDimensionInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    metricKeys: string[],
    existingKeys: string[]
  ): vscode.CodeAction[] {
    var codeActions: vscode.CodeAction[] = [];
    var availableKeys: string[] = [];
    Object.keys(this.prometheusData).forEach((key) => {
      if (this.prometheusData[key].dimensions) {
        this.prometheusData[key].dimensions!.forEach((dimension) => {
          if (
            (metricKeys.length === 0 || metricKeys.includes(key)) &&
            !existingKeys.includes(dimension) &&
            !availableKeys.includes(dimension)
          ) {
            availableKeys.push(dimension);
          }
        });
      }
    });
    availableKeys.forEach((key) => {
      codeActions.push(
        this.createInsertAction(`Insert ${key} dimension`, `- key: ${key}\n  value: label:${key}`, document, range)
      );
    });
    return codeActions;
  }

  /**
   * Creates Code Actions for inserting metric metadata based on scraped Prometheus data.
   * Metrics are filtered to only match the ones added in the datasource (not all scraped) and also
   * ones that don't already have metadata defined (so we don't duplicate).
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param extension extension.yaml serialized as object
   * @returns list of code actions
   */
  private createMetadataInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    extension: ExtensionStub
  ): vscode.CodeAction[] {
    var codeActions: vscode.CodeAction[] = [];
    const datasourceMetrics = getAllMetricKeysAndValuesFromDataSource(extension);
    const metadataMetrics = extension.metrics ? extension.metrics.map((m) => m.key) : [];

    const metricsToInsert = datasourceMetrics
      // Metrics that don't have metadata defined yet...
      .filter((dsMetric) => !metadataMetrics.includes(dsMetric.key))
      // ... and have prometheus-based values...
      .filter((dsMetric) => dsMetric.value && dsMetric.value.startsWith("metric:"))
      // ... and have Prometheus descriptions ...
      .filter((dsMetric) => {
        let promKey = dsMetric.value.split("metric:")[1];
        return Object.keys(this.prometheusData).includes(promKey) && this.prometheusData[promKey].description;
      });

    // Actions for individual metric metadatas
    if (metricsToInsert.length > 0) {
      metricsToInsert.forEach((metric) => {
        let promKey = metric.value.split("metric:")[1];
        codeActions.push(
          this.createInsertAction(
            `Add metadata for ${metric.key}`,
            buildMetricMetadataSnippet(
              metric.key,
              titleCase(promKey),
              this.prometheusData[promKey].description!,
              undefined,
              -2,
              false
            ),
            document,
            range
          )
        );
      });
    }
    // Action for all metrics in one go
    if (metricsToInsert.length > 1) {
      codeActions.push(
        this.createInsertAction(
          "Add metadata for all metrics",
          metricsToInsert
            .map((metric) => {
              let promKey = metric.value.split("metric:")[1];
              return buildMetricMetadataSnippet(
                metric.key,
                titleCase(promKey),
                this.prometheusData[promKey].description!,
                undefined,
                -2,
                false
              );
            })
            .join("\n"),
          document,
          range
        )
      );
    }

    return codeActions;
  }
}

/**
 * Splits a metric key on underscore ("_") and puts together all parts with first
 * character in upper case, providing a sort of title.
 * @param metricKey metric key
 * @returns metric key as title case
 */
function titleCase(metricKey: string): string {
  return metricKey
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.substring(1)}`)
    .join(" ");
}
