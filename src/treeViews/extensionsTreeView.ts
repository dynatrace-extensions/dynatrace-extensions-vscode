import * as path from "path";
import * as yaml from "yaml";
import * as vscode from "vscode";
import * as glob from "glob";
import { readFileSync } from "fs";
import { getAllWorkspaces } from "../utils/fileSystem";
import { ExtensionWorkspace } from "../interfaces/treeViewData";
import { deleteWorkspace } from "./commands/workspaces";

/**
 * A tree data provider that renders all Extensions 2.0 project workspaces that have been
 * initialized with our VSCode Extension. Any Dynatrace extensions detected within are
 * rendered as children of the workspace.
 */
export class ExtensionsTreeDataProvider implements vscode.TreeDataProvider<ExtensionProjectItem> {
  context: vscode.ExtensionContext;
  private _onDidChangeTreeData: vscode.EventEmitter<ExtensionProjectItem | undefined | void> = new vscode.EventEmitter<
    ExtensionProjectItem | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<ExtensionProjectItem | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.registerCommands(context);
  }

  /**
   * Registers the commands that this Tree View needs to work with.
   * Commands include adding, opening, or deleting a workspace, opening an extension file, or refreshing this view.
   * @param context {@link vscode.ExtensionContext}
   */
  private registerCommands(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.refresh", () => this.refresh()),
      vscode.commands.registerCommand("dt-ext-copilot-workspaces.addWorkspace", () => {
        vscode.commands.executeCommand("vscode.openFolder");
        context.globalState.update("dt-ext-copilot.initPending", true);
      });
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.openWorkspace", (workspace: ExtensionProjectItem) => {
      vscode.commands.executeCommand("vscode.openFolder", workspace.path);
    });
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.deleteWorkspace", (workspace: ExtensionProjectItem) => {
      deleteWorkspace(context, workspace).then(() => this.refresh());
    });
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.editExtension", (extension: ExtensionProjectItem) => {
      vscode.commands.executeCommand("vscode.open", extension.path);
    });
  }

  /**
   * Refresh this view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
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
      var extensions: ExtensionProjectItem[] = [];
      var workspacePath = element.path.fsPath;
      glob
        .sync("**/extension/extension.yaml", {
          cwd: workspacePath,
        })
        .forEach((filepath) => {
          let extension: ExtensionStub = yaml.parse(readFileSync(path.join(workspacePath, filepath)).toString());
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
              `${extension.name}-${extension.version}`,
              extension.version
            )
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
          vscode.workspace.workspaceFolders[0].uri.fsPath === (workspace.folder as vscode.Uri).fsPath
            ? path.join(__filename, "..", "..", "assets", "icons", "workspace_current.png")
            : path.join(__filename, "..", "..", "assets", "icons", "workspace.png"),
          "extensionWorkspace",
          workspace.id
        )
    );
  }
}

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
   * @param contextValue a keyword that can be referenced in package.json to single out this item type
   * @param version if item represents an extension, what version is it
   */
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    path: vscode.Uri,
    icon: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon,
    contextValue: string,
    id: string,
    version?: string
  ) {
    super(label, collapsibleState);

    this.id = id;
    this.version = version;
    this.tooltip = version ? `${label}-${version}` : label;
    this.description = this.version;
    this.path = path;
    this.iconPath = icon;

    this.contextValue = contextValue;
  }
}
