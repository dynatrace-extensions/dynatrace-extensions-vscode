import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";

interface ValidationStatus {
  status: "valid" | "invalid" | "unknown";
  error?: {
    code: number;
    message: string;
  };
}

/**
 * A Code Lens to display the status of validating a metric selector.
 */
class ValidationStatusLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector metric selector relevant to this lens
   * @param status the validation status for this lens' metric selector
   */
  constructor(range: vscode.Range, selector: string, status: ValidationStatus) {
    super(range);
    this.selector = selector;
    this.command = this.getStatusAsCommand(status);
  }

  /**
   * Interprets a ValidationStatus and translates it to a vscode.Command to be used
   * inside the code lens.
   * @param status status of the metric selector
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

  /**
   * Updates the status of this lens.
   * @param status the new status
   */
  public updateStatus(status: ValidationStatus) {
    this.command = this.getStatusAsCommand(status);
  }
}

/**
 * A Code Lens which allows validating a metric selector and updating its associated
 * {@link ValidationStatusLens}
 */
class SelectorValidationLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector metric selector relevant to this lens
   */
  constructor(range: vscode.Range, selector: string) {
    super(range, {
      title: "Validate selector",
      tooltip: "Run a query and check if the selector is valid",
      command: "dynatrace-extension-developer.metric-codelens.validateSelector",
      arguments: [selector],
    });
    this.selector = selector;
  }
}

/**
 * A Code Lens which allows running a metric query with the given selector.
 */
class SelectorRunnerLens extends vscode.CodeLens {
  selector: string;

  /**
   * @param range VSCode Range at which lens should be created
   * @param selector metric selector relevant to this lens
   */
  constructor(range: vscode.Range, selector: string) {
    super(range, {
      title: "Query metric data",
      tooltip: "Run the metric query and visualize its results",
      command: "dynatrace-extension-developer.metric-codelens.runSelector",
      arguments: [selector],
    });
    this.selector = selector;
  }
}

/**
 * Implementation of a Code Lens Provider to facilitate operations done on metrics and metric selectors.
 */
export class MetricCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.codeLenses = [];
    this.regex = /(metricSelector:)/g;
  }

  /**
   * Provides the actual code lenses relevant to each valid section of the extension yaml.
   * @param document VSCode Text Document - this should be the extension.yaml
   * @param token Cancellation Token
   * @returns list of code lenses
   */
  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    const regex = new RegExp(this.regex);
    const text = document.getText();
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));

      if (range) {
        const selector = line.text.split("metricSelector: ")[1];

        this.createOrUpdateLens(new SelectorRunnerLens(range, selector));
        this.createOrUpdateLens(new SelectorValidationLens(range, selector));
        this.createOrUpdateLens(new ValidationStatusLens(range, selector, { status: "unknown" }));
      }
    }
    return this.codeLenses;
  }

  /**
   * Checks the knwown Code Lenses and either creates the provided lens or updates the existing
   * entry in case the details match.
   * @param newLens a Metric Selector code lens
   */
  private createOrUpdateLens(newLens: SelectorRunnerLens | SelectorValidationLens | ValidationStatusLens) {
    let prevLensIdx = this.codeLenses.findIndex(
      (lens) => lens.constructor === newLens.constructor && lens.range.isEqual(newLens.range)
    );
    if (prevLensIdx === -1) {
      this.codeLenses.push(newLens);
    } else {
      if (
        (this.codeLenses[prevLensIdx] as SelectorRunnerLens | SelectorValidationLens | ValidationStatusLens)
          .selector !== newLens.selector
      ) {
        this.codeLenses[prevLensIdx] = newLens;
      }
    }
  }

  /**
   * Allows updating an already existing Validation Status code lens. This allows on-demand
   * status updates for metric selectors.
   * @param selector metric selector of the lens
   * @param status status object to update lens with
   */
  public updateValidationStatus(selector: string, status: ValidationStatus) {
    const idx = this.codeLenses.findIndex((lens) => lens instanceof ValidationStatusLens && lens.selector === selector);
    if (idx >= 0) {
      (this.codeLenses[idx] as ValidationStatusLens).updateStatus(status);
    }
    this._onDidChangeCodeLenses.fire();
  }
}

/**
 * Runs a metric query and reports the status of validating the result.
 * If no errors were experienced, the check is successful, otherwise it is considered failed and the details are
 * contained within the returned object.
 * @param selector metric selector to validate
 * @param dt Dynatrace API Client
 * @returns validation status
 */
export function validateMetricSelector(selector: string, dt: Dynatrace): Promise<ValidationStatus> {
  return dt.metrics
    .query(selector)
    .then(() => ({ status: "valid" } as ValidationStatus))
    .catch(
      (err: DynatraceAPIError) =>
        ({
          status: "invalid",
          error: {
            code: err.errorParams.code,
            message: err.errorParams.data,
          },
        } as ValidationStatus)
    );
}
