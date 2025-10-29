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

import crypto from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import vscode from "vscode";
import { MetricMetadata } from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import { checkWorkspaceOpen, isExtensionsWorkspace } from "../utils/conditionCheckers";
import { getAllMetricKeys, getEntityForMetric } from "../utils/extensionParsing";
import { createUniqueFileName, getExtensionFilePath } from "../utils/fileSystem";
import logger from "../utils/logging";
import { showQuickPick } from "../utils/vscode";

const logTrace = ["commandPalette", "createAlert"];

export const createAlertWorkflow = async () => {
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await createAlert();
  }
};

export async function createAlert() {
  logger.info("Executing Create Alert command", ...logTrace);
  const extensionFile = getExtensionFilePath();
  if (!extensionFile) {
    logger.error("Missing extension file. Command aborted.", ...logTrace);
    return;
  }
  const extensionText = readFileSync(extensionFile).toString();
  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension does not exist in cache. Command aborted.", ...logTrace);
    return;
  }

  // TODO: we could ask the user if they want to create a new alert or edit an existing one?

  // Ask the user to select a metric
  let metricKeys = getAllMetricKeys(extension);
  if (metricKeys.length === 0 && extension.metrics) {
    metricKeys = extension.metrics.map((metric: MetricMetadata) => metric.key);
  }

  if (metricKeys.length === 0) {
    logger.notify(
      "WARN",
      "No metrics defined in extension.yaml, please define them before creating alerts",
      ...logTrace,
    );
    return;
  }

  const metricToUse = await showQuickPick(metricKeys, {
    placeHolder: "Choose a metric",
    title: "Extension workspace: Create Alert",
    ignoreFocusOut: true,
  });
  if (!metricToUse) {
    logger.notify("ERROR", "No metric was selected. Operation cancelled.", ...logTrace);
    return;
  }

  // Ask the user to input the alert name
  const alertName = await vscode.window.showInputBox({
    placeHolder: `Alert name for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
    ignoreFocusOut: true,
  });
  if (!alertName) {
    logger.notify("ERROR", "No alert name was entered. Operation cancelled.", ...logTrace);
    return;
  }

  // Ask the user if the condition is ABOVE or BELOW
  const alertCondition = await showQuickPick(["ABOVE", "BELOW"], {
    placeHolder: `Alert condition for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
    ignoreFocusOut: true,
  });
  if (!alertCondition) {
    logger.notify("ERROR", "No alert condition was selected. Operation cancelled.", ...logTrace);
    return;
  }

  // Ask the user to input the threshold
  const threshold = await vscode.window.showInputBox({
    placeHolder: `Threshold for ${metricToUse} when ${alertCondition}`,
    title: "Extension workspace: Create Alert",
    ignoreFocusOut: true,
  });

  if (!threshold || isNaN(Number(threshold))) {
    logger.notify("ERROR", "No valid threshold was entered. Operation cancelled.", ...logTrace);
    return;
  }

  let primaryEntityType = getEntityForMetric(metricToUse, extension);
  if (!primaryEntityType) {
    primaryEntityType =
      (await vscode.window.showInputBox({
        placeHolder: "What entity type should the alert be triggered on?",
        title: "Extension workspace: Create Alert",
        ignoreFocusOut: true,
        validateInput: value => {
          if (value.startsWith("dt.")) {
            return "Don't add any prefix to the entity type";
          }
          return null;
        },
      })) ?? undefined;
  }
  if (primaryEntityType) {
    primaryEntityType = `dt.entity.${primaryEntityType}`;
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
    metricId: metricToUse,
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
    primaryDimensionKey: primaryEntityType,
    alertCondition: alertCondition,
    samples: 5,
    violatingSamples: 3,
    dealertingSamples: 5,
    threshold: numberThreshold,
    eventType: "CUSTOM_ALERT",
  };

  const alertFile = path.resolve(alertsDir, fileName);
  const alertFileContent = JSON.stringify(alertTemplate, null, 2);
  logger.info(`Creating alert file ${alertFile}`, ...logTrace);
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

  logger.notify("INFO", `Alert '${alertName}' created on alerts/${fileName}`, ...logTrace);
}
