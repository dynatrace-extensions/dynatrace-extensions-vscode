import * as vscode from "vscode";
import * as yaml from "yaml";
import { getCardMetaFromDefinition, getCardMetaFromLayout } from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

export class ScreensMetaCompletionProvider implements vscode.CompletionItemProvider {
  constructor() {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var parentBlocks = getParentBlocks(position.line, document.getText());
    var line = document.lineAt(position.line).text.substring(0, position.character);
    var screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());

    // Screen Card Key Suggestions
    // -----
    if (line.endsWith("key: ")) {
      // In layout, suggestion include cards already defined (if any)
      if (parentBlocks[parentBlocks.length - 1] === "cards" && parentBlocks[parentBlocks.length - 2] === "layout") {
        completions.push(...this.createCardKeyCompletions("layout", screenIdx, extension));
      }

      // In card definitions, suggestions include keys from layout (if any)
      const listableCards = ["entitiesListCards", "chartsCards", "eventsCards", "logsCards", "messageCards"];
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
              | "messageCards"
          )
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
    cardType?: "entitiesListCards" | "chartsCards" | "eventsCards" | "logsCards" | "messageCards"
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];

    if (location === "definition") {
      var cardsInserted = getCardMetaFromDefinition(screenIdx, extension, cardType).map((c) => c.key);
      getCardMetaFromLayout(screenIdx, extension)
        .filter(
          // Stupid way of matching card types between yaml key and yaml value
          (card) =>
            card.type.substring(0, 4).toLowerCase() === cardType!.substring(0, 4) && !cardsInserted.includes(card.key)
        )
        .forEach((card) => {
          const cardCompletion = new vscode.CompletionItem(card.key, vscode.CompletionItemKind.Field);
          cardCompletion.detail = "Copilot suggestion";
          cardCompletion.documentation =
            "Your layout section already has this card key, but you don't have a defintion for it yet.";
          completions.push(cardCompletion);
        });
    } else if (location === "layout") {
      var cardsInserted = getCardMetaFromLayout(screenIdx, extension).map((c) => c.key);
      getCardMetaFromDefinition(screenIdx, extension)
        .filter((card) => !cardsInserted.includes(card.key))
        .forEach((card) => {
          const cardCompletion = new vscode.CompletionItem(card.key, vscode.CompletionItemKind.Field);
          cardCompletion.detail = "Copilot suggestion";
          cardCompletion.documentation =
            "Your card definitions already include this key, but it's not yet included in any layout.";
          completions.push(cardCompletion);
        });
    }

    return completions;
  }
}
