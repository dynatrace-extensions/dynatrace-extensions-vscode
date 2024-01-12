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
import { SimulatorLensProvider } from "./codeLens/simulatorCodeLens";
import { SnmpCodeLensProvider } from "./codeLens/snmpCodeLens";
import { ValidationStatus, runSelector, validateSelector } from "./codeLens/utils/selectorUtils";
import { runWMIQuery } from "./codeLens/utils/wmiUtils";
import { WmiCodeLensProvider } from "./codeLens/wmiCodeLens";
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
import { DiagnosticFixProvider } from "./diagnostics/diagnosticFixProvider";
import { DiagnosticsProvider } from "./diagnostics/diagnostics";
import { SnmpHoverProvider } from "./hover/snmpHover";
import { ConnectionStatusManager } from "./statusBar/connection";
import { FastModeStatus } from "./statusBar/fastMode";
import { SimulatorManager } from "./statusBar/simulator";
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
import { CachedData } from "./utils/dataCaching";
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
 * Registers Completion Providers for this extension.
 * This is so that all providers can be created in one function, keeping the activation function more tidy.
 * @param documentSelector {@link vscode.DocumentSelector} matching the extension.yaml file
 * @param cachedData the data cache
 * @returns list of providers as disposables
 */
function registerCompletionProviders(
  documentSelector: vscode.DocumentSelector,
  cachedData: CachedData,
): vscode.Disposable[] {
  logger.debug("Registering completion providers", ...logTrace, "registerCompletionProviders");
  // Instantiate completion providers
  const topologyCompletionProvider = new TopologyCompletionProvider();
  const entitySelectorCompletionProvider = new EntitySelectorCompletionProvider();
  const iconCompletionProvider = new IconCompletionProvider();
  const prometheusCompletionProvider = new PrometheusCompletionProvider();
  const screensMetaCompletionProvider = new ScreensMetaCompletionProvider();
  const wmiCompletionProvider = new WmiCompletionProvider();
  const configurationCompletionProvider = new ConfigurationCompletionProvider(cachedData);

  // Subscribe them to cached data
  cachedData.subscribeConsumers({
    builtinEntityTypes: [topologyCompletionProvider, entitySelectorCompletionProvider],
    parsedExtension: [
      topologyCompletionProvider,
      prometheusCompletionProvider,
      wmiCompletionProvider,
    ],
    baristaIcons: [iconCompletionProvider],
    prometheusData: [prometheusCompletionProvider],
    wmiData: [wmiCompletionProvider],
    entityInstances: [configurationCompletionProvider],
  });

  // Register with vscode.languages and return disposables
  return [
    // Topology data
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      topologyCompletionProvider,
      ":",
    ),
    // Entity selectors
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      entitySelectorCompletionProvider,
      ":",
    ),
    // Barista icons
    vscode.languages.registerCompletionItemProvider(documentSelector, iconCompletionProvider, ":"),
    // Screens metadata/items
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      screensMetaCompletionProvider,
      ":",
    ),
    // Prometheus data
    vscode.languages.registerCompletionItemProvider(documentSelector, prometheusCompletionProvider),
    // Wmi data
    vscode.languages.registerCompletionItemProvider(documentSelector, wmiCompletionProvider),
    // Monitoring configurations
    vscode.languages.registerCompletionItemProvider(
      { language: "jsonc", pattern: "**/tempConfigFile.jsonc" },
      configurationCompletionProvider,
    ),
  ];
}

/**
 * Registers this extension's Commands for the VSCode Command Palette.
 * This is so that all commands can be created in one function, keeping the activation function more tidy.
 * @param tenantsProvider a provider for environments tree data
 * @param extensionWorkspacesProvider a provider for extension workspaces tree data
 * @param diagnosticsProvider a provider for diagnostics
 * @param cachedData the data cache
 * @param outputChannel a JSON output channel for communicating data
 * @param context {@link vscode.ExtensionContext}
 * @returns list commands as disposables
 */
function registerCommandPaletteCommands(
  tenantsProvider: EnvironmentsTreeDataProvider,
  extensionWorkspacesProvider: ExtensionsTreeDataProvider,
  diagnosticsProvider: DiagnosticsProvider,
  cachedData: CachedData,
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
      if (await checkEnvironmentConnected(tenantsProvider)) {
        const dtClient = await tenantsProvider.getDynatraceClient();
        if (dtClient) {
          await loadSchemas(context, dtClient);
        }
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dynatrace-extensions.initWorkspace", async () => {
      logger.info("Command 'initWorkspace' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await checkEnvironmentConnected(tenantsProvider))) {
        initWorkspaceStorage(context);
        try {
          const dtClient = await tenantsProvider.getDynatraceClient();
          if (dtClient) {
            await initWorkspace(cachedData, context, dtClient, () => {
              extensionWorkspacesProvider.refresh();
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
      if ((await checkWorkspaceOpen()) && (await checkEnvironmentConnected(tenantsProvider))) {
        initWorkspaceStorage(context);
        const dtClient = await tenantsProvider.getDynatraceClient();
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
        await buildExtension(context, outputChannel, await tenantsProvider.getDynatraceClient());
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dynatrace-extensions.uploadExtension", async () => {
      logger.info("Command 'uploadExtension' called.", ...logTrace);
      if (
        (await checkWorkspaceOpen()) &&
        (await isExtensionsWorkspace(context)) &&
        (await checkEnvironmentConnected(tenantsProvider)) &&
        (await checkExtensionZipExists())
      ) {
        const dtClient = await tenantsProvider.getDynatraceClient();
        const currentEnv = await tenantsProvider.getCurrentEnvironment();
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
          (await checkEnvironmentConnected(tenantsProvider))
        ) {
          const dtClient = await tenantsProvider.getDynatraceClient();
          const currentEnv = await tenantsProvider.getCurrentEnvironment();
          if (dtClient && currentEnv) {
            await activateExtension(dtClient, cachedData, currentEnv.url, version);
          }
        }
      },
    ),
    // Create Extension documentation
    vscode.commands.registerCommand("dynatrace-extensions.createDocumentation", async () => {
      logger.info("Command 'createDocumentation' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createDocumentation(cachedData);
      }
    }),
    // Create Overview dashboard
    vscode.commands.registerCommand("dynatrace-extensions.createDashboard", async () => {
      logger.info("Command 'createDashboard' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createOverviewDashboard(tenantsProvider, cachedData, outputChannel);
      }
    }),
    // Create Alert
    vscode.commands.registerCommand("dynatrace-extensions.createAlert", async () => {
      logger.info("Command 'createAlert' called.", ...logTrace);
      if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace(context))) {
        await createAlert(cachedData);
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
              cachedData,
              await tenantsProvider.getDynatraceClient(),
              path.resolve(extensionDir, "extension.yaml"),
            );
          }
        } else {
          await convertJMXExtension(
            cachedData,
            await tenantsProvider.getDynatraceClient(),
            outputPath,
          );
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
              cachedData,
              await tenantsProvider.getDynatraceClient(),
              path.resolve(extensionDir, "activationSchema.json"),
            );
          } else {
            // No activationSchema.json found
            await convertPythonExtension(cachedData, await tenantsProvider.getDynatraceClient());
          }
        } else {
          await convertPythonExtension(
            cachedData,
            await tenantsProvider.getDynatraceClient(),
            outputPath,
          );
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
          (await checkEnvironmentConnected(tenantsProvider))
        ) {
          const dtClient = await tenantsProvider.getDynatraceClient();
          if (dtClient) {
            await createMonitoringConfiguration(dtClient, context, cachedData);
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

/**
 * Registers commands that enable/disable features of this extension.
 * This is so that all commands can be created in one function, keeping the activation function more tidy.
 * @returns list of commands as disposables
 */
function registerFeatureSwitchCommands() {
  logger.debug(
    "Registering commands for enabling/disabling features",
    ...logTrace,
    "registerFeatureSwitchCommands",
  );
  return [
    // Code lenses
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableMetricSelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.metricSelectorsCodeLens", true)
        .then(undefined, () => {
          logger.info(
            "Could not update setting dynatraceExtensions.metricSelectorsCodeLens",
            "registerFeatureSwitchCommands",
          );
        });
    }),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableMetricSelectors",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.metricSelectorsCodeLens", false)
          .then(undefined, () => {
            logger.info("Could not update setting dynatraceExtensions.metricSelectorsCodeLens");
          });
      },
    ),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableEntitySelectors", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.entitySelectorsCodeLens", true)
        .then(undefined, () => {
          logger.info("Could not update setting dynatraceExtensions.entitySelectorsCodeLens");
        });
    }),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableEntitySelectors",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.entitySelectorsCodeLens", false)
          .then(undefined, () => {
            logger.info("Could not update setting dynatraceExtensions.entitySelectorsCodeLens");
          });
      },
    ),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableWmiCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.wmiCodeLens", true)
        .then(undefined, () => {
          logger.info("Could not update setting dynatraceExtensions.wmiCodeLens");
        });
    }),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.disableWmiCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.wmiCodeLens", false)
        .then(undefined, () => {
          logger.info("Could not update setting dynatraceExtensions.wmiCodeLens");
        });
    }),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableScreenCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.screenCodeLens", true)
        .then(undefined, () => {
          logger.info("Could not update setting dynatraceExtensions.screenCodeLens");
        });
    }),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.disableScreenCodelens", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.screenCodeLens", false)
        .then(undefined, () => {
          logger.info("Could not update setting dynatraceExtensions.screenCodeLens");
        });
    }),
    // Other features
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableFastDevelopment", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.fastDevelopmentMode", true)
        .then(undefined, () => {
          logger.info("Could not update setting fastDevelopmentMode");
        });
    }),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableFastDevelopment",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.fastDevelopmentMode", false)
          .then(undefined, () => {
            logger.info("Could not update setting fastDevelopmentMode");
          });
      },
    ),
    // Diagnostics
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableAllDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.all", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.all");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.extensionName", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.extensionName");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.metricKeys", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.metricKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.cardKeys", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.cardKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.snmp", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.disableAllDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.all", false)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.all");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.extensionName", false)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.extensionName");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.metricKeys", false)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.metricKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.cardKeys", false)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.cardKeys");
        });
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.snmp", false)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableNameDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.extensionName", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.extensionName");
        });
    }),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableNameDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.extensionName", false)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.extensionName");
          });
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.enableMetricKeyDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.metricKeys", true)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.metricKeys");
          });
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableMetricKeyDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.metricKeys", false)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.metricKeys");
          });
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.enableCardKeyDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.cardKeys", true)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.cardKeys");
          });
      },
    ),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableCardKeyDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.cardKeys", false)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.cardKeys");
          });
      },
    ),
    vscode.commands.registerCommand("dynatrace-extensions-workspaces.enableSnmpDiagnostics", () => {
      vscode.workspace
        .getConfiguration()
        .update("dynatraceExtensions.diagnostics.snmp", true)
        .then(undefined, () => {
          logger.info("Could not update setting diagnostics.snmp");
        });
    }),
    vscode.commands.registerCommand(
      "dynatrace-extensions-workspaces.disableSnmpDiagnostics",
      () => {
        vscode.workspace
          .getConfiguration()
          .update("dynatraceExtensions.diagnostics.snmp", false)
          .then(undefined, () => {
            logger.info("Could not update setting diagnostics.snmp");
          });
      },
    ),
  ];
}

/**
 * Sets up the VSCode extension by registering all the available functionality as disposable objects.
 * Activation events (e.g. run command) always trigger this function.
 * @param context VSCode Extension Context
 */
export async function activate(context: vscode.ExtensionContext) {
  const fnLogTrace = [...logTrace, "activate"];
  // Initialize global storage and logging
  initGlobalStorage(context);
  logger.initializeLogging(context);
  logger.info(
    `Dynatrace Extensions version ${
      (context.extension.packageJSON as { version: string }).version
    } is activating...`,
    ...fnLogTrace,
  );

  // Check presence of legacy extension
  const legacyExtension = vscode.extensions.getExtension(
    "DynatracePlatformExtensions.dt-ext-copilot",
  );
  // If present, initiate migration from legacy extension
  if (legacyExtension) {
    await migrateFromLegacyExtension(context);
  }

  // Document selector for the extension.yaml file
  const extension2selector: vscode.DocumentSelector = {
    language: "yaml",
    pattern: "**/extension/extension.yaml",
  };
  // Additonal context: number of workspaces affects the welcome message for the extensions tree view
  vscode.commands
    .executeCommand(
      "setContext",
      "dynatrace-extensions.numWorkspaces",
      getAllWorkspaces(context).length,
    )
    .then(undefined, () => {
      logger.warn(
        "Could not set context for number of registered workspaces.",
        ...fnLogTrace,
        "setContext",
      );
    });
  // Additonal context: different welcome message for the extensions tree view if inside a workspace
  vscode.commands
    .executeCommand(
      "setContext",
      "dynatrace-extensions.extensionWorkspace",
      isExtensionsWorkspace(context, false),
    )
    .then(undefined, () => {
      logger.warn(
        "Could not set context for recognised extension workspace.",
        ...fnLogTrace,
        "setContext",
      );
    });
  // Additional context: number of environments affects the welcome message for the tenants tree view
  vscode.commands
    .executeCommand(
      "setContext",
      "dynatrace-extensions.numEnvironments",
      getAllEnvironments(context).length,
    )
    .then(undefined, () => {
      logger.warn(
        "Could not set context for number of Dynatrace enviornments.",
        ...fnLogTrace,
        "setContext",
      );
    });
  logger.debug("Instantiating feature providers", ...fnLogTrace);
  // Create feature/data providers
  const genericChannel = vscode.window.createOutputChannel("Dynatrace", "json");
  const connectionStatusManager = new ConnectionStatusManager();
  const tenantsTreeViewProvider = new EnvironmentsTreeDataProvider(
    context,
    connectionStatusManager,
    genericChannel,
  );
  const cachedData = new CachedData(tenantsTreeViewProvider, context.globalStorageUri.fsPath);
  await cachedData.initialize();
  const webviewPanelManager = new WebviewPanelManager(context.extensionUri);
  const extensionsTreeViewProvider = new ExtensionsTreeDataProvider(context);
  simulatorManager = new SimulatorManager(context, webviewPanelManager);
  const metricLensProvider = new SelectorCodeLensProvider(
    "metricSelector:",
    "metricSelectorsCodeLens",
    cachedData,
  );
  const entityLensProvider = new SelectorCodeLensProvider(
    "entitySelectorTemplate:",
    "entitySelectorsCodeLens",
    cachedData,
  );
  const snippetCodeActionProvider = new SnippetGenerator();
  const simulatorLensProvider = new SimulatorLensProvider(simulatorManager);
  const screensLensProvider = new ScreenLensProvider(tenantsTreeViewProvider);
  const prometheusLensProvider = new PrometheusCodeLensProvider(cachedData);
  const prometheusActionProvider = new PrometheusActionProvider();
  const snmpActionProvider = new SnmpActionProvider(cachedData);
  const wmiLensProvider = new WmiCodeLensProvider(cachedData);
  const snmpLensProvider = new SnmpCodeLensProvider(cachedData);
  const snmpHoverProvider = new SnmpHoverProvider(cachedData);
  const fastModeChannel = vscode.window.createOutputChannel("Dynatrace Fast Mode", "json");
  const fastModeStatus = new FastModeStatus(fastModeChannel);
  const diagnosticsProvider = new DiagnosticsProvider(cachedData);
  const diagnosticFixProvider = new DiagnosticFixProvider(diagnosticsProvider);
  let editTimeout: NodeJS.Timeout | undefined;

  // Subscribe feature providers as consumers of cached data
  logger.debug("Subscribing feature providers to cached data", ...fnLogTrace);
  cachedData.subscribeConsumers({
    parsedExtension: [
      snippetCodeActionProvider,
      screensLensProvider,
      diagnosticsProvider,
      snmpActionProvider,
      metricLensProvider,
      entityLensProvider,
      prometheusActionProvider,
      simulatorManager,
    ],
    prometheusData: [prometheusLensProvider, prometheusActionProvider],
    snmpData: [snmpActionProvider, diagnosticsProvider, snmpHoverProvider],
    selectorStatuses: [metricLensProvider, entityLensProvider],
    wmiData: [wmiLensProvider],
    wmiStatuses: [wmiLensProvider],
  });

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
    ...registerCommandPaletteCommands(
      tenantsTreeViewProvider,
      extensionsTreeViewProvider,
      diagnosticsProvider,
      cachedData,
      genericChannel,
      context,
    ),
    // Commands for enabling/disabling features
    ...registerFeatureSwitchCommands(),
    // Auto-completion providers
    ...registerCompletionProviders(extension2selector, cachedData),
    // Extension 2.0 Workspaces Tree View
    vscode.window.registerTreeDataProvider(
      "dynatrace-extensions-workspaces",
      extensionsTreeViewProvider,
    ),
    // Dynatrace Environments Tree View
    vscode.window.registerTreeDataProvider(
      "dynatrace-extensions-environments",
      tenantsTreeViewProvider,
    ),
    // Hover provider for SNMP OIDs
    vscode.languages.registerHoverProvider(extension2selector, snmpHoverProvider),
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
    // Code Lens for Simulator
    vscode.languages.registerCodeLensProvider(extension2selector, simulatorLensProvider),
    // Code Lens for Prometheus scraping
    vscode.languages.registerCodeLensProvider(extension2selector, prometheusLensProvider),
    // Code Lens for metric and entity selectors
    vscode.languages.registerCodeLensProvider(extension2selector, metricLensProvider),
    vscode.languages.registerCodeLensProvider(extension2selector, entityLensProvider),
    // Code Lens for opening screens
    vscode.languages.registerCodeLensProvider(extension2selector, screensLensProvider),
    // Code Lens for WMI queries
    vscode.languages.registerCodeLensProvider(extension2selector, wmiLensProvider),
    // Code Lens for SNMP MIBs
    vscode.languages.registerCodeLensProvider(extension2selector, snmpLensProvider),
    // Commands for metric and entity selector Code Lenses
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.validateSelector",
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
      "dynatrace-extensions.codelens.runSelector",
      async (selector: string, type: "metric" | "entity") => {
        const updateCallback = (checkedSelector: string, status: ValidationStatus) => {
          if (type === "metric") {
            metricLensProvider.updateValidationStatus(checkedSelector, status);
          } else {
            entityLensProvider.updateValidationStatus(checkedSelector, status);
          }
        };
        if (await checkEnvironmentConnected(tenantsTreeViewProvider)) {
          const dtClient = await tenantsTreeViewProvider.getDynatraceClient();
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
        runWMIQuery(
          query,
          genericChannel,
          webviewPanelManager,
          cachedData,
          (checkedQuery, status, result) => {
            wmiLensProvider.updateQueryData(checkedQuery, status, result);
          },
        ).catch(err => {
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
