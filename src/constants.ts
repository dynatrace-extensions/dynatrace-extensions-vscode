import * as vscode from "vscode";
import { ExtensionDiagnosticDto } from "./utils/diagnostics";

// Document selector for the extension.yaml file
export const MANIFEST_DOC_SELECTOR: vscode.DocumentSelector = {
  language: "yaml",
  pattern: "**/extension/extension.yaml",
};

export const TEMP_CONFIG_DOC_SELECTOR: vscode.DocumentSelector = {
  language: "jsonc",
  pattern: "**/tempConfigFile.jsonc",
};

export const QUICK_FIX_PROVIDER_METADATA: vscode.CodeActionProviderMetadata = {
  providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
};

/**
 * ALL KNOWN DYNATRACE EXTENSIONS COPILOT DIAGNOSTICS SHOULD BE CATALOGUED HERE
 * ============================================================================
 * This allows later re-use of the known codes for other features like Quick
 * Fix actions and condition checkers. The code you use when adding a new
 * diagnostic to the catalogue does not indicate anything - it just needs to
 * be unique. "DED" was used to indicate Dynatrace Extensions Diagnostic.
 */

export const EXTENSION_NAME_MISSING: ExtensionDiagnosticDto = {
  code: "DED001",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Extension name is mandatory, but missing.",
};

export const EXTENSION_NAME_TOO_LONG: ExtensionDiagnosticDto = {
  code: "DED002",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Extension name must not be longer than 50 characters.",
};

export const EXTENSION_NAME_INVALID: ExtensionDiagnosticDto = {
  code: "DED003",
  severity: vscode.DiagnosticSeverity.Error,
  message:
    "Extension name is invalid. " +
    "Must only contain lowercase letters, numbers, hyphens, underscores, or dots.",
};

export const EXTENSION_NAME_NON_CUSTOM: ExtensionDiagnosticDto = {
  code: "DED004",
  severity: vscode.DiagnosticSeverity.Error,
  message: 'Only custom extensions can be built (name must start with "custom:")',
};

export const EXTENSION_NAME_CUSTOM_ON_BITBUCKET: ExtensionDiagnosticDto = {
  code: "DED005",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "BitBucket-linked extensions should not have custom names",
};

export const COUNT_METRIC_KEY_SUFFIX: ExtensionDiagnosticDto = {
  code: "DED006",
  severity: vscode.DiagnosticSeverity.Warning,
  message: 'Metrics of type count should have keys ending in ".count" or "_count"',
};

export const GAUGE_METRIC_KEY_SUFFIX: ExtensionDiagnosticDto = {
  code: "DED007",
  severity: vscode.DiagnosticSeverity.Warning,
  message: 'Metrics of type gauge should not have keys ending in ".count" or "_count"',
};

export const REFERENCED_CARD_NOT_DEFINED: ExtensionDiagnosticDto = {
  code: "DED008",
  severity: vscode.DiagnosticSeverity.Error,
  message: "This card is referenced in layout but does not have a definition within this screen",
};

export const DEFINED_CARD_NOT_REFERENCED: ExtensionDiagnosticDto = {
  code: "DED009",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "This card is defined but is not referenced within the screen layout",
};

export const OID_DOES_NOT_EXIST: ExtensionDiagnosticDto = {
  code: "DED010",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "The existence of this OID could not be verified.",
};

export const OID_NOT_READABLE: ExtensionDiagnosticDto = {
  code: "DED011",
  severity: vscode.DiagnosticSeverity.Error,
  message: "This OID is not readable (MAX-ACCESS does not allow reading).",
};

export const OID_STRING_AS_METRIC: ExtensionDiagnosticDto = {
  code: "DED012",
  severity: vscode.DiagnosticSeverity.Error,
  message: "This OID returns a string but it's being used as a numerical metric value.",
};

export const OID_COUNTER_AS_GAUGE: ExtensionDiagnosticDto = {
  code: "DED013",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "This OID returns a Counter but is being used as a Gauge metric.",
};

export const OID_GAUGE_AS_COUNTER: ExtensionDiagnosticDto = {
  code: "DED014",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "This OID returns a Gauge but is being used as a Counter metric.",
};

export const OID_SYNTAX_INVALID: ExtensionDiagnosticDto = {
  code: "DED015",
  severity: vscode.DiagnosticSeverity.Error,
  message:
    "Invalid OID syntax. OID must not start/end with '.' and may only contain dots and digits.",
};

export const OID_DOT_ZERO_IN_TABLE: ExtensionDiagnosticDto = {
  code: "DED016",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Invalid OID syntax. OIDs must not end in '.0' when part of a 'table' subgroup.",
};

export const OID_DOT_ZERO_MISSING: ExtensionDiagnosticDto = {
  code: "DED017",
  severity: vscode.DiagnosticSeverity.Error,
  message:
    "Invalid OID syntax. OIDs must end in '.0' when they are not part of a 'table' subgroup.",
};

export const OID_STATIC_OBJ_IN_TABLE: ExtensionDiagnosticDto = {
  code: "DED018",
  severity: vscode.DiagnosticSeverity.Error,
  message: "Type conflict. This OID is static but being used inside a 'table' subgroup.",
};

export const OID_TABLE_OBJ_AS_STATIC: ExtensionDiagnosticDto = {
  code: "DED019",
  severity: vscode.DiagnosticSeverity.Error,
  message:
    "Type conflict. " +
    "This OID maps to table entries but is not being used inside a 'table' subgroup.",
};

export const DEFINED_VAR_NOT_REFERENCED: ExtensionDiagnosticDto = {
  code: "DED020",
  severity: vscode.DiagnosticSeverity.Warning,
  message: "This variable is defined but is not used within this extension",
};

export const REFERENCED_VAR_NOT_DEFINED: ExtensionDiagnosticDto = {
  code: "DED021",
  severity: vscode.DiagnosticSeverity.Error,
  message: "A variable is referenced but is not defined.",
};
