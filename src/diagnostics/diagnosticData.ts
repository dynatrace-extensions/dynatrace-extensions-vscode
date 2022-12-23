import * as vscode from "vscode";

interface CopilotDiagnostic {
  code: string | number | { value: string | number; target: vscode.Uri } | undefined;
  severity: vscode.DiagnosticSeverity;
  message: string;
}

/**
 * Creates a {@link vscode.Diagnostic} from a known Copilot Diagnostic (a.k.a. this extension)
 * @param startPos VSCode Position marking the start of the highlight
 * @param endPos VSCode Position marking the end of the highlight
 * @param diagnostic one of the known Copilot Diagnostics (defined below)
 * @returns VSCode Diagnostic
 */
export function copilotDiagnostic(
  startPos: vscode.Position,
  endPos: vscode.Position,
  diagnostic: CopilotDiagnostic
): vscode.Diagnostic {
  return {
    range: new vscode.Range(startPos, endPos),
    message: diagnostic.message,
    code: diagnostic.code,
    severity: diagnostic.severity,
    source: "Extensions Copilot",
  };
}

/**
 * ALL KNOWN DYNATRACE EXTENSIONS COPILOT DIAGNOSTICS SHOULD BE CATALOGUED HERE
 * ============================================================================
 * This allows later re-use of the known codes for other features like Quick
 * Fix actions and condition checkers. The code you use for a diagnostic is
 * does not indicate anything - it just needs to be unique.
 */

export const EXTENSION_NAME_MISSING: CopilotDiagnostic = {
  code: "DEC001",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Extension name is mandatory, but missing.",
};

export const EXTENSION_NAME_TOO_LONG: CopilotDiagnostic = {
  code: "DEC002",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Extension name must not be longer than 50 characters.",
};

export const EXTENSION_NAME_INVALID: CopilotDiagnostic = {
  code: "DEC003",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Extension name is invalid. Must only contain lowercase letters, numbers, hyphens, underscores, or dots.",
};

export const EXTENSION_NAME_NON_CUSTOM: CopilotDiagnostic = {
  code: "DEC004",
  severity: vscode.DiagnosticSeverity.Error,
  message: 'Only custom extensions can be built (name must start with "custom:")',
};

export const EXTENSION_NAME_CUSTOM_ON_BITBUCKET: CopilotDiagnostic = {
  code: "DEC005",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "BitBucket-linked extensions should not have custom names",
};

export const COUNT_METRIC_KEY_SUFFIX: CopilotDiagnostic = {
  code: "DEC006",
  severity: vscode.DiagnosticSeverity.Warning,
  message: 'Metrics of type count should have keys ending in ".count" or "_count"',
};

export const GAUGE_METRIC_KEY_SUFFIX: CopilotDiagnostic = {
  code: "DEC007",
  severity: vscode.DiagnosticSeverity.Warning,
  message: 'Metrics of type gauge should not have keys ending in ".count" or "_count"',
};

export const REFERENCED_CARD_NOT_DEFINED: CopilotDiagnostic = {
  code: "DEC008",
  severity: vscode.DiagnosticSeverity.Error,
  message: "This card is referenced in layout but does not have a definition within this screen",
};

export const DEFINED_CARD_NOT_REFERENCED: CopilotDiagnostic = {
  code: "DEC009",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "This card is defined but is not referenced within the screen layout",
};
