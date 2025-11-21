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
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import yaml from "yaml";
import { ExtensionStub, MetricMetadata, TopologyType } from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import { getExtensionFilePath } from "../utils/fileSystem";
import logger from "../utils/logging";

interface OpenPipelineProcessor {
  id: string;
  type: string;
  matcher: string;
  description?: string;
  smartscapeNode: {
    nodeType: string;
    nodeIdFieldName: string;
    idComponents: Array<{
      idComponent: string;
      referencedFieldName: string;
    }>;
    extractNode: boolean;
    nodeName?: {
      type: string;
      value: string;
    };
    fieldsToExtract?: Array<{
      fieldName: string;
      referencedFieldName: string;
    }>;
  };
}

// Fields that are not allowed to be extracted in OpenPipeline
const BLOCKED_FIELDS = ["dt.security_context"];

/**
 * Workflow that creates a Smartscape topology configuration from the extension's
 * topology section by converting it to OpenPipeline format.
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
    const pipeline = await convertTopologyToOpenPipeline(extension);
    writePipelineToFile(pipeline);
    writeMetricSourceToFile(extension);
    updateExtensionYaml(extension);
    logger.info("Smartscape topology configuration created successfully", ...logTrace);
    void vscode.window.showInformationMessage(
      "Smartscape topology pipeline created at extension/openpipeline/metric.pipeline.json",
    );
  } catch (error) {
    logger.error(`Failed to create Smartscape topology: ${(error as Error).message}`, ...logTrace);
  }
}

/**
 * Converts the topology section of the extension.yaml into the equivalent
 * OpenPipeline pipelines and sources definition
 * @param extension extension.yaml serialized as object
 */
export const convertTopologyToOpenPipeline = async (extension: ExtensionStub) => {
  if (!extension.topology) {
    throw Error("Extension does not have a topology section.");
  }

  const processors: OpenPipelineProcessor[] = [];

  // Convert topology types to smartscape node processors
  if (extension.topology.types) {
    const typeProcessors = await convertTopologyTypes(extension.topology.types, extension.metrics);
    processors.push(...typeProcessors);
  }

  // TODO: Convert topology relationships to smartscape edge processors
  // if (extension.topology.relationships) {
  //   const edgeProcessors = await convertTopologyRelationships(extension.topology.relationships);
  //   processors.push(...edgeProcessors);
  // }

  // Create the OpenPipeline configuration
  const pipeline = {
    customId: extension.name,
    displayName: `${extension.name} - Smartscape Topology`,
    smartscapeNodeExtraction: {
      processors,
    },
  };

  logger.info(`Created pipeline with ${processors.length} processors`);
  return pipeline;
};

/**
 * Converts topology types to OpenPipeline smartscape node processors
 * @param types - Array of topology types from extension.yaml
 * @param metrics - Optional array of metrics for finding matching metric keys
 * @returns Array of OpenPipeline processors
 */
const convertTopologyTypes = async (
  types: TopologyType[],
  metrics?: MetricMetadata[],
): Promise<OpenPipelineProcessor[]> => {
  const processors: OpenPipelineProcessor[] = [];
  let processorCounter = 0;

  // We loop through the existing topology.types, creating the configuration dynamically
  // while asking the user for input when necessary
  for (const type of types) {
    // Show a input for the user to select the new name
    const newName = await vscode.window.showInputBox({
      prompt: `Enter new name for type "${type.name}"`,
      placeHolder: suggestNewTypeName(type.name),
      value: suggestNewTypeName(type.name),
      validateInput: value => {
        if (!value || value.trim() === "") {
          return "Name cannot be empty";
        }
        return null;
      },
    });

    if (!newName) {
      throw Error("User cancelled the operation");
    }

    // Process each rule in the type
    for (const rule of type.rules) {
      for (const source of rule.sources) {
        // Skip non-Metrics sources as Logs have different condition formats
        if (source.sourceType !== "Metrics") {
          continue;
        }

        // Ask user for entity extraction matcher
        const suggestedEntityMatcher = convertConditionToMatcher(source.condition);
        const entityMatcher = await vscode.window.showInputBox({
          prompt: `Enter matcher condition for entity extraction (extractNode: false) for "${type.displayName}"`,
          placeHolder: suggestedEntityMatcher,
          value: suggestedEntityMatcher,
          validateInput: value => {
            if (!value || value.trim() === "") {
              return "Matcher cannot be empty";
            }
            return null;
          },
        });

        if (!entityMatcher) {
          throw Error("User cancelled the operation");
        }

        // Create entity extraction processor (extractNode: false)
        const entityProcessor = createSmartscapeNodeProcessor(
          type,
          newName,
          source,
          rule,
          false,
          entityMatcher,
          processorCounter++,
        );
        processors.push(entityProcessor);

        // Ask user for node extraction matcher
        const matchingMetric = findMatchingMetric(source.condition, metrics);
        const suggestedNodeMatcher = matchingMetric
          ? `matchesValue(metric.key, "${matchingMetric}")`
          : suggestedEntityMatcher;

        const nodeMatcher = await vscode.window.showInputBox({
          prompt: `Enter matcher condition for node extraction (extractNode: true) for "${type.displayName}"`,
          placeHolder: suggestedNodeMatcher,
          value: suggestedNodeMatcher,
          validateInput: value => {
            if (!value || value.trim() === "") {
              return "Matcher cannot be empty";
            }
            return null;
          },
        });

        if (!nodeMatcher) {
          throw Error("User cancelled the operation");
        }

        // Create node extraction processor (extractNode: true)
        const nodeProcessor = createSmartscapeNodeProcessor(
          type,
          newName,
          source,
          rule,
          true,
          nodeMatcher,
          processorCounter++,
        );
        processors.push(nodeProcessor);
      }
    }
  }

  return processors;
};

const suggestNewTypeName = (currentName: string): string => {
  // Entities names should be uppercase and separated by '_'
  // Example: cloudhub:org becomes CLOUDHUB_ORG
  return currentName.toUpperCase().replace(/:/g, "_");
};

/**
 * Converts a topology source condition to a DQL matcher expression
 * @param condition - The source condition (e.g., "$prefix(cloudhub.org.)")
 * @returns DQL matcher expression using proper DQL syntax
 * @see https://docs.dynatrace.com/docs/discover-dynatrace/platform/openpipeline/reference/dql-matcher-in-openpipeline
 */
const convertConditionToMatcher = (condition: string | undefined): string => {
  // Handle undefined or empty condition
  if (!condition || condition.trim() === "") {
    return "isNotNull(metric.key)";
  }

  // Handle $prefix() function - converts to matchesValue with wildcard
  // matchesValue is case-insensitive and supports * at the end for prefix matching
  const prefixMatch = condition.match(/\$prefix\(([^)]+)\)/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    return `matchesValue(metric.key, "${prefix}*")`;
  }

  // Handle $eq() function - converts to DQL exact match
  // Using == for case-sensitive exact match
  const eqMatch = condition.match(/\$eq\(([^)]+)\)/);
  if (eqMatch) {
    const value = eqMatch[1];
    return `metric.key == "${value}"`;
  }

  // Handle $exists() function - matches all metrics
  if (condition.includes("$exists()")) {
    return "isNotNull(metric.key)";
  }

  // Default: assume it's a pattern and use matchesValue for wildcard support
  return `matchesValue(metric.key, "${condition}")`;
};

/**
 * Finds a metric key that matches the given condition
 * @param condition - The source condition
 * @param metrics - List of available metrics
 * @returns Matching metric key or null
 */
const findMatchingMetric = (condition: string, metrics?: MetricMetadata[]): string | null => {
  if (!metrics || metrics.length === 0) {
    return null;
  }

  // Extract the pattern from the condition
  const prefixMatch = condition.match(/\$prefix\(([^)]+)\)/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const matchingMetric = metrics.find(m => m.key.startsWith(prefix));
    return matchingMetric ? matchingMetric.key : null;
  }

  const eqMatch = condition.match(/\$eq\(([^)]+)\)/);
  if (eqMatch) {
    const exactKey = eqMatch[1];
    const matchingMetric = metrics.find(m => m.key === exactKey);
    return matchingMetric ? matchingMetric.key : null;
  }

  // For $exists(), just return the first metric if any
  if (condition.includes("$exists()")) {
    return metrics.length > 0 ? metrics[0].key : null;
  }

  return null;
};

/**
 * Creates a smartscape node processor for OpenPipeline
 */
const createSmartscapeNodeProcessor = (
  type: TopologyType,
  newName: string,
  source: { sourceType: string; condition: string },
  rule: TopologyType["rules"][0],
  extractNode: boolean,
  matcher: string,
  counter: number,
): OpenPipelineProcessor => {
  // Build ID components from required dimensions
  // If no required dimensions exist, create a default ID component based on the type name
  let idComponents =
    rule.requiredDimensions?.map(dim => ({
      idComponent: dim.key,
      referencedFieldName: dim.key,
    })) || [];

  // Ensure at least one ID component exists (API requirement: minimum size is 1)
  if (idComponents.length === 0) {
    const defaultIdKey = `${type.name.toLowerCase()}.id`;
    idComponents = [
      {
        idComponent: `${type.name.replace(/:/g, "_")}_id`,
        referencedFieldName: defaultIdKey,
      },
    ];
  }

  // Build fields to extract from attributes, filtering out blocked fields
  const fieldsToExtract = rule.attributes
    .filter(attr => !BLOCKED_FIELDS.includes(attr.key))
    .map(attr => ({
      fieldName: attr.key,
      referencedFieldName: attr.key,
    }));

  const processorId = `${newName}_${extractNode ? "node" : "entity"}_${source.sourceType}_${counter}`;

  return {
    id: processorId,
    type: "smartscapeNode",
    matcher,
    description: `Extract ${extractNode ? "node" : "entities"} for ${type.displayName}`,
    smartscapeNode: {
      nodeType: newName,
      nodeIdFieldName: "node_id",
      idComponents,
      extractNode,
      nodeName: {
        type: "constant",
        value: type.displayName,
      },
      fieldsToExtract: fieldsToExtract.length > 0 ? fieldsToExtract : undefined,
    },
  };
};

/**
 * Writes the OpenPipeline configuration to extension/openpipeline/metric.pipeline.json
 * @param pipeline - The pipeline configuration to write
 */
const writePipelineToFile = (pipeline: unknown): void => {
  const logTrace = ["commandPalette", "writePipelineToFile"];

  try {
    // Get the extension file path and derive the openpipeline directory
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    const extensionDir = dirname(extensionFile);
    const openpipelineDir = join(extensionDir, "openpipeline");
    const pipelineFile = join(openpipelineDir, "metric.pipeline.json");

    // Create openpipeline directory if it doesn't exist
    try {
      mkdirSync(openpipelineDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, that's fine
      logger.debug(
        `Directory already exists or could not be created: ${openpipelineDir}`,
        ...logTrace,
      );
    }

    // Write the pipeline configuration
    const pipelineJson = JSON.stringify(pipeline, null, 2);
    writeFileSync(pipelineFile, pipelineJson, "utf-8");

    logger.info(`Pipeline written to ${pipelineFile}`, ...logTrace);
  } catch (error) {
    logger.error(`Failed to write pipeline to file: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};

/**
 * Writes the metric source configuration to extension/openpipeline/metric.source.json
 * @param extension - The extension metadata to extract the name from
 */
const writeMetricSourceToFile = (extension: ExtensionStub): void => {
  const logTrace = ["commandPalette", "writeMetricSourceToFile"];

  try {
    // Get the extension file path and derive the openpipeline directory
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    const extensionDir = dirname(extensionFile);
    const openpipelineDir = join(extensionDir, "openpipeline");
    const sourceFile = join(openpipelineDir, "metric.source.json");

    // Create openpipeline directory if it doesn't exist
    try {
      mkdirSync(openpipelineDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, that's fine
      logger.debug(
        `Directory already exists or could not be created: ${openpipelineDir}`,
        ...logTrace,
      );
    }

    // Create the metric source configuration
    const metricSource = {
      displayName: `${extension.name} metric source`,
      staticRouting: {
        pipelineId: extension.name,
      },
    };

    // Write the metric source configuration
    const sourceJson = JSON.stringify(metricSource, null, 2);
    writeFileSync(sourceFile, sourceJson, "utf-8");

    logger.info(`Metric source written to ${sourceFile}`, ...logTrace);
  } catch (error) {
    logger.error(`Failed to write metric source to file: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};

/**
 * Updates the extension.yaml file to add OpenPipeline configuration references
 * @param extension - The extension metadata
 */
const updateExtensionYaml = (extension: ExtensionStub): void => {
  const logTrace = ["commandPalette", "updateExtensionYaml"];

  try {
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    // Read the current extension.yaml file
    const yamlContent = readFileSync(extensionFile, "utf-8");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const extensionData: Record<string, unknown> = yaml.parse(yamlContent);

    // Add or update the openpipeline section
    extensionData.openpipeline = {
      pipelines: [
        {
          displayName: `${extension.name} pipeline`,
          pipelinePath: "openpipeline/metric.pipeline.json",
          configScope: "metrics",
        },
      ],
      sources: [
        {
          displayName: `${extension.name} source`,
          sourcePath: "openpipeline/metric.source.json",
          configScope: "metrics",
        },
      ],
    };

    // Write the updated YAML back to the file
    const updatedYaml = yaml.stringify(extensionData);
    writeFileSync(extensionFile, updatedYaml, "utf-8");

    logger.info("Updated extension.yaml with OpenPipeline configuration", ...logTrace);
  } catch (error) {
    logger.error(`Failed to update extension.yaml: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};
