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

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export class Logger {
  private outputChannel = vscode.window.createOutputChannel("DynatraceExtensions Logs", "log");
  private logLevel: LogLevel = "INFO";

  private logMessage(message: unknown, level: LogLevel) {
    const data = typeof message === "string" ? message : JSON.stringify(message, null, 2);
    const timestamp = new Date().toISOString();
    const formattedMessage =
      level === "NONE" ? `[${timestamp}] ${data}` : `[${timestamp}] [${level}] ${data}`;

    this.outputChannel.appendLine(formattedMessage);
  }

  public setLogLevel(logLevel: LogLevel) {
    this.logLevel = logLevel;
  }

  public log(message: unknown) {
    this.logMessage(message, "NONE");
  }

  public debug(message: unknown) {
    if (["INFO", "WARN", "ERROR"].includes(this.logLevel)) return;
    this.logMessage(message, "DEBUG");
  }

  public info(message: unknown) {
    if (["WARN", "ERROR"].includes(this.logLevel)) return;
    this.logMessage(message, "INFO");
  }

  public warn(message: unknown) {
    if (this.logLevel === "ERROR") return;
    this.logMessage(message, "WARN");
  }

  public error(message: unknown) {
    this.logMessage(message, "ERROR");
  }
}
