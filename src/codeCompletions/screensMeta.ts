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
import { getReferencedCardsMeta, getDefinedCardsMeta } from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

export class ScreensMetaCompletionProvider implements vscode.CompletionItemProvider {
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const extension = this.cachedData.getExtensionYaml(document.getText());
    const parentBlocks = getParentBlocks(position.line, document.getText());
    const line = document.lineAt(position.line).text.substring(0, position.character);
    const screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());

    // Screen Card Key Suggestions
    // -----
    if (line.endsWith("key: ")) {
      // In layout, suggestion include cards already defined (if any)
      if (
        parentBlocks[parentBlocks.length - 1] === "cards" &&
        parentBlocks[parentBlocks.length - 2] === "layout"
      ) {
        completions.push(...this.createCardKeyCompletions("layout", screenIdx, extension));
      }

      // In card definitions, suggestions include keys from layout (if any)
      const listableCards = [
        "entitiesListCards",
        "chartsCards",
        "eventsCards",
        "logsCards",
        "messageCards",
      ];
      if (listableCards.includes(parentBlocks[parentBlocks.length - 1])) {
        completions.push(
          ...this.createCardKeyCompletions(
            "definition",
            screenIdx,
            extension,
            parentBlocks[parentBlocks.length - 1] as
              | "entitiesListCards"
              | "chartsCards"
              | "eventsCards"
              | "logsCards"
              | "messageCards",
          ),
        );
      }
    }

    return completions;
  }

  /**
   * Creates completion items for card keys that can be inserted either in card definitions as
   * the card's key or in layout definitions as the card key.
   * @param location where is the insertion made
   * @param screenIdx which screen triggered the provider
   * @param extension the extension.yaml serialized as object
   * @param cardType optional - card type. makes suggestions relevant when insertion is "definition"
   * @returns list of completion items
   */
  private createCardKeyCompletions(
    location: "definition" | "layout",
    screenIdx: number,
    extension: ExtensionStub,
    cardType?: "entitiesListCards" | "chartsCards" | "eventsCards" | "logsCards" | "messageCards",
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];

    if (location === "definition") {
      var cardsInserted = getDefinedCardsMeta(screenIdx, extension, cardType).map(c => c.key);
      getReferencedCardsMeta(screenIdx, extension)
        .filter(
          // Stupid way of matching card types between yaml key and yaml value
          card =>
            card.type.substring(0, 4).toLowerCase() === cardType!.substring(0, 4) &&
            !cardsInserted.includes(card.key),
        )
        .forEach(card => {
          const cardCompletion = new vscode.CompletionItem(
            card.key,
            vscode.CompletionItemKind.Field,
          );
          cardCompletion.detail = "Copilot suggestion";
          cardCompletion.documentation =
            "Your layout section already has this card key, " +
            "but you don't have a defintion for it yet.";
          completions.push(cardCompletion);
        });
    } else if (location === "layout") {
      var cardsInserted = getReferencedCardsMeta(screenIdx, extension).map(c => c.key);
      getDefinedCardsMeta(screenIdx, extension)
        .filter(card => !cardsInserted.includes(card.key))
        .forEach(card => {
          const cardCompletion = new vscode.CompletionItem(
            card.key,
            vscode.CompletionItemKind.Field,
          );
          cardCompletion.detail = "Copilot suggestion";
          cardCompletion.documentation =
            "Your card definitions already include this key, " +
            "but it's not yet included in any layout.";
          completions.push(cardCompletion);
        });
    }

    return completions;
  }
}
