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

import { statSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { cleanUpLogs } from "./fileSystem";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export class Logger {
  private static logLevel: LogLevel = "INFO";
  private static currentLogFile: string;
  private static outputChannel: vscode.OutputChannel;
  private static context: vscode.ExtensionContext;
  private readonly scope: string;

  constructor(scope: string) {
    this.scope = scope;
  }

  private static checkFileSize() {
    // If the file is larger than 10MB, start a new log file
    const size = statSync(Logger.currentLogFile).size / (1024 * 1024);
    if (size > 10) {
      Logger.startNewLogFile();
    }
  }

  private static startNewLogFile() {
    const logsDir = path.join(Logger.context.globalStorageUri.fsPath, "logs");
    Logger.currentLogFile = path.join(
      logsDir,
      `${new Date().toISOString().replace(/:/g, "_")}.log`,
    );
    writeFileSync(Logger.currentLogFile, "");
  }

  private logToConsole(message: string, level: LogLevel) {
    switch (level) {
      case "DEBUG":
        console.debug(message);
        break;
      case "INFO":
        console.info(message);
        break;
      case "WARN":
        console.warn(message);
        break;
      case "ERROR":
        console.error(message);
        break;
      case "NONE":
        console.log(message);
        break;
    }
  }

  private logMessage(message: unknown, level: LogLevel) {
    const data = typeof message === "string" ? message : JSON.stringify(message, null, 2);
    const timestamp = new Date().toISOString();
    const formattedMessage =
      level === "NONE"
        ? `${timestamp} [${this.scope}] ${data}`
        : `${timestamp} [${level}][${this.scope}] ${data}`;

    this.logToConsole(formattedMessage, level);
    Logger.outputChannel.appendLine(formattedMessage);
    writeFileSync(Logger.currentLogFile, `${formattedMessage}\n`, { flag: "a" });
    Logger.checkFileSize();
  }

  public static initialize(context: vscode.ExtensionContext) {
    Logger.context = context;
    Logger.outputChannel = vscode.window.createOutputChannel("Dynatrace Log", "log");
    Logger.startNewLogFile();
  }

  public static dispose() {
    Logger.outputChannel.dispose();
    cleanUpLogs(path.join(Logger.context.globalStorageUri.fsPath, "logs"), 10);
  }

  public setLogLevel(logLevel: LogLevel) {
    Logger.logLevel = logLevel;
  }

  public log(message: unknown) {
    this.logMessage(message, "NONE");
  }

  public debug(message: unknown) {
    if (["INFO", "WARN", "ERROR"].includes(Logger.logLevel)) return;
    this.logMessage(message, "DEBUG");
  }

  public info(message: unknown) {
    if (["WARN", "ERROR"].includes(Logger.logLevel)) return;
    this.logMessage(message, "INFO");
  }

  public warn(message: unknown) {
    if (Logger.logLevel === "ERROR") return;
    this.logMessage(message, "WARN");
  }

  public error(message: unknown) {
    this.logMessage(message, "ERROR");
  }
}
