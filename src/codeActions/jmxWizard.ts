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
import { MBean } from "../dynatrace-api/interfaces/extensions";

import { getCachedJMXData, getCachedParsedExtension } from "../utils/caching";
import { createSingletonProvider } from "../utils/singleton";
import { indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provider for Code Actions that work with scraped Prometheus data to automatically
 * insert it in the Extension yaml.
 */
class JMXActionProvider implements vscode.CodeActionProvider {
  /**
   * Provides the Code Actions that insert details based on JMX scraped data.
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
      !/^jmx:/gm.test(document.getText()) ||
      Object.keys(getCachedJMXData()).length === 0 ||
      !parsedExtension
    ) {
      return [];
    }

    const lineText = document.lineAt(range.start.line).text;

    // Metrics and dimensions
    if (lineText.includes("subgroups:")) {
      codeActions.push(...this.createQueryInsertions(document, range));
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
      const indent = firstLineMatch.index;
      const line = range.start.line + 1;
      const insertPosition = new vscode.Position(line, 0);
      const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
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
  private createQueryInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];
    const availableQueries = this.getAvailableQueries();

    availableQueries.forEach(mbean => {
      const dimensions: string[] = [];
      const metrics: string[] = [];
      const query = mbean.fullPath;
      Object.keys(mbean.properties).forEach(key => {
        dimensions.push(`property:${key}`);
      });
      mbean.metrics.forEach(metric => {
        if (metric.numeric) {
          metrics.push(`attribute:${metric.name}`);
        } else {
          dimensions.push(`attribute:${metric.name}`);
        }
      });
      let response = `- subgroup: ${query}\n  query: ${query}\n  dimensions:\n`;
      dimensions.forEach(dimension => {
        response = `${response}    - key: ${dimension.replace("property:", "").replace("attribute:", "").toLowerCase()}\n      value: ${dimension}\n`;
        if (dimension.startsWith("attribute:")) {
          response = `${response}      refresh: true\n`;
        }
      });
      response = `${response}  metrics:\n`;
      metrics.forEach(metric => {
        response = `${response}    - key: ${metric.replace("attribute:", "")}\n      value: ${metric}\n      type: gauge\n`;
      });
      if (metrics.length === 0) {
        response = `${response}    - key: ${query.split(":")[0]}\n      value: const:1\n      type: gauge\n`;
      }
      const action = this.createInsertAction(
        `Insert query for ${query}`,
        response,
        document,
        range,
      );
      if (action) {
        codeActions.push(action);
      }
    });

    return codeActions;
  }

  private getAvailableQueries() {
    const queries: MBean[] = [];
    const jmxData = getCachedJMXData();
    Object.values(jmxData).forEach(domains => {
      Object.values(domains).forEach(mbeans => {
        Object.values(mbeans).forEach(mbeanlist => {
          mbeanlist.forEach(mbean => {
            queries.push(mbean);
          });
        });
      });
    });
    return queries;
  }
}

/**
 * Provides singleton access to the JMXActionProvider.
 */
export const getJMXActionProvider = createSingletonProvider(JMXActionProvider);
