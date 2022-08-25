import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceEnvironmentData } from "../interfaces/treeViewData";
import { ConnectionStatusManager } from "../statusBar/connection";
import { decryptToken } from "../utils/cryptography";
import { getAllEnvironments } from "../utils/fileSystem";

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Any environment in the list may be used for API-based operations.
 */
export class EnvironmentsTreeDataProvider implements vscode.TreeDataProvider<EnvironmentTreeItem> {
  context: vscode.ExtensionContext;
  connectionStatus: ConnectionStatusManager;
  private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentTreeItem | undefined | void> =
    new vscode.EventEmitter<EnvironmentTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<EnvironmentTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension Context
   * @param connectionStatus a connection status manager, to update the status bar
   */
  constructor(context: vscode.ExtensionContext, connectionStatus: ConnectionStatusManager) {
    this.context = context;
    this.connectionStatus = connectionStatus;
    let currentEnvironment = this.getCurrentEnvironment();
    this.connectionStatus.updateStatusBar(
      Boolean(currentEnvironment),
      currentEnvironment?.label?.toString()
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: EnvironmentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EnvironmentTreeItem | undefined): EnvironmentTreeItem[] {
    if (element) {
      // TODO:
      // Parse and return the extensions available
      // Potentially parse and return monitoring configurations?
      return [];
    }

    return getAllEnvironments(this.context).map((environment: DynatraceEnvironmentData) => {
      if (environment.current) {
        this.connectionStatus.updateStatusBar(
          true,
          environment.name ? environment.name : environment.id
        );
      }
      return new EnvironmentTreeItem(
        vscode.TreeItemCollapsibleState.Collapsed,
        environment.url,
        decryptToken(environment.token),
        environment.current ? "currentDynatraceEnvironment" : "dynatraceEnvironment",
        environment.current
          ? path.join(__filename, "..", "..", "assets", "icons", "environment_current.png")
          : path.join(__filename, "..", "..", "assets", "icons", "environment.png"),
        environment.id,
        environment.name,
        environment.current
      );
    });
  }

  /**
   * Gets the currently conneted environment (if any).
   */
  getCurrentEnvironment() {
    return this.getChildren()
      .filter((e) => e.current)
      .pop();
  }

  /**
   * Gets an instance of a Dynatrace API Client based on the currently connected environment.
   */
  getDynatraceClient() {
    var dt;
    const currentEnvironment = this.getCurrentEnvironment();
    if (currentEnvironment) {
      try {
        dt = new Dynatrace(currentEnvironment.url, currentEnvironment.token);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create API Client. Error: ${err.message}`);
      }
      return dt;
    }
  }
}

/**
 * Represents an item within the Environments Tree View.
 * Used to represent Dynatrace Environments with saved credentials that can be used for
 * API-based operations.
 */
export class EnvironmentTreeItem extends vscode.TreeItem {
  name?: string;
  url: string;
  id: string;
  token: string;
  current: boolean;

  /**
   * @param collapsibleState whether the item supports children and is either collapsed or expanded
   * @param url the URL at which an environment is reachable
   * @param token an access token to use with the environment
   * @param contextValue a keyword that can be referenced in package.json to single out this item type
   * @param icon the icon to display next to the label
   * @param id the Dynatrace environment ID
   * @param name a user-friendly name for this environment
   * @param current whether this is the currently used environment
   */
  constructor(
    collapsibleState: vscode.TreeItemCollapsibleState,
    url: string,
    token: string,
    contextValue: string,
    icon:
      | string
      | vscode.Uri
      | { light: string | vscode.Uri; dark: string | vscode.Uri }
      | vscode.ThemeIcon,
    id: string,
    name?: string,
    current: boolean = false
  ) {
    let label = name ? name : id;

    super(label, collapsibleState);

    this.url = url;
    this.token = token;
    this.id = id;
    this.tooltip = id;
    this.current = current;
    this.iconPath = icon;
    this.contextValue = contextValue;
  }
}
