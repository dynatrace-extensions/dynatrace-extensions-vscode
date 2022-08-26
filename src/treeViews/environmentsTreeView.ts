import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceEnvironmentData } from "../interfaces/treeViewData";
import { ConnectionStatusManager } from "../statusBar/connection";
import { decryptToken } from "../utils/cryptography";
import { getAllEnvironments } from "../utils/fileSystem";

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Extensions available in the environment, as well as their
 * monitoring configurations are rendered as children.
 * Any environment in the list may be used for API-based operations.
 */
export class EnvironmentsTreeDataProvider implements vscode.TreeDataProvider<EnvironmentTreeItem> {
  context: vscode.ExtensionContext;
  connectionStatus: ConnectionStatusManager;
  private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentTreeItem | undefined | void> = new vscode.EventEmitter<
    EnvironmentTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<EnvironmentTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension Context
   * @param connectionStatus a connection status manager, to update the status bar
   */
  constructor(context: vscode.ExtensionContext, connectionStatus: ConnectionStatusManager) {
    this.context = context;
    this.connectionStatus = connectionStatus;
    this.getCurrentEnvironment().then((environment) =>
      this.connectionStatus.updateStatusBar(Boolean(environment), environment?.label?.toString())
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: EnvironmentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: EnvironmentTreeItem | undefined): Promise<EnvironmentTreeItem[]> {
    if (element) {
      switch (element.contextValue) {
        case "dynatraceEnvironment":
        case "currentDynatraceEnvironment":
          return await element.dt.extensionsV2.list().then((list) =>
            list.map(
              (extension) =>
                new EnvironmentTreeItem(
                  vscode.TreeItemCollapsibleState.Collapsed,
                  element.url,
                  element.token,
                  "tenantExtension",
                  {
                    light: path.join(__filename, "..", "..", "assets", "icons", "plugin_light.png"),
                    dark: path.join(__filename, "..", "..", "assets", "icons", "plugin_dark.png"),
                  },
                  `${extension.extensionName}-${extension.version}`,
                  `${extension.extensionName} (${extension.version})`
                )
            )
          );
        case "tenantExtension":
          let extensionName = element.label!.toString().split(" ")[0];
          return await element.dt.extensionsV2.listMonitoringConfigurations(extensionName).then(
            async (configs) =>
              await Promise.all(
                configs.map(async (config) => {
                  let status = await element.dt.extensionsV2
                    .getMonitoringConfigurationStatus(extensionName, config.objectId)
                    .then((statusObj) => {
                      switch (statusObj.status) {
                        case "ERROR":
                          return "🔴";
                        case "OK":
                          return "🟢";
                        case "UNKNOWN":
                          return "⚫";
                        default:
                          return "⚪";
                      }
                    });
                  return new EnvironmentTreeItem(
                    vscode.TreeItemCollapsibleState.None,
                    element.url,
                    element.token,
                    "monitoringConfiguration",
                    new vscode.ThemeIcon("gear"),
                    config.objectId,
                    `${config.value.description} (${config.value.version}) ${status}`
                  );
                })
              )
          );
        default:
          return [];
      }
    }

    return getAllEnvironments(this.context).map((environment: DynatraceEnvironmentData) => {
      if (environment.current) {
        this.connectionStatus.updateStatusBar(true, environment.name ? environment.name : environment.id);
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
   * @return environment or undefined if none is connected
   */
  async getCurrentEnvironment(): Promise<EnvironmentTreeItem | undefined> {
    return await this.getChildren()
      .then((children) => children.filter((c) => c.contextValue === "currentDynatraceEnvironment"))
      .then((children) => children.pop());
  }

  /**
   * Gets an instance of a Dynatrace API Client.
   * If no environment is specified, the currently connected environment is used.
   * @param environment specific environment to get the client for
   * @return API Client instance or undefined if none could be created
   */
  async getDynatraceClient(environment?: EnvironmentTreeItem): Promise<Dynatrace | undefined> {
    return environment ? environment.dt : await this.getCurrentEnvironment().then((e) => e?.dt);
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
  dt: Dynatrace;

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
    icon: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon,
    id: string,
    name?: string,
    current: boolean = false
  ) {
    let label = name ? name : id;

    super(label, collapsibleState);

    this.url = url;
    this.token = token;
    this.id = id;
    this.dt = new Dynatrace(this.url, this.token);
    this.tooltip = id;
    this.current = current;
    this.iconPath = icon;
    this.contextValue = contextValue;
  }
}
