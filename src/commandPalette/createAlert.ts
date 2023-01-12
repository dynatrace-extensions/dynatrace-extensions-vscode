import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import * as vscode from "vscode";
import * as yaml from "yaml";
import * as crypto from "crypto";
import { getExtensionFilePath } from "../utils/fileSystem";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path = require("path");

export async function createAlert(context: vscode.ExtensionContext) {
  const extensionFile = getExtensionFilePath(context)!;
  const extension: ExtensionStub = yaml.parse(
    readFileSync(extensionFile).toString()
  );

  if (!extension.metrics) {
    vscode.window.showWarningMessage(
      "No metrics defined in extension.yaml, please define them before creating alerts"
    );
    return;
  }

  // TODO, we could ask the user if they want to create a new alert or edit an existing one?

  // Ask the user to select metric
  const metricKeys = extension.metrics.map((metric) => metric.key);
  const metricToUse = await vscode.window.showQuickPick(metricKeys, {
    placeHolder: "Choose a metric",
    title: "Extension workspace: Create Alert",
  });
  if (!metricToUse) {
    vscode.window.showErrorMessage(
      "No metric was selected. Operation cancelled."
    );
    return;
  }

  // Ask the user to input the alert name
  const alertName = await vscode.window.showInputBox({
    placeHolder: `Alert name for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertName) {
    vscode.window.showErrorMessage(
      "No alert name was entered. Operation cancelled."
    );
    return;
  }

  // Ask the user if the condition is ABOVE or BELOW
  const alertCondition = await vscode.window.showQuickPick(["ABOVE", "BELOW"], {
    placeHolder: `Alert condition for ${metricToUse}`,
    title: "Extension workspace: Create Alert",
  });
  if (!alertCondition) {
    vscode.window.showErrorMessage(
      "No alert condition was selected. Operation cancelled."
    );
    return;
  }

  // Ask the user to input the threshold
  const threshold = await vscode.window.showInputBox({
    placeHolder: `Threshold for ${metricToUse} when ${alertCondition}`,
    title: "Extension workspace: Create Alert",
  });

  if (!threshold || isNaN(Number(threshold))) {
    vscode.window.showErrorMessage(
      "No valid threshold was entered. Operation cancelled."
    );
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

  // Count how many files we have inside the alerts directory with readDirSync
  // The current file number is that number + 1
  const currentFileNumber = readdirSync(alertsDir).length + 1;
  // Pad the number with zeros so the lenght is always 3
  const paddedFileNumber = currentFileNumber.toString().padStart(3, "0");

  // Convert alertName to lowerCase, only allow \w and - characters
  // Make sure we don't have multiple - in a row
  const alertNameForFile = alertName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  
  const fileName = `alert-${paddedFileNumber}-${alertNameForFile}.json`;

  const alertTemplate = {
    id: crypto.randomUUID(),
    metricSelector: metricToUse,
    name: alertName,
    description:
      "The {metricname} value was {alert_condition} normal behavior. Dimensions: {dims}",
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
  if (!extension.alerts) {
    extension.alerts = [];
  }
  extension.alerts.push({
    path: `alerts/${fileName}`,
  });

  writeFileSync(extensionFile, yaml.stringify(extension, { lineWidth: 0 }));

  vscode.window.showInformationMessage(`Alert '${alertName}' created on alerts/${fileName}`);


}
