import { existsSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  EecType,
  OsType,
  RemoteTarget,
  SimulationLocation,
  SimulatorStatus,
} from "../interfaces/simulator";
import { showMessage } from "../utils/code";
import { CachedDataConsumer } from "../utils/dataCaching";
import { getDatasourceName } from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import {
  canSimulateDatasource,
  getDatasourceDir,
  getDatasourceExe,
  getDatasourcePath,
} from "../utils/simulator";

const SIMULATOR_START_CMD = "dynatrace-extensions.simulator.start";
const SIMULATOR_STOP_CMD = "dynatrace-extensions.simulator.stop";
const SIMULATOR_CHECK_READY_CMD = "dynatrace-extensions.simulator.checkReady";

export class SimulatorManager extends CachedDataConsumer {
  private idToken: string;
  private url: string;
  private localOs: OsType;
  private datasourceDir: string;
  private datasourceExe: string;
  private extensionFile: string;
  private activationFile: string;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBar: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    super(); // Data cache access
    this.url = "file://CONSOLE";
    this.idToken = path.join(context.globalStorageUri.fsPath, "idToken.txt");
    this.localOs = process.platform === "win32" ? "WINDOWS" : "LINUX";

    // Create staus bar and hide it
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this.statusBar.hide();

    // Create the output channel for logs
    this.outputChannel = vscode.window.createOutputChannel("Extension simulator", "log");

    // Register commands
    vscode.commands.registerCommand(SIMULATOR_START_CMD, async () => {
      await this.start();
    });
    vscode.commands.registerCommand(SIMULATOR_STOP_CMD, () => this.stop());
    vscode.commands.registerCommand(SIMULATOR_CHECK_READY_CMD, () => this.isReady());
  }

  /**
   * Updates the status bar with the current simulator status.
   * @param status - simulator status
   * @param message - optional message to display in the tooltip
   */
  private updateStatusBarDetails(status: SimulatorStatus, message?: string) {
    switch (status) {
      case "READY":
        this.statusBar.text = "$(debug-start) Simulate extension";
        this.statusBar.tooltip = "Click to start simulating your extension";
        this.statusBar.command = SIMULATOR_START_CMD;
        break;
      case "RUNNING":
        this.statusBar.text = "$(debug-stop) Simulate extension";
        this.statusBar.tooltip = "Click to stop the current simulation";
        this.statusBar.command = SIMULATOR_STOP_CMD;
        break;
      case "NOTREADY":
        this.statusBar.text = "$(warning) Cannot simulate extension";
        this.statusBar.tooltip = message ?? "One or more checks failed. Click to check again.";
        this.statusBar.command = SIMULATOR_CHECK_READY_CMD;
        break;
    }
  }

  /**
   * Checks if the simulator is ready to start.
   * @param location - simulation location
   * @param eecType - eec type
   * @param target - remote target
   * @returns true if simulator is ready, false otherwise
   */
  public isReady(location?: SimulationLocation, eecType?: EecType, target?: RemoteTarget) {
    // Check extension has datasource
    const datasourceName = getDatasourceName(this.parsedExtension);
    if (datasourceName === "unsupported") {
      this.updateStatusBarDetails("NOTREADY", "Extension does not have a supported datasource");
      return false;
    }
    // Check extension file exists
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      this.updateStatusBarDetails("NOTREADY", "Could not detect extension manifest file");
      return false;
    } else {
      this.extensionFile = extensionFile;
    }
    // Check activation file exists
    if (!vscode.workspace.workspaceFolders) return false;
    const activationFile = path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      "config",
      "simulator.json",
    );
    if (!existsSync(activationFile)) {
      this.updateStatusBarDetails("NOTREADY", 'Could not detect config file "simulator.json"');
      return false;
    } else {
      this.activationFile = activationFile;
    }

    // LOCAL Simulation checks
    if (location === "LOCAL") {
      if (!eecType) return false;
      // Check we can simulate this DS on local OS
      if (!canSimulateDatasource(this.localOs, eecType, datasourceName)) {
        this.updateStatusBarDetails(
          "NOTREADY",
          `Datasource ${datasourceName} cannot be simulated on this OS`,
        );
        return false;
      }
      // Check binary exists
      const datasourcePath = getDatasourcePath(this.localOs, eecType, datasourceName);
      if (!existsSync(datasourcePath)) {
        this.updateStatusBarDetails(
          "NOTREADY",
          `Could not find datasource executable at ${datasourcePath}`,
        );
        return false;
      } else {
        this.datasourceDir = getDatasourceDir(this.localOs, eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(eecType, datasourceName);
      }
    }

    // REMOTE Simulation checks
    if (location === "REMOTE") {
      if (!target) return false;
      // Check we can simulate this DS on remote OS
      if (!canSimulateDatasource(target.osType, target.eecType, datasourceName)) {
        this.updateStatusBarDetails(
          "NOTREADY",
          `Datasource ${datasourceName} cannot be simulated on ${target.osType}`,
        );
        return false;
      }
    }

    // At this point, simulator is ready
    this.updateStatusBarDetails("READY");
    return true;
  }

  private createProcess() {}

  private startLocally() {
    showMessage("info", "Great! Good job so far!");
  }

  private startRemotely() {}

  private async start() {
    // Simulation location
    const locationChoice = await vscode.window.showQuickPick(
      [
        {
          label: "Local",
          value: "LOCAL",
          description: "Simulate the extension on your local machine",
        },
        {
          label: "Remote",
          value: "REMOTE",
          description: "Simulate the extension remotely on a OneAgent or ActiveGate",
        },
      ],
      {
        canPickMany: false,
        title: "Where will the simulation run?",
        ignoreFocusOut: true,
      },
    );
    if (!locationChoice) {
      showMessage("error", "No location selected");
      return;
    }

    // EEC type
    const eecChoice = await vscode.window.showQuickPick(
      [
        {
          label: "ActiveGate",
          value: "ACTIVEGATE",
          description: "Simulate the extension on an ActiveGate",
        },
        {
          label: "OneAgent",
          value: "ONEAGENT",
          description: "Simulate the extension on a OneAgent",
        },
      ],
      {
        canPickMany: false,
        title: "Which component will run the simulation?",
        ignoreFocusOut: true,
      },
    );
    if (!eecChoice) {
      showMessage("error", "No component selected");
      return;
    }

    // Remote target
    let target;
    if (locationChoice.value === "REMOTE") {
      showMessage("warn", "NOT IMPLEMENTED");
    }

    // Check simulator is ready for selected choice and start simulation
    if (
      this.isReady(locationChoice.value as SimulationLocation, eecChoice.value as EecType, target)
    ) {
      switch (locationChoice.value) {
        case "LOCAL":
          this.startLocally();
          break;
        case "REMOTE":
          this.startRemotely();
          break;
      }
    } else {
      showMessage("warn", "Cannot simulate extension, check status bar for details");
    }
  }

  private stop() {}
}
