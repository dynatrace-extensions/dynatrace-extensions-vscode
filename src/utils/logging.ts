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
import * as chalk from "chalk";
import * as vscode from "vscode";
import { removeOldestFiles } from "./fileSystem";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";
type NotificationLevel = Extract<LogLevel, "INFO" | "WARN" | "ERROR">;

let initialized = false;
let logLevel: LogLevel = "INFO";
let maxFileSize: number = 10;
let maxFiles: number = 10;
let currentLogFile: string;
let outputChannel: vscode.OutputChannel;
let context: vscode.ExtensionContext;

/**
 * Starts a new log file with the current timestamp.
 */
function startNewLogFile() {
  const logsDir = path.join(context.globalStorageUri.fsPath, "logs");
  const workspaceName = vscode.workspace.workspaceFolders?.[0].name ?? "no-workspace";
  const fileName = `${workspaceName}_${new Date()
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")}_log.log`;
  currentLogFile = path.join(logsDir, fileName);
  writeFileSync(currentLogFile, "");
}

/**
 * Checks the size of the current log file and starts a new one if needed.
 */
function checkFileSize() {
  const size = statSync(currentLogFile).size / (1024 * 1024);
  if (size > maxFileSize) {
    startNewLogFile();
  }
}

/**
 * Extracts the log scope (trace breadcrumbs) from the stack trace.
 * NOTE: This only works in development mode.
 * @param stack the stack trace
 */
function extractScope(stack: string) {
  return stack
    .split("\n")
    .map(l => {
      if (l.includes("dynatrace-extensions-vscode")) {
        const match = l.match(/at (.*?) \(/);
        return match ? match[1] : "";
      }
      return "";
    })
    .filter(l => l !== "")
    .slice(3)
    .reverse()
    .join(" > ");
}

/**
 * Logs a message to the developer tools console. The message is formatted with colors by
 * using chalk. All messages have an easily recognizable '[Dynatrace]' prefix.
 * @param timestamp the timestamp of the log message
 * @param data the data to log
 * @param scope the scope (trace breadcrumbs) of the log message
 * @param level the log level
 */
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

  // During development, we can automatically build the trace
  const fmtScope = chalk.magentaBright(
    `[${process.env.DEVELOPMENT ? extractScope(new Error().stack ?? "") : scope}]`,
  );

  console.log(
    `${fmtTimestamp} ${fmtPrefix}${fmtLevel}${fmtScope} ` +
      (level === "DEBUG" ? `${chalk.gray(data)}\n` : `${data}`),
  );
}

/**
 * Logs a message at the appropriate level with the given trace breadcrumbs.
 * Messages without a level are only logged to the developer tools console. Other levels
 * are also logged to the output channel and a log file in global storage.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 * @param level the log level
 */
function logMessage(data: unknown, level: LogLevel, ...trace: string[]) {
  const message = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString();
  const scope = trace.join(".");
  const formattedMessage = `${timestamp} [${level}][${scope}] ${message}`;

  // Log to console and output channel controlled by settings
  if (
    ["ERROR", "NONE"].includes(level) ||
    (level === "DEBUG" && ["DEBUG", "NONE"].includes(logLevel)) ||
    (level === "INFO" && ["INFO", "DEBUG", "NONE"].includes(logLevel)) ||
    (level === "WARN" && logLevel !== "ERROR")
  ) {
    logToConsole(timestamp, message, scope, level);
    if (level !== "NONE") {
      outputChannel.appendLine(formattedMessage);
    }
  }

  // File log will always capture all messages
  writeFileSync(currentLogFile, `${formattedMessage}\n`, { flag: "a" });
  checkFileSize();
}

/**
 * Initializes the logging system. This must be called before any other logging statements.
 * It creates the output channel and starts a new log file.
 * @param ctx the extension context
 */
export function initializeLogging(ctx: vscode.ExtensionContext) {
  if (initialized) return;
  context = ctx;

  // Load the configuration
  const config = vscode.workspace.getConfiguration("dynatraceExtensions.logging", null);
  logLevel = config.get<LogLevel>("level") ?? "INFO";
  maxFileSize = config.get<number>("maxFileSize") ?? 10;
  maxFiles = config.get<number>("maxFiles") ?? 10;

  // Create the output channel, start a new log file, and remove old logs
  outputChannel = vscode.window.createOutputChannel("Dynatrace Log", "log");
  startNewLogFile();
  removeOldestFiles(path.join(context.globalStorageUri.fsPath, "logs"), maxFiles);
  initialized = true;
}

/**
 * Disposes the output channel and cleans up old log files.
 */
export function disposeLogger() {
  outputChannel.dispose();
  removeOldestFiles(path.join(context.globalStorageUri.fsPath, "logs"), maxFiles);
}

/**
 * Log a message without a level. These messages are only logged to
 * the editor's developer tools console.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export function log(data: unknown, ...trace: string[]) {
  logMessage(data, "NONE", ...trace);
}

/**
 * Log a message with DEBUG level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export function debug(data: unknown, ...trace: string[]) {
  logMessage(data, "DEBUG", ...trace);
}

/**
 * Log a message with INFO level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export function info(data: unknown, ...trace: string[]) {
  logMessage(data, "INFO", ...trace);
}

/**
 * Log a message with WARN level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export function warn(data: unknown, ...trace: string[]) {
  logMessage(data, "WARN", ...trace);
}

/**
 * Log a message with ERROR level. This will always be logged.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export function error(data: unknown, ...trace: string[]) {
  logMessage(data, "ERROR", ...trace);
}

/**
 * Sends a notitification at the specified level to the UI. It also logs the message internally.
 * @param level level of the notification
 * @param message message of the notification
 * @param trace any trace breadcrumbs for internal logging
 */
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
