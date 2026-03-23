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

import { getCachedJMXData, getCachedParsedExtension } from "../utils/caching";
import { createSingletonProvider } from "../utils/singleton";
import { indentSnippet } from "./utils/snippetBuildingUtils";

/**
 * Provider for Code Actions that insert JMX query snippets into the Extension yaml
 * based on scraped JMX data.
 */
class JMXActionProvider implements vscode.CodeActionProvider {
  /**
   * Provides Code Actions that insert details based on JMX scraped data.
   * @param document document that activated the provider
   * @param range range that activated the provider
   * @returns list of Code Actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    if (
      !/^jmx:/gm.test(document.getText()) ||
      Object.keys(getCachedJMXData()).length === 0 ||
      !getCachedParsedExtension()
    ) {
      return [];
    }

    const lineText = document.lineAt(range.start.line).text;
    return lineText.includes("subgroups:") ? this.createQueryInsertions(document, range) : [];
  }

  /**
   * Creates a Code Action that inserts a snippet of text on the next line at index 0.
   * @param actionName name of the Code Action
   * @param textToInsert the snippet to insert
   * @param document the document that triggered the action
   * @param range the range that triggered the action
   * @returns Code Action, or undefined if the current line has no alphabetic characters
   */
  private createInsertAction(
    actionName: string,
    textToInsert: string,
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction | undefined {
    const firstLetterMatch = /[a-z]/i.exec(document.lineAt(range.start.line).text);
    if (!firstLetterMatch) {
      return undefined;
    }

    const isLastLine = document.lineCount === range.start.line + 1;
    const snippet = isLastLine ? `\n${textToInsert}` : textToInsert;
    const insertPosition = new vscode.Position(range.start.line + 1, 0);

    const action = new vscode.CodeAction(actionName, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(
      document.uri,
      insertPosition,
      indentSnippet(snippet, firstLetterMatch.index),
    );
    return action;
  }

  /**
   * Creates Code Actions for inserting JMX queries from scraped data.
   * One action is created per available MBean query.
   * @param document the document that triggered the action provider
   * @param range the range that triggered the action
   * @returns list of code actions
   */
  private createQueryInsertions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    return this.getAvailableQueries()
      .map(mbean =>
        this.createInsertAction(
          `Insert query for ${mbean.fullPath}`,
          this.buildQuerySnippet(mbean),
          document,
          range,
        ),
      )
      .filter((action): action is vscode.CodeAction => action !== undefined);
  }

  /**
   * Builds a YAML snippet for a single MBean query, including its dimensions and metrics.
   */
  private buildQuerySnippet(mbean: {
    fullPath: string;
    properties: Record<string, string>;
    metrics: { name: string; numeric: boolean }[];
  }): string {
    const query = mbean.fullPath;

    const propertyDimensions = Object.keys(mbean.properties).map(key => `property:${key}`);
    const attributeDimensions = mbean.metrics
      .filter(m => !m.numeric)
      .map(m => `attribute:${m.name}`);
    const dimensions = [...propertyDimensions, ...attributeDimensions];

    const numericMetrics = mbean.metrics.filter(m => m.numeric).map(m => `attribute:${m.name}`);

    const dimensionLines = dimensions
      .map(dim => {
        const key = dim.replace("property:", "").replace("attribute:", "").toLowerCase();
        const base = `    - key: ${key}\n      value: ${dim}\n`;
        return dim.startsWith("attribute:") ? `${base}      refresh: true\n` : base;
      })
      .join("");

    const metricLines =
      numericMetrics.length > 0
        ? numericMetrics
            .map(
              m =>
                `    - key: ${m.replace("attribute:", "")}\n      value: ${m}\n      type: gauge\n`,
            )
            .join("")
        : `    - key: ${query.split(":")[0]}\n      value: const:1\n      type: gauge\n`;

    return `- subgroup: ${query}\n  query: ${query}\n  dimensions:\n${dimensionLines}  metrics:\n${metricLines}`;
  }

  /** Collects all MBeans from the cached JMX data into a flat array. */
  private getAvailableQueries() {
    return Object.values(getCachedJMXData()).flatMap(domains =>
      Object.values(domains).flatMap(mbeans => Object.values(mbeans).flat()),
    );
  }
}

/**
 * Provides singleton access to the JMXActionProvider.
 */
export const getJMXActionProvider = createSingletonProvider(JMXActionProvider);
