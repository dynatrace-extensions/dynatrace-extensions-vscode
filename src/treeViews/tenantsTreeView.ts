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
  DynatraceTenantDto,
  DynatraceTenant,
  MonitoringConfiguration,
  TenantsTreeDataProvider,
  TenantsTreeItem,
} from "../interfaces/treeViews";
import { showConnectedStatusBar } from "../statusBar/connection";
import { decryptToken } from "../utils/cryptography";
import { getAllTenants } from "../utils/fileSystem";
import * as logger from "../utils/logging";

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

/**
 * Gets an instance of a Dynatrace API Client.
 * If no environment is specified, the currently connected environment is used.
 * @param tenant specific environment to get the client for
 * @return API Client instance or undefined if none could be created
 */
export const getDynatraceClient = async (tenant?: DynatraceTenant) => {
  const client = tenant ? tenant.dt : await getConnectedTenant().then(t => t?.dt);
  return client;
};

/**
 * Gets the currently conneted environment (if any).
 * @return environment or undefined if none is connected
 */
export const getConnectedTenant = async () => {
  const tenant = await getTenantsTreeDataProvider()
    .getChildren()
    .then(children =>
      (children as DynatraceTenant[]).filter(c => c.contextValue === "currentDynatraceEnvironment"),
    )
    .then(children => children.pop());
  return tenant;
};

export const refreshTenantsTreeView = () => {
  getTenantsTreeDataProvider().refresh();
};

/**
 * Returns a singleton instance of the EnvironmentsTreeDataProvider.
 */
export const getTenantsTreeDataProvider = (() => {
  let instance: TenantsTreeDataProvider | undefined;

  return () => {
    instance = instance === undefined ? new TenantsTreeDataProviderImpl() : instance;
    return instance;
  };
})();

/**
 * A tree data provider that renders all Dynatrace Environments that have been registered
 * with the VSCode Extension. Extensions available in the environment, as well as their
 * monitoring configurations are rendered as children.
 * Any environment in the list may be used for API-based operations.
 */
class TenantsTreeDataProviderImpl implements TenantsTreeDataProvider {
  private readonly logTrace = ["treeViews", "environmentsTreeView", "EnvironmentsTreeDataProvider"];
  private _onDidChangeTreeData: vscode.EventEmitter<TenantsTreeItem | undefined> =
    new vscode.EventEmitter<TenantsTreeItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<TenantsTreeItem | undefined> =
    this._onDidChangeTreeData.event;

  /**
   * @param connectionStatus a connection status manager, to update the status bar
   */
  constructor() {
    this.getChildren()
      .then(children =>
        (children as DynatraceTenant[]).filter(
          c => c.contextValue === "currentDynatraceEnvironment",
        ),
      )
      .then(children => children.pop())
      .then(tenant => {
        if (tenant) {
          showConnectedStatusBar(tenant).catch(() => {});
        }
      })
      .catch(err => {
        logger.error((err as Error).message, ...this.logTrace);
      });
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
    return getAllTenants().map((tenant: DynatraceTenantDto) => {
      const { id, url, apiUrl, label, current, token } = tenant;
      if (current) {
        showConnectedStatusBar(tenant).catch(() => {});
      }
      return createDynatraceTenantTreeItem(url, decryptToken(token), id, label, current, apiUrl);
    });
  }
}

/**
 * Creates a TreeItem object that represents a Dynatrace (SaaS, Managed, Platform) tenant registered
 * with the VSCode Extension.
 * @param url the URL to this tenant
 * @param token a Dynatrace API Token to use when authenticating with this tenant
 * @param id the id of this tenant
 * @param label an optional label for displaying this tenant (defaults to id)
 * @param current whether this tenant should be used for API operations currently
 */
const createDynatraceTenantTreeItem = (
  url: string,
  token: string,
  id: string,
  label?: string,
  current: boolean = false,
  apiUrl?: string,
): DynatraceTenant =>
  ({
    ...new vscode.TreeItem(label ?? id, vscode.TreeItemCollapsibleState.Collapsed),
    url: url,
    apiUrl: apiUrl ?? url,
    token: token,
    id: id,
    dt: new Dynatrace(apiUrl ?? url, token),
    tooltip: id,
    current: current,
    contextValue: current ? "currentDynatraceEnvironment" : "dynatraceEnvironment",
    iconPath: current ? ICONS.ENVIRONMENT_CURRENT : ICONS.ENVIRONMENT,
  }) as DynatraceTenant;

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
): DeployedExtension =>
  ({
    ...new vscode.TreeItem(`${extensionName} (${extensionVersion})`, collapsibleState),
    id: extensionName,
    dt: dt,
    tenantUrl: tenantUrl,
    extensionVersion: extensionVersion,
    contextValue: "deployedExtension",
    iconPath: ICONS.DEPLOYED_EXTENSION,
  }) as DeployedExtension;

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
): MonitoringConfiguration =>
  ({
    ...new vscode.TreeItem(
      `${description} (${version}) ${CONFIG_STATUS_COLORS[monitoringStatus]}`,
      vscode.TreeItemCollapsibleState.None,
    ),
    id: configurationId,
    extensionName: extensionName,
    contextValue: "monitoringConfiguration",
    iconPath: new vscode.ThemeIcon("gear"),
    dt: dt,
  }) as MonitoringConfiguration;
