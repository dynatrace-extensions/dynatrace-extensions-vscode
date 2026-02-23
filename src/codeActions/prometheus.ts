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

import vscode from "vscode";
import { ExtensionStub } from "../interfaces/extensionMeta";

import { getCachedParsedExtension, getCachedPrometheusData } from "../utils/caching";
import {
  getMetricsFromDataSource,
  getPrometheusLabelKeys,
  getPrometheusMetricKeys,
} from "../utils/extensionParsing";
import { createSingletonProvider } from "../utils/singleton";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";
import { buildMetricMetadataSnippet, indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provider for Code Actions that work with scraped Prometheus data to automatically
 * insert it in the Extension yaml.
 */
class PrometheusActionProvider implements vscode.CodeActionProvider {
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
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const parsedExtension = getCachedParsedExtension();

    // Bail early if different datasource or no scraped data
    if (
      !/^prometheus:/gm.test(document.getText()) ||
      Object.keys(getCachedPrometheusData()).length === 0 ||
      !parsedExtension
    ) {
      return [];
    }

    const lineText = document.lineAt(range.start.line).text;
    const parentBlocks = getParentBlocks(range.start.line, document.getText());

    // Metrics and dimensions
    if (
      parentBlocks[parentBlocks.length - 1] === "prometheus" ||
      parentBlocks[parentBlocks.length - 1] === "subgroups"
    ) {
      // Existing datasource yaml details
      const groupIdx = getBlockItemIndexAtLine("prometheus", range.start.line, document.getText());
      const subgroupIdx = getBlockItemIndexAtLine(
        "subgroups",
        range.start.line,
        document.getText(),
      );
      const prevLineText = document.lineAt(range.start.line - 1).text;
      const metricKeys = getPrometheusMetricKeys(parsedExtension, groupIdx, subgroupIdx);
      const labelKeys = getPrometheusLabelKeys(parsedExtension, groupIdx, subgroupIdx);
      if (lineText.includes("metrics:")) {
        codeActions.push(
          ...this.createMetricInsertions(
            document,
            range,
            metricKeys,
            parentBlocks[parentBlocks.length - 1] === "subgroups",
            !prevLineText.includes("group:"),
          ),
        );
      }
      if (lineText.includes("dimensions:")) {
        codeActions.push(...this.createDimensionInsertions(document, range, metricKeys, labelKeys));
      }
    }
    // Metadata
    if (lineText.startsWith("metrics:")) {
      codeActions.push(...this.createMetadataInsertions(document, range, parsedExtension));
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
    range: vscode.Range,
  ): vscode.CodeAction | undefined {
    if (document.lineCount === range.start.line + 1) {
      textToInsert = "\n" + textToInsert;
    }
    const firstLineMatch = /[a-z]/i.exec(document.lineAt(range.start.line).text);
    if (firstLineMatch) {
      let indent = firstLineMatch.index;
      let line = range.start.line + 1;
      if (actionName === "Insert all scraped metrics") {
        line = range.start.line;
        indent = indent - 2;
      }
      const insertPosition = new vscode.Position(line, 0);
      const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      if (actionName === "Insert all scraped metrics") {
        const deleteRange = new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line + 1, 0),
        );
        action.edit.delete(document.uri, deleteRange);
      }
      action.edit.insert(document.uri, insertPosition, indentSnippet(textToInsert, indent));
      return action;
    }
  }

  /**
   * Creates Code Actions for inserting metrics from scraped Prometheus data.
   * Actions are created for individual metrics as well as all-in-one.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param existingKeys keys that have already been inserted in yaml (to be excluded)
   * @param isSubgroup boolean that indicates if we are in a subgroup or not
   * @returns list of code actions
   */
  private createMetricInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
    existingKeys: string[],
    isSubgroup: boolean,
    isGroup: boolean,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const availableKeys = Object.keys(getCachedPrometheusData()).filter(
      key => !existingKeys.includes(key),
    );

    if (!isSubgroup) {
      let j = 0;
      let response = "";
      let tab = "";
      if (isGroup) {
        response = '- group: "1"\n';
        tab = "  ";
      }
      response = `${response}${tab}subgroups:`;
      for (let i = 0; i < availableKeys.length; i++) {
        if (i === j * 100) {
          j++;
          response = `${response}\n${tab}- subgroup: "${j}"\n${tab}  metrics:\n`;
        }
        const key = availableKeys[i];
        response = `${response}  ${tab}- key: ${key}\n${tab}    value: metric:${key}\n${tab}    type: ${String(getCachedPrometheusData()[key].type)}\n`;
      }

      // Insert all metrics in one go
      if (availableKeys.length > 1) {
        const action = this.createInsertAction(
          "Insert all scraped metrics",
          response,
          document,
          range,
        );
        if (action) {
          codeActions.push(action);
        }
      }
    }

    // Insert individual metrics
    availableKeys.forEach(key => {
      const action = this.createInsertAction(
        `Insert ${key} metric`,
        `- key: ${key}\n  value: metric:${key}\n  type: ${String(
          getCachedPrometheusData()[key].type,
        )}`,
        document,
        range,
      );

      if (action) {
        codeActions.push(action);
      }
    });

    return codeActions;
  }

  /**
   * Creates Code Actions for inserting dimensions from scraped Prometheus data.
   * Dimensions are filtered by metric keys, so that suggestions apply only to the metrics already
   * inserted in the YAML. Existing keys should be provided to not duplicate labels already in YAML.
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
    existingKeys: string[],
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const availableKeys: string[] = [];
    Object.keys(getCachedPrometheusData()).forEach(key => {
      const dimensions = getCachedPrometheusData()[key].dimensions;
      if (dimensions && dimensions.length > 0) {
        dimensions.forEach(dimension => {
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
    availableKeys.forEach(key => {
      const action = this.createInsertAction(
        `Insert ${key} dimension`,
        `- key: ${key}\n  value: label:${key}`,
        document,
        range,
      );
      if (action) {
        codeActions.push(action);
      }
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
    extension: ExtensionStub,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const datasourceMetrics = getMetricsFromDataSource(extension, true);
    const metadataMetrics = extension.metrics ? extension.metrics.map(m => m.key) : [];

    const metricsToInsert = datasourceMetrics
      // Metrics that don't have metadata defined yet...
      .filter(dsMetric => !metadataMetrics.includes(dsMetric.key))
      // ... and have prometheus-based values...
      .filter(dsMetric => dsMetric.value.startsWith("metric:"))
      // ... and have Prometheus descriptions ...
      .filter(dsMetric => {
        const promKey = dsMetric.value.split("metric:")[1];
        return (
          Object.keys(getCachedPrometheusData()).includes(promKey) &&
          getCachedPrometheusData()[promKey].description
        );
      });

    // Action for all metrics in one go
    if (metricsToInsert.length > 1) {
      const action = this.createInsertAction(
        "Add metadata for all metrics",
        metricsToInsert
          .map(metric => {
            const promKey = metric.value.split("metric:")[1];
            return buildMetricMetadataSnippet(
              metric.key,
              titleCase(promKey),
              String(getCachedPrometheusData()[promKey].description),
              -2,
              false,
            );
          })
          .join("\n"),
        document,
        range,
      );
      if (action) {
        codeActions.push(action);
      }
    }

    // Actions for individual metric metadatas
    if (metricsToInsert.length > 0) {
      metricsToInsert.forEach(metric => {
        const promKey = metric.value.split("metric:")[1];
        const action = this.createInsertAction(
          `Add metadata for ${metric.key}`,
          buildMetricMetadataSnippet(
            metric.key,
            titleCase(promKey),
            String(getCachedPrometheusData()[promKey].description),
            -2,
            false,
          ),
          document,
          range,
        );
        if (action) {
          codeActions.push(action);
        }
      });
    }

    return codeActions;
  }
}

/**
 * Provides singleton access to the PrometheusActionProvider.
 */
export const getPrometheusActionProvider = createSingletonProvider(PrometheusActionProvider);

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
    .map(part => `${part.charAt(0).toUpperCase()}${part.substring(1)}`)
    .join(" ");
}
