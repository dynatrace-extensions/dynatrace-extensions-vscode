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

import { SimulatorStatus } from "@common";
import vscode from "vscode";
import { SimulatorManager } from "../statusBar/simulator";
import logger from "../utils/logging";

const START_COMMAND = "dynatraceExtensions.simulator.codelens.start";
const STOP_COMMAND = "dynatraceExtensions.simulator.codelens.stop";
const REFRESH = "dynatraceExtensions.simulator.codelens.refresh";

/**
 * Provides singleton access to the SimulatorLensProvider
 */
export const getSimulatorLensProvider = (() => {
  let instance: SimulatorLensProvider | undefined;

  return (simulator: SimulatorManager) => {
    instance = instance === undefined ? new SimulatorLensProvider(simulator) : instance;
    return instance;
  };
})();

/**
 * Simple implementation of a Code Lens Provider to allow starting and stopping the simulator from the editor
 * without having to visit the Simulator UI. This action will use the last known configuration or the defaults.
 */
class SimulatorLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "simulatorCodeLens", this.constructor.name];
  private codeLenses: vscode.CodeLens[];
  private simulator: SimulatorManager;
  private lastKnownStatus: SimulatorStatus;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  /**
   * @param simulator - instance of {@link SimulatorManager} to control the simulator
   */
  constructor(simulator: SimulatorManager) {
    this.simulator = simulator;
    this.codeLenses = [];
    this.lastKnownStatus = SimulatorStatus.Unknown;

    // Start the simulator and update the last known status
    vscode.commands.registerCommand(START_COMMAND, () => {
      this.simulator.start(this.simulator.currentConfiguration, false).then(
        () => {
          this.lastKnownStatus = SimulatorStatus.Running;
          this._onDidChangeCodeLenses.fire();
        },
        err => logger.error(err, ...this.logTrace),
      );
    });
    // Stop the simulator and update the last known status
    vscode.commands.registerCommand(STOP_COMMAND, () => {
      this.simulator.stop(false);
      this.lastKnownStatus = SimulatorStatus.Ready;
      this._onDidChangeCodeLenses.fire();
    });
    // Reset the last known status and refresh the lenses
    vscode.commands.registerCommand(REFRESH, () => {
      this.lastKnownStatus = SimulatorStatus.Unknown;
      this._onDidChangeCodeLenses.fire();
    });
  }

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    this.codeLenses = [];

    // Find position for the lens
    const regex = new RegExp(`^${this.simulator.datasourceName}:`, "gm");
    const match = regex.exec(document.getText());
    if (match) {
      const line = document.lineAt(document.positionAt(match.index));
      const position = new vscode.Position(line.lineNumber, 0);
      const range = new vscode.Range(position, position);

      // If we don't know the status yet, check if the simulator is ready
      if (this.lastKnownStatus === SimulatorStatus.Unknown) {
        const readyCheck = this.simulator.checkMandatoryRequirements();
        if (readyCheck[0]) {
          this.lastKnownStatus = SimulatorStatus.Ready;
          const configCheck = await this.simulator.checkSimulationConfig(
            this.simulator.currentConfiguration.location,
            this.simulator.currentConfiguration.eecType,
            this.simulator.currentConfiguration.target,
          );
          this.lastKnownStatus = configCheck[0];
        } else {
          this.lastKnownStatus = SimulatorStatus.NotReady;
        }
      }
      // If the simulator is ready, we can display this code lens
      if (this.lastKnownStatus === SimulatorStatus.Ready) {
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "▶️ Simulate extension",
            tooltip: "Start a simulation based on your last known settings or the defaults.",
            command: START_COMMAND,
          }),
        );
      } else if (this.lastKnownStatus === SimulatorStatus.Running) {
        // Otherwise, offer to stop it if it's running
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏹️ Stop simulation",
            tooltip: "Stop the currently running simulation.",
            command: STOP_COMMAND,
          }),
        );
      } else {
        // If it's not ready and not running, let's notify and allow refresh
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "❌ Simulation not possible",
            tooltip: "Please check your simulator configuration and click to try again.",
            command: REFRESH,
          }),
        );
      }
    }

    return this.codeLenses;
  }
}
