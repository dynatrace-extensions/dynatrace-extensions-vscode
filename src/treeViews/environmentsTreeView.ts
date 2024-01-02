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
import * as logger from "../utils/logging";
import {
  addEnvironment,
  editEnvironment,
  deleteEnvironment,
  changeConnection,
  editMonitoringConfiguration,
  deleteMonitoringConfiguration,
  addMonitoringConfiguration,
  saveMoniotringConfiguration,
  openExtension,
} from "./commands/environments";

const ICONS_PATH = path.join(__filename, "..", "..", "src", "assets", "icons");
const ICONS: Record<string, { light: string; dark: string }> = {
  DEPLOYED_EXTENSION: {
    light: path.join(ICONS_PATH, "deployed_extension_light.png"),
    dark: path.join(ICONS_PATH, "deployed_extension_dark.png"),
  },
  ENVIRONMENT: {
    light: path.join(ICONS_PATH, "platform_light.png"),
    dark: path.join(ICONS_PATH, "platform_dark.png"),
  },
  ENVIRONMENT_CURRENT: {
    light: path.join(ICONS_PATH, "platform_current_light.png"),
    dark: path.join(ICONS_PATH, "platform_current_dark.png"),
  },
};

interface IDynatraceEnvironment extends EnvironmentsTreeItem {
  url: string;
  token: string;
  current: boolean;
  contextValue: "currentDynatraceEnvironment" | "dynatraceEnvironment";
}

/**
 * Represents a Dynatrace (SaaS, Managed, Platform) Environment registered with the add-on.
 */
export class DynatraceEnvironment extends vscode.TreeItem implements IDynatraceEnvironment {
  id: string;
  dt: Dynatrace;
  url: string;
  apiUrl: string;
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
    current: boolean = false,
    apiUrl?: string,
  ) {
    super(label ?? id, collapsibleState);
    this.url = url;
    this.apiUrl = apiUrl ?? url;
    this.token = token;
    this.id = id;
    this.dt = new Dynatrace(this.apiUrl, this.token);
    this.tooltip = id;
    this.current = current;
    this.contextValue = this.current ? "currentDynatraceEnvironment" : "dynatraceEnvironment";
    this.iconPath = this.current ? ICONS.ENVIRONMENT_CURRENT : ICONS.ENVIRONMENT;
  }
}

interface IDeployedExtension extends EnvironmentsTreeItem {
  extensionVersion: string;
  contextValue: "deployedExtension";
}

/**
 * Represents an Extension 2.0 that is deployed to the connected Dynatrace Environment.
 */
export class DeployedExtension extends vscode.TreeItem implements IDeployedExtension {
  id: string;
  dt: Dynatrace;
  tenantUrl: string;
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
    dt: Dynatrace,
    tenantUrl: string,
  ) {
    super(`${extensionName} (${extensionVersion})`, collapsibleState);
    this.id = extensionName;
    this.dt = dt;
    this.tenantUrl = tenantUrl;
    this.extensionVersion = extensionVersion;
    this.contextValue = "deployedExtension";
    this.iconPath = ICONS.DEPLOYED_EXTENSION;
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
    dt: Dynatrace,
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

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Extensions available in the environment, as well as their
 * monitoring configurations are rendered as children.
 * Any environment in the list may be used for API-based operations.
 */
export class EnvironmentsTreeDataProvider implements vscode.TreeDataProvider<EnvironmentsTreeItem> {
  private readonly logTrace = ["treeViews", "environmentsTreeView", this.constructor.name];
  context: vscode.ExtensionContext;
  connectionStatus: ConnectionStatusManager;
  oc: vscode.OutputChannel;
  private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentsTreeItem | undefined> =
    new vscode.EventEmitter<EnvironmentsTreeItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<EnvironmentsTreeItem | undefined> =
    this._onDidChangeTreeData.event;

  /**
   * @param context VSCode Extension Context
   * @param connectionStatus a connection status manager, to update the status bar
   */
  constructor(
    context: vscode.ExtensionContext,
    connectionStatus: ConnectionStatusManager,
    errorChannel: vscode.OutputChannel,
  ) {
    this.context = context;
    this.connectionStatus = connectionStatus;
    this.oc = errorChannel;
    this.getCurrentEnvironment()
      .then(environment => {
        this.connectionStatus
          .updateStatusBar(Boolean(environment), {
            ...{ ...environment },
            name: environment.label.toString(),
          })
          .catch(() => {});
      })
      .catch(err => {
        logger.error((err as Error).message, ...this.logTrace);
      });
    this.registerCommands(context);
  }

  /**
   * Registers the commands that the Items in this Tree View needs to work with.
   * @param context {@link vscode.ExtensionContext}
   */
  private registerCommands(context: vscode.ExtensionContext) {
    // Commands for Environments
    vscode.commands.registerCommand("dynatrace-extensions-environments.refresh", () =>
      this.refresh(),
    );
    vscode.commands.registerCommand("dynatrace-extensions-environments.addEnvironment", () =>
      addEnvironment(context).then(() => this.refresh()),
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.useEnvironment",
      async (environment: DynatraceEnvironment) => {
        await registerEnvironment(
          context,
          environment.url,
          environment.apiUrl,
          encryptToken(environment.token),
          environment.label?.toString(),
          true,
        );
        this.connectionStatus.clearConnectionChecks();
        this.connectionStatus
          .updateStatusBar(true, { ...{ ...environment }, name: environment.label.toString() })
          .catch(() => {});
        this.refresh();
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.editEnvironment",
      async (environment: DynatraceEnvironment) => {
        await editEnvironment(context, environment).then(() => this.refresh());
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.deleteEnvironment",
      async (environment: DynatraceEnvironment) => {
        await deleteEnvironment(context, environment).then(() => this.refresh());
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.changeConnection",
      async () => {
        await changeConnection(context).then(([connected, environment]) => {
          this.connectionStatus.clearConnectionChecks();
          this.connectionStatus.updateStatusBar(connected, environment).catch(() => {});
          this.refresh();
        });
      },
    );
    // Commands for monitoring configurations
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.addConfig",
      async (extension: DeployedExtension) => {
        await addMonitoringConfiguration(extension, context, this.oc).then(success => {
          if (success) {
            this.refresh();
          }
        });
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.editConfig",
      async (config: MonitoringConfiguration) => {
        await editMonitoringConfiguration(config, context, this.oc).then(success => {
          if (success) {
            this.refresh();
          }
        });
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.deleteConfig",
      async (config: MonitoringConfiguration) => {
        await deleteMonitoringConfiguration(config).then(success => {
          if (success) {
            this.refresh();
          }
        });
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.saveConfig",
      async (config: MonitoringConfiguration) => {
        await saveMoniotringConfiguration(config).catch(err => {
          logger.notify("ERROR", `Unable to save configuration. ${(err as Error).message}`);
        });
      },
    );
    // Other commands
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.openExtension",
      async (extension: DeployedExtension) => {
        await openExtension(extension).catch(err => {
          logger.warn(
            `Couldn't open URL for extension ${extension.id}: ${(err as Error).message}`,
            ...this.logTrace,
            "openExtension",
          );
        });
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
    const children: EnvironmentsTreeItem[] = [];
    if (element) {
      switch (element.contextValue) {
        // For Dynatrace Environments, Extensions are the children items
        case "dynatraceEnvironment":
        case "currentDynatraceEnvironment":
          await element.dt.extensionsV2
            .list()
            .then(list =>
              children.push(
                ...list.map(
                  extension =>
                    new DeployedExtension(
                      vscode.TreeItemCollapsibleState.Collapsed,
                      extension.extensionName,
                      extension.version,
                      element.dt,
                      (element as DynatraceEnvironment).url,
                    ),
                ),
              ),
            );
          break;
        // For Extensions, configurations are the children items
        case "deployedExtension":
          await element.dt.extensionsV2
            .listMonitoringConfigurations(element.id)
            .then(async configs => {
              const configObjects = await Promise.all(
                configs.map(async config => {
                  const status = await element.dt.extensionsV2.getMonitoringConfigurationStatus(
                    element.id,
                    config.objectId ?? "",
                  );
                  return new MonitoringConfiguration(
                    config.objectId ?? "",
                    config.value.version,
                    config.value.description,
                    element.id,
                    status.status,
                    element.dt,
                  );
                }),
              );
              return configObjects;
            })
            .then(configObjects => {
              children.push(...configObjects);
            });
          break;
      }
      return children;
    }

    // If no item specified, grab all environments from global storage
    return getAllEnvironments(this.context).map((environment: DynatraceEnvironmentData) => {
      if (environment.current) {
        this.connectionStatus.updateStatusBar(true, environment).catch(() => {});
      }
      return new DynatraceEnvironment(
        vscode.TreeItemCollapsibleState.Collapsed,
        environment.url,
        decryptToken(environment.token),
        environment.id,
        environment.name,
        environment.current,
        environment.apiUrl,
      );
    });
  }

  /**
   * Gets the currently conneted environment (if any).
   * @return environment or undefined if none is connected
   */
  async getCurrentEnvironment(): Promise<DynatraceEnvironment | undefined> {
    const environment = await this.getChildren()
      .then(children =>
        (children as DynatraceEnvironment[]).filter(
          c => c.contextValue === "currentDynatraceEnvironment",
        ),
      )
      .then(children => children.pop());
    return environment;
  }

  /**
   * Gets an instance of a Dynatrace API Client.
   * If no environment is specified, the currently connected environment is used.
   * @param environment specific environment to get the client for
   * @return API Client instance or undefined if none could be created
   */
  async getDynatraceClient(environment?: EnvironmentsTreeItem): Promise<Dynatrace | undefined> {
    const client = environment
      ? environment.dt
      : await this.getCurrentEnvironment().then(e => e?.dt);
    return client;
  }
}

/**
 * Represents a Tree Item for the Environments tree view of the add-on.
 * These are the minimum details every other object should include.
 */
export interface EnvironmentsTreeItem extends vscode.TreeItem {
  id: string;
  contextValue: string;
  dt: Dynatrace;
}
