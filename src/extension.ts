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
  limitations under the  License.
 */

import * as vscode from "vscode";
import { getDiagnosticFixProvider } from "./codeActions/diagnosticFixProvider";
import { getPrometheusActionProvider } from "./codeActions/prometheus";
import { getSnippetGenerator } from "./codeActions/snippetGenerator";
import { getSnmpActionProvider } from "./codeActions/snmp";
import { getConfigurationCompletionProvider } from "./codeCompletions/configuration";
import { getEntitySelectorCompletionProvider } from "./codeCompletions/entitySelectors";
import { getIconCompletionProvider } from "./codeCompletions/icons";
import { getPrometheusCompletionProvider } from "./codeCompletions/prometheus";
import { getScreensCompletionProvider } from "./codeCompletions/screensMeta";
import { getTopologyCompletionProvider } from "./codeCompletions/topology";
import { getWmiCompletionProvider } from "./codeCompletions/wmi";
import { getPrometheusCodeLensProvider } from "./codeLens/prometheusScraper";
import { getScreenLensProvider } from "./codeLens/screenCodeLens";
import { getSelectorCodeLensProvider } from "./codeLens/selectorCodeLens";
import { getSimulatorLensProvider } from "./codeLens/simulatorCodeLens";
import { getSnmpCodeLensProvider } from "./codeLens/snmpCodeLens";
import { registerSelectorCommands } from "./codeLens/utils/selectorUtils";
import { getWmiCodeLensProvider } from "./codeLens/wmiCodeLens";
import { activateExtensionWorkflow } from "./commandPalette/activateExtension";
import { buildExtensionWorkflow, fastModeBuildWorkflow } from "./commandPalette/buildExtension";
import { convertJmxExtensionWorkflow } from "./commandPalette/convertJMXExtension";
import { convertPythonExtensionWorkflow } from "./commandPalette/convertPythonExtension";
import { createAlertWorkflow } from "./commandPalette/createAlert";
import { createMonitoringConfigurationWorkflow } from "./commandPalette/createConfiguration";
import { createDashboardWorkflow } from "./commandPalette/createDashboard";
import { createDocumentationWorkflow } from "./commandPalette/createDocumentation";
import { distributeCertificateWorkflow } from "./commandPalette/distributeCertificate";
import { downloadSupportArchiveWorkflow } from "./commandPalette/downloadSupportArchive";
import { generateCertificatesWorkflow } from "./commandPalette/generateCertificates";
import { initWorkspaceWorkflow } from "./commandPalette/initWorkspace";
import { loadSchemasWorkflow } from "./commandPalette/loadSchemas";
import { uploadExtensionWorkflow } from "./commandPalette/uploadExtension";
import {
  MANIFEST_DOC_SELECTOR,
  QUICK_FIX_PROVIDER_METADATA,
  TEMP_CONFIG_DOC_SELECTOR,
} from "./constants";
import { getSnmpHoverProvider } from "./hover/snmpHover";
import { getConnectionStatusBar } from "./statusBar/connection";
import { getFastModeStatusBar } from "./statusBar/fastMode";
import { SimulatorManager } from "./statusBar/simulator";
import { registerTenantsViewCommands } from "./treeViews/commands/environments";
import { registerWorkspaceViewCommands } from "./treeViews/commands/workspaces";
import { getTenantsTreeDataProvider } from "./treeViews/tenantsTreeView";
import { getWorkspacesTreeDataProvider } from "./treeViews/workspacesTreeView";
import { initializeCache } from "./utils/caching";
import { isExtensionsWorkspace } from "./utils/conditionCheckers";
import { registerDiagnosticsEventListeners } from "./utils/diagnostics";
import {
  getAllEnvironments,
  getAllWorkspaces,
  initializeGlobalStorage,
  migrateFromLegacyExtension,
} from "./utils/fileSystem";
import * as logger from "./utils/logging";
import { REGISTERED_PANELS, getWebviewPanelManager } from "./webviews/webviewPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowFunction<T extends any[] = []> = (...args: T) => PromiseLike<unknown>;
let simulatorManager: SimulatorManager;
let activationContext: vscode.ExtensionContext;

/**
 * Sets up the VSCode extension by registering all the available functionality as disposable objects.
 * The extension automatically activates after editor start-up.
 */
export async function activate(context: vscode.ExtensionContext) {
  const fnLogTrace = ["extension", "activate"];

  setActivationContext(context);
  initializeGlobalStorage();

  const extensionVersion = (context.extension.packageJSON as { version: string }).version;
  logger.info(`dynatrace-extensions (version ${extensionVersion}) is activating...`, ...fnLogTrace);

  // TODO: Code soon to be removed from project
  if (vscode.extensions.getExtension("DynatracePlatformExtensions.dt-ext-copilot")) {
    await migrateFromLegacyExtension();
  }

  // Set custom context properties for tree views
  setContextProperty("numWorkspaces", getAllWorkspaces().length);
  setContextProperty("extensionWorkspace", await isExtensionsWorkspace(false));
  setContextProperty("numEnvironments", getAllEnvironments().length);

  logger.debug("Instantiating feature providers", ...fnLogTrace);
  await initializeCache(context.globalStorageUri.fsPath);
  simulatorManager = new SimulatorManager();

  // Register all features and allow VSCode access to the disposables.
  logger.debug("Registering commands and feature providers", ...fnLogTrace);
  context.subscriptions.push(
    ...registerCommandPaletteWorkflows(),
    ...registerCompletionProviders(),
    ...registerTreeViews(),
    ...registerCodeActionsProviders(),
    ...registerSelectorCommands(),
    ...registerCodeLensProviders(),
    ...registerDiagnosticsEventListeners(),
    ...registerSerializersForPanels([
      REGISTERED_PANELS.METRIC_RESULTS,
      REGISTERED_PANELS.WMI_RESULTS,
    ]),
    getFastModeStatusBar(),
    getConnectionStatusBar(),
    vscode.languages.registerHoverProvider(MANIFEST_DOC_SELECTOR, getSnmpHoverProvider()),
    vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
      await fastModeBuildWorkflow(doc);
    }),
  );

  await handlePendingInitialization();

  logger.info("Dynatrace Extensions is now activated.", ...fnLogTrace);
  setActivationContext(context);
  return context;
}

const setActivationContext = (newContext: vscode.ExtensionContext) => {
  activationContext = newContext;
};

/**
 * Sets a VSCode context property that can be referenced in the package.json file.
 */
const setContextProperty = (key: string, value: string | number | boolean) => {
  const fnLogTrace = ["extension", "setContextProperty"];
  const contextPrefix = "dynatrace-extensions";
  vscode.commands.executeCommand("setContext", `${contextPrefix}.${key}`, value).then(
    () => logger.debug(`Set context property ${key} to ${String(value)}`),
    () => logger.warn("Could not set context for number of registered workspaces.", ...fnLogTrace),
  );
};

/**
 * Registers all commands that should appear as workflows in vscode's command palette.
 */
const registerCommandPaletteWorkflows = (): vscode.Disposable[] => [
  registerWorkflowCommand("loadSchemas", () => loadSchemasWorkflow()),
  registerWorkflowCommand("initWorkspace", () => initWorkspaceWorkflow()),
  registerWorkflowCommand("generateCertificates", () => generateCertificatesWorkflow()),
  registerWorkflowCommand("distributeCertificate", () => distributeCertificateWorkflow()),
  registerWorkflowCommand("buildExtension", () => buildExtensionWorkflow()),
  registerWorkflowCommand("uploadExtension", () => uploadExtensionWorkflow()),
  registerWorkflowCommand("activateExtension", () => activateExtensionWorkflow()),
  registerWorkflowCommand("createDocumentation", () => createDocumentationWorkflow()),
  registerWorkflowCommand("createDashboard", () => createDashboardWorkflow()),
  registerWorkflowCommand("createAlert", () => createAlertWorkflow()),
  registerWorkflowCommand("convertJmxExtension", () => convertJmxExtensionWorkflow()),
  registerWorkflowCommand("convertPythonExtension", () => convertPythonExtensionWorkflow()),
  registerWorkflowCommand("createMonitoringConfiguration", () =>
    createMonitoringConfigurationWorkflow(),
  ),
  registerWorkflowCommand("downloadSupportArchive", () => downloadSupportArchiveWorkflow()),
];

/**
 * Registers a Workflow command in VSCode. The command ID is automatically prefixed with
 * dynatrace-extensions` and its function is wrapped with log messages and error handling.
 */
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const registerWorkflowCommand = <T extends any[]>(
  workflowName: string,
  workflow: WorkflowFunction<T>,
) => {
  const commandId = `dynatrace-extensions.${workflowName}`;
  return vscode.commands.registerCommand(commandId, async (...args: T) => {
    logger.info("Command called.", commandId);
    await workflow(...args).then(
      () => logger.info("Completed normally", commandId),
      err => logger.notify("ERROR", `Unexpected error: ${(err as Error).message}`, commandId),
    );
  });
};

const registerCompletionProviders = (): vscode.Disposable[] => [
  registerCompletionProvider(getTopologyCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
  registerCompletionProvider(getEntitySelectorCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
  registerCompletionProvider(getIconCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
  registerCompletionProvider(getPrometheusCompletionProvider(), MANIFEST_DOC_SELECTOR),
  registerCompletionProvider(getScreensCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
  registerCompletionProvider(getWmiCompletionProvider(), MANIFEST_DOC_SELECTOR),
  registerCompletionProvider(getConfigurationCompletionProvider(), TEMP_CONFIG_DOC_SELECTOR),
];

const registerCompletionProvider = (
  provider: vscode.CompletionItemProvider,
  documentSelector: vscode.DocumentSelector,
  ...triggerCharacters: string[]
) =>
  vscode.languages.registerCompletionItemProvider(documentSelector, provider, ...triggerCharacters);

/**
 * Registers tree view data providers and their associated commands.
 */
const registerTreeViews = (): vscode.Disposable[] => [
  vscode.window.registerTreeDataProvider(
    "dynatrace-extensions-workspaces",
    getWorkspacesTreeDataProvider(),
  ),
  ...registerWorkspaceViewCommands(),
  vscode.window.registerTreeDataProvider(
    "dynatrace-extensions-environments",
    getTenantsTreeDataProvider(),
  ),
  ...registerTenantsViewCommands(),
];

const registerCodeActionsProviders = () => [
  registerCodeActionsProvider(getSnippetGenerator()),
  registerCodeActionsProvider(getSnmpActionProvider()),
  registerCodeActionsProvider(getPrometheusActionProvider()),
  registerCodeActionsProvider(getDiagnosticFixProvider()),
];

const registerCodeActionsProvider = (
  provider: vscode.CodeActionProvider,
  documentSelector: vscode.DocumentSelector = MANIFEST_DOC_SELECTOR,
  providerMetadata: vscode.CodeActionProviderMetadata = QUICK_FIX_PROVIDER_METADATA,
) => vscode.languages.registerCodeActionsProvider(documentSelector, provider, providerMetadata);

const registerCodeLensProviders = () => [
  registerCodeLensProvider(getSimulatorLensProvider(simulatorManager)),
  registerCodeLensProvider(getPrometheusCodeLensProvider()),
  registerCodeLensProvider(
    getSelectorCodeLensProvider("metricSelector:", "metricSelectorsCodeLens"),
  ),
  registerCodeLensProvider(
    getSelectorCodeLensProvider("entitySelectorTemplate:", "entitySelectorsCodeLens"),
  ),
  registerCodeLensProvider(getScreenLensProvider()),
  registerCodeLensProvider(getWmiCodeLensProvider()),
  registerCodeLensProvider(getSnmpCodeLensProvider()),
];

const registerCodeLensProvider = (
  provider: vscode.CodeLensProvider,
  documentSelector: vscode.DocumentSelector = MANIFEST_DOC_SELECTOR,
) => vscode.languages.registerCodeLensProvider(documentSelector, provider);

const registerSerializersForPanels = (webviewPanels: string[]) =>
  webviewPanels.map(panel =>
    vscode.window.registerWebviewPanelSerializer(panel, getWebviewPanelManager()),
  );

/**
 * Checks if there is workspace initialization pending from a previous window/activation and
 * triggers the initWorkspace command. This happens when our user first opens a new workspace
 * and then expects that workspace to get initialized.
 */
const handlePendingInitialization = async () => {
  const pendingInit = getActivationContext().globalState.get("dynatrace-extensions.initPending");
  if (pendingInit) {
    logger.info(
      "There is a workspace initialization pending from previous window/activation. Triggering the command now.",
      "extension",
      "activate",
    );
    await vscode.commands.executeCommand("dynatrace-extensions.initWorkspace");
  }
};

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated.
 */
export function deactivate() {
  const fnLogTrace = ["extension", "deactivate"];
  logger.info("Dynatrace Extensions is deactivating...", ...fnLogTrace);

  // Kill any simulator processes left running
  simulatorManager.stop();

  logger.info("Dynatrace Extensions is now deactivated.", ...fnLogTrace);
  logger.disposeOutputChannels();
  logger.cleanUpLogFiles();
}

export const getActivationContext = () => activationContext;
