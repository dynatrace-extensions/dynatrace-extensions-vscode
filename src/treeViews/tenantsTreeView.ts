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

import path from "path";
import { Utils } from "@common";
import vscode from "vscode";
import { DynatraceClient, createDynatraceClient } from "../dynatrace-api/dynatrace";
import {
  DeployedExtension,
  DeploymentModel,
  DynatraceTenant,
  DynatraceTenantDto,
  IconPath,
  MonitoringConfiguration,
  TenantsTreeDataProvider,
  TenantsTreeItem,
} from "../interfaces/treeViews";
import { showConnectedStatusBar } from "../statusBar/connection";
import { decryptToken } from "../utils/cryptography";
import { getAllTenants } from "../utils/fileSystem";
import logger from "../utils/logging";
import { createSingletonProvider } from "../utils/singleton";

const ICONS_PATH = path.join(__filename, "..", "..", "src", "assets", "icons");
const ICONS = {
  DEPLOYED_EXTENSION_SAAS: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "deployed_extension_saas.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "deployed_extension_saas.png")),
  },
  DEPLOYED_EXTENSION_MANAGED: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "deployed_extension_managed.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "deployed_extension_managed.png")),
  },
  SAAS_TENANT: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "saas_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "saas_dark.png")),
  },
  MANAGED_TENANT: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "managed_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "managed_dark.png")),
  },
  SAAS_TENANT_CURRENT: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "saas_current_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "saas_current_dark.png")),
  },
  MANAGED_TENANT_CURRENT: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "managed_current_light.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "managed_current_dark.png")),
  },
  SAAS_TENANT_INVALID: {
    light: vscode.Uri.file(path.join(ICONS_PATH, "saas_invalid.png")),
    dark: vscode.Uri.file(path.join(ICONS_PATH, "saas_invalid.png")),
  },
} satisfies Record<string, IconPath>;
type ConfigStatus = "ERROR" | "OK" | "UNKNOWN";
const CONFIG_STATUS_COLORS: Record<ConfigStatus, string> = {
  ERROR: "🔴",
  OK: "🟢",
  UNKNOWN: "⚫",
};

export const checkTenantSetup = (
  tenant: DynatraceTenantDto,
  notify: boolean = false,
): string | null => {
  let issue = null;
  if (
    tenant.url.includes("live.dynatrace.com") ||
    tenant.url.includes("sprint.dynatracelabs.com") ||
    tenant.url.includes("dev.dynatracelabs.com")
  ) {
    issue = "Tenant is using a legacy URL. Update it to a .apps domain and use a Platform Token";
  } else if (tenant.deploymentModel === "saas") {
    const dtToken = decryptToken(tenant.token);
    if (dtToken.startsWith("dt0c01") || dtToken.startsWith("dt0s01")) {
      issue = "Tenant has a legacy token. Update it to a Platform Token";
    }
  }
  if (issue && notify) {
    logger.notify("WARN", `${tenant.label}: ${issue}`);
  }
  return issue;
};

const getTenantIconAndTooltip = (tenant: DynatraceTenantDto): [IconPath, string] => {
  const setupIssue = checkTenantSetup(tenant);

  if (setupIssue) {
    return [ICONS.SAAS_TENANT_INVALID, setupIssue];
  }
  if (tenant.deploymentModel === "saas") {
    return [tenant.current ? ICONS.SAAS_TENANT_CURRENT : ICONS.SAAS_TENANT, tenant.id];
  }
  return [tenant.current ? ICONS.MANAGED_TENANT_CURRENT : ICONS.MANAGED_TENANT, tenant.id];
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
      children.filter(
        (c): c is DynatraceTenant => c.contextValue === "currentDynatraceEnvironment",
      ),
    )
    .then(children => children.pop());
  return tenant;
};

export const refreshTenantsTreeView = () => {
  getTenantsTreeDataProvider().refresh();
};

export const isConnectedToSaaS = async (): Promise<boolean> => {
  const tenant = await getConnectedTenant();
  return tenant?.deploymentModel === "saas";
};

export const isConnectedToManaged = async (): Promise<boolean> => {
  const tenant = await getConnectedTenant();
  return tenant?.deploymentModel === "managed";
};

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
        children.filter(
          (c): c is DynatraceTenant => c.contextValue === "currentDynatraceEnvironment",
        ),
      )
      .then(children => children.pop())
      .then(tenant => {
        if (tenant) {
          showConnectedStatusBar(tenant).catch(Utils.noOp);
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
                    element.url,
                    element.deploymentModel,
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
                    element.deploymentModel,
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
    return getAllTenants().map(tenant => {
      if (tenant.current) {
        showConnectedStatusBar(tenant).catch(Utils.noOp);
      }
      return createDynatraceTenantTreeItem(tenant);
    });
  }
}

/**
 * Returns a singleton instance of the EnvironmentsTreeDataProvider.
 */
export const getTenantsTreeDataProvider = createSingletonProvider<TenantsTreeDataProvider>(
  TenantsTreeDataProviderImpl,
);

/**
 * Creates a TreeItem object that represents a Dynatrace (SaaS, Managed, Platform) tenant registered
 * with the VSCode Extension.
 * @param tenant the tenant object
 */
const createDynatraceTenantTreeItem = (tenant: DynatraceTenantDto): DynatraceTenant => {
  const { label, id, url, token, deploymentModel, current } = tenant;
  const dtToken = decryptToken(token);
  const [iconPath, tooltip] = getTenantIconAndTooltip(tenant);
  return {
    ...new vscode.TreeItem(label ?? id, vscode.TreeItemCollapsibleState.Collapsed),
    url,
    token: dtToken,
    id,
    dt: createDynatraceClient(url, dtToken, deploymentModel),
    tooltip,
    current,
    deploymentModel,
    contextValue: current ? "currentDynatraceEnvironment" : "dynatraceEnvironment",
    iconPath,
  } as DynatraceTenant;
};

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
  dt: DynatraceClient,
  tenantUrl: string,
  deploymentModel: DeploymentModel,
): DeployedExtension =>
  ({
    ...new vscode.TreeItem(`${extensionName} (${extensionVersion})`, collapsibleState),
    id: extensionName,
    dt: dt,
    tenantUrl: tenantUrl,
    extensionVersion: extensionVersion,
    contextValue: "deployedExtension",
    iconPath:
      deploymentModel === "saas" ? ICONS.DEPLOYED_EXTENSION_SAAS : ICONS.DEPLOYED_EXTENSION_MANAGED,
    deploymentModel,
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
  dt: DynatraceClient,
  deploymentModel: DeploymentModel,
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
    dt,
    deploymentModel,
  }) as MonitoringConfiguration;
