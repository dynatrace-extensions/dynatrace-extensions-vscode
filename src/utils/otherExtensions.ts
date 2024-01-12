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
import * as logger from "./logging";

const logTrace = ["utils", "otherExtensions"];

/**
 * Gets the path to the active/selected Python interpreter.
 * This is taken from the Python extension for VS Code.
 * @returns the path as a string
 */
export async function getPythonPath(): Promise<string> {
  const fnLogTrace = [...logTrace, "getPythonPath"];
  let pythonPath = "python";

  logger.debug("Activating Python extension for VSCode", ...fnLogTrace);
  const extension = vscode.extensions.getExtension<ProposedExtensionAPI>("ms-python.python");
  if (!extension?.isActive) {
    await extension?.activate();
  }
  const activeEnvironment = extension?.exports.environments.getActiveEnvironmentPath();
  pythonPath = activeEnvironment?.path ?? pythonPath;

  logger.debug(`Active python environment path detected as "${pythonPath}"`, ...fnLogTrace);

  return pythonPath;
}

/**
 * Sets the Path and Virtual Environment for Python process executions.
 * Returns the result as {@link ExecOptions} that can be passed to child processes.
 * @returns virtual environment exec options
 */
export async function getPythonVenvOpts(): Promise<ExecOptions> {
  const fnLogTrace = [...logTrace, "getPythonVenvOpts"];
  const pythonPath = await getPythonPath();
  const env = process.env;

  if (pythonPath !== "python" && process.env.PATH) {
    // Python bin directory
    const pythonPathDir = path.resolve(pythonPath, "..");
    logger.debug(`Adding python to PATH using bin directory "${pythonPathDir}"`, ...fnLogTrace);

    // virtual env is right above bin directory
    const pythonVenvPath = path.resolve(pythonPath, "..", "..");
    logger.debug(`Adding python virutal environment as "${pythonVenvPath}"`, ...fnLogTrace);

    env.PATH = `${pythonPathDir}${path.delimiter}${process.env.PATH}`;
    env.VIRTUAL_ENV = pythonVenvPath;
  }

  return { env };
}
