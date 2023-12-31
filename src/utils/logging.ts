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
import chalk from "chalk";
import * as vscode from "vscode";
import { cleanUpLogs } from "./fileSystem";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";
type NotificationLevel = Extract<LogLevel, "INFO" | "WARN" | "ERROR">;

let logLevel: LogLevel = "INFO";
let currentLogFile: string;
let outputChannel: vscode.OutputChannel;
let context: vscode.ExtensionContext;

function startNewLogFile() {
  const logsDir = path.join(context.globalStorageUri.fsPath, "logs");
  currentLogFile = path.join(logsDir, `${new Date().toISOString().replace(/:/g, "_")}.log`);
  writeFileSync(currentLogFile, "");
}

function checkFileSize() {
  // If the file is larger than 10MB, start a new log file
  const size = statSync(currentLogFile).size / (1024 * 1024);
  if (size > 10) {
    startNewLogFile();
  }
}

function logToConsole(timestamp: string, data: string, scope: string, level: LogLevel) {
  const fmtPrefix = chalk.black.bgCyan("[Dynatrace]");
  const fmtTimestamp = chalk.cyan(timestamp);
  const fmtLevel = ((lvl: LogLevel) => {
    switch (lvl) {
      case "DEBUG":
        return chalk.white(`[${lvl}]`);
      case "INFO":
        return chalk.green(`[${lvl}]`);
      case "WARN":
        return chalk.yellow(`[${lvl}]`);
      case "ERROR":
        return chalk.red(`[${lvl}]`);
      case "NONE":
        return "";
    }
  })(level);
  const fmtScope = chalk.magentaBright(`[${scope}]`);
  console.log(
    `${fmtTimestamp} ${fmtPrefix}${fmtLevel}${fmtScope} ` +
      (level === "DEBUG" ? `${chalk.gray(data)}\n` : `${data}`),
  );
}

function logMessage(message: unknown, level: LogLevel, ...trace: string[]) {
  const data = typeof message === "string" ? message : JSON.stringify(message, null, 2);
  const timestamp = new Date().toISOString();
  const scope = trace.join(".");
  const formattedMessage =
    level === "NONE"
      ? `${timestamp} [${scope}] ${data}`
      : `${timestamp} [${level}][${scope}] ${data}`;

  logToConsole(timestamp, data, scope, level);
  outputChannel.appendLine(formattedMessage);
  writeFileSync(currentLogFile, `${formattedMessage}\n`, { flag: "a" });
  checkFileSize();
}

export function initializeLogging(ctx: vscode.ExtensionContext) {
  context = ctx;
  outputChannel = vscode.window.createOutputChannel("Dynatrace Log", "log");
  startNewLogFile();
}

export function disposeLogger() {
  outputChannel.dispose();
  cleanUpLogs(path.join(context.globalStorageUri.fsPath, "logs"), 10);
}

export function setLogLevel(level: LogLevel) {
  logLevel = level;
}

export function log(message: unknown, ...trace: string[]) {
  logMessage(message, "NONE", ...trace);
}

export function debug(message: unknown, ...trace: string[]) {
  if (["INFO", "WARN", "ERROR"].includes(logLevel)) return;
  logMessage(message, "DEBUG", ...trace);
}

export function info(message: unknown, ...trace: string[]) {
  if (["WARN", "ERROR"].includes(logLevel)) return;
  logMessage(message, "INFO", ...trace);
}

export function warn(message: unknown, ...trace: string[]) {
  if (logLevel === "ERROR") return;
  logMessage(message, "WARN", ...trace);
}

export function error(message: unknown, ...trace: string[]) {
  logMessage(message, "ERROR", ...trace);
}

export function notify(level: NotificationLevel, message: string, ...trace: string[]) {
  switch (level) {
    case "INFO":
      vscode.window.showInformationMessage(message).then(
        () => info(message, ...trace),
        () => error("Could not create UI notification", ...trace),
      );
      break;
    case "WARN":
      vscode.window.showWarningMessage(message).then(
        () => warn(message, ...trace),
        () => error("Could not create UI notification", ...trace),
      );
      break;
    case "ERROR":
      vscode.window.showErrorMessage(message).then(
        () => error(message, ...trace),
        () => error("Could not create UI notification", ...trace),
      );
      break;
  }
}
