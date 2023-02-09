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
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { CachedDataProvider } from "../utils/dataCaching";
import {
  getDatasourceName,
  getMetricValue,
  getPrometheusLabelKeys,
  getPrometheusMetricKeys,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

/**
 * Provider for code auto-completions related to Prometheus data.
 * Is dependent on scraped metrics for suggestions.
 */
export class PrometheusCompletionProvider implements vscode.CompletionItemProvider {
  private prometheusData: PromData = {};
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  /**
   * Provides the actual completion items related to Prometheus data.
   * @param document {@link vscode.TextDocument} that triggered the provider
   * @param position {@link vscode.Position} when provider was triggered
   * @param token {@link vscode.CancellationToken}
   * @param context {@link vscode.ExtensionContext}
   * @returns list of completion items
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    var completionItems: vscode.CompletionItem[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var parentBlocks = getParentBlocks(position.line, document.getText());
    var line = document.lineAt(position.line).text.substring(0, position.character);

    this.prometheusData = this.cachedData.getPrometheusData();

    // Bail early if different datasource or no scraped data
    if (getDatasourceName(extension) !== "prometheus" || !this.prometheusData) {
      return [];
    }
    
    // Metric details
    if (line.endsWith("value: ")) {
      // Existing datasource yaml details
      const groupIdx = getBlockItemIndexAtLine("prometheus", position.line, document.getText());
      const subgroupIdx = getBlockItemIndexAtLine("subgroups", position.line, document.getText());
      const metricKeys = getPrometheusMetricKeys(extension, groupIdx, subgroupIdx);
      const labelKeys = getPrometheusLabelKeys(extension, groupIdx, subgroupIdx);

      // Metric values from prometheus scraped data
      if (parentBlocks[parentBlocks.length - 1] === "metrics") {
        completionItems.push(...this.createMetricCompletion(metricKeys));
      }
      // Dimension values from prometheus scraped data
      if (parentBlocks[parentBlocks.length - 1] === "dimensions") {
        completionItems.push(...this.createDimensionCompletions(metricKeys, labelKeys));
      }
    }

    // Metric metadata
    if (line.endsWith("description: ") && parentBlocks[parentBlocks.length - 1] === "metadata") {
      const metricIdx = getBlockItemIndexAtLine("metrics", position.line, document.getText());
      completionItems.push(...this.createDescriptionCompletion(extension.metrics[metricIdx].key, extension));
    }

    return completionItems;
  }

  /**
   * Creates a completion item for individual metric values from the scraped endpoint.
   * Filters out any keys that are already part of the YAML.
   * @param existingKeys keys that should be filtered out
   * @returns list of completion items
   */
  private createMetricCompletion(existingKeys: string[]): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    const availableKeys = Object.keys(this.prometheusData).filter((key) => !existingKeys.includes(key));

    // Only create completion item if there are keys to insert
    if (availableKeys.length > 0) {
      const metricCompletion = new vscode.CompletionItem("Browse scraped metrics", vscode.CompletionItemKind.Function);
      metricCompletion.detail = "Copilot Suggestion";
      metricCompletion.documentation = "Browse metric keys that have been scraped from your Prometheus endpoint.";
      metricCompletion.insertText = new vscode.SnippetString();
      metricCompletion.insertText.appendText("metric:");
      metricCompletion.insertText.appendChoice(availableKeys);
      completions.push(metricCompletion);
    }

    return completions;
  }

  /**
   * Creates completion item for individual dimension values based on labels from the scraped endpoint.
   * Dimensions are filtered by metric keys, so that if metrics are already in YAML only the labels
   * that appear on those metrics are suggested.
   * @param metricKeys metric keys to use in filtering Prometheus labels
   * @param existingKeys label keys to ignore
   * @returns completion items
   */
  private createDimensionCompletions(metricKeys: string[], existingKeys: string[]): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var dimensions: string[] = [];
    Object.keys(this.prometheusData).forEach((key) => {
      if (this.prometheusData[key].dimensions) {
        this.prometheusData[key].dimensions!.forEach((dimension) => {
          if (
            (metricKeys.length === 0 || metricKeys.includes(key)) &&
            !existingKeys.includes(dimension) &&
            !dimensions.includes(dimension)
          ) {
            dimensions.push(dimension);
          }
        });
      }
    });
    // Only create completion only if there are dimensions to insert
    if (dimensions.length > 0) {
      const dimensionCompletion = new vscode.CompletionItem("Browse scraped labels", vscode.CompletionItemKind.Field);
      dimensionCompletion.detail = "Copilot Suggestion";
      dimensionCompletion.documentation =
        "Browse metric labels that have scraped from your Prometheus endpoint. If you already entered metrics, only matching labels are suggested.";
      dimensionCompletion.insertText = new vscode.SnippetString();
      dimensionCompletion.insertText.appendText("label:");
      dimensionCompletion.insertText.appendChoice(dimensions);
      completions.push(dimensionCompletion);
    }

    return completions;
  }

  /**
   * Creates completion item for metric description based on details from the scraped prometheus endpoint
   * @param metricKey the (dynatrace) metric key for which description is added
   * @param extension extension.yaml serialized as object
   * @returns list of completions
   */
  private createDescriptionCompletion(metricKey: string, extension: ExtensionStub): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    const metricValue = getMetricValue(metricKey, extension);

    if (metricValue && metricValue.startsWith("metric:")) {
      const promKey = metricValue.split("metric:")[1];
      if (Object.keys(this.prometheusData).includes(promKey)) {
        const descriptionCompletion = new vscode.CompletionItem(
          "Add description",
          vscode.CompletionItemKind.Constant
        );
        descriptionCompletion.detail = "Copilot Suggestion";
        descriptionCompletion.documentation =
          "Automatically add metric description from your Prometheus endpoint scraped data.";
        descriptionCompletion.insertText = this.prometheusData[promKey].description;
        completions.push(descriptionCompletion);
      }
    }

    return completions;
  }
}
