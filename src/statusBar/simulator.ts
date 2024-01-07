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
  limitations under the License.
 */

import { ChildProcess, ExecOptions, SpawnOptions, spawn } from "child_process";
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
  SimulationSpecs,
  SimulatorPanelData,
  SimulatorStatus,
} from "../interfaces/simulator";
import { ToastOptions } from "../interfaces/webview";
import { loopSafeWait } from "../utils/code";
import { checkDtSdkPresent } from "../utils/conditionCheckers";
import { CachedDataConsumer } from "../utils/dataCaching";
import { getDatasourceName } from "../utils/extensionParsing";
import {
  cleanUpSimulatorLogs,
  deleteSimulatorTarget,
  getExtensionFilePath,
  getExtensionWorkspaceDir,
  getSimulatorSummaries,
  getSimulatorTargets,
  registerSimulatorSummary,
  registerSimulatorTarget,
} from "../utils/fileSystem";
import * as logger from "../utils/logging";
import { getPythonVenvOpts } from "../utils/otherExtensions";
import {
  canSimulateDatasource,
  getDatasourceDir,
  getDatasourceExe,
  getDatasourcePath,
  loadDefaultSimulationConfig,
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
  public datasourceName: string;
  public simulatorStatus: SimulatorStatus;
  public currentConfiguration: SimulationConfig;
  private simulatorProcess: ChildProcess | undefined;
  private simulationSpecs: SimulationSpecs;
  private failedChecks: string[];
  private idToken: string;
  private url: string;
  private localOs: OsType;
  private extensionFile: string;
  private activationFile: string;
  private datasourceDir: string;
  private datasourceExe: string;
  private pyEnvOptions: ExecOptions;
  private readonly logTrace = ["statusBar", "simulator", this.constructor.name];
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
    this.simulationSpecs = {
      isPython: false,
      dsSupportsActiveGateEec: false,
      dsSupportsOneAgentEec: false,
      localActiveGateDsExists: false,
      localOneAgentDsExists: false,
    };
    this.currentConfiguration = loadDefaultSimulationConfig(context);

    // Initial clean-up of files
    cleanUpSimulatorLogs(context);

    // Create the output channel for logs
    this.outputChannel = vscode.window.createOutputChannel("Extension simulator", "log");

    // Register commands
    vscode.commands.registerCommand(
      SIMULATOR_START_CMD,
      async (config?: SimulationConfig, showUI: boolean = true) => {
        if (config) {
          this.currentConfiguration = config;
        }
        await this.start(config ?? this.currentConfiguration, showUI);
      },
    );
    vscode.commands.registerCommand(SIMULATOR_STOP_CMD, () => this.stop());
    vscode.commands.registerCommand(
      SIMULATOR_CHECK_READY_CMD,
      (showUI: boolean = true, config?: SimulationConfig) => this.checkReady(showUI, config),
    );
    vscode.commands.registerCommand(SIMULATOR_OPEN_UI_CMD, () => this.refreshUI(true));
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
    logger.info(`Deleting target ${target.name}`, ...this.logTrace, "deleteTarget");
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
    this.refreshUI(true);
  }

  /**
   * Adds a remote target to the list stored in global storage.
   * @param target - target to register
   */
  private addTarget(target: RemoteTarget) {
    logger.info(`Adding target ${target.name}`, ...this.logTrace, "addTarget");
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
    this.refreshUI(true);
  }

  /**
   * Check readiness to start. Will first check workspace mandatory details, and, if a configuration
   * was given, will continue checking the configuration details too.
   * @param showUI whether to show the simulator panel after checking
   * @param config a simulation config to check
   */
  public checkReady(showUI: boolean = true, config?: SimulationConfig) {
    const fnLogTrace = [...this.logTrace, "checkReady"];
    logger.info("Checking simulator readiness", ...fnLogTrace);
    // Let the panel know check is in progress
    this.refreshUI(showUI, "CHECKING");

    // First check mandatory requirements
    const [result, failedChecks] = this.checkMantatoryRequirements();
    if (!result) {
      this.refreshUI(showUI, "UNSUPPORTED", undefined, failedChecks);
      logger.warn(`Mandatory checks failed: ${failedChecks.join(", ")}`, ...fnLogTrace);
      return;
    }

    // Check config if given, check further
    if (config) {
      this.currentConfiguration = config;
      this.checkSimulationConfig(config.location, config.eecType, config.target).then(
        ([status, statusMessage]) => {
          logger.debug(
            `Simulation config check result: ${status} (${statusMessage})`,
            ...fnLogTrace,
          );
          this.refreshUI(showUI, status, statusMessage);
        },
        err => {
          logger.error(
            `Error checking simulation config: ${(err as Error).message}`,
            ...fnLogTrace,
          );
          this.refreshUI(
            showUI,
            "NOTREADY",
            `Error checking configuration: ${(err as Error).message}`,
          );
        },
      );
      return;
    }

    this.refreshUI(showUI, "READY");
  }

  /**
   * Checks mandatory requirements for simulating any extension.
   * Without these, there's no point going any further in the process.
   * @returns tuple of [check result, failed checks]
   */
  public checkMantatoryRequirements(): [boolean, string[]] {
    const failedChecks: string[] = [];
    // Check extension file exists
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      failedChecks.push("Manifest");
    } else {
      this.extensionFile = extensionFile;
    }
    // Check extension has datasource
    const datasourceName = getDatasourceName(this.parsedExtension);
    if (datasourceName === "unsupported") {
      failedChecks.push("Datasource");
    } else {
      this.datasourceName = datasourceName;
    }
    // Check activation file exists
    if (!vscode.workspace.workspaceFolders) {
      failedChecks.push("Activation file");
    } else {
      // Any extension can use the "simulator.json"
      const activationFile = path.resolve(
        path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "config", "simulator.json"),
      );
      if (existsSync(activationFile)) {
        this.activationFile = activationFile;
      } else {
        // Python extensions may use "activation.json" as alternative
        if (datasourceName === "python") {
          const pyActivation = path.resolve(
            path.join(path.resolve(getExtensionWorkspaceDir(), ".."), "activation.json"),
          );
          if (existsSync(pyActivation)) {
            this.activationFile = pyActivation;
          } else {
            failedChecks.push("Activation file");
          }
        } else {
          failedChecks.push("Activation file");
        }
      }
    }

    // If mandatory checks passed, we can get simulation specs
    if (failedChecks.length === 0) {
      this.simulationSpecs = this.getSimulationSpecs();
    }

    this.failedChecks = failedChecks;
    this.simulatorStatus = failedChecks.length === 0 ? "READY" : "UNSUPPORTED";
    return [failedChecks.length === 0, this.failedChecks];
  }

  /**
   * Checks if current simulation configuration can be run.
   * @param location - simulation location
   * @param eecType - eec type
   * @param target - remote target
   * @returns true if simulator is ready, false otherwise
   */
  public async checkSimulationConfig(
    location: SimulationLocation,
    eecType: EecType,
    target?: RemoteTarget,
  ): Promise<[SimulatorStatus, string]> {
    // LOCAL Simulation checks
    if (location === "LOCAL") {
      // For python, we only need to check the SDK is available
      if (this.datasourceName === "python") {
        const [pyStat, pyMsg] = await getPythonVenvOpts().then(
          envOptions => {
            this.pyEnvOptions = envOptions;
            return checkDtSdkPresent(undefined, undefined, envOptions).then(
              sdkAvailable => {
                if (!sdkAvailable) {
                  return ["NOTREADY", "Python SDK not found"];
                } else {
                  return ["READY", ""];
                }
              },
              err => ["NOTREADY", `Error checking for Python SDK: ${(err as Error).message}`],
            );
          },
          err => ["NOTREADY", `Error checking for Python SDK: ${(err as Error).message}`],
        );
        if (pyStat === "NOTREADY") {
          return [pyStat, pyMsg];
        }
      } else {
        // Check we can simulate this DS on local OS
        if (!canSimulateDatasource(this.localOs, eecType, this.datasourceName)) {
          return ["NOTREADY", `Datasource ${this.datasourceName} cannot be simulated on this OS`];
        }
        // Check binary exists
        const datasourcePath = getDatasourcePath(this.localOs, eecType, this.datasourceName);
        if (!existsSync(datasourcePath)) {
          return ["NOTREADY", `Could not find datasource executable at ${datasourcePath}`];
        } else {
          this.datasourceDir = getDatasourceDir(this.localOs, eecType, this.datasourceName);
          this.datasourceExe = getDatasourceExe(this.localOs, eecType, this.datasourceName);
        }
      }
    }

    // REMOTE Simulation checks
    if (location === "REMOTE") {
      if (this.datasourceName === "python") {
        return ["NOTREADY", "Python datasource can only be simulated on local machine"];
      }
      if (!target) return ["NOTREADY", "No target given for remote simulation"];
      // Check we can simulate this DS on remote OS
      if (!canSimulateDatasource(target.osType, target.eecType, this.datasourceName)) {
        return [
          "NOTREADY",
          `Datasource ${this.datasourceName} cannot be simulated on ${target.osType}`,
        ];
      } else {
        this.datasourceDir = getDatasourceDir(target.osType, target.eecType, this.datasourceName);
        this.datasourceExe = getDatasourceExe(target.osType, target.eecType, this.datasourceName);
      }
    }

    // At this point, simulator is ready
    return ["READY", ""];
  }

  private getSimulationSpecs(): SimulationSpecs {
    const isPython = this.datasourceName === "python";
    let localOneAgentDsExists: boolean;
    if (isPython) {
      localOneAgentDsExists = true;
    } else {
      try {
        localOneAgentDsExists = existsSync(
          getDatasourcePath(this.localOs, "ONEAGENT", this.datasourceName),
        );
      } catch {
        localOneAgentDsExists = false;
      }
    }
    let localActiveGateDsExists: boolean;
    if (isPython) {
      localActiveGateDsExists = true;
    } else {
      try {
        localActiveGateDsExists = existsSync(
          getDatasourcePath(this.localOs, "ACTIVEGATE", this.datasourceName),
        );
      } catch {
        localActiveGateDsExists = false;
      }
    }
    const dsSupportsActiveGateEec =
      canSimulateDatasource("LINUX", "ACTIVEGATE", this.datasourceName) ||
      canSimulateDatasource("WINDOWS", "ACTIVEGATE", this.datasourceName);
    const dsSupportsOneAgentEec =
      canSimulateDatasource("LINUX", "ONEAGENT", this.datasourceName) ||
      canSimulateDatasource("WINDOWS", "ONEAGENT", this.datasourceName);

    const specs = {
      isPython,
      localOneAgentDsExists,
      localActiveGateDsExists,
      dsSupportsActiveGateEec,
      dsSupportsOneAgentEec,
    };

    logger.debug(
      `Simulator specs are: ${JSON.stringify(specs)}`,
      ...this.logTrace,
      "getSimulationSpecs",
    );

    return specs;
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
    logger.debug(
      `Creating simulator process for command "${command}"`,
      ...this.logTrace,
      "createProcess",
    );
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
      this.refreshUI(true);
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
      this.datasourceName === "python"
        ? `dt-sdk run --activation-config "${this.activationFile}"` +
          (this.currentConfiguration.sendMetrics ? " --local-ingest" : "")
        : `.${path.sep}${this.datasourceExe} --url "${this.url}"  --idtoken "${this.idToken}" ` +
          `--extConfig "file://${this.extensionFile}" --userConfig "file://${this.activationFile}"`;
    const cwd =
      this.datasourceName === "python"
        ? path.resolve(getExtensionWorkspaceDir(), "..")
        : this.datasourceDir;
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/bash";

    // Initial message before starting the process
    this.outputChannel.replace("Starting simulation...\n");
    this.outputChannel.show();
    this.outputChannel.appendLine(`Running command: ${command}\n`);

    const execOptions: SpawnOptions =
      this.datasourceName === "python" ? { cwd, shell, ...this.pyEnvOptions } : { shell, cwd };

    // Create the process
    this.createProcess({ location: "LOCAL" }, command, execOptions);
  }

  /**
   * Starts the simulation on a remote target machine.
   * @param target - remote target
   */
  private async startRemotely(target: RemoteTarget) {
    const fnLogTrace = [...this.logTrace, "startRemotely"];
    this.outputChannel.replace(`Copying required files to remote machine at ${target.address}\n`);
    this.outputChannel.show();

    // Copy the files onto the host
    const scpCommand = `scp -i "${target.privateKey}" "${this.activationFile}" "${this.extensionFile}" "${this.idToken}" ${target.username}@${target.address}:/tmp`;
    logger.debug(
      `Simulator starting remotely. Copying files using command "${scpCommand}"`,
      ...fnLogTrace,
    );
    const scp = spawn(scpCommand, {
      shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    });
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
  public async start(config: SimulationConfig, showUI: boolean = true) {
    const fnLogTrace = [...this.logTrace, "start"];
    logger.info("Starting simulator", ...fnLogTrace);

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
      this.refreshUI(showUI, "RUNNING");
    } catch (err) {
      logger.notify(
        "ERROR",
        `Error starting the simulation ${(err as Error).message}`,
        ...fnLogTrace,
      );
    }
  }

  /**
   * Performs all the necessary cleanup when the simulator is stopped.
   * @param showUI - whether to show the UI after stopping
   */
  public stop(showUI: boolean = true) {
    const fnLogTrace = [...this.logTrace, "stop"];
    logger.info("Stopping simulator", ...fnLogTrace);
    try {
      if (this.simulatorProcess) {
        // Datasource is detached from main process, so we need to kill the entire process tree
        pidtree(this.simulatorProcess.pid, (err, pids) => {
          if (err) {
            logger.notify(
              "ERROR",
              `Error getting all PIDs: ${err.message}. Please ensure all processes are manually stopped.`,
              ...fnLogTrace,
            );
          } else {
            pids.forEach(pid => {
              try {
                process.kill(pid, "SIGKILL");
              } catch (e) {
                logger.notify("ERROR", `Process ${pid} must be stopped manually.`, ...fnLogTrace);
              }
            });
          }
        });
        // Finally, kill our main process
        this.simulatorProcess.kill("SIGKILL");
        this.simulatorProcess = undefined;
      }
    } catch (err) {
      logger.notify(
        "ERROR",
        `Error stopping the simulation ${(err as Error).message}`,
        ...fnLogTrace,
      );
    } finally {
      this.refreshUI(showUI, "READY");
    }
  }

  private refreshUI(
    show: boolean,
    status?: SimulatorStatus,
    statusMessage?: string,
    failedChecks?: string[],
  ) {
    const panelData: SimulatorPanelData = {
      dataType: SIMULATOR_PANEL_DATA_TYPE,
      data: {
        targets: getSimulatorTargets(this.context),
        summaries: getSimulatorSummaries(this.context),
        currentConfiguration: this.currentConfiguration,
        specs: this.simulationSpecs,
        status: status ?? this.simulatorStatus,
        statusMessage,
        failedChecks: failedChecks ?? this.failedChecks,
      },
    };

    logger.debug(
      `Refresh UI with panel data ${JSON.stringify(panelData)}`,
      ...this.logTrace,
      "refreshUI",
    );

    if (show) {
      this.panelManager.render(REGISTERED_PANELS.SIMULATOR_UI, "Extension Simulator", panelData);
    } else {
      this.panelManager.postMessage(REGISTERED_PANELS.SIMULATOR_UI, {
        messageType: "updateData",
        data: panelData,
      });
    }
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
