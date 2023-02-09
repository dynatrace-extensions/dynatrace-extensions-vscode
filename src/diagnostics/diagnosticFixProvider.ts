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
import { COUNT_METRIC_KEY_SUFFIX, GAUGE_METRIC_KEY_SUFFIX } from "./diagnosticData";
import { DiagnosticsProvider } from "./diagnostics";

interface InsertOptions {
  editType: "insert";
  editPosition: vscode.Position;
  editText: string;
}

interface ReplaceOptions {
  editType: "replace";
  editRange: vscode.Range;
  editText: string;
}

interface DeleteOptions {
  editType: "delete";
  editRange: vscode.Range;
}

/**
 * Provider for Code Actions that proposes fixes for Diagnostics raised by the Extensions Copilot
 */
export class DiagnosticFixProvider implements vscode.CodeActionProvider {
  private readonly diagnosticProvider: DiagnosticsProvider;

  /**
   * @param diagnosticProvider a provider of Diagnostics raised by the Copilot
   */
  constructor(diagnosticProvider: DiagnosticsProvider) {
    this.diagnosticProvider = diagnosticProvider;
  }

  /**
   * Provides Code Actions that fix Diagnostics relevant to the triggered context
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
    var fixActions: vscode.CodeAction[] = [];

    // We should only attempt to fix our own diagnostics
    const diagnostics = this.diagnosticProvider.getDiagnostics(document.uri);

    // Actions for fixing metric keys
    fixActions.push(
      ...this.createMetricKeyFixes(
        diagnostics.filter((d) => d.code === COUNT_METRIC_KEY_SUFFIX.code || d.code === GAUGE_METRIC_KEY_SUFFIX.code),
        range,
        document
      )
    );

    return fixActions;
  }

  /**
   * Creates a quick fix action in a relatively generic way.
   * @param title title of the generated action
   * @param diagnostic the diagnostic that this action fixes
   * @param edit options that will define this action's edit activity
   * @param document document that activated the provider
   * @returns the generated Code Action
   */
  private createFixAction(
    title: string,
    diagnostic: vscode.Diagnostic,
    edit: InsertOptions | ReplaceOptions | DeleteOptions,
    document: vscode.TextDocument
  ) {
    const fixAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    fixAction.diagnostics = [diagnostic];
    fixAction.edit = new vscode.WorkspaceEdit();

    switch (edit.editType) {
      case "insert":
        fixAction.edit.insert(document.uri, edit.editPosition, edit.editText);
        break;
      case "replace":
        fixAction.edit.replace(document.uri, edit.editRange, edit.editText);
        break;
      case "delete":
        fixAction.edit.delete(document.uri, edit.editRange);
        break;
      default:
        break;
    }

    return fixAction;
  }

  /**
   * Creates a set of Code Actions that relate to fixing invalid metric keys.
   * @param diagnostics diagnostics related to metric keys
   * @param range range that triggered the provider
   * @param document document that triggered the provider
   * @returns list of Code Actions
   */
  private createMetricKeyFixes(
    diagnostics: vscode.Diagnostic[],
    range: vscode.Range,
    document: vscode.TextDocument
  ): vscode.CodeAction[] {
    var fixActions: vscode.CodeAction[] = [];

    // Fix Actions for individual metric keys
    diagnostics
      .filter((diagnostic) => diagnostic.range.start.line === range.start.line)
      .forEach((diagnostic) => {
        switch (diagnostic.code!.toString()) {
          case COUNT_METRIC_KEY_SUFFIX.code:
            fixActions.push(
              this.createFixAction(
                'Append ".count" to key',
                diagnostic,
                { editType: "insert", editPosition: diagnostic.range.end, editText: ".count" },
                document
              ),
              this.createFixAction(
                'Append "_count" to key',
                diagnostic,
                { editType: "insert", editPosition: diagnostic.range.end, editText: "_count" },
                document
              )
            );
            break;
          case GAUGE_METRIC_KEY_SUFFIX.code:
            fixActions.push(
              this.createFixAction(
                "Remove key suffix",
                diagnostic,
                {
                  editType: "delete",
                  editRange: new vscode.Range(
                    new vscode.Position(diagnostic.range.end.line, diagnostic.range.end.character - 6),
                    diagnostic.range.end
                  ),
                },
                document
              )
            );
            break;
          default:
            break;
        }
      });

    // All in one action to fix all keys
    if (diagnostics.length > 1) {
      const fixAllKeysAction = new vscode.CodeAction("Fix all metric keys", vscode.CodeActionKind.QuickFix);
      fixAllKeysAction.diagnostics = diagnostics;
      fixAllKeysAction.edit = new vscode.WorkspaceEdit();
      diagnostics.forEach((diagnostic) => {
        switch (diagnostic.code) {
          case COUNT_METRIC_KEY_SUFFIX.code:
            fixAllKeysAction.edit!.insert(document.uri, diagnostic.range.end, ".count");
            break;
          case GAUGE_METRIC_KEY_SUFFIX.code:
            fixAllKeysAction.edit!.delete(
              document.uri,
              new vscode.Range(
                new vscode.Position(diagnostic.range.end.line, diagnostic.range.end.character - 6),
                diagnostic.range.end
              )
            );
            break;
          default:
            break;
        }
      });
      fixActions.push(fixAllKeysAction);
    }

    return fixActions;
  }
}
