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
 * UTILITIES FOR EXECUTING COMMANDS AND PROCESSES ON THE HOST MACHINE
 ********************************************************************************/

import { exec, ExecOptions } from "child_process";
import vscode from "vscode";
import logger from "./logging";

const logTrace = ["utils", "subprocesses"];

/**
 * Executes the given command in a child process and wraps the whole thing in a Promise.
 * This way the execution is async but other code can await it.
 * On success, returns the exit code (if any). Will throw any error with the message
 * part of the stderr (the rest is included via output channel)
 * @param command the command to execute
 * @param oc JSON output channel to communicate error details
 * @param cancelToken cancellation token to cancel the process
 * @param envOptions options to pass to the child process
 * @returns exit code or `null`
 */
export function runCommand(
  command: string,
  oc?: vscode.OutputChannel,
  cancelToken?: vscode.CancellationToken,
  envOptions?: ExecOptions,
): Promise<number | null> {
  const fnLogTrace = [...logTrace, "runCommand"];
  logger.debug(`Running command "${command}"`, ...fnLogTrace);

  const p = exec(command, envOptions);
  let [stdout, stderr] = ["", ""];

  return new Promise((resolve, reject) => {
    if (cancelToken) {
      cancelToken.onCancellationRequested(() => {
        logger.warn("Cancellation requested. Killing subprocess", ...fnLogTrace);
        p.kill("SIGINT");
        reject(Error("Operation cancelled."));
      });
    }
    p.stdout?.on("data", (data: Buffer) => (stdout += data.toString()));
    p.stderr?.on("data", (data: Buffer) => (stderr += data.toString()));
    p.on("exit", code => {
      if (cancelToken?.isCancellationRequested) {
        return resolve(1);
      }
      if (code !== 0) {
        let [shortMessage, details] = [stderr, [""]];
        if (stderr.includes("ERROR") && stderr.includes("+")) {
          [shortMessage, ...details] = stderr.substring(stderr.indexOf("ERROR") + 7).split("+");
        }
        const errorDetails = JSON.stringify(
          {
            error: shortMessage.split("\r\n"),
            detailedOutput: `+${details.join("+")}`.split("\r\n"),
          },
          null,
          2,
        );
        logger.error(errorDetails, ...fnLogTrace);
        if (oc) {
          oc.replace(errorDetails);
          oc.show();
        }
        reject(Error(shortMessage));
      }
      logger.debug(stdout, ...fnLogTrace);
      return resolve(code);
    });
  });
}
