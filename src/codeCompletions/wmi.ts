import * as vscode from "vscode";
import * as yaml from "yaml";
import { CachedDataProvider } from "../utils/dataCaching";

export class WmiCompletionProvider implements vscode.CompletionItemProvider {
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
    context: vscode.CompletionContext
  ): vscode.ProviderResult<
    vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
  > {
    const extension = yaml.parse(document.getText()) as ExtensionStub;

    // Exit early if different datasource
    if (!extension.wmi) {
      return [];
    }

    // Get the current line
    const line = document
      .lineAt(position.line)
      .text.substring(0, position.character);

    // If the line contains 'value:' the user is editing a dimension or metric
    if (line.includes("value: ") || line.includes("column:")) {
      // Find the first query definition found before this line
      const closestQueryLine = this.findClosestOcurrence(
        "query:",
        position,
        document
      );
      if (closestQueryLine) {
        const queryString = closestQueryLine.split("query:")[1].trim();

        // Find out if we have a query result for this query
        const cachedQueryResults =
          this.cachedData.getWmiQueryResult(queryString);
        if (!cachedQueryResults || cachedQueryResults.results.length === 0) {
          return [];
        }
        
        const firstResult = cachedQueryResults.results[0];
        const colummnNames = Object.keys(firstResult);
        return colummnNames.map((name) => {
          const suggestion = `column:${name}`;
          const displayValue = `${suggestion} (${firstResult[name]}) <${typeof firstResult[name]}>`
          const completionItem = new vscode.CompletionItem(displayValue, vscode.CompletionItemKind.Field);
          completionItem.insertText = suggestion;
          completionItem.detail = `WMI result suggestion`;
          completionItem.documentation = `${suggestion}\nValue: ${firstResult[name]}\nType: ${typeof firstResult[name]}`;
          return completionItem;
        });
      }
    }
  }

  findClosestOcurrence(
    target: string,
    position: vscode.Position,
    document: vscode.TextDocument
  ): string | undefined {
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      if (line.includes(target)) {
        return line;
      }
    }
    return undefined;
  }
}
