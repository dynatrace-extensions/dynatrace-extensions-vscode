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

import { existsSync, mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { ExtensionStub, DocumentDashboard } from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import { checkWorkspaceOpen, isExtensionsWorkspace } from "../utils/conditionCheckers";
import { getExtensionFilePath } from "../utils/fileSystem";
import * as logger from "../utils/logging";
import { EXTENSION_TEMPLATE } from "./extension_template";

export const createGen3DashboardWorkflow = async () => {
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await createGen3OverviewDashboard();
  }
};

/**
 * Parses the extension yaml, collects relevant data, and populates a series of JSON templates
 * that together form an overview dashboard.
 * @param extension extension.yaml serialized as object
 * @param title dashboard title
 * @param short optional prefix/technology for the extension/dashboard
 * @returns JSON string representing the dashboard
 */
function buildDashboard(
  extension: ExtensionStub,
  title: string,
  _short: string = "Extension",
): string {
  return EXTENSION_TEMPLATE();
}

function getUpdatedExtensionString(
  extension: ExtensionStub,
  newDashboard: DocumentDashboard,
): string {
  if (!extension.documents) {
    extension.documents = { dashboards: [] };
  } else if (!extension.documents.dashboards) {
    extension.documents.dashboards = [];
  }

  const dashboards = extension.documents.dashboards as DocumentDashboard[];

  const existingDashboard = dashboards.find(
    (dashboard: DocumentDashboard) => dashboard.path === newDashboard.path,
  );

  if (existingDashboard) {
    existingDashboard.displayName = newDashboard.displayName;
  } else {
    dashboards.push(newDashboard);
  }

  return yaml.stringify(extension);
}

/**
 * Workflow for creating an overview dashboard based on the content of the extension.yaml.
 * The extension should have topology defined otherwise the dashboard doesn't have much
 * data to render and is pointless. The extension yaml is adapted to include the newly
 * created dashboard. At the end, the user is prompted to upload the dashboard to Dynatrace
 * @returns
 */
export async function createGen3OverviewDashboard() {
  const fnLogTrace = ["commandPalette", "createGen3Dashboard", "createGen3OverviewDashboard"];
  logger.info("Executing Create Dashboard command", ...fnLogTrace);

  const extensionFile = getExtensionFilePath();
  if (!extensionFile) {
    logger.error("Couldn't get extension.yaml file");
    return;
  }

  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension does not exist in cache. Command aborted.", ...fnLogTrace);
    return;
  }

  const defaultTitle = `Extension Overview (${extension.name}:${extension.version})`;
  const userTitle = await vscode.window.showInputBox({
    title: "Dashboard title",
    value: defaultTitle,
    ignoreFocusOut: true,
  });

  const dashboardTitle = userTitle ?? defaultTitle;
  const dashboardJson = buildDashboard(extension, dashboardTitle);

  // Create directories and json file for dashboard
  const documentsDirName = "documents";
  const overviewDashboardName = "overview.dashboard.json";
  const extensionDir = path.resolve(extensionFile, "..");
  const documentsDir = path.resolve(extensionDir, documentsDirName);
  if (!existsSync(documentsDir)) {
    mkdirSync(documentsDir);
  }

  const dashboardFile = path.resolve(documentsDir, overviewDashboardName);
  writeFileSync(dashboardFile, dashboardJson);

  // Edit extension.yaml to include the new dashboard
  const dashboardPath = `${documentsDirName}/${overviewDashboardName}`;
  const newDashboardYaml: DocumentDashboard = {
    displayName: dashboardTitle,
    path: dashboardPath,
  };

  // NOTE THIS WORKS, but updates and reformats all of the existing yaml. TODO clean this up
  const updatedExtensionText = getUpdatedExtensionString(extension, newDashboardYaml);
  writeFileSync(extensionFile, updatedExtensionText);

  logger.notify("INFO", "Dashboard created successfully", ...fnLogTrace);
}
