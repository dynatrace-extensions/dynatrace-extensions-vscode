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

import { writeFileSync } from "fs";
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { showMessage } from "../utils/code";
import { CachedData } from "../utils/dataCaching";
import { extractV1FromRemote, extractv1ExtensionFromLocal } from "./convertJMXExtension";
import { convertPluginJsonToActivationSchema } from "./python/pythonConversion";

// TODO - This is duplicated from the JMX Conversion, we should move it to a shared location
const OPTION_LOCAL_FILE: vscode.QuickPickItem = {
  label: "Locally",
  description: "Browse the local filesystem for a .json or .zip file",
};
const OPTION_DYNATRACE_ENVIRONMENT: vscode.QuickPickItem = {
  label: "Remotely",
  description: "Browse your Dynatrace environment for a Python extension",
};

/**
 * Parses a v1 plugin.json file and produces an equivalent 2.0 activationSchema.json.
 * The file can be loaded either locally or from a connected tenant and supports both direct
 * file parsing as well as zip browsing.
 * @param dataCache An instance of the data cache
 * @param dt Dynatrace Client API
 * @param outputPath optional path where to save the manifest
 */
export async function convertPythonExtension(
  dataCache: CachedData,
  dt?: Dynatrace,
  outputPath?: string,
) {
  // User chooses if they want to use a local file or browse from the Dynatrace environment
  const pluginJSONOrigins = [OPTION_LOCAL_FILE, OPTION_DYNATRACE_ENVIRONMENT];
  const pluginJSONOrigin = await vscode.window.showQuickPick(pluginJSONOrigins, {
    placeHolder: "How would you like to import the Python V1 extension?",
    title: "Convert Python plugin.json",
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (!pluginJSONOrigin) {
    showMessage("warn", "No selection made. Operation cancelled.");
    return;
  }

  const [v1Extension, errorMessage] =
    pluginJSONOrigin.label === OPTION_LOCAL_FILE.label
      ? await extractv1ExtensionFromLocal()
      : await extractV1FromRemote("Python", dt);

  if (errorMessage !== "") {
    showMessage("error", `Operation failed: ${errorMessage}`);
    return;
  }

  // Convert the v1 extension to v2
  try {
    const activationSchema = await convertPluginJsonToActivationSchema(v1Extension);

    // Ask the user where they would like to save the file to
    const options: vscode.SaveDialogOptions = {
      saveLabel: "Save",
      title: "Save Python extension activationSchema.json",
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Python v2 extension activation schema": ["json"],
      },
      defaultUri: vscode.Uri.file("activationSchema.json"),
    };

    const extensionJSONFile =
      outputPath ?? (await vscode.window.showSaveDialog(options).then(p => p?.fsPath));
    if (!extensionJSONFile) {
      showMessage("error", "No file was selected. Operation cancelled.");
      return;
    }
    // Save the file
    const jsonFileContents = JSON.stringify(activationSchema, null, 2);
    writeFileSync(extensionJSONFile, jsonFileContents);

    // Update the cache
    dataCache.updateParsedExtension();

    // Open the file
    const document = await vscode.workspace.openTextDocument(extensionJSONFile);
    await vscode.window.showTextDocument(document);
  } catch (e) {
    showMessage("error", `Operation failed: ${(e as Error).message}`);
    return;
  }
}
