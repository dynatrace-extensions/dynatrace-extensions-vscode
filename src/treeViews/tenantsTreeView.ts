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
import {
  DeployedExtension,
  DynatraceEnvironmentData,
  DynatraceTenant,
  MonitoringConfiguration,
  TenantsTreeDataProvider,
  TenantsTreeItem,
} from "../interfaces/treeViews";
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
type ConfigStatus = "ERROR" | "OK" | "UNKNOWN";
const CONFIG_STATUS_COLORS: Record<ConfigStatus, string> = {
  ERROR: "🔴",
  OK: "🟢",
  UNKNOWN: "⚫",
};

let instance: TenantsTreeDataProvider | undefined;

/**
 * Returns a singleton instance of the EnvironmentsTreeDataProvider.
 */
export const getTenantsTreeDataProvider = (() => {
  return (
    context: vscode.ExtensionContext,
    connectionStatus: ConnectionStatusManager,
    errorChannel: vscode.OutputChannel,
  ) => {
    instance =
      instance === undefined
        ? new TenantsTreeDataProviderImpl(context, connectionStatus, errorChannel)
        : instance;
    return instance;
  };
})();

/**
 * Gets an instance of a Dynatrace API Client.
 * If no environment is specified, the currently connected environment is used.
 * @param environment specific environment to get the client for
 * @return API Client instance or undefined if none could be created
 */
export const getDynatraceClient = async (environment?: TenantsTreeItem) => {
  if (!instance) return undefined;
  const client = environment ? environment.dt : await getConnectedTenant().then(e => e?.dt);
  return client;
};

/**
 * Gets the currently conneted environment (if any).
 * @return environment or undefined if none is connected
 */
export const getConnectedTenant = async () => {
  if (!instance) return undefined;
  const environment = await instance
    .getChildren()
    .then(children =>
      (children as DynatraceTenant[]).filter(c => c.contextValue === "currentDynatraceEnvironment"),
    )
    .then(children => children.pop());
  return environment;
};

/**
 * Creates a TreeItem object that represents a Dynatrace (SaaS, Managed, Platform) tenant registered
 * with the VSCode Extension.
 * @param collapsibleState defines whether this item can be expanded further or not
 * @param url the URL to this tenant
 * @param token a Dynatrace API Token to use when authenticating with this tenant
 * @param id the id of this tenant
 * @param label an optional label for displaying this tenant (defaults to id)
 * @param current whether this tenant should be used for API operations currently
 */
const createDynatraceTenantTreeItem = (
  collapsibleState: vscode.TreeItemCollapsibleState,
  url: string,
  token: string,
  id: string,
  label?: string,
  current: boolean = false,
  apiUrl?: string,
): DynatraceTenant => ({
  ...new vscode.TreeItem(label ?? id, collapsibleState),
  url: url,
  apiUrl: apiUrl ?? url,
  token: token,
  id: id,
  dt: new Dynatrace(apiUrl ?? url, token),
  tooltip: id,
  current: current,
  contextValue: current ? "currentDynatraceEnvironment" : "dynatraceEnvironment",
  iconPath: current ? ICONS.ENVIRONMENT_CURRENT : ICONS.ENVIRONMENT,
});

/**
 * Creates a TreeItem object that represents an Extension 2.0 that is deployed to the connected
 * Dynatrace tenant.
 * @param collapsibleState defines whether this item can be expanded further or not
 * @param extensionName the name (ID) of the extension it represents
 * @param extensionVersion the latest activated version of this extension
 * @param dt the Dyntrace Client instance to use for API Operations
 */
const createDeployedExtension = (
  collapsibleState: vscode.TreeItemCollapsibleState,
  extensionName: string,
  extensionVersion: string,
  dt: Dynatrace,
  tenantUrl: string,
): DeployedExtension => ({
  ...new vscode.TreeItem(`${extensionName} (${extensionVersion})`, collapsibleState),
  id: extensionName,
  dt: dt,
  tenantUrl: tenantUrl,
  extensionVersion: extensionVersion,
  contextValue: "deployedExtension",
  iconPath: ICONS.DEPLOYED_EXTENSION,
});

/**
 * Creates an object that represents an instance of an Extension 2.0 monitoring configuration that
 * is present on the connected Dynatrace tenant.
 * @param configurationId the ID of the monitoring configuration object
 * @param version the version of the extension it is configured for
 * @param description the description the user entered
 * @param extensionName the name of the extension it configures
 * @param monitoringStatus the last known status of this configuraation
 * @param dt the Dyntrace Client instance to use for API Operations
 */
const createMonitoringConfiguration = (
  configurationId: string,
  version: string,
  description: string,
  extensionName: string,
  monitoringStatus: ConfigStatus,
  dt: Dynatrace,
): MonitoringConfiguration => ({
  ...new vscode.TreeItem(
    `${description} (${version}) ${CONFIG_STATUS_COLORS[monitoringStatus]}`,
    vscode.TreeItemCollapsibleState.None,
  ),
  id: configurationId,
  extensionName: extensionName,
  contextValue: "monitoringConfiguration",
  iconPath: new vscode.ThemeIcon("gear"),
  dt: dt,
});

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Extensions available in the environment, as well as their
 * monitoring configurations are rendered as children.
 * Any environment in the list may be used for API-based operations.
 */
class TenantsTreeDataProviderImpl implements TenantsTreeDataProvider {
  private readonly logTrace = ["treeViews", "environmentsTreeView", "EnvironmentsTreeDataProvider"];
  context: vscode.ExtensionContext;
  connectionStatus: ConnectionStatusManager;
  oc: vscode.OutputChannel;
  private _onDidChangeTreeData: vscode.EventEmitter<TenantsTreeItem | undefined> =
    new vscode.EventEmitter<TenantsTreeItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<TenantsTreeItem | undefined> =
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
    this.getChildren()
      .then(children =>
        (children as DynatraceTenant[]).filter(
          c => c.contextValue === "currentDynatraceEnvironment",
        ),
      )
      .then(children => children.pop())
      .then(environment => {
        if (environment) {
          this.connectionStatus
            .updateStatusBar(Boolean(environment), {
              ...{ ...environment },
              name: environment.label?.toString(),
            })
            .catch(() => {});
        }
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
      async (environment: DynatraceTenant) => {
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
          .updateStatusBar(true, { ...{ ...environment }, name: environment.label?.toString() })
          .catch(() => {});
        this.refresh();
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.editEnvironment",
      async (environment: DynatraceTenant) => {
        await editEnvironment(context, environment).then(() => this.refresh());
      },
    );
    vscode.commands.registerCommand(
      "dynatrace-extensions-environments.deleteEnvironment",
      async (environment: DynatraceTenant) => {
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
          logger.notify(
            "ERROR",
            `Unable to save configuration. ${(err as Error).message}`,
            ...this.logTrace,
            "saveMoniotringConfiguration",
          );
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
  getTreeItem(element: TenantsTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Retrieves the tree view items that represent children of an element, or all items
   * if no parent element has been provided.
   * @param element parent element, if any
   * @returns list of tree items
   */
  async getChildren(element?: TenantsTreeItem): Promise<TenantsTreeItem[]> {
    const children: TenantsTreeItem[] = [];
    if (element) {
      switch (element.contextValue) {
        // For Dynatrace Environments, Extensions are the children items
        case "dynatraceEnvironment":
        case "currentDynatraceEnvironment":
          await element.dt.extensionsV2
            .list()
            .then(list =>
              children.push(
                ...list.map(extension =>
                  createDeployedExtension(
                    vscode.TreeItemCollapsibleState.Collapsed,
                    extension.extensionName,
                    extension.version,
                    element.dt,
                    (element as DynatraceTenant).url,
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
                  return createMonitoringConfiguration(
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
      return createDynatraceTenantTreeItem(
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
}
