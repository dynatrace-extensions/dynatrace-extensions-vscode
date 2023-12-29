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

import * as vscode from "vscode";
import { SimulatorManager } from "../statusBar/simulator";

const START_COMMAND = "dynatraceExtensions.simulator.codelens.start";
const STOP_COMMAND = "dynatraceExtensions.simulator.codelens.stop";
const REFRESH = "dynatraceExtensions.simulator.codelens.refresh";

/**
 * Simple implementation of a Code Lens Provider to allow starting and stopping the simulator from the editor
 * without having to visit the Simulator UI. This action will use the last known configuration or the defaults.
 */
export class SimulatorLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private simulator: SimulatorManager;
  private lastKnownStatus: string;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  /**
   * @param simulator - instance of {@link SimulatorManager} to control the simulator
   */
  constructor(simulator: SimulatorManager) {
    this.simulator = simulator;
    this.codeLenses = [];
    this.lastKnownStatus = "UNKNOWN";

    // Start the simulator and update the last known status
    vscode.commands.registerCommand(START_COMMAND, () => {
      this.simulator.start(this.simulator.currentConfiguration, false).then(
        () => {
          this.lastKnownStatus = "RUNNING";
          this._onDidChangeCodeLenses.fire();
        },
        err => console.log(err),
      );
    });
    // Stop the simulator and update the last known status
    vscode.commands.registerCommand(STOP_COMMAND, () => {
      this.simulator.stop(false);
      this.lastKnownStatus = "READY";
      this._onDidChangeCodeLenses.fire();
    });
    // Reset the last known status and refresh the lenses
    vscode.commands.registerCommand(REFRESH, () => {
      this.lastKnownStatus = "UNKNOWN";
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
      if (this.lastKnownStatus === "UNKNOWN") {
        const readyCheck = this.simulator.checkMantatoryRequirements();
        if (readyCheck[0]) {
          this.lastKnownStatus = "READY";
          const configCheck = await this.simulator.checkSimulationConfig(
            this.simulator.currentConfiguration.location,
            this.simulator.currentConfiguration.eecType,
            this.simulator.currentConfiguration.target,
          );
          this.lastKnownStatus = configCheck[0];
        } else {
          this.lastKnownStatus = "NOTREADY";
        }
      }
      // If the simulator is ready, we can display this code lens
      if (this.lastKnownStatus === "READY") {
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "▶️ Simulate extension",
            tooltip: "Start a simulation based on your last known settings or the defaults.",
            command: START_COMMAND,
          }),
        );
      } else if (this.lastKnownStatus === "RUNNING") {
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
