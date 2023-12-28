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

/********************************************************************************
 * UTILITIES FOR INTERACTING WITH OTHER VS CODE EXTENSIONS
 ********************************************************************************/

import { ExecOptions } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { ProposedExtensionAPI } from "../interfaces/python";

/**
 * Gets the path to the active/selected Python interpreter.
 * This is taken from the Python extension for VS Code.
 * @returns the path as a string
 */
export async function getPythonPath(): Promise<string> {
  let pythonPath = "python";

  const extension = vscode.extensions.getExtension<ProposedExtensionAPI>("ms-python.python");
  if (!extension?.isActive) {
    await extension?.activate();
  }
  const activeEnvironment = extension?.exports.environments.getActiveEnvironmentPath();
  pythonPath = activeEnvironment?.path ?? pythonPath;

  return pythonPath;
}

/**
 * Sets the Path and Virtual Environment for Python process executions.
 * Returns the result as {@link ExecOptions} that can be passed to child processes.
 * @returns virtual environment exec options
 */
export async function getPythonVenvOpts(): Promise<ExecOptions> {
  const pythonPath = await getPythonPath();
  const env: Record<string, string> = process.env;

  if (pythonPath !== "python" && process.env.PATH) {
    // add the python bin directory to the PATH
    env.PATH = `${path.resolve(pythonPath, "..")}${path.delimiter}${process.env.PATH}`;
    // virtual env is right above bin directory
    env.VIRTUAL_ENV = path.resolve(pythonPath, "..", "..");
  }

  return { env };
}
