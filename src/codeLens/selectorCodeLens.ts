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

import { CodeLensCommand } from "@common";
import vscode from "vscode";
import { ExtensionStub } from "../interfaces/extensionMeta";
import {
  getCachedParsedExtension,
  getCachedSelectorStatus,
  setCachedSelectorStatus,
} from "../utils/caching";
import { resolveSelectorTemplate, ValidationStatus } from "./utils/selectorUtils";

const instances = new Map<string, SelectorCodeLensProvider>();

/**
 * Allows updating the validation status of a selector.
 */
export const updateSelectorValidationStatus = (
  selectorType: string,
  selector: string,
  status: ValidationStatus,
) => {
  instances.forEach(instance => instance.updateValidationStatus(selectorType, selector, status));
};

/**
 * Creates singleton access to the SelectorCodeLensProvider based on matcher and setting ID
 */
export const getSelectorCodeLensProvider = (() => {
  return (match: string, controlSetting: string) => {
    const instance =
      instances.get(`${match}${controlSetting}`) ??
      new SelectorCodeLensProvider(match, controlSetting);
    instances.set(`${match}${controlSetting}`, instance);
    return instance;
  };
})();

/**
 * Implementation of a Code Lens Provider to facilitate operations done on metric and entities
 * as well as their respective selectors.
 */
class SelectorCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private readonly controlSetting: string;
  private readonly matchString: string;
  private readonly selectorType: string;

  /**
   * @param match the text to match and extract the selector by
   * @param controlSetting the vscode setting which controls this feature
   */
  constructor(match: string, controlSetting: string) {
    this.codeLenses = [];
    this.matchString = match;
    this.controlSetting = controlSetting;
    this.selectorType = match.startsWith("metricSelector") ? "metric" : "entity";
    this.regex = new RegExp(`(${match})`, "g");
  }

  /**
   * Provides the actual code lenses relevant to each valid section of the extension yaml.
   * @param document VSCode Text Document - this should be the extension.yaml
   * @returns list of code lenses
   */
  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();
    const parsedExtension = getCachedParsedExtension();

    // Bail early if needed
    if (
      !parsedExtension ||
      !vscode.workspace.getConfiguration("dynatraceExtensions", null).get(this.controlSetting)
    ) {
      return [];
    }

    // Create lenses
    await Promise.all(
      Array.from(text.matchAll(regex)).map(match =>
        this.createLenses(parsedExtension, match, document).then(lenses => {
          this.codeLenses.push(...lenses);
        }),
      ),
    );
    return this.codeLenses;
  }

  /**
   * Creates one of each lens for a selector
   * @param extension extension.yaml serialized as object
   * @param match regular expression match on the extension.yaml text
   * @param document extension.yaml as vscode.TextDocument
   * @returns list of code lenses
   */
  private async createLenses(
    extension: ExtensionStub,
    match: RegExpMatchArray,
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (match.index) {
      const line = document.lineAt(document.positionAt(match.index).line);
      const indexOf = line.text.indexOf(match[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
      if (range) {
        let selector = line.text.split(`${this.matchString} `)[1];
        if (selector.includes("$(entityConditions)")) {
          selector = resolveSelectorTemplate(selector, extension, document, position);
        }
        return [
          new SelectorRunnerLens(range, selector, this.selectorType),
          new SelectorValidationLens(range, selector, this.selectorType),
          new ValidationStatusLens(
            range,
            selector,
            getCachedSelectorStatus(selector) ?? { status: "unknown" },
          ),
        ];
      }
    }
    return [];
  }

  /**
   * Updates the cached validation status for a given selector and notifies this
   * provider that code lenses have changed.
   * @param selectorType type of selector so that unnecessary updates can be avoided
   * @param selector selector to update status for
   * @param status current validation status
   */
  public updateValidationStatus(selectorType: string, selector: string, status: ValidationStatus) {
    if (selectorType !== this.selectorType) return;
    setCachedSelectorStatus(selector, status);
    this._onDidChangeCodeLenses.fire();
  }
}

/**
 * A Code Lens to display the status of validating a selector.
 */
class ValidationStatusLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector selector relevant to this lens
   * @param status the last known status to be displayed
   */
  constructor(range: vscode.Range, selector: string, status: ValidationStatus) {
    super(range);
    this.selector = selector;
    this.command = this.getStatusAsCommand(status);
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
        };
      case "invalid":
        return {
          title: `❌ (${status.error?.code ?? ""})`,
          tooltip: `Selector is invalid. ${status.error?.message ?? ""}`,
          command: "",
        };
      default:
        return {
          title: "❔",
          tooltip: "Selector has not been validated yet.",
          command: "",
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
      command: CodeLensCommand.ValidateSelector,
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
      command: CodeLensCommand.RunSelector,
      arguments: [selector, selectorType],
    });
    this.selector = selector;
  }
}
