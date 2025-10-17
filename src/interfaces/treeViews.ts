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

import vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";

export interface ExtensionWorkspaceDto {
  name: string;
  id: string;
  folder: string;
}

export interface ExtensionWorkspace {
  name: string;
  id: string;
  folder: vscode.Uri;
}

export interface DynatraceTenantDto {
  id: string;
  url: string;
  apiUrl: string;
  token: string;
  current: boolean;
  label: string;
}

type TenantsTreeContextValue =
  | "dynatraceEnvironment"
  | "currentDynatraceEnvironment"
  | "monitoringConfiguration"
  | "deployedExtension";

export interface TenantsTreeItemBase extends vscode.TreeItem {
  label: string;
  id: string;
  contextValue: TenantsTreeContextValue;
  dt: Dynatrace;
}

export interface DynatraceTenant extends TenantsTreeItemBase {
  url: string;
  apiUrl: string;
  token: string;
  current: boolean;
  contextValue: "currentDynatraceEnvironment" | "dynatraceEnvironment";
}

export interface MonitoringConfiguration extends TenantsTreeItemBase {
  extensionName: string;
  contextValue: "monitoringConfiguration";
}

export interface DeployedExtension extends TenantsTreeItemBase {
  tenantUrl: string;
  extensionVersion: string;
  contextValue: "deployedExtension";
}

export type TenantsTreeItem = DynatraceTenant | MonitoringConfiguration | DeployedExtension;

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
