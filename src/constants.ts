import * as vscode from "vscode";

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
