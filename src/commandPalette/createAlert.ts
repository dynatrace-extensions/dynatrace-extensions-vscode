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
import * as crypto from "crypto";
import { getExtensionFilePath } from "../utils/fileSystem";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path = require("path");
import { getAllMetricKeysFromDataSource } from "../utils/extensionParsing";
import { CachedDataProvider } from "../utils/dataCaching";
import { MetricMetadata } from "../interfaces/extensionMeta";

export async function createAlert(cachedData: CachedDataProvider) {
  const extensionFile = getExtensionFilePath()!;
  const extensionText = readFileSync(extensionFile).toString();
  const extension = cachedData.getExtensionYaml(extensionText);

  // TODO, we could ask the user if they want to create a new alert or edit an existing one?

  // Ask the user to select a metric
  let metricKeys = getAllMetricKeysFromDataSource(extension);
  if (metricKeys.length === 0 && extension.metrics) {
    metricKeys = extension.metrics.map((metric: MetricMetadata) => metric.key);
  }

  if (metricKeys.length === 0) {
    vscode.window.showWarningMessage(
      "No metrics defined in extension.yaml, please define them before creating alerts",
    );
    return;
  }

  const metricToUse = await vscode.window.showQuickPick(metricKeys, {
    placeHolder: "Choose a metric",
    title: "Extension workspace: Create Alert",
  });
  if (!metricToUse) {
    vscode.window.showErrorMessage("No metric was selected. Operation cancelled.");
    return;
  }

  // Ask the user to input the alert name
  const alertName = await vscode.window.showInputBox({
    placeHolder: `Alert name for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertName) {
    vscode.window.showErrorMessage("No alert name was entered. Operation cancelled.");
    return;
  }

  // Ask the user if the condition is ABOVE or BELOW
  const alertCondition = await vscode.window.showQuickPick(["ABOVE", "BELOW"], {
    placeHolder: `Alert condition for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertCondition) {
    vscode.window.showErrorMessage("No alert condition was selected. Operation cancelled.");
    return;
  }

  // Ask the user to input the threshold
  const threshold = await vscode.window.showInputBox({
    placeHolder: `Threshold for ${metricToUse} when ${alertCondition}`,
    title: "Extension workspace: Create Alert",
  });

  if (!threshold || isNaN(Number(threshold))) {
    vscode.window.showErrorMessage("No valid threshold was entered. Operation cancelled.");
    return;
  }

  // Convert threshold to a number
  const numberThreshold = Number(threshold);

  // Create directories for alerts if they don't exist
  const extensionDir = path.resolve(extensionFile, "..");
  const alertsDir = path.resolve(extensionDir, "alerts");
  if (!existsSync(alertsDir)) {
    mkdirSync(alertsDir);
  }

  const fileName = createUniqueAlertFileName(alertsDir, alertName);

  const alertTemplate = {
    id: crypto.randomUUID(),
    metricSelector: metricToUse,
    name: alertName,
    description: "The {metricname} value was {alert_condition} normal behavior. Dimensions: {dims}",
    enabled: true,
    monitoringStrategy: {
      type: "STATIC_THRESHOLD",
      violatingSamples: 3,
      samples: 5,
      dealertingSamples: 5,
      alertCondition: alertCondition,
      alertingOnMissingData: false,
      threshold: numberThreshold,
    },
    alertCondition: alertCondition,
    samples: 5,
    violatingSamples: 3,
    dealertingSamples: 5,
    threshold: numberThreshold,
    eventType: "CUSTOM_ALERT",
  };

  const alertFile = path.resolve(alertsDir, fileName);
  const alertFileContent = JSON.stringify(alertTemplate, null, 2);
  console.log(`Creating alert file ${alertFile}`);
  writeFileSync(alertFile, alertFileContent);

  // Add the alert to the extension.yaml file
  const alertsMatch = extensionText.search(/^alerts:$/gm);
  let updatedExtensionText;
  if (alertsMatch > -1) {
    if (!extensionText.includes(`path: alerts/${fileName}`)) {
      const indent = extensionText.slice(alertsMatch).indexOf("-") - 8;
      const beforeText = extensionText.slice(0, alertsMatch);
      const afterText = extensionText.slice(alertsMatch + 8);
      updatedExtensionText = `${beforeText}alerts:\n${" ".repeat(
        indent,
      )}- path: alerts/${fileName}\n${afterText}`;
    } else {
      // Nothing to do, alert is already present
      updatedExtensionText = extensionText;
    }
  } else {
    updatedExtensionText = `${extensionText}\nalerts:\n  - path: alerts/${fileName}\n`;
  }

  writeFileSync(extensionFile, updatedExtensionText);

  vscode.window.showInformationMessage(`Alert '${alertName}' created on alerts/${fileName}`);
}

function createUniqueAlertFileName(alertsDir: string, alertName: string): string {
  // Count how many files we have inside the alerts directory with readDirSync
  let currentAlertFiles = readdirSync(alertsDir);
  let currentFileNumber = currentAlertFiles.length;

  while (true) {
    currentFileNumber++;
    const alertNameForFile = createValidFileName(alertName);

    // Pad the number with zeros so the lenght is always 3
    const paddedFileNumber = currentFileNumber.toString().padStart(3, "0");
    const fileName = `alert-${paddedFileNumber}-${alertNameForFile}.json`;

    // Check if the file name is unique, otherwise we increment the counter and try again
    if (!currentAlertFiles.includes(fileName)) {
      return fileName;
    }
  }
}

export function createValidFileName(name: string) {
  // Convert name to lowerCase, only allow \w and - characters
  // It must follow the pattern [a-zA-Z0-9]+([-_./][a-zA-Z0-9]+)*
  const nameForFile = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Only allow a-z, 0-9 and -
    .replace(/-+/g, "-") // Replace multiple '-' with a single '-'
    .replace(/^-+|-+$/g, ""); // Remove leading and trailing '-'

  return nameForFile;
}
