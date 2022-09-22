import * as vscode from "vscode";
import Axios from "axios";
import { getParentBlocks, isCursorAt } from "../utils/yamlParsing";

interface BaristaMeta {
  title: string;
  public: boolean;
  tags: string[];
  name: string;
}

/**
 * Provider for code auto-completion related to Barista icons
 */
export class IconCompletionProvider implements vscode.CompletionItemProvider {
  baristaIcons: string[];

  constructor() {
    this.baristaIcons = [];
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

    if (this.baristaIcons.length === 0) {
      this.loadBaristaIcons();
    }

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
   * Loads the names of all available Barista Icons.
   * The internal Barista endpoint is tried first, before the public one.
   */
  private loadBaristaIcons() {
    const publicURL = "https://barista.dynatrace.com/data/resources/icons.json";
    const internalURL = "https://barista.lab.dynatrace.org/data/resources/icons.json";

    Axios.get(internalURL)
      .then((res) => {
        if (res.data.icons) {
          this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
        }
      })
      .catch(async (err) => {
        console.log("Internal Barista not accessible. Trying public one.");

        Axios.get(publicURL)
          .then((res) => {
            if (res.data.icons) {
              this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
            }
          })
          .catch((err) => {
            console.log("Public Barista not accessible.");
            console.log(err.message);
          });
      });
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
