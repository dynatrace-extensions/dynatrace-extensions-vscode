import * as vscode from "vscode";
import { CachedDataProvider } from "../utils/dataCaching";
import { resolveSelectorTemplate, ValidationStatus } from "./selectorUtils";

/**
 * A Code Lens to display the status of validating a selector.
 */
class ValidationStatusLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector selector relevant to this lens
   * @param cachedData a provider of cached validation statuses
   */
  constructor(range: vscode.Range, selector: string, cachedData: CachedDataProvider) {
    super(range);
    this.selector = selector;
    const cachedStatus = cachedData.getSelectorStatus(selector);
    this.command = this.getStatusAsCommand(cachedStatus);
  }

  /**
   * Interprets a ValidationStatus and translates it to a vscode.Command to be used
   * inside the code lens.
   * @param status status of the selector
   * @returns command object
   */
  private getStatusAsCommand(status: ValidationStatus): vscode.Command {
    switch (status.status) {
      case "valid":
        return {
          title: "✅",
          tooltip: "Selector is valid",
          command: "",
          arguments: [],
        };
      case "invalid":
        return {
          title: `❌ (${status.error?.code})`,
          tooltip: `Selector is invalid. ${status.error?.message}`,
          command: "",
          arguments: [],
        };
      default:
        return {
          title: "❔",
          tooltip: "Selector has not been validated yet.",
          command: "",
          arguments: [],
        };
    }
  }
}

/**
 * A Code Lens which allows validating a selector and updating its status.
 */
class SelectorValidationLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector selector relevant to this lens
   */
  constructor(range: vscode.Range, selector: string, selectorType: string) {
    super(range, {
      title: "Validate selector",
      tooltip: "Run a query and check if the selector is valid",
      command: "dt-ext-copilot.codelens.validateSelector",
      arguments: [selector, selectorType],
    });
    this.selector = selector;
  }
}

/**
 * A Code Lens which allows running a query with the given selector.
 */
class SelectorRunnerLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector selector relevant to this lens
   */
  constructor(range: vscode.Range, selector: string, selectorType: string) {
    super(range, {
      title: "Query data",
      tooltip: "Run the query and visualize its results",
      command: "dt-ext-copilot.codelens.runSelector",
      arguments: [selector, selectorType],
    });
    this.selector = selector;
  }
}

/**
 * Implementation of a Code Lens Provider to facilitate operations done on metric and entities
 * as well as their respective selectors.
 */
export class SelectorCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  public readonly cachedData: CachedDataProvider;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private readonly controlSetting: string;
  private readonly matchString: string;
  private readonly selectorType: string;

  /**
   * @param match the text to match and extract the selector by
   * @param controlSetting the vscode setting which controls this feature
   * @param dataProvider a provider of cacheable data (i.e. selector statuses)
   */
  constructor(match: string, controlSetting: string, dataProvider: CachedDataProvider) {
    this.codeLenses = [];
    this.matchString = match;
    this.controlSetting = controlSetting;
    this.cachedData = dataProvider;
    this.selectorType = match.startsWith("metricSelector") ? "metric" : "entity";
    this.regex = new RegExp(`(${match})`, "g");
  }

  /**
   * Provides the actual code lenses relevant to each valid section of the extension yaml.
   * @param document VSCode Text Document - this should be the extension.yaml
   * @param token Cancellation Token
   * @returns list of code lenses
   */
  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();

    // Honor the user's settings
    if (!vscode.workspace.getConfiguration("dynatrace", null).get(this.controlSetting) as boolean) {
      return [];
    }

    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));

      if (range) {
        var selector = line.text.split(`${this.matchString} `)[1];
        if (selector.includes("$(entityConditions)")) {
          selector = resolveSelectorTemplate(selector, document, position);
        }

        this.codeLenses.push(new SelectorRunnerLens(range, selector, this.selectorType));
        this.codeLenses.push(new SelectorValidationLens(range, selector, this.selectorType));
        this.codeLenses.push(new ValidationStatusLens(range, selector, this.cachedData));
      }
    }
    return this.codeLenses;
  }

  /**
   * Updates the cached validation status for a given selector and notifies this
   * provider that code lenses have changed.
   * @param selector selector to update status for
   * @param status current validation status
   */
  public updateValidationStatus(selector: string, status: ValidationStatus) {
    this.cachedData.addSelectorStatus(selector, status);
    this._onDidChangeCodeLenses.fire();
  }
}
