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

import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";

export interface ExtensionWorkspace {
  name: string;
  id: string;
  folder: string | vscode.Uri;
}

export interface DynatraceEnvironmentData {
  id: string;
  url: string;
  apiUrl: string;
  token: string;
  current: boolean;
  name?: string;
}

type TenantsTreeContextValue =
  | "dynatraceEnvironment"
  | "currentDynatraceEnvironment"
  | "monitoringConfiguration"
  | "deployedExtension";
export type TenantsTreeItem = vscode.TreeItem & {
  id: string;
  contextValue: TenantsTreeContextValue;
  dt: Dynatrace;
};

export type DynatraceTenant = TenantsTreeItem & {
  url: string;
  apiUrl: string;
  token: string;
  current: boolean;
  contextValue: "currentDynatraceEnvironment" | "dynatraceEnvironment";
};

export type MonitoringConfiguration = TenantsTreeItem & {
  extensionName: string;
  contextValue: "monitoringConfiguration";
};

export type DeployedExtension = TenantsTreeItem & {
  tenantUrl: string;
  extensionVersion: string;
  contextValue: "deployedExtension";
};

export interface TenantsTreeDataProvider extends vscode.TreeDataProvider<TenantsTreeItem> {
  refresh: () => void;
  getTreeItem: (element: TenantsTreeItem) => vscode.TreeItem;
  getChildren: (element?: TenantsTreeItem) => Promise<TenantsTreeItem[]>;
}
export type WorkspacesTreeContextValue = "extensionWorkspace" | "extension";

export type WorkspaceTreeItem = vscode.TreeItem & {
  id: string;
  path: vscode.Uri;
  version?: string;
};

export interface WorkspacesTreeDataProvider extends vscode.TreeDataProvider<WorkspaceTreeItem> {
  refresh: () => void;
  getTreeItem: (element: WorkspaceTreeItem) => vscode.TreeItem;
  getChildren: (element?: WorkspaceTreeItem) => WorkspaceTreeItem[];
}
