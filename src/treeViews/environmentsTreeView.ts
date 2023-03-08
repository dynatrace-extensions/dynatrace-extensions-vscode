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

import path = require("path");
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceEnvironmentData } from "../interfaces/treeViewData";
import { ConnectionStatusManager } from "../statusBar/connection";
import { decryptToken, encryptToken } from "../utils/cryptography";
import { getAllEnvironments, registerEnvironment } from "../utils/fileSystem";
import {
  addEnvironment,
  editEnvironment,
  deleteEnvironment,
  changeConnection,
  editMonitoringConfiguration,
  deleteMonitoringConfiguration,
} from "./commands/environments";

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Extensions available in the environment, as well as their
 * monitoring configurations are rendered as children.
 * Any environment in the list may be used for API-based operations.
 */
export class EnvironmentsTreeDataProvider implements vscode.TreeDataProvider<EnvironmentsTreeItem> {
  context: vscode.ExtensionContext;
  connectionStatus: ConnectionStatusManager;
  private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentsTreeItem | undefined | void> = new vscode.EventEmitter<
    EnvironmentsTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<EnvironmentsTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension Context
   * @param connectionStatus a connection status manager, to update the status bar
   */
  constructor(context: vscode.ExtensionContext, connectionStatus: ConnectionStatusManager) {
    this.context = context;
    this.connectionStatus = connectionStatus;
    this.getCurrentEnvironment().then(environment =>
      this.connectionStatus.updateStatusBar(Boolean(environment), environment?.label?.toString())
    );
    this.registerCommands(context);
  }

  /**
   * Registers the commands that the Items in this Tree View needs to work with.
   * @param context {@link vscode.ExtensionContext}
   */
  private registerCommands(context: vscode.ExtensionContext) {
    // Commands for Environments
    vscode.commands.registerCommand("dt-ext-copilot-environments.refresh", () => this.refresh());
    vscode.commands.registerCommand("dt-ext-copilot-environments.addEnvironment", () =>
      addEnvironment(context).then(() => this.refresh())
    );
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.useEnvironment",
      (environment: DynatraceEnvironment) => {
        registerEnvironment(
          context,
          environment.url,
          encryptToken(environment.token),
          environment.label?.toString(),
          true
        );
        this.refresh();
      }
    );
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.editEnvironment",
      (environment: DynatraceEnvironment) => {
        editEnvironment(context, environment).then(() => this.refresh());
      }
    );
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.deleteEnvironment",
      (environment: DynatraceEnvironment) => {
        deleteEnvironment(context, environment).then(() => this.refresh());
      }
    );
    vscode.commands.registerCommand("dt-ext-copilot-environments.changeConnection", () => {
      changeConnection(context).then(([connected, environment]) => {
        this.connectionStatus.updateStatusBar(connected, environment);
        this.refresh();
      });
    });

    // Commands for Extensions
    // COMING SOON - if any

    // Commands for monitoring configurations
    vscode.commands.registerCommand("dt-ext-copilot-environments.editConfig", (config: MonitoringConfiguration) => {
      editMonitoringConfiguration(config, context).then(success => {
        if (success) {
          this.refresh();
        }
      });
    });
    vscode.commands.registerCommand("dt-ext-copilot-environments.deleteConfig", (config: MonitoringConfiguration) => {
      deleteMonitoringConfiguration(config).then(success => {
        if (success) {
          this.refresh();
        }
      });
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
  getTreeItem(element: EnvironmentsTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Retrieves the tree view items that represent children of an element, or all items
   * if no parent element has been provided.
   * @param element parent element, if any
   * @returns list of tree items
   */
  async getChildren(element?: EnvironmentsTreeItem): Promise<EnvironmentsTreeItem[]> {
    if (element) {
      switch (element.contextValue) {
        // For Dynatrace Environments, Extensions are the children items
        case "dynatraceEnvironment":
        case "currentDynatraceEnvironment":
          return await element.dt.extensionsV2
            .list()
            .then(list =>
              list.map(
                extension =>
                  new DeployedExtension(
                    vscode.TreeItemCollapsibleState.Collapsed,
                    extension.extensionName,
                    extension.version,
                    element.dt
                  )
              )
            );
        // For Extensions, configurations are the children items
        case "deployedExtension":
          return await element.dt.extensionsV2.listMonitoringConfigurations(element.id).then(
            async configs =>
              await Promise.all(
                configs.map(async config => {
                  const status = await element.dt.extensionsV2.getMonitoringConfigurationStatus(
                    element.id,
                    config.objectId
                  );
                  return new MonitoringConfiguration(
                    config.objectId,
                    config.value.version,
                    config.value.description,
                    element.id,
                    status.status,
                    element.dt
                  );
                })
              )
          );
        default:
          return [];
      }
    }

    // If no item specified, grab all environments from global storage
    return getAllEnvironments(this.context).map((environment: DynatraceEnvironmentData) => {
      if (environment.current) {
        this.connectionStatus.updateStatusBar(true, environment.name ?? environment.id);
      }
      return new DynatraceEnvironment(
        vscode.TreeItemCollapsibleState.Collapsed,
        environment.url,
        decryptToken(environment.token),
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
  async getCurrentEnvironment(): Promise<DynatraceEnvironment | undefined> {
    return await this.getChildren()
      .then(children =>
        (children as DynatraceEnvironment[]).filter(c => c.contextValue === "currentDynatraceEnvironment")
      )
      .then(children => children.pop());
  }

  /**
   * Gets an instance of a Dynatrace API Client.
   * If no environment is specified, the currently connected environment is used.
   * @param environment specific environment to get the client for
   * @return API Client instance or undefined if none could be created
   */
  async getDynatraceClient(environment?: EnvironmentsTreeItem): Promise<Dynatrace | undefined> {
    return environment ? environment.dt : await this.getCurrentEnvironment().then(e => e?.dt);
  }
}

/**
 * Represents a Tree Item for the Environments tree view of the Copilot.
 * These are the minimum details every other object should include.
 */
export interface EnvironmentsTreeItem extends vscode.TreeItem {
  id: string;
  contextValue: string;
  dt: Dynatrace;
}

interface IDynatraceEnvironment extends EnvironmentsTreeItem {
  url: string;
  token: string;
  current: boolean;
  contextValue: "currentDynatraceEnvironment" | "dynatraceEnvironment";
}

/**
 * Represents a Dynatrace (SaaS or Managed) Environment registered with the Copilot.
 */
export class DynatraceEnvironment extends vscode.TreeItem implements IDynatraceEnvironment {
  id: string;
  dt: Dynatrace;
  url: string;
  token: string;
  current: boolean;
  contextValue: "currentDynatraceEnvironment" | "dynatraceEnvironment";

  /**
   * @param collapsibleState defines whether this item can be expanded further or not
   * @param url the URL to this environment
   * @param token a Dynatrace API Token to use when authenticating with this environment
   * @param id the ID of id of this environment (Tenant ID)
   * @param label an optional label for displaying this environment (otherwise will use ID)
   * @param current whether this environment should be used for API operations currently
   */
  constructor(
    collapsibleState: vscode.TreeItemCollapsibleState,
    url: string,
    token: string,
    id: string,
    label?: string,
    current: boolean = false
  ) {
    super(label ?? id, collapsibleState);
    this.url = url;
    this.token = token;
    this.id = id;
    this.dt = new Dynatrace(this.url, this.token);
    this.tooltip = id;
    this.current = current;
    this.contextValue = this.current ? "currentDynatraceEnvironment" : "dynatraceEnvironment";
    this.iconPath = this.current
      ? path.join(__filename, "..", "assets", "icons", "environment_current.png")
      : path.join(__filename, "..", "assets", "icons", "environment.png");
  }
}

interface IDeployedExtension extends EnvironmentsTreeItem {
  extensionVersion: string;
  contextValue: "deployedExtension";
}

/**
 * Represents an Extension 2.0 that is deployed to the connected Dynatrace Environment.
 */
class DeployedExtension extends vscode.TreeItem implements IDeployedExtension {
  id: string;
  dt: Dynatrace;
  extensionVersion: string;
  contextValue: "deployedExtension";

  /**
   * @param collapsibleState defines whether this item can be expanded further or not
   * @param extensionName the name (ID) of the extension it represents
   * @param extensionVersion the latest activated version of this extension
   * @param dt the Dyntrace Client instance to use for API Operations
   */
  constructor(
    collapsibleState: vscode.TreeItemCollapsibleState,
    extensionName: string,
    extensionVersion: string,
    dt: Dynatrace
  ) {
    super(`${extensionName} (${extensionVersion})`, collapsibleState);
    this.id = extensionName;
    this.dt = dt;
    this.extensionVersion = extensionVersion;
    this.contextValue = "deployedExtension";
    this.iconPath = {
      light: path.join(__filename, "..", "assets", "icons", "plugin_light.png"),
      dark: path.join(__filename, "..", "assets", "icons", "plugin_dark.png"),
    };
  }
}

interface IMonitoringConfiguration extends EnvironmentsTreeItem {
  extensionName: string;
  contextValue: "monitoringConfiguration";
}

/**
 * Represents an instance of an Extension 2.0 configuration that is present on the connected
 * Dynatrace Environment.
 */
export class MonitoringConfiguration extends vscode.TreeItem implements IMonitoringConfiguration {
  id: string;
  dt: Dynatrace;
  extensionName: string;
  contextValue: "monitoringConfiguration";

  /**
   * @param configurationId the ID of the monitoring configuration object
   * @param version the version of the extension it is configured for
   * @param description the description the user entered
   * @param extensionName the name of the extension it configures
   * @param monitoringStatus the last known status of this configuraation
   * @param dt the Dyntrace Client instance to use for API Operations
   */
  constructor(
    configurationId: string,
    version: string,
    description: string,
    extensionName: string,
    monitoringStatus: "ERROR" | "OK" | "UNKNOWN",
    dt: Dynatrace
  ) {
    const statusSymbol = (() => {
      switch (monitoringStatus) {
        case "ERROR":
          return "🔴";
        case "OK":
          return "🟢";
        case "UNKNOWN":
          return "⚫";
        default:
          return "⚪";
      }
    })();

    super(`${description} (${version}) ${statusSymbol}`, vscode.TreeItemCollapsibleState.None);
    this.id = configurationId;
    this.extensionName = extensionName;
    this.contextValue = "monitoringConfiguration";
    this.iconPath = new vscode.ThemeIcon("gear");
    this.dt = dt;
  }
}
