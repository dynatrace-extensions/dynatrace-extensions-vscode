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
 * UTILITIES FOR CODE PATTERNS AND ANY REUSABLE FUNCTIONS
 ********************************************************************************/

import * as vscode from "vscode";
import * as logger from "./logging";

/**
 * Loop-safe function to make use of setTimeout
 */
export async function loopSafeWait(duration: number) {
  await new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * A generalized way of sending simple messages while having a fulfilled/rejected handler.
 * Helps comply with @typescript-eslint/no-floating-promises
 * @param severity info, warn, error
 * @param message message to send in notification
 */
export function showMessage(severity: "info" | "warn" | "error", message: string) {
  const logTrace = ["utils", "code", "showMessage"];
  switch (severity) {
    case "info":
      vscode.window.showInformationMessage(message).then(
        () => {
          logger.info(message, ...logTrace);
        },
        () => {
          logger.error(`Could not create UI notification about "${message}"`, ...logTrace);
        },
      );
      break;
    case "warn":
      vscode.window.showWarningMessage(message).then(
        () => {
          logger.info(message, ...logTrace);
        },
        () => {
          logger.error(`Could not create UI notification about "${message}"`, ...logTrace);
        },
      );
      break;
    case "error":
      vscode.window.showErrorMessage(message).then(
        () => {
          logger.info(message, ...logTrace);
        },
        () => {
          logger.error(`Could not create UI notification about "${message}"`, ...logTrace);
        },
      );
  }
}
