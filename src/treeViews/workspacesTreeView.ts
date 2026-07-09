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

import { readFileSync } from "fs";
import path from "path";
import { glob } from "glob";
import vscode from "vscode";
import { ExtensionStub } from "../interfaces/extensionMeta";
import {
  IconPath,
  WorkspaceTreeItem,
  WorkspacesTreeContextValue,
  WorkspacesTreeDataProvider,
} from "../interfaces/treeViews";
import { getAllWorkspaces } from "../utils/fileSystem";
import { createSingletonProvider } from "../utils/singleton";
import { parseYAML } from "../utils/yamlParsing";

const ICONS_PATH = path.join(__filename, "..", "..", "src", "assets", "icons");
const ICONS: Record<string, IconPath> = {
  EXTENSION: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "extension_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "extension_dark.png")),
  },
  EXTENSION_CURRENT: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "extension_current_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "extension_current_dark.png")),
  },
  EXTENSION_MANIFEST: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "manifest_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "manifest_dark.png")),
  },
};

export const refreshWorkspacesTreeView = () => {
  getWorkspacesTreeDataProvider().refresh();
};

/**
 * Extracts the display text of a tree item's label, which may be a plain string
 * or a {@link vscode.TreeItemLabel}. Used for alphabetical sorting.
 */
const labelText = (item: WorkspaceTreeItem): string =>
  typeof item.label === "string" ? item.label : item.label?.label ?? "";

/**
 * Creates a TreeItem that can be used to represent either an extensions workspace
 * or an extension manifest within that workspace.
 * @param label the label to be shown in the tree view (as node)
 * @param collapsibleState whether the item supports and is either collapsed or expanded
 * @param workspacePath the path to the workspace or extension (depending on item type)
 * @param icon the icon to display next to the label
 * @param contextValue a keyword that can be referenced in package.json to single out this item type
 * @param version if item represents an extension, what version is it
 */
const createWorkspacesTreeItem = (
  label: string,
  collapsibleState: vscode.TreeItemCollapsibleState,
  workspacePath: string,
  icon: string | IconPath,
  contextValue: WorkspacesTreeContextValue,
  id: string,
  version?: string,
): WorkspaceTreeItem => ({
  ...new vscode.TreeItem(label, collapsibleState),
  id: id,
  version: version,
  tooltip: version ? `${label}-${version}` : label,
  description: version,
  path: workspacePath.startsWith("file://")
    ? vscode.Uri.parse(workspacePath)
    : vscode.Uri.file(workspacePath),
  iconPath: icon,
  contextValue: contextValue,
});

/**
 * A tree data provider that renders all Extensions 2.0 project workspaces that have been
 * initialized with our VSCode Extension. Any Dynatrace extensions detected within are
 * rendered as children of the workspace.
 */
class WorkspacesTreeDataProviderImpl implements WorkspacesTreeDataProvider {
  private _onDidChangeTreeData: vscode.EventEmitter<WorkspaceTreeItem | undefined> =
    new vscode.EventEmitter<WorkspaceTreeItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<WorkspaceTreeItem | undefined> =
    this._onDidChangeTreeData.event;

  /**
   * Refresh this view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Retrieve a tree view item from an element within the view.
   * @param element the element to retrieve
   * @returns the tree item
   */
  getTreeItem(element: WorkspaceTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Retrieves the tree view items that represent children of an element, or all items
   * if no parent element has been provided.
   * @param element parent element, if any
   * @returns list of tree items
   */
  getChildren(element?: WorkspaceTreeItem): WorkspaceTreeItem[] {
    if (element) {
      // Workspaces have Extensions as children items
      const extensions: WorkspaceTreeItem[] = [];
      const workspacePath = element.path.fsPath;
      const extensionFiles = [
        ...glob.sync("extension/extension.yaml", { cwd: workspacePath }),
        ...glob.sync("*/extension/extension.yaml", { cwd: workspacePath }),
      ];
      extensionFiles.forEach(filepath => {
        const extensionFilePath = path.join(workspacePath, filepath);
        const extension: ExtensionStub = parseYAML(readFileSync(extensionFilePath).toString());
        extensions.push(
          createWorkspacesTreeItem(
            extension.name,
            vscode.TreeItemCollapsibleState.None,
            extensionFilePath,
            ICONS.EXTENSION_MANIFEST,
            "extension",
            `${extension.name}-${extension.version}`,
            extension.version,
          ),
        );
      });
      // Render extensions alphabetically (case-insensitive) by name
      extensions.sort((a, b) =>
        labelText(a).localeCompare(labelText(b), undefined, { sensitivity: "base" }),
      );
      return extensions;
    }
    // If no item specified, grab all workspaces from global storage, sorted
    // alphabetically (case-insensitive) by their raw name - not the upper-cased label.
    return [...getAllWorkspaces()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map(workspace =>
        createWorkspacesTreeItem(
          workspace.name.toUpperCase(),
          vscode.TreeItemCollapsibleState.Collapsed,
          workspace.folder,
          vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders[0].uri.toString() === workspace.folder
            ? ICONS.EXTENSION_CURRENT
            : ICONS.EXTENSION,
          "extensionWorkspace",
          workspace.id,
        ),
      );
  }
}

/**
 * Returns a singleton instance of the WorkspacesTreeDataProvider.
 */
export const getWorkspacesTreeDataProvider = createSingletonProvider<WorkspacesTreeDataProvider>(
  WorkspacesTreeDataProviderImpl,
);
