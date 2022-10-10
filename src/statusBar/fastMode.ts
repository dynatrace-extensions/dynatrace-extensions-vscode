import * as vscode from "vscode";

/**
 * Helper class for managing status when in Fast Development Mode
 */
export class FastModeStatus {
  private commandId = "dt-ext-copilot-fastmode.openOutput";
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly outputChannel: vscode.OutputChannel;

  /**
   * @param oc OutputChannel that captures build errors. This will be shown on click.
   */
  constructor(oc: vscode.OutputChannel) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
    this.outputChannel = oc;
    vscode.commands.registerCommand(this.commandId, () => this.outputChannel.show());
    this.statusBarItem.command = this.commandId;
    this.updateStatusBar(vscode.workspace.getConfiguration("dynatrace", null).get("fastDevelopmentMode") as boolean);
  }

  /**
   * Get the StatusBarItem associated with this status bar.
   * @returns StatusBarItem
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  /**
   * Update the Fast Development Mode status bar.
   * The status only shows when the mode is enabled, and can display the build version and last 
   * known build status.
   * @param active Whether Fast Development Mode is enabled or not
   * @param version The current version of the extension build
   * @param passing Whether the build has completed successfully or not
   */
  updateStatusBar(active: boolean, version?: string, passing?: boolean) {
    if (active) {
      this.statusBarItem.text = "🔥 Fast Mode Enabled";
      if (version !== undefined) {
        this.statusBarItem.text += ` | Version ${version}`;
      }
      if (passing !== undefined) {
        this.statusBarItem.text += ` | ${passing ? "✅" : `$(error)`}`;
      }
      this.statusBarItem.tooltip =
        passing === undefined
          ? "Builds are triggered whenever you save changes."
          : passing
          ? "Build passed!"
          : "Build has failed. Click to see last known failure details.";
      this.statusBarItem.backgroundColor =
        passing === false ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }
}
