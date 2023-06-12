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

import * as crypto from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path = require("path");
import * as vscode from "vscode";
import { MetricMetadata } from "../interfaces/extensionMeta";
import { showMessage } from "../utils/code";
import { CachedDataProvider } from "../utils/dataCaching";
import { getAllMetricKeys } from "../utils/extensionParsing";
import { createUniqueFileName, getExtensionFilePath } from "../utils/fileSystem";

export async function createAlert(cachedData: CachedDataProvider) {
  const extensionFile = getExtensionFilePath();
  if (!extensionFile) {
    return;
  }
  const extensionText = readFileSync(extensionFile).toString();
  const extension = cachedData.getExtensionYaml(extensionText);

  // TODO: we could ask the user if they want to create a new alert or edit an existing one?

  // Ask the user to select a metric
  let metricKeys = getAllMetricKeys(extension);
  if (metricKeys.length === 0 && extension.metrics) {
    metricKeys = extension.metrics.map((metric: MetricMetadata) => metric.key);
  }

  if (metricKeys.length === 0) {
    showMessage(
      "warn",
      "No metrics defined in extension.yaml, please define them before creating alerts",
    );
    return;
  }

  const metricToUse = await vscode.window.showQuickPick(metricKeys, {
    placeHolder: "Choose a metric",
    title: "Extension workspace: Create Alert",
  });
  if (!metricToUse) {
    showMessage("error", "No metric was selected. Operation cancelled.");
    return;
  }

  // Ask the user to input the alert name
  const alertName = await vscode.window.showInputBox({
    placeHolder: `Alert name for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertName) {
    showMessage("error", "No alert name was entered. Operation cancelled.");
    return;
  }

  // Ask the user if the condition is ABOVE or BELOW
  const alertCondition = await vscode.window.showQuickPick(["ABOVE", "BELOW"], {
    placeHolder: `Alert condition for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertCondition) {
    showMessage("error", "No alert condition was selected. Operation cancelled.");
    return;
  }

  // Ask the user to input the threshold
  const threshold = await vscode.window.showInputBox({
    placeHolder: `Threshold for ${metricToUse} when ${alertCondition}`,
    title: "Extension workspace: Create Alert",
  });

  if (!threshold || isNaN(Number(threshold))) {
    showMessage("error", "No valid threshold was entered. Operation cancelled.");
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

  const fileName = createUniqueFileName(alertsDir, "alert", alertName);

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

  showMessage("info", `Alert '${alertName}' created on alerts/${fileName}`);
}
