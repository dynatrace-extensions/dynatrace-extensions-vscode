/**
  Copyright 2025 Dynatrace LLC

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
import { getCachedParsedExtension } from "../utils/caching";
import logger from "../utils/logging";
import {
  convertTopologyToOpenPipeline,
  writePipelineToFile,
  writePipelineSourceToFile,
  updateExtensionYaml,
} from "./convertTopology";
import { vscodeInputCallback } from "./convertTopologyCallbacks";

/**
 * Workflow that creates a Smartscape topology configuration from the extension's
 * topology section by converting it to OpenPipeline format.
 * This is the VSCode-specific entry point that uses interactive prompts.
 */
export async function createSmartscapeTopologyWorkflow() {
  const logTrace = ["commandPalette", "createSmartscapeTopologyWorkflow"];
  logger.info("Creating Smartscape topology configuration", ...logTrace);

  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension does not exist in cache. Command aborted.", ...logTrace);
    return;
  }

  try {
    const { pipelineExtensionYaml, pipelineDocs } = await convertTopologyToOpenPipeline(
      extension,
      vscodeInputCallback,
    );

    const files: string[] = [];

    // Write metrics pipeline and source if present
    if (pipelineDocs.metricPipeline) {
      writePipelineToFile(pipelineDocs.metricPipeline, "metrics");
      writePipelineSourceToFile(extension, "metrics");
      files.push("metric.pipeline.json", "metric.source.json");
    }

    // Write logs pipeline and source if present
    if (pipelineDocs.logPipeline) {
      writePipelineToFile(pipelineDocs.logPipeline, "logs");
      writePipelineSourceToFile(extension, "logs");
      files.push("log.pipeline.json", "log.source.json");
    }

    updateExtensionYaml(pipelineExtensionYaml);
    logger.info("Smartscape topology configuration created successfully", ...logTrace);

    const message =
      files.length > 0
        ? `Smartscape topology pipelines created: ${files.join(", ")}`
        : "No topology processors created";

    void vscode.window.showInformationMessage(message);
  } catch (error) {
    logger.error(`Failed to create Smartscape topology: ${(error as Error).message}`, ...logTrace);
  }
}
