import * as vscode from "vscode";

/**
 * Helper class for managing the Connection Status Bar Item.
 */
export class ConnectionStatusManager {
  statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this.statusBarItem.command = "dt-ext-copilot-environments.changeConnection";
    this.updateStatusBar(false);
  }

  /**
   * Gets an instance of {@link vscode.StatusBarItem} that will be used to
   * keep track of the currently connected (in use) Dynatrace environment.
   * @returns the status bar item
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  /**
   * Updates the status bar item to show whether any specific Dynatrace environment
   * is currently being used or not.
   * @param connected whether any environment is in use
   * @param environment optional label for the environment, in case one is in use
   */
  updateStatusBar(connected: boolean, environment?: string) {
    if (connected) {
      this.statusBarItem.text = `$(dt-signet) Connected to ${environment}`;
      this.statusBarItem.tooltip = "Using this environment for API calls";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor("notebookStatusSuccessIcon.foreground");
    } else {
      this.statusBarItem.text = `$(dt-signet) Not connected`;
      this.statusBarItem.tooltip = "No API calls are currently possible";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.statusBarItem.color = undefined;
    }
    this.statusBarItem.show();
  }
}
