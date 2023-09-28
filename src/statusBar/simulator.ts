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
const SIMULATOR_OPEN_UI_CMD = "dynatrace-extensions.simulator.openUI";
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

    // Create staus bar and hide it
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBar.hide();

    // Create the output channel for logs
    this.outputChannel = vscode.window.createOutputChannel("Extension simulator", "log");

    // Register commands
    vscode.commands.registerCommand(SIMULATOR_START_CMD, async () => {
      await this.start();
    });
    vscode.commands.registerCommand(SIMULATOR_STOP_CMD, () => this.stop());
    vscode.commands.registerCommand(SIMULATOR_CHECK_READY_CMD, () => this.isReady());
    vscode.commands.registerCommand(SIMULATOR_OPEN_UI_CMD, () => this.openUI());
    vscode.commands.registerCommand(SIMULATOR_READ_LOG_CMD, (logPath: string) =>
      this.readLog(logPath),
    );
    vscode.commands.registerCommand(SIMULATOR_ADD_TARGERT_CMD, (target: RemoteTarget) =>
      this.addTarget(target),
    );
    vscode.commands.registerCommand(SIMULATOR_DELETE_TARGERT_CMD, (target: RemoteTarget) =>
      this.deleteTarget(target),
    );
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
    this.openUI();
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
    this.openUI();
  }

  /**
   * TODO: Review and delete or merge with other function
   * ----
   * Updates the status bar with the current simulator status.
   * @param status - simulator status
   * @param message - optional message to display in the tooltip
   */
  private updateStatusBarDetails(
    status: SimulatorStatus,
    message?: string,
    openUI: boolean = true,
  ) {
    this.simulatorStatus = status;
    this.statusBar.command = SIMULATOR_OPEN_UI_CMD;
    this.statusBar.text = "Extension simulator";
    this.statusBar.tooltip = "Click to open";
    if (openUI) this.openUI();
    this.statusBar.show();
  }

  /**
   * Checks if the simulator is ready to start.
   * @param location - simulation location
   * @param eecType - eec type
   * @param target - remote target
   * @returns true if simulator is ready, false otherwise
   */
  public isReady(
    openUI: boolean = true,
    location?: SimulationLocation,
    eecType?: EecType,
    target?: RemoteTarget,
  ) {
    // Check extension has datasource
    const datasourceName = getDatasourceName(this.parsedExtension);
    if (datasourceName === "unsupported") {
      this.updateStatusBarDetails(
        "NOTREADY",
        "Extension does not have a supported datasource",
        openUI,
      );
      return false;
    }
    // Check extension file exists
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      this.updateStatusBarDetails("NOTREADY", "Could not detect extension manifest file", openUI);
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
      this.updateStatusBarDetails(
        "NOTREADY",
        'Could not detect config file "simulator.json"',
        openUI,
      );
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
          openUI,
        );
        return false;
      }
      // Check binary exists
      const datasourcePath = getDatasourcePath(this.localOs, eecType, datasourceName);
      if (!existsSync(datasourcePath)) {
        this.updateStatusBarDetails(
          "NOTREADY",
          `Could not find datasource executable at ${datasourcePath}`,
          openUI,
        );
        return false;
      } else {
        this.datasourceDir = getDatasourceDir(this.localOs, eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(this.localOs, eecType, datasourceName);
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
          openUI,
        );
        return false;
      } else {
        this.datasourceDir = getDatasourceDir(target.osType, target.eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(target.osType, target.eecType, datasourceName);
      }
    }

    // At this point, simulator is ready
    this.updateStatusBarDetails("READY", undefined, openUI);
    return true;
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
      this.openUI();
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

    this.updateStatusBarDetails("RUNNING");
  }

  /**
   * Starts the main user flow for the simulator.
   */
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
    let target: RemoteTarget;
    if (locationChoice.value === "REMOTE") {
      const targetChoice = await vscode.window.showQuickPick(
        getSimulatorTargets(this.context).map(t => ({
          label: `${t.name} (${t.username}@${t.address})`,
          value: t,
        })),
        {
          canPickMany: false,
          title: "Which remote target will run the simulation?",
          ignoreFocusOut: true,
        },
      );
      if (!targetChoice) {
        showMessage("error", "No target selected");
        return;
      } else {
        target = targetChoice.value;
      }
    }

    // Check simulator is ready for selected choice and start simulation
    if (
      this.isReady(
        true,
        locationChoice.value as SimulationLocation,
        eecChoice.value as EecType,
        target,
      )
    ) {
      // Create log folder if it doesn't exist
      const logsDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir);
      }
      // Start the simulation
      try {
        switch (locationChoice.value) {
          case "LOCAL":
            this.startLocally();
            break;
          case "REMOTE":
            await this.startRemotely(target);
            break;
        }
        this.updateStatusBarDetails("RUNNING");
      } catch (err) {
        showMessage("error", `Error starting the simulation ${(err as Error).message}`);
      }
    } else {
      showMessage("warn", "Cannot simulate extension, check status bar for details");
    }
  }

  /**
   * Performs all the necessary cleanup when the simulator is stopped.
   */
  private stop() {
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
      this.updateStatusBarDetails("READY");
    }
  }

  private openUI() {
    this.panelManager.render(REGISTERED_PANELS.SIMULATOR_UI, "Extension Simulator", {
      dataType: SIMULATOR_PANEL_DATA_TYPE,
      data: {
        targets: getSimulatorTargets(this.context),
        summaries: getSimulatorSummaries(this.context),
        status: this.simulatorStatus,
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
