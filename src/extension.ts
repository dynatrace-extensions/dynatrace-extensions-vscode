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
import {
  getSelectorCodeLensProvider,
  updateSelectorValidationStatus,
} from "./codeLens/selectorCodeLens";
import { getSimulatorLensProvider } from "./codeLens/simulatorCodeLens";
import { getSnmpCodeLensProvider } from "./codeLens/snmpCodeLens";
import { ValidationStatus, runSelector, validateSelector } from "./codeLens/utils/selectorUtils";
import { runWMIQuery } from "./codeLens/utils/wmiUtils";
import { getWmiCodeLensProvider, updateWmiValidationStatus } from "./codeLens/wmiCodeLens";
import { activateExtensionWorkflow } from "./commandPalette/activateExtension";
import { buildExtension, buildExtensionWorkflow } from "./commandPalette/buildExtension";
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
import { SnmpHoverProvider } from "./hover/snmpHover";
import { ConnectionStatusManager } from "./statusBar/connection";
import { FastModeStatus } from "./statusBar/fastMode";
import { SimulatorManager } from "./statusBar/simulator";
import { getDynatraceClient, getTenantsTreeDataProvider } from "./treeViews/tenantsTreeView";
import { getWorkspacesTreeDataProvider } from "./treeViews/workspacesTreeView";
import { initializeCache } from "./utils/caching";
import { checkTenantConnected, isExtensionsWorkspace } from "./utils/conditionCheckers";
import { updateDiagnosticsCollection } from "./utils/diagnostics";
import {
  getAllEnvironments,
  getAllWorkspaces,
  initGlobalStorage,
  migrateFromLegacyExtension,
} from "./utils/fileSystem";
import * as logger from "./utils/logging";
import { REGISTERED_PANELS, getWebviewPanelManager } from "./webviews/webviewPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowFunction<T extends any[] = []> = (...args: T) => PromiseLike<unknown>;
let simulatorManager: SimulatorManager;
const logTrace = ["extension"];

/**
 * Sets up the VSCode extension by registering all the available functionality as disposable objects.
 * Activation events (e.g. run command) always trigger this function.
 * @param context VSCode Extension Context
 */
export async function activate(context: vscode.ExtensionContext) {
  const fnLogTrace = [...logTrace, "activate"];
  const extensionVersion = (context.extension.packageJSON as { version: string }).version;
  initGlobalStorage(context);
  logger.initializeLogging(context);
  logger.info(`Dynatrace Extensions version ${extensionVersion} is activating...`, ...fnLogTrace);

  // TODO: Code soon to be removed from project
  // Checks presence of legacy extension and performs migration
  if (vscode.extensions.getExtension("DynatracePlatformExtensions.dt-ext-copilot")) {
    await migrateFromLegacyExtension(context);
  }

  // Set custom context properties for tree views
  setContextProperty("numWorkspaces", getAllWorkspaces(context).length);
  setContextProperty("extensionWorkspace", await isExtensionsWorkspace(context, false));
  setContextProperty("numEnvironments", getAllEnvironments(context).length);

  logger.debug("Instantiating feature providers", ...fnLogTrace);
  // Create feature/data providers
  const genericChannel = vscode.window.createOutputChannel("Dynatrace", "json");
  const connectionStatusManager = new ConnectionStatusManager();
  await initializeCache(context.globalStorageUri.fsPath);
  simulatorManager = new SimulatorManager(context);
  const snmpHoverProvider = new SnmpHoverProvider();
  const fastModeChannel = vscode.window.createOutputChannel("Dynatrace Fast Mode", "json");
  const fastModeStatus = new FastModeStatus(fastModeChannel);
  let editTimeout: NodeJS.Timeout | undefined;

  // The check for the simulator's initial status (must happen once cached data is available)
  vscode.commands.executeCommand("dynatrace-extensions.simulator.checkReady", false).then(
    () => {},
    err =>
      logger.info(
        `Error while checking simulator status: ${(err as Error).message}`,
        ...fnLogTrace,
      ),
  );

  logger.debug("Registering commands and feature providers", ...fnLogTrace);
  // Perform all feature registrations
  context.subscriptions.push(
    // Commands for the Command Palette (workflows)
    registerWorkflowCommand("loadSchemas", () => loadSchemasWorkflow(context)),
    registerWorkflowCommand("initWorkspace", () => initWorkspaceWorkflow(context)),
    registerWorkflowCommand("generateCertificates", () => generateCertificatesWorkflow(context)),
    registerWorkflowCommand("distributeCertificate", () => distributeCertificateWorkflow(context)),
    registerWorkflowCommand("buildExtension", () =>
      buildExtensionWorkflow(context, genericChannel),
    ),
    registerWorkflowCommand("uploadExtension", () => uploadExtensionWorkflow(context)),
    registerWorkflowCommand("activateExtension", () => activateExtensionWorkflow(context)),
    registerWorkflowCommand("createDocumentation", () => createDocumentationWorkflow(context)),
    registerWorkflowCommand("createDashboard", () =>
      createDashboardWorkflow(context, genericChannel),
    ),
    registerWorkflowCommand("createAlert", () => createAlertWorkflow(context)),
    registerWorkflowCommand("convertJmxExtension", () => convertJmxExtensionWorkflow()),
    registerWorkflowCommand("convertPythonExtension", () => convertPythonExtensionWorkflow()),
    registerWorkflowCommand("createMonitoringConfiguration", () =>
      createMonitoringConfigurationWorkflow(context),
    ),
    registerWorkflowCommand("downloadSupportArchive", () =>
      downloadSupportArchiveWorkflow(context),
    ),
    // Commands for enabling/disabling features
    ...registerFeatureSwitchCommands("MetricSelectors", "metricSelectorsCodeLens"),
    ...registerFeatureSwitchCommands("EntitySelectors", "entitySelectorsCodeLens"),
    ...registerFeatureSwitchCommands("WmiCodelens", "wmiCodeLens"),
    ...registerFeatureSwitchCommands("ScreenCodelens", "screenCodeLens"),
    ...registerFeatureSwitchCommands("FastDevelopment", "fastDevelopmentMode"),
    ...registerFeatureSwitchCommands("NameDiagnostics", "diagnostics.extensionName"),
    ...registerFeatureSwitchCommands("MetricKeyDiagnostics", "diagnostics.metricKeys"),
    ...registerFeatureSwitchCommands("CardKeyDiagnostics", "diagnostics.cardKeys"),
    ...registerFeatureSwitchCommands("SnmpDiagnostics", "diagnostics.snmp"),
    ...registerFeatureSwitchCommands(
      "AllDiagnostics",
      "diagnostics.all",
      "diagnostics.extensionName",
      "diagnostics.metricKeys",
      "diagnostics.cardKeys",
      "diagnostics.snmp",
    ),
    // Auto-completion providers
    registerCompletionProvider(getTopologyCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
    registerCompletionProvider(getEntitySelectorCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
    registerCompletionProvider(getIconCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
    registerCompletionProvider(getPrometheusCompletionProvider(), MANIFEST_DOC_SELECTOR),
    registerCompletionProvider(getScreensCompletionProvider(), MANIFEST_DOC_SELECTOR, ":"),
    registerCompletionProvider(getWmiCompletionProvider(), MANIFEST_DOC_SELECTOR),
    registerCompletionProvider(getConfigurationCompletionProvider(), TEMP_CONFIG_DOC_SELECTOR),
    // Tree Data providers
    vscode.window.registerTreeDataProvider(
      "dynatrace-extensions-workspaces",
      getWorkspacesTreeDataProvider(context),
    ),
    vscode.window.registerTreeDataProvider(
      "dynatrace-extensions-environments",
      getTenantsTreeDataProvider(context, connectionStatusManager, genericChannel),
    ),
    // Hover provider for SNMP OIDs
    vscode.languages.registerHoverProvider(MANIFEST_DOC_SELECTOR, snmpHoverProvider),
    // Code action providers
    registerCodeActionsProvider(getSnippetGenerator()),
    registerCodeActionsProvider(getSnmpActionProvider()),
    registerCodeActionsProvider(getPrometheusActionProvider()),
    registerCodeActionsProvider(getDiagnosticFixProvider()),
    // Connection Status Bar Item
    connectionStatusManager.getStatusBarItem(),
    // FastMode Status Bar Item
    fastModeStatus.getStatusBarItem(),
    // Code Lens providers
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
    // Commands for metric and entity selector Code Lenses
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.validateSelector",
      async (selector: string, type: "metric" | "entity") => {
        if (await checkTenantConnected()) {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            const status = await validateSelector(selector, type, dtClient);
            updateSelectorValidationStatus(type, selector, status);
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.runSelector",
      async (selector: string, type: "metric" | "entity") => {
        const updateCallback = (checkedSelector: string, status: ValidationStatus) =>
          updateSelectorValidationStatus(type, checkedSelector, status);
        if (await checkTenantConnected()) {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            runSelector(selector, type, dtClient, genericChannel, updateCallback).catch(err => {
              logger.info(`Running selector failed unexpectedly. ${(err as Error).message}`);
            });
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.runWMIQuery",
      async (query: string) => {
        runWMIQuery(query, genericChannel, (checkedQuery, status, result) => {
          updateWmiValidationStatus(checkedQuery, status, result);
        }).catch(err => {
          logger.info(`Running WMI Query failed unexpectedly. ${(err as Error).message}`);
        });
      },
    ),
    // Default WebView Panel Serializers
    vscode.window.registerWebviewPanelSerializer(
      REGISTERED_PANELS.METRIC_RESULTS,
      getWebviewPanelManager(context.extensionUri),
    ),
    vscode.window.registerWebviewPanelSerializer(
      REGISTERED_PANELS.WMI_RESULTS,
      getWebviewPanelManager(context.extensionUri),
    ),
    // Activity on every document save
    vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
      // Fast Development Mode - build extension
      if (
        vscode.workspace.getConfiguration("dynatraceExtensions", null).get("fastDevelopmentMode") &&
        doc.fileName.endsWith("extension.yaml") &&
        (await isExtensionsWorkspace(context, false)) &&
        (await checkTenantConnected())
      ) {
        const dt = await getDynatraceClient();
        await buildExtension(context, fastModeChannel, dt, {
          status: fastModeStatus,
          document: doc,
        });
      }
    }),
    // Activity on active document changed
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.fileName.endsWith("extension.yaml")) {
        updateDiagnosticsCollection(editor.document).catch(err => {
          logger.info(`Could not provide diagnostics. ${(err as Error).message}`);
        });
      }
    }),
    // Activity on every text change in a document
    vscode.workspace.onDidChangeTextDocument(change => {
      if (change.document.fileName.endsWith("extension.yaml")) {
        // Allow 0.5 sec after doc changes to reduce execution frequency
        if (editTimeout) {
          clearTimeout(editTimeout);
          editTimeout = undefined;
        }
        editTimeout = setTimeout(() => {
          updateDiagnosticsCollection(change.document).catch(err => {
            logger.info(`Could not provide diagnostics. ${(err as Error).message}`);
          });
          editTimeout = undefined;
        }, 500);
      }
    }),
    // Activity on every configuration change
    vscode.workspace.onDidChangeConfiguration(() => {
      const fastModeEnabled = vscode.workspace
        .getConfiguration("dynatraceExtensions", null)
        .get("fastDevelopmentMode");
      fastModeStatus.updateStatusBar(Boolean(fastModeEnabled));
    }),
  );
  // We may have an initialization pending from previous window/activation.
  const pendingInit = context.globalState.get("dynatrace-extensions.initPending");
  if (pendingInit) {
    logger.info(
      "There is a workspace initialization pending from previous window/activation. Triggering the command now.",
      ...fnLogTrace,
    );
    await vscode.commands.executeCommand("dynatrace-extensions.initWorkspace");
  }
  logger.info("Dynatrace Extensions is now activated.", ...fnLogTrace);
  return context;
}

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated.
 */
export function deactivate() {
  const fnLogTrace = [...logTrace, "deactivate"];
  logger.info("Dynatrace Extensions is deactivating...", ...fnLogTrace);

  // Kill any simulator processes left running
  simulatorManager.stop();

  logger.info("Dynatrace Extensions is now deactivated.", ...fnLogTrace);
  logger.disposeLogger();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

const registerUpdateConfigCommand = (
  commandId: string,
  settingValue: string | boolean | number,
  ...settingIds: string[]
) =>
  vscode.commands.registerCommand(commandId, () => {
    settingIds.forEach(settingId => {
      const settingName = `dynatraceExtensions.${settingId}`;
      vscode.workspace
        .getConfiguration()
        .update(settingName, settingValue)
        .then(
          () =>
            logger.debug(`Changed setting ${settingName} to ${String(settingValue)}`, commandId),
          () => logger.warn(`Failed to change setting ${settingName}`, commandId),
        );
    });
  });

const registerFeatureSwitchCommands = (featureName: string, ...settingIds: string[]) => {
  const enableCommandId = `dynatrace-extensions-workspaces.enable${featureName}`;
  const disableCommandId = `dynatrace-extensions-workspaces.disable${featureName}`;
  return [
    registerUpdateConfigCommand(enableCommandId, true, ...settingIds),
    registerUpdateConfigCommand(disableCommandId, false, ...settingIds),
  ];
};
const setContextProperty = (key: string, value: string | number | boolean) => {
  const fnLogTrace = [...logTrace, "setContextProperty"];
  const contextPrefix = "dynatrace-extensions";
  vscode.commands.executeCommand("setContext", `${contextPrefix}.${key}`, value).then(
    () => logger.debug(`Set context property ${key} to ${String(value)}`),
    () => logger.warn("Could not set context for number of registered workspaces.", ...fnLogTrace),
  );
};

const registerCompletionProvider = (
  provider: vscode.CompletionItemProvider,
  documentSelector: vscode.DocumentSelector,
  ...triggerCharacters: string[]
) =>
  vscode.languages.registerCompletionItemProvider(documentSelector, provider, ...triggerCharacters);

const registerCodeActionsProvider = (
  provider: vscode.CodeActionProvider,
  documentSelector: vscode.DocumentSelector = MANIFEST_DOC_SELECTOR,
  providerMetadata: vscode.CodeActionProviderMetadata = QUICK_FIX_PROVIDER_METADATA,
) => vscode.languages.registerCodeActionsProvider(documentSelector, provider, providerMetadata);

const registerCodeLensProvider = (
  provider: vscode.CodeLensProvider,
  documentSelector: vscode.DocumentSelector = MANIFEST_DOC_SELECTOR,
) => vscode.languages.registerCodeLensProvider(documentSelector, provider);
