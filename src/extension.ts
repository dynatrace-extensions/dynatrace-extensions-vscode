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

import path = require("path");
import * as vscode from "vscode";
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
import { activateExtension } from "./commandPalette/activateExtension";
import { buildExtension } from "./commandPalette/buildExtension";
import { convertJMXExtension } from "./commandPalette/convertJMXExtension";
import { convertPythonExtension } from "./commandPalette/convertPythonExtension";
import { createAlert } from "./commandPalette/createAlert";
import { createMonitoringConfiguration } from "./commandPalette/createConfiguration";
import { createOverviewDashboard } from "./commandPalette/createDashboard";
import { createDocumentation } from "./commandPalette/createDocumentation";
import { distributeCertificate } from "./commandPalette/distributeCertificate";
import { downloadSupportArchive } from "./commandPalette/downloadSupportArchive";
import { generateCerts } from "./commandPalette/generateCertificates";
import { initWorkspace } from "./commandPalette/initWorkspace";
import { loadSchemas } from "./commandPalette/loadSchemas";
import { uploadExtension } from "./commandPalette/uploadExtension";
import {
  MANIFEST_DOC_SELECTOR,
  QUICK_FIX_PROVIDER_METADATA,
  TEMP_CONFIG_DOC_SELECTOR,
} from "./constants";
import { DiagnosticFixProvider } from "./diagnostics/diagnosticFixProvider";
import { DiagnosticsProvider } from "./diagnostics/diagnostics";
import { SnmpHoverProvider } from "./hover/snmpHover";
import { ConnectionStatusManager } from "./statusBar/connection";
import { FastModeStatus } from "./statusBar/fastMode";
import { SimulatorManager } from "./statusBar/simulator";
import {
  getConnectedTenant,
  getDynatraceClient,
  getTenantsTreeDataProvider,
} from "./treeViews/tenantsTreeView";
import {
  getWorkspacesTreeDataProvider,
  refreshWorkspacesTreeData,
} from "./treeViews/workspacesTreeView";
import { initializeCache } from "./utils/caching";
import {
  checkCertificateExists,
  checkTenantConnected,
  checkExtensionZipExists,
  checkOverwriteCertificates,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "./utils/conditionCheckers";
import {
  getAllEnvironments,
  getAllWorkspaces,
  getExtensionWorkspaceDir,
  initGlobalStorage,
  initWorkspaceStorage,
  migrateFromLegacyExtension,
} from "./utils/fileSystem";
import * as logger from "./utils/logging";
import { REGISTERED_PANELS, WebviewPanelManager } from "./webviews/webviewPanel";

let simulatorManager: SimulatorManager;
const logTrace = ["extension"];

/**
 * Registers this extension's Commands for the VSCode Command Palette.
 * This is so that all commands can be created in one function, keeping the activation function more tidy.
 * @param diagnosticsProvider a provider for diagnostics
 * @param outputChannel a JSON output channel for communicating data
 * @param context {@link vscode.ExtensionContext}
 * @returns list commands as disposables
 */
function registerCommandPaletteCommands(
  diagnosticsProvider: DiagnosticsProvider,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  logger.debug(
    "Registering commands for the command palette",
    ...logTrace,
    "registerCommandPaletteCommands",
  );
  return [
    // Load extension schemas of a given version
    vscode.commands.registerCommand("dynatrace-extensions.loadSchemas", async () => {
      logger.info("Command 'loadSchemas' called.", ...logTrace);
      if (await checkTenantConnected()) {
        const dtClient = await getDynatraceClient();
        if (dtClient) {
          await loadSchemas(context, dtClient);
        }
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dynatrace-extensions.initWorkspace", async () => {
      logger.info("Command 'initWorkspace' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await checkTenantConnected())) {
        initWorkspaceStorage(context);
        try {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            await initWorkspace(context, dtClient, () => {
              refreshWorkspacesTreeData();
            });
          }
        } finally {
          await context.globalState.update("dynatrace-extensions.initPending", undefined);
        }
      }
    }),
    // Generate the certificates required for extension signing
    vscode.commands.registerCommand("dynatrace-extensions.generateCertificates", async () => {
      logger.info("Command 'generateCertificates' called.", ...logTrace);
      if (await checkWorkspaceOpen()) {
        initWorkspaceStorage(context);
        return checkOverwriteCertificates(context).then(async approved => {
          if (approved) {
            return generateCerts(context);
          }
          return false;
        });
      }
      return false;
    }),
    // Distribute CA certificate to Dynatrace credential vault & OneAgents/ActiveGates
    vscode.commands.registerCommand("dynatrace-extensions.distributeCertificate", async () => {
      logger.info("Command 'distributeCertificate' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await checkTenantConnected())) {
        initWorkspaceStorage(context);
        const dtClient = await getDynatraceClient();
        if ((await checkCertificateExists("ca")) && dtClient) {
          await distributeCertificate(context, dtClient);
        }
      }
    }),
    // Build Extension 2.0 package
    vscode.commands.registerCommand("dynatrace-extensions.buildExtension", async () => {
      logger.info("Command 'buildExtension' called.", ...logTrace);
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkCertificateExists("dev")) &&
        (await diagnosticsProvider.isValidForBuilding())
      ) {
        await buildExtension(context, outputChannel, await getDynatraceClient());
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dynatrace-extensions.uploadExtension", async () => {
      logger.info("Command 'uploadExtension' called.", ...logTrace);
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkTenantConnected()) &&
        (await checkExtensionZipExists())
      ) {
        const dtClient = await getDynatraceClient();
        const currentEnv = await getConnectedTenant();
        if (dtClient && currentEnv) {
          await uploadExtension(dtClient, currentEnv.url);
        }
      }
    }),
    // Activate a given version of extension 2.0
    vscode.commands.registerCommand(
      "dynatrace-extensions.activateExtension",
      async (version?: string) => {
        logger.info("Command 'activateExtension' called.", ...logTrace);
        if (
          (await checkWorkspaceOpen()) &&
          (await isExtensionsWorkspace(context)) &&
          (await checkTenantConnected())
        ) {
          const dtClient = await getDynatraceClient();
          const currentEnv = await getConnectedTenant();
          if (dtClient && currentEnv) {
            await activateExtension(dtClient, currentEnv.url, version);
          }
        }
      },
    ),
    // Create Extension documentation
    vscode.commands.registerCommand("dynatrace-extensions.createDocumentation", async () => {
      logger.info("Command 'createDocumentation' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createDocumentation();
      }
    }),
    // Create Overview dashboard
    vscode.commands.registerCommand("dynatrace-extensions.createDashboard", async () => {
      logger.info("Command 'createDashboard' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createOverviewDashboard(outputChannel);
      }
    }),
    // Create Alert
    vscode.commands.registerCommand("dynatrace-extensions.createAlert", async () => {
      logger.info("Command 'createAlert' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createAlert();
      }
    }),
    // Convert JMX Extension from 1.0 to 2.0
    vscode.commands.registerCommand(
      "dynatrace-extensions.convertJmxExtension",
      async (outputPath?: string) => {
        logger.info("Command 'convertJmxExtension' called.", ...logTrace);
        // Unless explicitly specified, try to detect output path
        if (!outputPath) {
          const extensionDir = getExtensionWorkspaceDir();
          if (extensionDir) {
            await convertJMXExtension(
              await getDynatraceClient(),
              path.resolve(extensionDir, "extension.yaml"),
            );
          }
        } else {
          await convertJMXExtension(await getDynatraceClient(), outputPath);
        }
      },
    ),
    // Convert Python extension plugin.json to activationSchema.json
    vscode.commands.registerCommand(
      "dynatrace-extensions.convertPythonExtension",
      async (outputPath?: string) => {
        logger.info("Command 'convertPythonExtension' called.", ...logTrace);
        // Unless explicitly specified, try to detect output path
        if (!outputPath) {
          const extensionDir = getExtensionWorkspaceDir();
          if (extensionDir) {
            await convertPythonExtension(
              await getDynatraceClient(),
              path.resolve(extensionDir, "activationSchema.json"),
            );
          } else {
            // No activationSchema.json found
            await convertPythonExtension(await getDynatraceClient());
          }
        } else {
          await convertPythonExtension(await getDynatraceClient(), outputPath);
        }
      },
    ),
    // Create monitoring configuration files
    vscode.commands.registerCommand(
      "dynatrace-extensions.createMonitoringConfiguration",
      async () => {
        logger.info("Command 'createMonitoringConfiguration' called.", ...logTrace);
        if (
          (await checkWorkspaceOpen()) &&
          (await isExtensionsWorkspace(context)) &&
          (await checkTenantConnected())
        ) {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            await createMonitoringConfiguration(dtClient, context);
          }
        }
      },
    ),
    // Download support archive
    vscode.commands.registerCommand("dynatrace-extensions.downloadSupportArchive", async () => {
      // eslint-disable-next-line no-secrets/no-secrets
      logger.info("Command 'downloadSupportArchive' called.", ...logTrace);
      const logsDir = path.join(context.globalStorageUri.fsPath, "logs");
      await downloadSupportArchive(logsDir);
    }),
  ];
}

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
  const webviewPanelManager = new WebviewPanelManager(context.extensionUri);
  simulatorManager = new SimulatorManager(context, webviewPanelManager);
  const snmpHoverProvider = new SnmpHoverProvider();
  const fastModeChannel = vscode.window.createOutputChannel("Dynatrace Fast Mode", "json");
  const fastModeStatus = new FastModeStatus(fastModeChannel);
  const diagnosticsProvider = new DiagnosticsProvider();
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
    // Commands for the Command Palette
    ...registerCommandPaletteCommands(diagnosticsProvider, genericChannel, context),
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
    registerCodeActionsProvider(new DiagnosticFixProvider(diagnosticsProvider)),
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
            runSelector(
              selector,
              type,
              dtClient,
              genericChannel,
              webviewPanelManager,
              updateCallback,
            ).catch(err => {
              logger.info(`Running selector failed unexpectedly. ${(err as Error).message}`);
            });
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.runWMIQuery",
      async (query: string) => {
        runWMIQuery(query, genericChannel, webviewPanelManager, (checkedQuery, status, result) => {
          updateWmiValidationStatus(checkedQuery, status, result);
        }).catch(err => {
          logger.info(`Running WMI Query failed unexpectedly. ${(err as Error).message}`);
        });
      },
    ),
    // Default WebView Panel Serializers
    vscode.window.registerWebviewPanelSerializer(
      REGISTERED_PANELS.METRIC_RESULTS,
      webviewPanelManager,
    ),
    vscode.window.registerWebviewPanelSerializer(
      REGISTERED_PANELS.WMI_RESULTS,
      webviewPanelManager,
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
        diagnosticsProvider.provideDiagnostics(editor.document).catch(err => {
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
          diagnosticsProvider.provideDiagnostics(change.document).catch(err => {
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
