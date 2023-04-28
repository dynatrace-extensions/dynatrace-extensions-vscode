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
import { CachedDataProvider } from "../utils/dataCaching";
import { getMetricsFromDataSource } from "../utils/extensionParsing";
import { buildMetricMetadataSnippet, indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provider for Code Actions for SNMP-based extensions, leveraging online OID information.
 */
export class SnmpActionProvider implements vscode.CodeActionProvider {
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider provider of cached data (i.e. prometheus scraped data)
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  /**
   * Provides the Code Actions that insert details based on SNMP data.
   * @param document document that activated the provider
   * @param range range that activated the provider
   * @param context Code Action context
   * @param token cancellation token
   * @returns list of Code Actions
   */
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[]> {
    var codeActions: vscode.CodeAction[] = [];

    // Bail early if different datasource
    if (!/^snmp:/gm.test(document.getText())) {
      return [];
    }

    const lineText = document.lineAt(range.start.line).text;
    const extension = this.cachedData.getExtensionYaml(document.getText());

    if (lineText.startsWith("metrics:")) {
      codeActions.push(...(await this.createMetadataInsertions(document, range, extension)));
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
   * Creates Code Actions for inserting metric metadata based on cached Prometheus data.
   * Metrics are filtered to only those that don't have metadata defined already.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @param extension extension.yaml serialized as object
   * @returns list of code actions
   */
  private async createMetadataInsertions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    extension: ExtensionStub,
  ): Promise<vscode.CodeAction[]> {
    const codeActions: vscode.CodeAction[] = [];
    // Get metrics and keep the OID-based ones
    const metrics = getMetricsFromDataSource(extension, true).filter(
      m => m.value && m.value.startsWith("oid:"),
    );
    // Reduce the time by bulk fetching all required OIDs
    const oidInfos = await this.cachedData.getBulkOidsInfo(
      metrics.map(m =>
        m.value!.endsWith(".0") ? m.value!.slice(4, m.value!.length - 2) : m.value!.slice(4),
      ),
    );
    // Map OID info to each metric
    const metricInfos = metrics.map((m, i) => ({
      key: m.key,
      type: m.type,
      value: m.value,
      info: oidInfos[i],
    }));

    // Filter out metrics that already have metadata or don't have OID info
    const insertedMetrics = extension.metrics ? extension.metrics.map(m => m.key) : [];
    const metricsToInsert = metricInfos
      .filter(metric => !insertedMetrics.includes(metric.key))
      .filter(metric => Object.keys(metric.info).length > 0);

    // Create actions for all metrics in one go
    if (metricsToInsert.length > 1) {
      codeActions.push(
        this.createInsertAction(
          "Add metadata for all metrics",
          metricsToInsert
            .map(metric =>
              buildMetricMetadataSnippet(
                metric.key,
                metric.info.objectType ?? metric.key,
                metric.info.description ?? "",
                undefined,
                -2,
                false,
              ),
            )
            .join("\n"),
          document,
          range,
        ),
      );
    }

    // Create actions for individual metrics
    if (metricsToInsert.length > 0) {
      metricsToInsert.forEach(metric => {
        codeActions.push(
          this.createInsertAction(
            `Add metadata for ${metric.key}`,
            buildMetricMetadataSnippet(
              metric.key,
              metric.info.objectType ?? metric.key,
              metric.info.description ?? "",
              undefined,
              -2,
              false,
            ),
            document,
            range,
          ),
        );
      });
    }

    return codeActions;
  }
}
