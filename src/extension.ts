import * as vscode from "vscode";
import { loadSchemas } from "./commands/loadSchemas";
import { initWorkspace } from "./commands/initWorkspace";
import { generateCerts } from "./commands/generateCertificates";
import { uploadCertificate } from "./commands/uploadCertificate";
import { createDocumentation } from "./commands/createDocumentation";
import { buildExtension } from "./commands/buildExtension";
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
import { addEnvironment, deleteEnvironment, editEnvironment } from "./treeViews/commands/environments";
import { encryptToken } from "./utils/cryptography";
import { ConnectionStatusManager } from "./statusBar/connection";
import { deleteWorkspace } from "./treeViews/commands/workspaces";
import { MetricCodeLensProvider, validateMetricSelector } from "./codeLens/metricCodeLens";
import { MetricResultsPanel } from "./webviews/metricResults";
import { DynatraceAPIError } from "./dynatrace-api/errors";

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
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numWorkspaces",
    getAllWorkspaces(context).length
  );
  // Additonal context: different welcome message for the extensions tree view if inside a workspace
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.extensionWorkspace",
    isExtensionsWorkspace(context)
  );
  // Additional context: number of environments affects the welcome message for the tenants tree view
  vscode.commands.executeCommand(
    "setContext",
    "dynatrace-extension-developer.numEnvironments",
    getAllEnvironments(context).length
  );
  // Create feature/data providers
  const extensionsTreeViewProvider = new ExtensionsTreeDataProvider(context);
  const connectionStatusManager = new ConnectionStatusManager();
  const tenantsTreeViewProvider = new EnvironmentsTreeDataProvider(context, connectionStatusManager);
  const snippetCodeActionProvider = new SnippetGenerator();
  const codeLensProvider = new MetricCodeLensProvider();

  context.subscriptions.push(
    // Commands for the Command Palette
    // Load extension schemas of a given version
    vscode.commands.registerCommand("dynatrace-extension-developer.loadSchemas", async () => {
      if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
        loadSchemas(context, (await tenantsTreeViewProvider.getDynatraceClient())!);
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dynatrace-extension-developer.initWorkspace", async () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        initWorkspace(context, (await tenantsTreeViewProvider.getDynatraceClient())!, () => {
          extensionsTreeViewProvider.refresh();
        });
      }
    }),
    // Generate the certificates required for extension signing
    vscode.commands.registerCommand("dynatrace-extension-developer.generateCertificates", () => {
      if (checkWorkspaceOpen()) {
        initWorkspaceStorage(context);
        checkOverwriteCertificates(context).then((approved) => {
          if (approved) {
            generateCerts(context);
          }
        });
      }
    }),
    // Upload certificate to Dynatrace credential vault
    vscode.commands.registerCommand("dynatrace-extension-developer.uploadCertificate", async () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        if (checkCertificateExists("ca", context)) {
          uploadCertificate(context, (await tenantsTreeViewProvider.getDynatraceClient())!);
        }
      }
    }),
    // Build Extension 2.0 package
    vscode.commands.registerCommand("dynatrace-extension-developer.buildExtension", () => {
      if (checkWorkspaceOpen() && isExtensionsWorkspace(context) && checkCertificateExists("dev", context)) {
        buildExtension(context);
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dynatrace-extension-developer.uploadExtension", async () => {
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
    vscode.commands.registerCommand("dynatrace-extension-developer.activateExtension", async (version?: string) => {
      if (
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkEnvironmentConnected(tenantsTreeViewProvider)
      ) {
        activateExtension((await tenantsTreeViewProvider.getDynatraceClient())!, version);
      }
    }),
    // Create Extension documentation
    vscode.commands.registerCommand("dynatrace-extension-developer.createDocumentation", () => {
      createDocumentation();
    }),
    // Auto-completion - topology data
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new TopologyCompletionProvider(tenantsTreeViewProvider),
      ":"
    ),
    // Auto-completion - entity selectors
    vscode.languages.registerCompletionItemProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      new EntitySelectorCompletionProvider(tenantsTreeViewProvider),
      ":"
    ),
    // Extension 2.0 Workspaces Tree View
    vscode.window.registerTreeDataProvider("dynatrace-extension-developer-workspaces", extensionsTreeViewProvider),
    vscode.commands.registerCommand("dynatrace-extension-developer-workspaces.refresh", () =>
      extensionsTreeViewProvider.refresh()
    ),
    vscode.commands.registerCommand("dynatrace-extension-developer-workspaces.addWorkspace", () =>
      vscode.commands.executeCommand("vscode.openFolder").then(() => {
        vscode.commands.executeCommand("dynatrace-extension-developer.initWorkspace");
      })
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-workspaces.openWorkspace",
      (workspace: ExtensionProjectItem) => {
        vscode.commands.executeCommand("vscode.openFolder", workspace.path);
      }
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-workspaces.deleteWorkspace",
      (workspace: ExtensionProjectItem) => {
        deleteWorkspace(context, workspace).then(() => extensionsTreeViewProvider.refresh());
      }
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-workspaces.editExtension",
      (extension: ExtensionProjectItem) => {
        vscode.commands.executeCommand("vscode.open", extension.path);
      }
    ),
    // Dynatrace Environments Tree View
    vscode.window.registerTreeDataProvider("dynatrace-extension-developer-environments", tenantsTreeViewProvider),
    vscode.commands.registerCommand("dynatrace-extension-developer-environments.refresh", () =>
      tenantsTreeViewProvider.refresh()
    ),
    vscode.commands.registerCommand("dynatrace-extension-developer-environments.addEnvironment", () =>
      addEnvironment(context).then(() => tenantsTreeViewProvider.refresh())
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-environments.useEnvironment",
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
      "dynatrace-extension-developer-environments.editEnvironment",
      (environment: EnvironmentTreeItem) => {
        editEnvironment(context, environment).then(() => tenantsTreeViewProvider.refresh());
      }
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-environments.deleteEnvironment",
      (environment: EnvironmentTreeItem) => {
        deleteEnvironment(context, environment).then(() => tenantsTreeViewProvider.refresh());
      }
    ),
    // Code actions for adding snippets
    vscode.languages.registerCodeActionsProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      snippetCodeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    ),
    // Connection Status Bar Item
    connectionStatusManager.getStatusBarItem(),
    // Code Lens
    vscode.languages.registerCodeLensProvider(
      { language: "yaml", pattern: "**/extension/extension.yaml" },
      codeLensProvider
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer.metric-codelens.validateSelector",
      async (selector: string) => {
        if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
          const status = await validateMetricSelector(selector, (await tenantsTreeViewProvider.getDynatraceClient())!);
          codeLensProvider.updateValidationStatus(selector, status);
        }
      }
    ),
    vscode.commands.registerCommand("dynatrace-extension-developer.metric-codelens.runSelector", (selector: string) => {
      if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
        tenantsTreeViewProvider
          .getDynatraceClient()
          .then((dt) => dt!.metrics.query(selector, "5m"))
          .then((res: MetricSeriesCollection[]) => {
            MetricResultsPanel.createOrShow(res);
          })
          .catch((err: DynatraceAPIError) => {
            MetricResultsPanel.createOrShow(JSON.stringify(err.errorParams, undefined, 2));
          });
      }
    }),
    // Web view panel - metric query results
    vscode.window.registerWebviewPanelSerializer(MetricResultsPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        console.log(`Got state: ${state}`);
        webviewPanel.webview.options = { enableScripts: true };
        MetricResultsPanel.revive(webviewPanel, "No data to display. Close the tab and trigger the action again.");
      },
    })
  );
}

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated (e.g. end of command).
 */
export function deactivate() {
  console.log("DYNATRACE EXTENSION DEVELOPER - DEACTIVATED");
}
