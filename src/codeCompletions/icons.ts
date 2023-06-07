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
import { CachedDataProvider } from "../utils/dataCaching";
import { getParentBlocks } from "../utils/yamlParsing";

/**
 * Provider for code auto-completion related to Barista icons
 */
export class IconCompletionProvider implements vscode.CompletionItemProvider {
  private baristaIcons: string[] = [];
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider of cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const completionItems: vscode.CompletionItem[] = [];
    const parentBlocks = getParentBlocks(position.line, document.getText());
    const line = document.lineAt(position.line).text.substring(0, position.character);

    this.baristaIcons = this.cachedData.getBaristaIcons();

    if (
      line.endsWith("iconPattern: ") ||
      (parentBlocks[parentBlocks.length - 1] === "header" && line.endsWith("icon: "))
    ) {
      if (this.baristaIcons.length > 0) {
        completionItems.push(this.createIconCompletion());
      }
    }

    return completionItems;
  }

  /**
   * Creates a completion item for Barista icons
   * @returns
   */
  private createIconCompletion(): vscode.CompletionItem {
    const iconCompletion = new vscode.CompletionItem(
      "Browse icons",
      vscode.CompletionItemKind.Enum,
    );
    iconCompletion.detail = "Dynatrace Extensions";
    iconCompletion.documentation = new vscode.MarkdownString(
      "Browse Barista icon IDs that can be used here. You can explore the whole icon set " +
        "[online](https://barista.dynatrace.com/resources/icons).",
    );
    iconCompletion.insertText = new vscode.SnippetString();
    iconCompletion.insertText.appendChoice(this.baristaIcons);

    return iconCompletion;
  }
}
