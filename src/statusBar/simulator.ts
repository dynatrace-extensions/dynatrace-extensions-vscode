import { ChildProcess, SpawnOptions, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
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
  SimulatorStatus,
} from "../interfaces/simulator";
import { loopSafeWait, showMessage } from "../utils/code";
import { CachedDataConsumer } from "../utils/dataCaching";
import { getDatasourceName } from "../utils/extensionParsing";
import {
  getExtensionFilePath,
  getSimulatorTargets,
  registerSimulatorSummary,
} from "../utils/fileSystem";
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
  private simulatorProcess: ChildProcess | undefined;
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

  constructor(context: vscode.ExtensionContext) {
    super(); // Data cache access
    this.url = "file://CONSOLE";
    this.context = context;
    this.idToken = path.join(context.globalStorageUri.fsPath, "idToken.txt");
    this.localOs = process.platform === "win32" ? "WINDOWS" : "LINUX";

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
    this.statusBar.show();
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
        );
        return false;
      } else {
        this.datasourceDir = getDatasourceDir(target.osType, target.eecType, datasourceName);
        this.datasourceExe = getDatasourceExe(target.osType, target.eecType, datasourceName);
      }
    }

    // At this point, simulator is ready
    this.updateStatusBarDetails("READY");
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
    const logFilePath = path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      "logs",
      `${startTime.toISOString().replace(/:/g, "-")}_simulator.log`,
    );
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
      registerSimulatorSummary(this.context, { ...staticDetails, startTime, duration, success } as
        | LocalExecutionSummary
        | RemoteExecutionSummary);
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
      this.isReady(locationChoice.value as SimulationLocation, eecChoice.value as EecType, target)
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
}