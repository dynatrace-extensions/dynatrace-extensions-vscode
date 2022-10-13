import * as vscode from "vscode";
import { loadSchemas } from "./commands/loadSchemas";
import { initWorkspace } from "./commands/initWorkspace";
import { generateCerts } from "./commands/generateCertificates";
import { uploadCertificate } from "./commands/uploadCertificate";
import { createDocumentation } from "./commands/createDocumentation";
import { buildExtension, fastModeBuild } from "./commands/buildExtension";
import { TopologyCompletionProvider } from "./codeCompletions/topology";
import {
  checkCertificateExists,
  checkEnvironmentConnected,
  checkExtensionZipExists,
  checkOverwriteCertificates,
  checkWorkspaceOpen,
  isExtensionsWorkspace,
} from "./utils/conditionCheckers";
import {
  getAllEnvironments,
  getAllWorkspaces,
  initGlobalStorage,
  initWorkspaceStorage,
  registerEnvironment,
} from "./utils/fileSystem";
import { ExtensionProjectItem, ExtensionsTreeDataProvider } from "./treeViews/extensionsTreeView";
import { SnippetGenerator } from "./codeActions/snippetGenerator";
import { uploadExtension } from "./commands/uploadExtension";
import { activateExtension } from "./commands/activateExtension";
import { EntitySelectorCompletionProvider } from "./codeCompletions/entitySelectors";
import { EnvironmentsTreeDataProvider, EnvironmentTreeItem } from "./treeViews/environmentsTreeView";
import {
  addEnvironment,
  changeConnection,
  deleteEnvironment,
  editEnvironment,
} from "./treeViews/commands/environments";
import { encryptToken } from "./utils/cryptography";
import { ConnectionStatusManager } from "./statusBar/connection";
import { deleteWorkspace } from "./treeViews/commands/workspaces";
import { SelectorCodeLensProvider } from "./codeLens/selectorCodeLens";
import { MetricResultsPanel } from "./webviews/metricResults";
import { IconCompletionProvider } from "./codeCompletions/icons";
import { CachedDataProvider } from "./utils/dataCaching";
import { ScreensMetaCompletionProvider } from "./codeCompletions/screensMeta";
import { runSelector, validateSelector } from "./codeLens/selectorUtils";
import { FastModeStatus } from "./statusBar/fastMode";
import { DiagnosticsProvider } from "./diagnostics/diagnostics";
import { PrometheusCodeLensProvider } from "./codeLens/prometheusScraper";
import { PrometheusCompletionProvider } from "./codeCompletions/prometheus";
import { PrometheusActionProvider } from "./codeActions/prometheus";

/**
 * Sets up the VSCode extension by registering all the available functionality as disposable objects.
 * Activation events (e.g. run command) always trigger this function.
 * @param context VSCode Extension Context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("DYNATRACE EXTENSION DEVELOPER - ACTIVATED!");

  // Initialize global storage
  initGlobalStorage(context);

  // Additonal context: number of workspaces affects the welcome message for the extensions tree view
  vscode.commands.executeCommand("setContext", "dt-ext-copilot.numWorkspaces", getAllWorkspaces(context).length);
  // Additonal context: different welcome message for the extensions tree view if inside a workspace
  vscode.commands.executeCommand("setContext", "dt-ext-copilot.extensionWorkspace", isExtensionsWorkspace(context));
  // Additional context: number of environments affects the welcome message for the tenants tree view
  vscode.commands.executeCommand("setContext", "dt-ext-copilot.numEnvironments", getAllEnvironments(context).length);
  // Create feature/data providers
  const extensionsTreeViewProvider = new ExtensionsTreeDataProvider(context);
  const connectionStatusManager = new ConnectionStatusManager();
  const tenantsTreeViewProvider = new EnvironmentsTreeDataProvider(context, connectionStatusManager);
  const cachedDataProvider = new CachedDataProvider(tenantsTreeViewProvider);
  const snippetCodeActionProvider = new SnippetGenerator();
  const metricLensProvider = new SelectorCodeLensProvider(
    "metricSelector:",
    "metricSelectorsCodeLens",
    cachedDataProvider
  );
  const entityLensProvider = new SelectorCodeLensProvider(
    "entitySelectorTemplate:",
    "entitySelectorsCodeLens",
    cachedDataProvider
  );
  const prometheusLensProvider = new PrometheusCodeLensProvider(cachedDataProvider);
  const prometheusActionProvider = new PrometheusActionProvider(cachedDataProvider);
  const fastModeChannel = vscode.window.createOutputChannel("Dynatrace Fast Mode", "json");
  const fastModeStatus = new FastModeStatus(fastModeChannel);
  const genericChannel = vscode.window.createOutputChannel("Dynatrace", "json");
  const diagnosticsProvider = new DiagnosticsProvider();
  var editTimeout: NodeJS.Timeout | undefined;

  context.subscriptions.push(
    // Commands for the Command Palette
    // Load extension schemas of a given version
    vscode.commands.registerCommand("dt-ext-copilot.loadSchemas", async () => {
      if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
        loadSchemas(context, (await tenantsTreeViewProvider.getDynatraceClient())!);
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dt-ext-copilot.initWorkspace", async () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        try {
          initWorkspace(context, (await tenantsTreeViewProvider.getDynatraceClient())!, () => {
            extensionsTreeViewProvider.refresh();
          });
        } finally {
          context.globalState.update("dt-ext-copilot.initPending", undefined);
        }
      }
    }),
    // Generate the certificates required for extension signing
    vscode.commands.registerCommand("dt-ext-copilot.generateCertificates", async () => {
      if (checkWorkspaceOpen()) {
        initWorkspaceStorage(context);
        return await checkOverwriteCertificates(context).then(async (approved) => {
          if (approved) {
            return await generateCerts(context);
          }
        });
      }
    }),
    // Upload certificate to Dynatrace credential vault
    vscode.commands.registerCommand("dt-ext-copilot.uploadCertificate", async () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        if (checkCertificateExists("ca")) {
          uploadCertificate(context, (await tenantsTreeViewProvider.getDynatraceClient())!);
        }
      }
    }),
    // Build Extension 2.0 package
    vscode.commands.registerCommand("dt-ext-copilot.buildExtension", async () => {
      if (
        (await diagnosticsProvider.isValidForBuilding()) &&
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkCertificateExists("dev")
      ) {
        buildExtension(context, genericChannel, await tenantsTreeViewProvider.getDynatraceClient());
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dt-ext-copilot.uploadExtension", async () => {
      if (
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkEnvironmentConnected(tenantsTreeViewProvider) &&
        checkExtensionZipExists()
      ) {
        uploadExtension((await tenantsTreeViewProvider.getDynatraceClient())!);
      }
    }),
    // Activate a given version of extension 2.0
    vscode.commands.registerCommand("dt-ext-copilot.activateExtension", async (version?: string) => {
      if (
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkEnvironmentConnected(tenantsTreeViewProvider)
      ) {
        activateExtension((await tenantsTreeViewProvider.getDynatraceClient())!, version);
      }
    }),
    // Create Extension documentation
    vscode.commands.registerCommand("dt-ext-copilot.createDocumentation", () => {
      createDocumentation();
    }),
    // Auto-completion - topology data
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new TopologyCompletionProvider(cachedDataProvider),
      ":"
    ),
    // Auto-completion - entity selectors
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new EntitySelectorCompletionProvider(cachedDataProvider),
      ":"
    ),
    // Auto-completion - Barista icons
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new IconCompletionProvider(cachedDataProvider),
      ":"
    ),
    // Auto-completion - Screens metadata/items
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new ScreensMetaCompletionProvider(),
      ":"
    ),
    // Auto-completion - Prometheus data
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new PrometheusCompletionProvider(cachedDataProvider)
    ),
    // Extension 2.0 Workspaces Tree View
    vscode.window.registerTreeDataProvider("dt-ext-copilot-workspaces", extensionsTreeViewProvider),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.refresh", () => extensionsTreeViewProvider.refresh()),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.addWorkspace", () => {
      vscode.commands.executeCommand("vscode.openFolder");
      context.globalState.update("dt-ext-copilot.initPending", true);
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.openWorkspace", (workspace: ExtensionProjectItem) => {
      vscode.commands.executeCommand("vscode.openFolder", workspace.path);
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.deleteWorkspace", (workspace: ExtensionProjectItem) => {
      deleteWorkspace(context, workspace).then(() => extensionsTreeViewProvider.refresh());
    }),
    vscode.commands.registerCommand("dt-ext-copilot-workspaces.editExtension", (extension: ExtensionProjectItem) => {
      vscode.commands.executeCommand("vscode.open", extension.path);
    }),
    // Dynatrace Environments Tree View
    vscode.window.registerTreeDataProvider("dt-ext-copilot-environments", tenantsTreeViewProvider),
    vscode.commands.registerCommand("dt-ext-copilot-environments.refresh", () => tenantsTreeViewProvider.refresh()),
    vscode.commands.registerCommand("dt-ext-copilot-environments.addEnvironment", () =>
      addEnvironment(context).then(() => tenantsTreeViewProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.useEnvironment",
      (environment: EnvironmentTreeItem) => {
        registerEnvironment(
          context,
          environment.url,
          encryptToken(environment.token),
          environment.label?.toString(),
          true
        );
        tenantsTreeViewProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.editEnvironment",
      (environment: EnvironmentTreeItem) => {
        editEnvironment(context, environment).then(() => tenantsTreeViewProvider.refresh());
      }
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot-environments.deleteEnvironment",
      (environment: EnvironmentTreeItem) => {
        deleteEnvironment(context, environment).then(() => tenantsTreeViewProvider.refresh());
      }
    ),
    vscode.commands.registerCommand("dt-ext-copilot-environments.changeConnection", () => {
      changeConnection(context).then(([connected, environment]) => {
        connectionStatusManager.updateStatusBar(connected, environment);
        tenantsTreeViewProvider.refresh();
      });
    }),
    // Code actions for adding snippets
    vscode.languages.registerCodeActionsProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      snippetCodeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    ),
    // Code actions for Prometheus data
    vscode.languages.registerCodeActionsProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      prometheusActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    ),
    // Connection Status Bar Item
    connectionStatusManager.getStatusBarItem(),
    // Code Lens for metric and entity selectors
    vscode.languages.registerCodeLensProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      metricLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      entityLensProvider
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot.codelens.validateSelector",
      async (selector: string, type: "metric" | "entity") => {
        if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
          const status = await validateSelector(selector, type, (await tenantsTreeViewProvider.getDynatraceClient())!);
          return type === "metric"
            ? metricLensProvider.updateValidationStatus(selector, status)
            : entityLensProvider.updateValidationStatus(selector, status);
        }
      }
    ),
    vscode.commands.registerCommand(
      "dt-ext-copilot.codelens.runSelector",
      async (selector: string, type: "metric" | "entity") => {
        if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
          runSelector(selector, type, (await tenantsTreeViewProvider.getDynatraceClient())!, genericChannel);
        }
      }
    ),
    // Code Lens for Prometheus scraping
    vscode.languages.registerCodeLensProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      prometheusLensProvider
    ),
    // Web view panel - metric query results
    vscode.window.registerWebviewPanelSerializer(MetricResultsPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        console.log(`Got state: ${state}`);
        webviewPanel.webview.options = { enableScripts: true };
        MetricResultsPanel.revive(webviewPanel, "No data to display. Close the tab and trigger the action again.");
      },
    }),
    // Activity on every document save
    vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
      // Fast Development Mode - build extension
      if (
        vscode.workspace.getConfiguration("dynatrace", null).get("fastDevelopmentMode") &&
        doc.fileName.endsWith("extension.yaml") &&
        isExtensionsWorkspace(context) &&
        checkEnvironmentConnected(tenantsTreeViewProvider)
      ) {
        const dt = await tenantsTreeViewProvider.getDynatraceClient();
        fastModeBuild(context, dt!, doc, fastModeChannel, fastModeStatus);
      }
    }),
    // Activity on active document changed
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.fileName.endsWith("extension.yaml")) {
        diagnosticsProvider.provideDiagnostics(editor.document);
      }
    }),
    // Activity on every text change in a document
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (change.document.fileName.endsWith("extension.yaml")) {
        // Allow 1 sec after doc changes to avoid ex
        if (editTimeout) {
          clearTimeout(editTimeout);
          editTimeout = undefined;
        }
        editTimeout = setTimeout(() => {
          diagnosticsProvider.provideDiagnostics(change.document);
          editTimeout = undefined;
        }, 1000);
      }
    }),
    // Activity on every configuration change
    vscode.workspace.onDidChangeConfiguration(() => {
      const fastModeEnabled = vscode.workspace.getConfiguration("dynatrace", null).get("fastDevelopmentMode");
      fastModeStatus.updateStatusBar(Boolean(fastModeEnabled));
    })
  );
  // We may have an initialization pending from previous window/activation.
  if (context.globalState.get("dt-ext-copilot.initPending")) {
    vscode.commands.executeCommand("dt-ext-copilot.initWorkspace");
  }
}

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated (e.g. end of command).
 */
export function deactivate() {
  console.log("DYNATRACE EXTENSION DEVELOPER - DEACTIVATED");
}
