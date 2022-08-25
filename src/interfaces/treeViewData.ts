import * as vscode from "vscode";

export interface ExtensionWorkspace {
  name: string;
  id: string;
  folder: string | vscode.Uri;
}

export interface DynatraceEnvironmentData {
  id: string;
  url: string;
  token: string;
  current: boolean;
  name?: string;
}