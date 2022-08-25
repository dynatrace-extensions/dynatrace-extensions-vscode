import * as path from "path";
import * as yaml from "yaml";
import * as vscode from "vscode";
import * as glob from "glob";
import { readFileSync } from "fs";
import { getAllWorkspaces } from "../utils/fileSystem";
import { ExtensionWorkspace } from "../interfaces/treeViewData";

/**
 * A tree data provider that renders all Extensions 2.0 project workspaces that have been
 * initialized with our VSCode Extension. Any Dynatrace extensions detected within are
 * rendered as children of the workspace.
 */
export class ExtensionsTreeDataProvider implements vscode.TreeDataProvider<ExtensionProjectItem> {
  context: vscode.ExtensionContext;
  private _onDidChangeTreeData: vscode.EventEmitter<ExtensionProjectItem | undefined | void> =
    new vscode.EventEmitter<ExtensionProjectItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ExtensionProjectItem | undefined | void> =
    this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ExtensionProjectItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExtensionProjectItem | undefined): ExtensionProjectItem[] {
    if (element) {
      var extensions: ExtensionProjectItem[] = [];
      var workspacePath = element.path.fsPath;
      glob
        .sync("**/extension/extension.yaml", {
          cwd: workspacePath,
        })
        .forEach((filepath) => {
          let extension: ExtensionStub = yaml.parse(
            readFileSync(path.join(workspacePath, filepath)).toString()
          );
          extensions.push(
            new ExtensionProjectItem(
              extension.name,
              vscode.TreeItemCollapsibleState.None,
              vscode.Uri.file(path.join(workspacePath, filepath)),
              {
                light: path.join(__filename, "..", "..", "assets", "icons", "plugin_light.png"),
                dark: path.join(__filename, "..", "..", "assets", "icons", "plugin_dark.png"),
              },
              "extension",
              extension.version
            )
          );
        });
      return extensions;
    }

    return getAllWorkspaces(this.context).map(
      (workspace: ExtensionWorkspace) =>
        new ExtensionProjectItem(
          workspace.name.toUpperCase(),
          vscode.TreeItemCollapsibleState.Collapsed,
          workspace.folder as vscode.Uri,
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders[0].uri.fsPath ===
            (workspace.folder as vscode.Uri).fsPath
            ? path.join(__filename, "..", "..", "assets", "icons", "workspace_current.png")
            : path.join(__filename, "..", "..", "assets", "icons", "workspace.png"),
          "extensionWorkspace"
        )
    );
  }
}

/**
 * Represents an item within the Extensions Tree View. Can be used to represent
 * either an extensions workspace or an actual extension within the workspace.
 */
export class ExtensionProjectItem extends vscode.TreeItem {
  version?: string;
  path: vscode.Uri;

  /**
   * @param label the label to be shown in the tree view (as node)
   * @param collapsibleState whether the item supports and is either collapsed or expanded
   * @param path the path to the workspace or extension (depending on item type)
   * @param icon the icon to display next to the label
   * @param contextValue a keyword that can be referenced in package.json to single out this item type
   * @param version if item represents an extension, what version is it
   */
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    path: vscode.Uri,
    icon:
      | string
      | vscode.Uri
      | { light: string | vscode.Uri; dark: string | vscode.Uri }
      | vscode.ThemeIcon,
    contextValue: string,
    version?: string
  ) {
    super(label, collapsibleState);

    this.version = version;
    this.tooltip = version ? `${label}-${version}` : label;
    this.description = this.version;
    this.path = path;
    this.iconPath = icon;

    this.contextValue = contextValue;
  }
}
