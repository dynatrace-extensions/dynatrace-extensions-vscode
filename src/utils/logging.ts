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
import { getActivationContext } from "../extension";
import { removeOldestFiles } from "./fileSystem";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";
type NotificationLevel = Extract<LogLevel, "INFO" | "WARN" | "ERROR">;
const CHALK_FORMATS: Record<LogLevel, string> = {
  DEBUG: chalk.white("[DEBUG]"),
  INFO: chalk.green("[INFO]"),
  WARN: chalk.yellow("[WARN]"),
  ERROR: chalk.red("[ERROR]"),
  NONE: "",
};

/**
 * Disposes of all the output channels created so that VSCode can free up resources.
 */
export const disposeOutputChannels = () => {
  getGenericChannel().dispose();
  getFastModeChannel().dispose();
  getLogChannel().dispose();
};

/**
 * Provides access to a JSON-formatted output channel called "Dynatrace".
 */
export const getGenericChannel = (() => {
  let genericChannel: vscode.OutputChannel | undefined;

  return () => {
    genericChannel =
      genericChannel === undefined
        ? vscode.window.createOutputChannel("Dynatrace", "json")
        : genericChannel;
    return genericChannel;
  };
})();

/**
 * Provides access to a JSON-formatted output channel called "Dynatrace Fast Mode".
 */
export const getFastModeChannel = (() => {
  let fastModeChannel: vscode.OutputChannel | undefined;

  return () => {
    fastModeChannel =
      fastModeChannel === undefined
        ? vscode.window.createOutputChannel("Dynatrace Fast Mode", "json")
        : fastModeChannel;
    return fastModeChannel;
  };
})();

/**
 * Provides access to a log-formatted output channel called "Dynatrace Log".
 */
const getLogChannel = (() => {
  let logChannel: vscode.OutputChannel | undefined;

  return () => {
    logChannel =
      logChannel === undefined
        ? vscode.window.createOutputChannel("Dynatrace Log", "log")
        : logChannel;
    return logChannel;
  };
})();

/**
 * Sends a notitification at the specified level to the UI. It also logs the message internally.
 * @param level level of the notification
 * @param message message of the notification
 * @param trace any trace breadcrumbs for internal logging
 */
export const notify = (level: NotificationLevel, message: string, ...trace: string[]) => {
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
};

/**
 * Log a message with ERROR level. This will always be logged.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export const error = (data: unknown, ...trace: string[]) => {
  logMessage(data, "ERROR", ...trace);
};

/**
 * Log a message with WARN level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export const warn = (data: unknown, ...trace: string[]) => {
  logMessage(data, "WARN", ...trace);
};

/**
 * Log a message with INFO level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export const info = (data: unknown, ...trace: string[]) => {
  logMessage(data, "INFO", ...trace);
};

/**
 * Log a message with DEBUG level.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export const debug = (data: unknown, ...trace: string[]) => {
  logMessage(data, "DEBUG", ...trace);
};

/**
 * Log a message without a level. These messages are only logged to
 * the editor's developer tools console.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 */
export const log = (data: unknown, ...trace: string[]) => {
  logMessage(data, "NONE", ...trace);
};

/**
 * Logs a message at the appropriate level with the given trace breadcrumbs.
 * Messages without a level are only logged to the developer tools console. Other levels
 * are also logged to the output channel and a log file in global storage.
 * @param data the data to log; objects will be JSON stringified
 * @param trace any trace breadcrumbs for internal logging
 * @param level the log level
 */
const logMessage = (data: unknown, level: LogLevel, ...trace: string[]) => {
  const logLevel = getConfiguredLogLevel();
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
      getLogChannel().appendLine(formattedMessage);
    }
  }

  // File log will always capture all messages
  writeFileSync(getCurrentLogFile(), `${formattedMessage}\n`, { flag: "a" });
};

const getConfiguredLogLevel = (() => {
  let logLevel: LogLevel | undefined;

  return () => {
    logLevel =
      logLevel === undefined
        ? vscode.workspace
            .getConfiguration("dynatraceExtensions.logging", null)
            .get<LogLevel>("level") ?? "INFO"
        : logLevel;
    return logLevel;
  };
})();

/**
 * Logs a message to the developer tools console. The message is formatted with colors by
 * using chalk. All messages have an easily recognizable '[Dynatrace]' prefix.
 * @param timestamp the timestamp of the log message
 * @param data the data to log
 * @param scope the scope (trace breadcrumbs) of the log message
 * @param level the log level
 */
const logToConsole = (timestamp: string, data: string, scope: string, level: LogLevel) => {
  const fmtPrefix = chalk.black.bgCyan("[Dynatrace]");
  const fmtTimestamp = chalk.cyan(timestamp);
  const fmtLevel = CHALK_FORMATS[level];

  // During development, we can automatically build the trace
  const fmtScope = chalk.magentaBright(
    `[${process.env.DEVELOPMENT ? extractScope(new Error().stack ?? "") : scope}]`,
  );

  console.log(
    `${fmtTimestamp} ${fmtPrefix}${fmtLevel}${fmtScope} ` +
      (level === "DEBUG" ? `${chalk.gray(data)}\n` : `${data}`),
  );
};

/**
 * Extracts the log scope (trace breadcrumbs) from the stack trace.
 * NOTE: This only works in development mode.
 * @param stack the stack trace
 */
const extractScope = (stack: string) => {
  return (
    stack
      .split("\n")
      .map(l => {
        if (l.includes(path.resolve(__dirname, "..", ".."))) {
          const match = l.match(/at (.*?) \(/);
          return match ? match[1] : "";
        }
        return "";
      })
      .filter(l => l !== "")
      .slice(3)
      .reverse()
      .join(" > ") || "vscode-api"
  );
};

const getCurrentLogFile = (() => {
  let currentLogFile: string | undefined;

  return () => {
    if (
      currentLogFile === undefined ||
      statSync(currentLogFile).size / (1024 * 1024) > getConfiguredMaxFileSize()
    ) {
      const context = getActivationContext();
      const logsDir = context.logUri.fsPath;
      const workspaceName = vscode.workspace.workspaceFolders?.[0].name ?? "no-workspace";
      const fileName = `${workspaceName}_${new Date()
        .toISOString()
        .replace("T", "_")
        .replace(/:/g, "-")}_log.log`;
      currentLogFile = path.join(logsDir, fileName);
      writeFileSync(currentLogFile, "");
      cleanUpLogFiles();
    }
    return currentLogFile;
  };
})();

const getConfiguredMaxFileSize = (() => {
  let maxFileSize: number | undefined;

  return () => {
    maxFileSize =
      maxFileSize === undefined
        ? vscode.workspace
            .getConfiguration("dynatraceExtensions.logging", null)
            .get<number>("maxFileSize") ?? 10
        : maxFileSize;
    return maxFileSize;
  };
})();

/**
 * Cleans up old log files.
 */
export const cleanUpLogFiles = () => {
  const context = getActivationContext();
  removeOldestFiles(context.logUri.fsPath, getConfiguredMaxFiles());
};

const getConfiguredMaxFiles = (() => {
  let maxFiles: number | undefined;

  return () => {
    maxFiles =
      maxFiles === undefined
        ? vscode.workspace
            .getConfiguration("dynatraceExtensions.logging", null)
            .get<number>("maxFiles") ?? 10
        : maxFiles;
    return maxFiles;
  };
})();
