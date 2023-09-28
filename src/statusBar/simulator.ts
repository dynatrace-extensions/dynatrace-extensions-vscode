import { ChildProcess, SpawnOptions, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import pidtree = require("pidtree");
import * as vscode from "vscode";
import {
  EecType,
  LocalExecutionSummary,
  OsType,
  RemoteExecutionSummary,
  RemoteTarget,
  SimulationConfig,
  SimulationLocation,
  SimulatorPanelData,
  SimulatorStatus,
} from "../interfaces/simulator";
import { ToastOptions } from "../interfaces/webview";
import { loopSafeWait, showMessage } from "../utils/code";
import { CachedDataConsumer } from "../utils/dataCaching";
import { getDatasourceName } from "../utils/extensionParsing";
import {
  cleanUpSimulatorLogs,
  deleteSimulatorTarget,
  getExtensionFilePath,
  getSimulatorSummaries,
  getSimulatorTargets,
  registerSimulatorSummary,
  registerSimulatorTarget,
} from "../utils/fileSystem";
import {
  canSimulateDatasource,
  getDatasourceDir,
  getDatasourceExe,
  getDatasourcePath,
} from "../utils/simulator";
import { REGISTERED_PANELS, WebviewPanelManager } from "../webviews/webviewPanel";

const SIMULATOR_START_CMD = "dynatrace-extensions.simulator.start";
const SIMULATOR_STOP_CMD = "dynatrace-extensions.simulator.stop";
const SIMULATOR_CHECK_READY_CMD = "dynatrace-extensions.simulator.checkReady";
const SIMULATOR_OPEN_UI_CMD = "dynatrace-extensions.simulator.refreshUI";
const SIMULATOR_READ_LOG_CMD = "dynatrace-extensions.simulator.readLog";
const SIMULATOR_ADD_TARGERT_CMD = "dynatrace-extensions.simulator.addTarget";
const SIMULATOR_DELETE_TARGERT_CMD = "dynatrace-extensions.simulator.deleteTarget";
const SIMULATOR_PANEL_DATA_TYPE = "SIMULATOR_DATA";

/**
 * Helper class for managing the Extension Simulator, its UI, and data.
 */
export class SimulatorManager extends CachedDataConsumer {
  private simulatorProcess: ChildProcess | undefined;
  private simulatorStatus: SimulatorStatus;
  private simulatorStatusMessage: string;
  private idToken: string;
  private url: string;
  private localOs: OsType;
  private extensionFile: string;
  private activationFile: string;
  private datasourceDir: string;
  private datasourceExe: string;
  private readonly context: vscode.ExtensionContext;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly panelManager: WebviewPanelManager;

  /**
   * @param context - extension context
   * @param panelManager - webview panel manager
   */
  constructor(context: vscode.ExtensionContext, panelManager: WebviewPanelManager) {
    super(); // Data cache access
    this.url = "file://CONSOLE";
    this.context = context;
    this.idToken = path.join(context.globalStorageUri.fsPath, "idToken.txt");
    this.localOs = process.platform === "win32" ? "WINDOWS" : "LINUX";
    this.panelManager = panelManager;

    // Initial clean-up of files
    cleanUpSimulatorLogs(context);

    // Create the output channel for logs
    this.outputChannel = vscode.window.createOutputChannel("Extension simulator", "log");

    // Register commands
    vscode.commands.registerCommand(SIMULATOR_START_CMD, async (config: SimulationConfig) => {
      await this.start(config);
    });
    vscode.commands.registerCommand(SIMULATOR_STOP_CMD, () => this.stop());
    vscode.commands.registerCommand(SIMULATOR_CHECK_READY_CMD, (config?: SimulationConfig) => {
      // Let the panel know check is in progress
      this.simulatorStatus = "CHECKING";
      this.refreshUI();

      // Do actual check
      const [status, statusMessage] = config
        ? this.checkSimulationConfig(config.location, config.eecType, config.target)
        : this.checkSimulationConfig();

      // Let the panel know the check result
      this.simulatorStatus = status;
      this.simulatorStatusMessage = statusMessage;
      this.refreshUI();
    });
    vscode.commands.registerCommand(SIMULATOR_OPEN_UI_CMD, () => this.refreshUI());
    vscode.commands.registerCommand(SIMULATOR_READ_LOG_CMD, (logPath: string) =>
      this.readLog(logPath),
    );
    vscode.commands.registerCommand(SIMULATOR_ADD_TARGERT_CMD, (target: RemoteTarget) =>
      this.addTarget(target),
    );
    vscode.commands.registerCommand(SIMULATOR_DELETE_TARGERT_CMD, (target: RemoteTarget) =>
      this.deleteTarget(target),
    );

    // Create the status bar and show it
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBar.command = SIMULATOR_OPEN_UI_CMD;
    this.statusBar.text = "Extension simulator";
    this.statusBar.tooltip = "Click to open";
    this.statusBar.show();
  }

  /**
   * Deletes a remote target from the list stored in global storage.
   * @param target - target to delete
   */
  private deleteTarget(target: RemoteTarget) {
    // This will always succeed
    deleteSimulatorTarget(this.context, target);
    this.panelManager.postMessage(REGISTERED_PANELS.SIMULATOR_UI, {
      messageType: "showToast",
      data: {
        title: "Target deleted",
        type: "success",
        role: "status",
        lifespan: 800,
      } as ToastOptions,
    });
    this.refreshUI();
  }

  /**
   * Adds a remote target to the list stored in global storage.
   * @param target - target to register
   */
  private addTarget(target: RemoteTarget) {
    registerSimulatorTarget(this.context, target);
    this.panelManager.postMessage(REGISTERED_PANELS.SIMULATOR_UI, {
      messageType: "showToast",
      data: {
        title: "Target registered",
        type: "success",
        role: "status",
        lifespan: 800,
      } as ToastOptions,
    });
    this.refreshUI();
  }

  /**
   * Checks if current simulation configuration can be run.
   * @param location - simulation location
   * @param eecType - eec type
   * @param target - remote target
   * @returns true if simulator is ready, false otherwise
   */
  public checkSimulationConfig(
    location?: SimulationLocation,
    eecType?: EecType,
    target?: RemoteTarget,
  ): [SimulatorStatus, string] {
    // Check extension has datasource
    const datasourceName = getDatasourceName(this.parsedExtension);
    if (datasourceName === "unsupported") {
      return ["NOTREADY", "Extension does not have a supported datasource"];
    }
    // Check extension file exists
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      return ["NOTREADY", "Could not detect extension manifest file"];
    } else {
      this.extensionFile = extensionFile;
    }
    // Check activation file exists
    if (!vscode.workspace.workspaceFolders) return ["NOTREADY", "No workspace open"];
    const activationFile = path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      "config",
      "simulator.json",
    );
    if (!existsSync(activationFile)) {
      return ["NOTREADY", 'Could not detect config file "simulator.json"'];
    } else {
      this.activationFile = activationFile;
    }

    // LOCAL Simulation checks
    if (location === "LOCAL") {
      if (!eecType) return ["NOTREADY", "No EEC type selected"];
      // Check we can simulate this DS on local OS
      if (!canSimulateDatasource(this.localOs, eecType, datasourceName)) {
        return ["NOTREADY", `Datasource ${datasourceName} cannot be simulated on this OS`];
      }
      // Check binary exists
      const datasourcePath = getDatasourcePath(this.localOs, eecType, datasourceName);
      if (!existsSync(datasourcePath)) {
        return ["NOTREADY", `Could not find datasource executable at ${datasourcePath}`];
      } else {
        this.datasourceDir = getDatasourceDir(this.localOs, eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(this.localOs, eecType, datasourceName);
      }
    }

    // REMOTE Simulation checks
    if (location === "REMOTE") {
      if (!target) return ["NOTREADY", "No target given for remote simulation"];
      // Check we can simulate this DS on remote OS
      if (!canSimulateDatasource(target.osType, target.eecType, datasourceName)) {
        return ["NOTREADY", `Datasource ${datasourceName} cannot be simulated on ${target.osType}`];
      } else {
        this.datasourceDir = getDatasourceDir(target.osType, target.eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(target.osType, target.eecType, datasourceName);
      }
    }

    // At this point, simulator is ready
    return ["READY", ""];
  }

  /**
   * Spawns a child process which executes the datasource with the current extension files.
   * @param staticDetails - static details to add to the summary
   * @param command - command to execute
   * @param options - spawn options
   */
  private createProcess(
    staticDetails: Partial<LocalExecutionSummary | RemoteExecutionSummary>,
    command: string,
    options: SpawnOptions,
  ) {
    const startTime = new Date();
    let success = true;
    // If needed, make room for new log
    cleanUpSimulatorLogs(this.context);
    const logFilePath = path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      "logs",
      `${startTime.toISOString().replace(/:/g, "-")}_simulator.log`,
    );
    const workspace = vscode.workspace.workspaceFolders[0].name;
    this.simulatorProcess = spawn(command, options);

    this.outputChannel.appendLine(
      `Simulator process created with PID ${this.simulatorProcess.pid}`,
    );

    this.simulatorProcess.on("error", err => {
      this.outputChannel.appendLine("ERROR:");
      this.outputChannel.appendLine(err.message);
      success = false;
      writeFileSync(logFilePath, `ERROR:\n${err.message}\n`, { flag: "a" });
    });

    this.simulatorProcess.stdout.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
      writeFileSync(logFilePath, data.toString(), { flag: "a" });
    });
    this.simulatorProcess.stderr.on("data", (data: Buffer) => {
      this.outputChannel.appendLine("Error:");
      this.outputChannel.append(data.toString());
      success = false;
      writeFileSync(logFilePath, `Error:\n${data.toString()}`, { flag: "a" });
    });

    this.simulatorProcess.on("exit", (code, signal) => {
      this.outputChannel.appendLine(
        `Simulator process exited with code ${code ?? signal.toString()}`,
      );
    });

    this.simulatorProcess.on("close", (code, signal) => {
      const duration = Math.round((new Date().getTime() - startTime.getTime()) / 1000);
      registerSimulatorSummary(this.context, {
        ...staticDetails,
        startTime,
        duration,
        success,
        logPath: logFilePath,
        workspace,
      } as LocalExecutionSummary | RemoteExecutionSummary);
      this.refreshUI();
      this.outputChannel.appendLine(
        `Simulator process closed with code ${code ?? signal.toString()}`,
      );
      this.simulatorProcess = undefined;
    });
  }

  /**
   * Starts a local simulation of the extension.
   */
  private startLocally() {
    const command =
      `.${path.sep}${this.datasourceExe} --url "${this.url}"  --idtoken "${this.idToken}" ` +
      `--extConfig "file://${this.extensionFile}" --userConfig "file://${this.activationFile}"`;

    // Initial message before starting the process
    this.outputChannel.replace("Starting simulation...\n");
    this.outputChannel.show();
    this.outputChannel.appendLine(`Running command: ${command}\n`);

    // Create the process
    this.createProcess({ location: "LOCAL" }, command, {
      shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
      cwd: this.datasourceDir,
    });
  }

  /**
   * Starts the simulation on a remote target machine.
   * @param target - remote target
   */
  private async startRemotely(target: RemoteTarget) {
    this.outputChannel.replace(`Copying required files to remote machine at ${target.address}\n`);
    this.outputChannel.show();

    // Copy the files onto the host
    const scp = spawn(
      `scp -i "${target.privateKey}" "${this.activationFile}" "${this.extensionFile}" "${this.idToken}" ${target.username}@${target.address}:/tmp`,
      { shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh" },
    );
    scp.stdout.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });
    scp.stderr.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });
    scp.on("exit", (code, signal) => {
      if (code === 0) {
        this.outputChannel.appendLine("Files copied successfully.");
      } else {
        this.outputChannel.appendLine(`SCP process exited with code ${code ?? signal.toString()}`);
      }
    });

    // Wait for SCP to finish
    while (scp.exitCode === null) {
      await loopSafeWait(100);
    }

    // Set the new file paths
    this.idToken = "/tmp/idToken";
    this.extensionFile = "/tmp/extension.yaml";
    this.activationFile = "/tmp/simulator.json";

    // Initial message before starting the process
    this.outputChannel.appendLine("Starting remote simulation...");
    this.outputChannel.appendLine(`Target details: ${JSON.stringify(target)}\n`);

    // Build the command
    const command =
      `ssh -i "${target.privateKey}" ${target.username}@${target.address} ` +
      `'cd ${this.datasourceDir} && ./${this.datasourceExe} --url "${this.url}"  --idtoken "${this.idToken}" ` +
      `--extConfig "file://${this.extensionFile}" --userConfig "file://${this.activationFile}"'`;

    this.outputChannel.appendLine(`Running command: ${command}`);

    // Start the simulation
    this.createProcess({ location: "REMOTE", target: target.name }, command, {
      shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    });
  }

  /**
   * Starts simulating the extension based on the given configuration
   */
  private async start(config: SimulationConfig) {
    const { location, target } = config;

    // Create log folder if it doesn't exist
    const logsDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "logs");
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir);
    }
    // Start the simulation
    try {
      switch (location) {
        case "LOCAL":
          this.startLocally();
          break;
        case "REMOTE":
          await this.startRemotely(target);
          break;
      }
      this.simulatorStatus = "RUNNING";
      this.refreshUI();
    } catch (err) {
      showMessage("error", `Error starting the simulation ${(err as Error).message}`);
    }
  }

  /**
   * Performs all the necessary cleanup when the simulator is stopped.
   */
  public stop() {
    try {
      if (this.simulatorProcess) {
        // Datasource is detached from main process, so we need to kill the entire process tree
        pidtree(this.simulatorProcess.pid, (err, pids) => {
          if (err) {
            showMessage(
              "error",
              `Error getting all PIDs: ${err.message}. Please ensure all processes are manually stopped.`,
            );
          } else {
            pids.forEach(pid => {
              try {
                process.kill(pid, "SIGKILL");
              } catch (e) {
                showMessage("error", `Process ${pid} must be stopped manually.`);
              }
            });
          }
        });
        // Finally, kill our main process
        this.simulatorProcess.kill("SIGKILL");
        this.simulatorProcess = undefined;
      }
    } catch (err) {
      showMessage("error", `Error stopping the simulation ${(err as Error).message}`);
    } finally {
      this.simulatorStatus = "READY";
      this.refreshUI();
    }
  }

  private refreshUI() {
    this.panelManager.render(REGISTERED_PANELS.SIMULATOR_UI, "Extension Simulator", {
      dataType: SIMULATOR_PANEL_DATA_TYPE,
      data: {
        targets: getSimulatorTargets(this.context),
        summaries: getSimulatorSummaries(this.context),
        status: this.simulatorStatus,
        statusMessage: this.simulatorStatusMessage,
      },
    } as SimulatorPanelData);
  }

  private readLog(logPath: string) {
    const logFilePath = vscode.Uri.from(
      JSON.parse(logPath) as { scheme: string; path: string; authority: string },
    );

    const logContent = readFileSync(logFilePath.fsPath).toString();

    this.panelManager.postMessage(REGISTERED_PANELS.SIMULATOR_UI, {
      messageType: "openLog",
      data: logContent,
    });
  }
}
