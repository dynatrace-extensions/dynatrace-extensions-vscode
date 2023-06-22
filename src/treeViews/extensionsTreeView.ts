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
import * as path from "path";
import * as glob from "glob";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { ExtensionWorkspace } from "../interfaces/treeViewData";
import { getAllWorkspaces } from "../utils/fileSystem";
import { deleteWorkspace } from "./commands/workspaces";

const ICONS_PATH = path.join(__filename, "..", "..", "src", "assets", "icons");
const ICONS: Record<string, { light: string; dark: string }> = {
  EXTENSION: {
    light: path.join(ICONS_PATH, "extension_light.png"),
    dark: path.join(ICONS_PATH, "extension_dark.png"),
  },
  EXTENSION_CURRENT: {
    light: path.join(ICONS_PATH, "extension_current_light.png"),
    dark: path.join(ICONS_PATH, "extension_current_dark.png"),
  },
  EXTENSION_MANIFEST: {
    light: path.join(ICONS_PATH, "manifest_light.png"),
    dark: path.join(ICONS_PATH, "manifest_dark.png"),
  },
};

/**
 * Represents an item within the Extensions Tree View. Can be used to represent
 * either an extensions workspace or an actual extension within the workspace.
 */
export class ExtensionProjectItem extends vscode.TreeItem {
  id: string;
  path: vscode.Uri;
  version?: string;

  /**
   * @param label the label to be shown in the tree view (as node)
   * @param collapsibleState whether the item supports and is either collapsed or expanded
   * @param path the path to the workspace or extension (depending on item type)
   * @param icon the icon to display next to the label
   * @param contextValue a keyword that can be referenced in package.json to single out this
   * item type
   * @param version if item represents an extension, what version is it
   */
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    workspacePath: vscode.Uri,
    icon:
      | string
      | vscode.Uri
      | { light: string | vscode.Uri; dark: string | vscode.Uri }
      | vscode.ThemeIcon,
    contextValue: string,
    id: string,
    version?: string,
  ) {
    super(label, collapsibleState);

    this.id = id;
    this.version = version;
    this.tooltip = version ? `${label}-${version}` : label;
    this.description = this.version;
    this.path = workspacePath;
    this.iconPath = icon;

    this.contextValue = contextValue;
  }
}

/**
 * A tree data provider that renders all Extensions 2.0 project workspaces that have been
 * initialized with our VSCode Extension. Any Dynatrace extensions detected within are
 * rendered as children of the workspace.
 */
export class ExtensionsTreeDataProvider implements vscode.TreeDataProvider<ExtensionProjectItem> {
  context: vscode.ExtensionContext;
  private _onDidChangeTreeData: vscode.EventEmitter<ExtensionProjectItem | undefined> =
    new vscode.EventEmitter<ExtensionProjectItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<ExtensionProjectItem | undefined> =
    this._onDidChangeTreeData.event;

  /**
   * @param cachedDataProvider a provider for cacheable data
   * @param context VSCode Extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.registerCommands(context);
  }

  /**
   * Registers the commands that this Tree View needs to work with.
   * Commands include adding, opening, or deleting a workspace, opening an extension file, or
   * refreshing this view.
   * @param context {@link vscode.ExtensionContext}
   */
  private registerCommands(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.refresh", () =>
      this.refresh(),
    );
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.addWorkspace", async () => {
      await context.globalState.update("dynatrace-extensions.initPending", true);
      await vscode.commands.executeCommand("vscode.openFolder");
    });
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.openWorkspace",
      async (workspace: ExtensionProjectItem) => {
        await vscode.commands.executeCommand("vscode.openFolder", workspace.path);
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.deleteWorkspace",
      async (workspace: ExtensionProjectItem) => {
        await deleteWorkspace(context, workspace).then(() => this.refresh());
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.editExtension",
      async (extension: ExtensionProjectItem) => {
        await vscode.commands.executeCommand("vscode.open", extension.path);
      },
    );
  }

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
  getTreeItem(element: ExtensionProjectItem): vscode.TreeItem {
    return element;
  }

  /**
   * Retrieves the tree view items that represent children of an element, or all items
   * if no parent element has been provided.
   * @param element parent element, if any
   * @returns list of tree items
   */
  getChildren(element?: ExtensionProjectItem | undefined): ExtensionProjectItem[] {
    if (element) {
      // Workspaces have Extensions as children items
      const extensions: ExtensionProjectItem[] = [];
      const workspacePath = element.path.fsPath;
      const extensionFiles = [
        ...glob.sync("extension/extension.yaml", { cwd: workspacePath }),
        ...glob.sync("*/extension/extension.yaml", { cwd: workspacePath }),
      ];
      extensionFiles.forEach(filepath => {
        const extension = yaml.parse(
          readFileSync(path.join(workspacePath, filepath)).toString(),
        ) as ExtensionStub;
        extensions.push(
          new ExtensionProjectItem(
            extension.name,
            vscode.TreeItemCollapsibleState.None,
            vscode.Uri.file(path.join(workspacePath, filepath)),
            ICONS.EXTENSION_MANIFEST,
            "extension",
            `${extension.name}-${extension.version}`,
            extension.version,
          ),
        );
      });
      return extensions;
    }
    // If not item specified, grab all workspaces from global storage
    return getAllWorkspaces(this.context).map(
      (workspace: ExtensionWorkspace) =>
        new ExtensionProjectItem(
          workspace.name.toUpperCase(),
          vscode.TreeItemCollapsibleState.Collapsed,
          workspace.folder as vscode.Uri,
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders[0].uri.fsPath ===
            (workspace.folder as vscode.Uri).fsPath
            ? ICONS.EXTENSION_CURRENT
            : ICONS.EXTENSION,
          "extensionWorkspace",
          workspace.id,
        ),
    );
  }
}
