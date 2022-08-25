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
import {
  EnvironmentsTreeDataProvider,
  EnvironmentTreeItem,
} from "./treeViews/environmentsTreeView";
import {
  addEnvironment,
  deleteEnvironment,
  editEnvironment,
} from "./treeViews/commands/environments";
import { encryptToken } from "./utils/cryptography";
import { ConnectionStatusManager } from "./statusBar/connection";

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
  const tenantsTreeViewProvider = new EnvironmentsTreeDataProvider(
    context,
    connectionStatusManager
  );
  const snippetCodeActionProvider = new SnippetGenerator();

  context.subscriptions.push(
    // Load extension schemas of a given version
    vscode.commands.registerCommand("dynatrace-extension-developer.loadSchemas", () => {
      if (checkEnvironmentConnected(tenantsTreeViewProvider)) {
        loadSchemas(context, tenantsTreeViewProvider.getDynatraceClient()!);
      }
    }),
    // Initialize a new workspace for extension development
    vscode.commands.registerCommand("dynatrace-extension-developer.initWorkspace", () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        initWorkspace(context, tenantsTreeViewProvider.getDynatraceClient()!, () => {
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
    vscode.commands.registerCommand("dynatrace-extension-developer.uploadCertificate", () => {
      if (checkWorkspaceOpen() && checkEnvironmentConnected(tenantsTreeViewProvider)) {
        initWorkspaceStorage(context);
        if (checkCertificateExists("ca", context)) {
          uploadCertificate(context, tenantsTreeViewProvider.getDynatraceClient()!);
        }
      }
    }),
    // Build Extension 2.0 package
    vscode.commands.registerCommand("dynatrace-extension-developer.buildExtension", () => {
      if (
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkCertificateExists("dev", context)
      ) {
        buildExtension(context);
      }
    }),
    // Upload an extension to the tenant
    vscode.commands.registerCommand("dynatrace-extension-developer.uploadExtension", () => {
      if (
        checkWorkspaceOpen() &&
        isExtensionsWorkspace(context) &&
        checkEnvironmentConnected(tenantsTreeViewProvider) &&
        checkExtensionZipExists()
      ) {
        uploadExtension(tenantsTreeViewProvider.getDynatraceClient()!);
      }
    }),
    // Activate a given version of extension 2.0
    vscode.commands.registerCommand(
      "dynatrace-extension-developer.activateExtension",
      (version?: string) => {
        if (
          checkWorkspaceOpen() &&
          isExtensionsWorkspace(context) &&
          checkEnvironmentConnected(tenantsTreeViewProvider)
        ) {
          activateExtension(tenantsTreeViewProvider.getDynatraceClient()!, version);
        }
      }
    ),
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
    vscode.window.registerTreeDataProvider(
      "dynatrace-extension-developer-workspaces",
      extensionsTreeViewProvider
    ),
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
      "dynatrace-extension-developer-workspaces.editExtension",
      (extension: ExtensionProjectItem) => {
        vscode.commands.executeCommand("vscode.open", extension.path);
      }
    ),
    // Dynatrace Environments Tree View
    vscode.window.registerTreeDataProvider(
      "dynatrace-extension-developer-environments",
      tenantsTreeViewProvider
    ),
    vscode.commands.registerCommand("dynatrace-extension-developer-environments.refresh", () =>
      tenantsTreeViewProvider.refresh()
    ),
    vscode.commands.registerCommand(
      "dynatrace-extension-developer-environments.addEnvironment",
      () => addEnvironment(context).then(() => tenantsTreeViewProvider.refresh())
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
    connectionStatusManager.getStatusBarItem()
  );
}

/**
 * Performs any kind of necessary clean up.
 * Automatically called when the extension was deactivated (e.g. end of command).
 */
export function deactivate() {
  console.log("DYNATRACE EXTENSION DEVELOPER - DEACTIVATED");
}
