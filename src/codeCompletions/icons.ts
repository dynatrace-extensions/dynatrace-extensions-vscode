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
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    var completionItems: vscode.CompletionItem[] = [];
    var parentBlocks = getParentBlocks(position.line, document.getText());
    var line = document.lineAt(position.line).text.substring(0, position.character);

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
    const iconCompletion = new vscode.CompletionItem("Browse icons", vscode.CompletionItemKind.Enum);
    iconCompletion.detail = "Copilot suggestion";
    iconCompletion.documentation = new vscode.MarkdownString(
      "Browse Barista icon IDs that can be used here. You can explore the whole icon set [online](https://barista.dynatrace.com/resources/icons)."
    );
    iconCompletion.insertText = new vscode.SnippetString();
    iconCompletion.insertText.appendChoice(this.baristaIcons);

    return iconCompletion;
  }
}
