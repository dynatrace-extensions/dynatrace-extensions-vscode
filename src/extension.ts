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
import { PrometheusActionProvider } from "./codeActions/prometheus";
import { SnippetGenerator } from "./codeActions/snippetGenerator";
import { SnmpActionProvider } from "./codeActions/snmp";
import { ConfigurationCompletionProvider } from "./codeCompletions/configuration";
import { EntitySelectorCompletionProvider } from "./codeCompletions/entitySelectors";
import { IconCompletionProvider } from "./codeCompletions/icons";
import { PrometheusCompletionProvider } from "./codeCompletions/prometheus";
import { ScreensMetaCompletionProvider } from "./codeCompletions/screensMeta";
import { TopologyCompletionProvider } from "./codeCompletions/topology";
import { WmiCompletionProvider } from "./codeCompletions/wmi";
import { PrometheusCodeLensProvider } from "./codeLens/prometheusScraper";
import { ScreenLensProvider } from "./codeLens/screenCodeLens";
import { SelectorCodeLensProvider } from "./codeLens/selectorCodeLens";
import { runSelector, validateSelector } from "./codeLens/utils/selectorUtils";
import { runWMIQuery, WmiQueryResult } from "./codeLens/utils/wmiUtils";
import { WmiCodeLensProvider } from "./codeLens/wmiCodeLens";
import { activateExtension } from "./commandPalette/activateExtension";
import { buildExtension } from "./commandPalette/buildExtension";
import { convertJMXExtension } from "./commandPalette/convertJMXExtension";
import { createAlert } from "./commandPalette/createAlert";
import { createMonitoringConfiguration } from "./commandPalette/createConfiguration";
import { createOverviewDashboard } from "./commandPalette/createDashboard";
import { createDocumentation } from "./commandPalette/createDocumentation";
import { distributeCertificate } from "./commandPalette/distributeCertificate";
import { generateCerts } from "./commandPalette/generateCertificates";
import { initWorkspace } from "./commandPalette/initWorkspace";
import { loadSchemas } from "./commandPalette/loadSchemas";
import { uploadExtension } from "./commandPalette/uploadExtension";
import { DiagnosticFixProvider } from "./diagnostics/diagnosticFixProvider";
import { DiagnosticsProvider } from "./diagnostics/diagnostics";
import { ConnectionStatusManager } from "./statusBar/connection";
import { FastModeStatus } from "./statusBar/fastMode";
import { EnvironmentsTreeDataProvider } from "./treeViews/environmentsTreeView";
import { ExtensionsTreeDataProvider } from "./treeViews/extensionsTreeView";
import {
  checkCertificateExists,
  checkEnvironmentConnected,
  checkExtensionZipExists,
  checkOverwriteCertificates,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "./utils/conditionCheckers";
import { CachedDataProvider } from "./utils/dataCaching";
import {
  getAllEnvironments,
  getAllWorkspaces,
  initGlobalStorage,
  initWorkspaceStorage,
} from "./utils/fileSystem";
import { MetricResultsPanel } from "./webviews/metricResults";
import { WMIQueryResultsPanel } from "./webviews/wmiQueryResults";

/**
 * Registers Completion Providers for this extension.
 * This is so that all providers can be created in one function, keeping the activation function more tidy.
 * @param documentSelector {@link vscode.DocumentSelector} matching the extension.yaml file
 * @param cachedDataProvider a provider for cached data
 * @returns list of providers as disposables
 */
function registerCompletionProviders(
  documentSelector: vscode.DocumentSelector,
  cachedDataProvider: CachedDataProvider,
): vscode.Disposable[] {
  return [
    // Topology data
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new TopologyCompletionProvider(cachedDataProvider),
      ":",
    ),
    // Entity selectors
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new EntitySelectorCompletionProvider(cachedDataProvider),
      ":",
    ),
    // Barista icons
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new IconCompletionProvider(cachedDataProvider),
      ":",
    ),
    // Screens metadata/items
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new ScreensMetaCompletionProvider(cachedDataProvider),
      ":",
    ),
    // Prometheus data
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new PrometheusCompletionProvider(cachedDataProvider),
    ),
    // Wmi data
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      new WmiCompletionProvider(cachedDataProvider),
    ),
    // Monitoring configurations
    vscode.languages.registerCompletionItemProvider(
      { language: "jsonc", pattern: "**/tempConfigFile.jsonc" },
      new ConfigurationCompletionProvider(cachedDataProvider),
    ),
  ];
}

/**
 * Registers this extension's Commands for the VSCode Command Palette.
 * This is so that all commands can be created in one function, keeping the activation function more tidy.
 * @param tenantsProvider a provider for environments tree data
 * @param diagnosticsProvider a provider for diagnostics
 * @param cachedDataProvider a provider for cacheable data
 * @param outputChannel a JSON output channel for communicating data
 * @param context {@link vscode.ExtensionContext}
 * @returns list commands as disposables
 */
function registerCommandPaletteCommands(
  tenantsProvider: EnvironmentsTreeDataProvider,
  diagnosticsProvider: DiagnosticsProvider,
  cachedDataProvider: CachedDataProvider,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    // Load extension schemas of a given version
    vscode.commands.registerCommand("dt-ext-copilot.loadSchemas", async () => {
      if (await checkEnvironmentConnected(tenantsProvider)) {
        const dtClient = await tenantsProvider.getDynatraceClient();
        if (dtClient) {
          await loadSchemas(context, dtClient);
        }
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dt-ext-copilot.initWorkspace", async () => {
      if ((await checkWorkspaceOpen()) && (await checkEnvironmentConnected(tenantsProvider))) {
        initWorkspaceStorage(context);
        try {
          const dtClient = await tenantsProvider.getDynatraceClient();
          if (dtClient) {
            await initWorkspace(context, dtClient, () => {
              tenantsProvider.refresh();
            });
          }
        } finally {
          await context.globalState.update("dt-ext-copilot.initPending", undefined);
        }
      }
    }),
    // Generate the certificates required for extension signing
    vscode.commands.registerCommand("dt-ext-copilot.generateCertificates", async () => {
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
    vscode.commands.registerCommand("dt-ext-copilot.distributeCertificate", async () => {
      if ((await checkWorkspaceOpen()) && (await checkEnvironmentConnected(tenantsProvider))) {
        initWorkspaceStorage(context);
        const dtClient = await tenantsProvider.getDynatraceClient();
        if ((await checkCertificateExists("ca")) && dtClient) {
          await distributeCertificate(context, dtClient);
        }
      }
    }),
    // Build Extension 2.0 package
    vscode.commands.registerCommand("dt-ext-copilot.buildExtension", async () => {
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkCertificateExists("dev")) &&
        (await diagnosticsProvider.isValidForBuilding())
      ) {
        await buildExtension(context, outputChannel, await tenantsProvider.getDynatraceClient());
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dt-ext-copilot.uploadExtension", async () => {
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkEnvironmentConnected(tenantsProvider)) &&
        (await checkExtensionZipExists())
      ) {
        const dtClient = await tenantsProvider.getDynatraceClient();
        if (dtClient) {
          await uploadExtension(dtClient, cachedDataProvider);
        }
      }
    }),
    // Activate a given version of extension 2.0
    vscode.commands.registerCommand(
      "dt-ext-copilot.activateExtension",
      async (version?: string) => {
        if (
          (await checkWorkspaceOpen()) &&
          (await isExtensionsWorkspace(context)) &&
          (await checkEnvironmentConnected(tenantsProvider))
        ) {
          const dtClient = await tenantsProvider.getDynatraceClient();
          if (dtClient) {
            await activateExtension(dtClient, cachedDataProvider, version);
          }
        }
      },
    ),
    // Create Extension documentation
    vscode.commands.registerCommand("dt-ext-copilot.createDocumentation", async () => {
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createDocumentation(cachedDataProvider);
      }
    }),
    // Create Overview dashboard
    vscode.commands.registerCommand("dt-ext-copilot.createDashboard", async () => {
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createOverviewDashboard(tenantsProvider, cachedDataProvider, outputChannel);
      }
    }),
    // Create Alert
    vscode.commands.registerCommand("dt-ext-copilot.createAlert", async () => {
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createAlert(cachedDataProvider);
      }
    }),
    // Convert JMX Extension from 1.0 to 2.0
    vscode.commands.registerCommand(
      "dt-ext-copilot.convertJmxExtension",
      async (outputPath?: string) => {
        await convertJMXExtension(await tenantsProvider.getDynatraceClient(), outputPath);
      },
    ),
    // Create monitoring configuration files
    vscode.commands.registerCommand("dt-ext-copilot.createMonitoringConfiguration", async () => {
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkEnvironmentConnected(tenantsProvider))
      ) {
        const dtClient = await tenantsProvider.getDynatraceClient();
        if (dtClient) {
          await createMonitoringConfiguration(dtClient, context, cachedDataProvider);
        }
      }
    }),
  ];
}

/**
 * Registers commands that enable/disable features of this extension.
 * This is so that all commands can be created in one function, keeping the activation function more tidy.
 * @returns list of commands as disposables
 */
function registerFeatureSwitchCommands() {
  return [
    // Code lenses
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableMetricSelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.metricSelectorsCodeLens", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.metricSelectorsCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableMetricSelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.metricSelectorsCodeLens", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.metricSelectorsCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableEntitySelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.entitySelectorsCodeLens", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.entitySelectorsCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableEntitySelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.entitySelectorsCodeLens", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.entitySelectorsCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableWmiCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.wmiCodeLens", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.wmiCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableWmiCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.wmiCodeLens", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.wmiCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableScreenCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.screenCodeLens", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.screenCodeLens");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableScreenCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.screenCodeLens", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.screenCodeLens");
        });
    }),
    // Other features
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableFastDevelopment", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.fastDevelopmentMode", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.fastDevelopmentMode");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableFastDevelopment", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.fastDevelopmentMode", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.fastDevelopmentMode");
        });
    }),
    // Diagnostics
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableAllDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.all", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.all");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.extensionName", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.extensionName");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.metricKeys", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.metricKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.cardKeys", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.cardKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.snmp", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableAllDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.all", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.all");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.extensionName", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.extensionName");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.metricKeys", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.metricKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.cardKeys", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.cardKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.snmp", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableNameDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.extensionName", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.extensionName");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableNameDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.extensionName", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.extensionName");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableMetricKeyDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.metricKeys", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.metricKeys");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableMetricKeyDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.metricKeys", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.metricKeys");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableCardKeyDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.cardKeys", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.cardKeys");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableCardKeyDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.cardKeys", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.cardKeys");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.enableSnmpDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.snmp", true)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.disableSnmpDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatrace.diagnostics.snmp", false)
        .then(undefined, () => {
          console.log("Could not update setting dynatrace.diagnostics.snmp");
        });
    }),
  ];
}

/**
 * Sets up the VSCode extension by registering all the available functionality as disposable objects.
 * Activation events (e.g. run command) always trigger this function.
 * @param context VSCode Extension Context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("DYNATRACE EXTENSIONS COPILOT - ACTIVATED!");

  // Check newer extension presence
  const newExtension = vscode.extensions.getExtension(
    "DynatracePlatformExtensions.dynatrace-extensions",
  );
  // Do not activate if newer extension available
  if (newExtension) {
    throw Error("Newer extension detected. Will not activate this legacy version.");
  }

  // Initialize global storage
  initGlobalStorage(context);

  // Document selector for the extension.yaml file
  const extension2selector: vscode.DocumentSelector = {
    language: "yaml",
    pattern: "**/extension/extension.yaml",
  };
  // Additonal context: number of workspaces affects the welcome message for the extensions tree view
  vscode.commands
    .executeCommand("setContext", "dt-ext-copilot.numWorkspaces", getAllWorkspaces(context).length)
    .then(undefined, () => {
      console.log("Could not set context for number of Copilot registered workspaces.");
    });
  // Additonal context: different welcome message for the extensions tree view if inside a workspace
  vscode.commands
    .executeCommand(
      "setContext",
      "dt-ext-copilot.extensionWorkspace",
      isExtensionsWorkspace(context, false),
    )
    .then(undefined, () => {
      console.log("Could not set context for recognised extension workspace.");
    });
  // Additional context: number of environments affects the welcome message for the tenants tree view
  vscode.commands
    .executeCommand(
      "setContext",
      "dt-ext-copilot.numEnvironments",
      getAllEnvironments(context).length,
    )
    .then(undefined, () => {
      console.log("Could not set context for number of Dynatrace enviornments.");
    });
  // Create feature/data providers
  const genericChannel = vscode.window.createOutputChannel("Dynatrace", "json");
  const connectionStatusManager = new ConnectionStatusManager();
  const tenantsTreeViewProvider = new EnvironmentsTreeDataProvider(
    context,
    connectionStatusManager,
    genericChannel,
  );
  const cachedDataProvider = new CachedDataProvider(tenantsTreeViewProvider);
  const extensionsTreeViewProvider = new ExtensionsTreeDataProvider(cachedDataProvider, context);
  const snippetCodeActionProvider = new SnippetGenerator(cachedDataProvider);
  const metricLensProvider = new SelectorCodeLensProvider(
    "metricSelector:",
    "metricSelectorsCodeLens",
    cachedDataProvider,
  );
  const entityLensProvider = new SelectorCodeLensProvider(
    "entitySelectorTemplate:",
    "entitySelectorsCodeLens",
    cachedDataProvider,
  );
  const screensLensProvider = new ScreenLensProvider(tenantsTreeViewProvider, cachedDataProvider);
  const prometheusLensProvider = new PrometheusCodeLensProvider(cachedDataProvider);
  const prometheusActionProvider = new PrometheusActionProvider(cachedDataProvider);
  const snmpActionProvider = new SnmpActionProvider(cachedDataProvider);
  const wmiLensProvider = new WmiCodeLensProvider(cachedDataProvider);
  const fastModeChannel = vscode.window.createOutputChannel("Dynatrace Fast Mode", "json");
  const fastModeStatus = new FastModeStatus(fastModeChannel);
  const diagnosticsProvider = new DiagnosticsProvider(context, cachedDataProvider);
  const diagnosticFixProvider = new DiagnosticFixProvider(diagnosticsProvider);
  let editTimeout: NodeJS.Timeout | undefined;

  // Perform all feature registrations
  context.subscriptions.push(
    // Commands for the Command Palette
    ...registerCommandPaletteCommands(
      tenantsTreeViewProvider,
      diagnosticsProvider,
      cachedDataProvider,
      genericChannel,
      context,
    ),
    // Commands for enabling/disabling features
    ...registerFeatureSwitchCommands(),
    // Auto-completion providers
    ...registerCompletionProviders(extension2selector, cachedDataProvider),
    // Extension 2.0 Workspaces Tree View
    vscode.window.registerTreeDataProvider("dt-ext-copilot-workspaces", extensionsTreeViewProvider),
    // Dynatrace Environments Tree View
    vscode.window.registerTreeDataProvider("dt-ext-copilot-environments", tenantsTreeViewProvider),
    // Code actions for adding snippets
    vscode.languages.registerCodeActionsProvider(extension2selector, snippetCodeActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    // Code actions for Prometheus data
    vscode.languages.registerCodeActionsProvider(extension2selector, prometheusActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    // Code actions for SNMP data
    vscode.languages.registerCodeActionsProvider(extension2selector, snmpActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    // Code actions for fixing issues
    vscode.languages.registerCodeActionsProvider(extension2selector, diagnosticFixProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    // Connection Status Bar Item
    connectionStatusManager.getStatusBarItem(),
    // FastMode Status Bar Item
    fastModeStatus.getStatusBarItem(),
    // Code Lens for Prometheus scraping
    vscode.languages.registerCodeLensProvider(extension2selector, prometheusLensProvider),
    // Code Lens for metric and entity selectors
    vscode.languages.registerCodeLensProvider(extension2selector, metricLensProvider),
    vscode.languages.registerCodeLensProvider(extension2selector, entityLensProvider),
    // Code Lens for opening screens
    vscode.languages.registerCodeLensProvider(extension2selector, screensLensProvider),
    // Code Lens for WMI queries
    vscode.languages.registerCodeLensProvider(extension2selector, wmiLensProvider),
    // Commands for metric and entity selector Code Lenses
    vscode.commands.registerCommand(
      "dt-ext-copilot.codelens.validateSelector",
      async (selector: string, type: "metric" | "entity") => {
        if (await checkEnvironmentConnected(tenantsTreeViewProvider)) {
          const dtClient = await tenantsTreeViewProvider.getDynatraceClient();
          if (dtClient) {
            const status = await validateSelector(selector, type, dtClient);
            return type === "metric"
              ? metricLensProvider.updateValidationStatus(selector, status)
              : entityLensProvider.updateValidationStatus(selector, status);
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot.codelens.runSelector",
      async (selector: string, type: "metric" | "entity") => {
        if (await checkEnvironmentConnected(tenantsTreeViewProvider)) {
          const dtClient = await tenantsTreeViewProvider.getDynatraceClient();
          if (dtClient) {
            runSelector(selector, type, dtClient, genericChannel).catch(err => {
              console.log(
                `Running selector ${selector} failed unexpectedly. ${(err as Error).message}`,
              );
            });
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot.codelens.runWMIQuery",
      async (query: string) => {
        wmiLensProvider.setQueryRunning(query);
        runWMIQuery(query, genericChannel, wmiLensProvider.processQueryResults).catch(err => {
          console.log(`Running WMI query ${query} failed unexpectedly. ${(err as Error).message}`);
        });
      },
    ),
    // Web view panel - metric query results
    vscode.window.registerWebviewPanelSerializer(MetricResultsPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        webviewPanel.webview.options = { enableScripts: true };
        MetricResultsPanel.revive(
          webviewPanel,
          "No data to display. Close the tab and trigger the action again.",
        );
      },
    }),
    // Web view panel - WMI query results
    vscode.window.registerWebviewPanelSerializer(WMIQueryResultsPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        webviewPanel.webview.options = { enableScripts: true };
        WMIQueryResultsPanel.revive(webviewPanel, {} as WmiQueryResult);
      },
    }),
    // Activity on every document save
    vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
      // Fast Development Mode - build extension
      if (
        vscode.workspace.getConfiguration("dynatrace", null).get("fastDevelopmentMode") &&
        doc.fileName.endsWith("extension.yaml") &&
        (await isExtensionsWorkspace(context, false)) &&
        (await checkEnvironmentConnected(tenantsTreeViewProvider))
      ) {
        const dt = await tenantsTreeViewProvider.getDynatraceClient();
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
          console.log(`Could not provide diagnostics. ${(err as Error).message}`);
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
            console.log(`Could not provide diagnostics. ${(err as Error).message}`);
          });
          editTimeout = undefined;
        }, 500);
      }
    }),
    // Activity on every configuration change
    vscode.workspace.onDidChangeConfiguration(() => {
      const fastModeEnabled = vscode.workspace
        .getConfiguration("dynatrace", null)
        .get("fastDevelopmentMode");
      fastModeStatus.updateStatusBar(Boolean(fastModeEnabled));
    }),
  );
  // We may have an initialization pending from previous window/activation.
  const pendingInit = context.globalState.get("dt-ext-copilot.initPending");
  if (pendingInit) {
    vscode.commands.executeCommand("dt-ext-copilot.initWorkspace").then(
      () => {
        console.log("Pending init handled successfully.");
      },
      () => {
        console.log("Failed to handle pending init.");
      },
    );
  }
}

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated (e.g. end of command).
 */
export function deactivate() {
  console.log("DYNATRACE EXTENSIONS COPILOT - DEACTIVATED");
}
