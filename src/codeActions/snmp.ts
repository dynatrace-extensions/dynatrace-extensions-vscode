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
import { getCachedOid, getCachedParsedExtension, updateCachedSnmpOids } from "../utils/caching";
import { getMetricsFromDataSource } from "../utils/extensionParsing";
import { oidFromMetriValue } from "../utils/snmp";
import { getIndent } from "../utils/yamlParsing";
import { buildMetricMetadataSnippet, indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provides singleton access to the SnmpActionProvider
 */
export const getSnmpActionProvider = (() => {
  let instance: SnmpActionProvider | undefined;

  return () => {
    instance = instance === undefined ? new SnmpActionProvider() : instance;
    return instance;
  };
})();

/**
 * Provider for Code Actions for SNMP-based extensions, leveraging online OID information.
 */
class SnmpActionProvider implements vscode.CodeActionProvider {
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
  ): Promise<vscode.CodeAction[]> {
    const codeActions: vscode.CodeAction[] = [];
    const parsedExtension = getCachedParsedExtension();

    // Bail early if different datasource
    if (!/^snmp:/gm.test(document.getText()) || !parsedExtension) {
      return [];
    }

    const lineText = document.lineAt(range.start.line).text;

    if (lineText.startsWith("metrics:")) {
      codeActions.push(...(await this.createMetadataInsertions(document, range, parsedExtension)));
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
    const indent = getIndent(document, range.start.line);
    const insertPosition = new vscode.Position(range.start.line + 1, 0);
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
    const metrics = (
      getMetricsFromDataSource(extension, true) as { key: string; type: string; value: string }[]
    ).filter(m => m.value.startsWith("oid:"));

    // Reduce the time by bulk fetching all required OIDs
    await updateCachedSnmpOids(metrics.map(m => oidFromMetriValue(m.value)));

    // Map OID info to each metric
    const metricInfos = metrics.map(m => ({
      key: m.key,
      type: m.type,
      value: m.value,
      info: getCachedOid(oidFromMetriValue(m.value)),
    }));

    // Filter out metrics that already have metadata or don't have OID info
    const insertedMetrics = extension.metrics ? extension.metrics.map(m => m.key) : [];
    const metricsToInsert = metricInfos
      .filter(metric => !insertedMetrics.includes(metric.key))
      .filter(metric => Object.keys(metric.info ?? {}).length > 0);

    // Create actions for all metrics in one go
    if (metricsToInsert.length > 1) {
      codeActions.push(
        this.createInsertAction(
          "Add metadata for all metrics",
          metricsToInsert
            .map(metric =>
              buildMetricMetadataSnippet(
                metric.key,
                metric.info?.objectType ?? metric.key,
                metric.info?.description ?? "",
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
              metric.info?.objectType ?? metric.key,
              metric.info?.description ?? "",
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
