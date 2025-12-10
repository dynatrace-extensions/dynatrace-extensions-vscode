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

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import yaml from "yaml";
import { OpenPipelineProcessor, OpenPipelinePipeline } from "../interfaces/extensionDocs";
import {
  ExtensionStub,
  MetricMetadata,
  TopologyType,
  OpenPipeline,
} from "../interfaces/extensionMeta";
import { updateYamlNode } from "../utils/dashboards";
import { getExtensionFilePath } from "../utils/fileSystem";
import logger from "../utils/logging";

// Fields that are not allowed to be extracted in OpenPipeline
const BLOCKED_FIELDS = ["dt.security_context"];

interface OpenPipelineDocs {
  metricPipeline?: OpenPipelinePipeline;
  logPipeline?: OpenPipelinePipeline;
}

/**
 * Callback function type for getting user input
 * @param prompt - The prompt to show to the user
 * @param suggestedValue - The suggested value
 * @returns The input value or null if cancelled
 */
export type InputCallback = (prompt: string, suggestedValue: string) => Promise<string | null>;

/**
 * Cleans up the extension name by removing common prefixes
 * @param extensionName - The full extension name (e.g., "custom:com.dynatrace.mulesoft-cloudhub")
 * @returns The cleaned extension name (e.g., "mulesoft-cloudhub")
 */
const cleanExtensionName = (extensionName: string): string => {
  return extensionName
    .replace(/^custom:com\.dynatrace\./, "")
    .replace(/^com\.dynatrace\./, "")
    .replace(/^custom:/, "");
};

/**
 * Converts the topology section of the extension.yaml into the equivalent
 * OpenPipeline pipelines and sources definition
 * @param extension extension.yaml serialized as object
 * @param inputCallback - Callback function for getting user input
 */
export const convertTopologyToOpenPipeline = async (
  extension: ExtensionStub,
  inputCallback: InputCallback,
): Promise<{
  pipelineExtensionYaml: OpenPipeline;
  pipelineDocs: OpenPipelineDocs;
}> => {
  if (!extension.topology) {
    throw Error("Extension does not have a topology section.");
  }

  let metricsProcessors: OpenPipelineProcessor[] = [];
  let logsProcessors: OpenPipelineProcessor[] = [];

  // Convert topology types to smartscape node processors
  if (extension.topology.types) {
    const result = await createProcessorsFromTopology(
      extension.topology.types,
      extension.metrics,
      inputCallback,
    );
    metricsProcessors = result.metricsProcessors;
    logsProcessors = result.logsProcessors;
  }

  // TODO: Convert topology relationships to smartscape edge processors
  // if (extension.topology.relationships) {
  //   const edgeProcessors = await convertTopologyRelationships(extension.topology.relationships);
  //   processors.push(...edgeProcessors);
  // }

  // Create the OpenPipeline configuration
  const cleanedName = cleanExtensionName(extension.name);

  const pipelineDocs: OpenPipelineDocs = {};
  const pipelineExtensionYaml: OpenPipeline = {
    pipelines: [],
    sources: [],
  };

  // Create metrics pipeline if we have metrics processors
  if (metricsProcessors.length > 0) {
    const customId = `${cleanedName}-metrics`;
    const displayName = `${cleanedName} - Pipeline`;
    pipelineDocs.metricPipeline = {
      customId,
      displayName,
      smartscapeNodeExtraction: {
        processors: metricsProcessors,
      },
    };
    pipelineExtensionYaml.pipelines.push({
      displayName,
      pipelinePath: "openpipeline/metric.pipeline.json",
      configScope: "metrics",
    });
    pipelineExtensionYaml.sources.push({
      displayName,
      sourcePath: "openpipeline/metric.source.json",
      configScope: "metrics",
    });
  }

  // Create logs pipeline if we have logs processors
  if (logsProcessors.length > 0) {
    const customId = `${cleanedName}-logs`;
    const displayName = `${cleanedName} - Pipeline`;
    pipelineDocs.logPipeline = {
      customId,
      displayName,
      smartscapeNodeExtraction: {
        processors: logsProcessors,
      },
    };
    pipelineExtensionYaml.pipelines.push({
      displayName,
      pipelinePath: "openpipeline/log.pipeline.json",
      configScope: "logs",
    });
    pipelineExtensionYaml.sources.push({
      displayName,
      sourcePath: "openpipeline/log.source.json",
      configScope: "logs",
    });
  }

  logger.info(
    `Created pipeline with ${metricsProcessors.length} metrics and ${logsProcessors.length} logs processors`,
  );
  return {
    pipelineExtensionYaml,
    pipelineDocs,
  };
};

/**
 * Converts topology types to OpenPipeline smartscape node processors
 * @param types - Array of topology types from extension.yaml
 * @param metrics - Optional array of metrics for finding matching metric keys
 * @param inputCallback - Callback function for getting user input
 * @returns Array of OpenPipeline processors
 */
export const createProcessorsFromTopology = async (
  types: TopologyType[],
  metrics: MetricMetadata[] | undefined,
  inputCallback: InputCallback,
): Promise<{
  metricsProcessors: OpenPipelineProcessor[];
  logsProcessors: OpenPipelineProcessor[];
}> => {
  const metricsProcessors: OpenPipelineProcessor[] = [];
  const logsProcessors: OpenPipelineProcessor[] = [];
  let metricsCounter = 0;
  let logsCounter = 0;
  // Track entity types that already have extractNode: true
  const entityTypesWithNodeExtraction = new Set<string>();

  // We loop through the existing topology.types, creating the configuration dynamically
  // while asking the user for input when necessary
  for (const type of types) {
    // Show a input for the user to select the new name
    const suggestedName = suggestNewTypeName(type.name);
    const newName = await inputCallback(`Enter new name for type "${type.name}"`, suggestedName);

    if (!newName) {
      throw Error("User cancelled the operation");
    }

    // Process each rule in the type
    for (const rule of type.rules) {
      for (const source of rule.sources) {
        if (source.sourceType === "Metrics") {
          // Process Metrics source type
          const processors = await processMetricsSource(
            type,
            newName,
            source,
            rule,
            metrics,
            inputCallback,
            metricsCounter,
            entityTypesWithNodeExtraction,
          );
          metricsProcessors.push(...processors);
          metricsCounter += processors.length;
        } else if (source.sourceType === "Logs") {
          // Process Logs source type
          const processors = await processLogsSource(
            type,
            newName,
            source,
            rule,
            inputCallback,
            logsCounter,
            entityTypesWithNodeExtraction,
          );
          logsProcessors.push(...processors);
          logsCounter += processors.length;
        }
      }
    }
  }

  return { metricsProcessors, logsProcessors };
};

/**
 * Processes a Metrics source type and creates OpenPipeline processors
 * @returns Array of created processors
 */
const processMetricsSource = async (
  type: TopologyType,
  newName: string,
  source: { sourceType: string; condition?: string },
  rule: TopologyType["rules"][0],
  metrics: MetricMetadata[] | undefined,
  inputCallback: InputCallback,
  processorCounter: number,
  entityTypesWithNodeExtraction: Set<string>,
): Promise<OpenPipelineProcessor[]> => {
  const processors: OpenPipelineProcessor[] = [];

  // Ask user for entity extraction matcher
  const suggestedEntityMatcher = convertConditionToMatcher(source.condition);
  const entityMatcher = await inputCallback(
    `Enter matcher condition for entity extraction (extractNode: false) for "${type.displayName}"`,
    suggestedEntityMatcher,
  );

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

  // Only create node extraction processor if this entity type doesn't have one yet
  if (!entityTypesWithNodeExtraction.has(newName)) {
    // Ask user for node extraction matcher
    const matchingMetric = findMatchingMetric(source.condition, metrics);
    const suggestedNodeMatcher = matchingMetric
      ? `matchesValue(metric.key, "${matchingMetric}")`
      : suggestedEntityMatcher;

    const nodeMatcher = await inputCallback(
      `Enter matcher condition for node extraction (extractNode: true) for "${type.displayName}"`,
      suggestedNodeMatcher,
    );

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

    // Mark this entity type as having node extraction
    entityTypesWithNodeExtraction.add(newName);
  }

  return processors;
};

/**
 * Processes a Logs source type and creates OpenPipeline processors
 * @returns Array of created processors
 */
const processLogsSource = async (
  type: TopologyType,
  newName: string,
  source: { sourceType: string },
  rule: TopologyType["rules"][0],
  inputCallback: InputCallback,
  processorCounter: number,
  entityTypesWithNodeExtraction: Set<string>,
): Promise<OpenPipelineProcessor[]> => {
  const processors: OpenPipelineProcessor[] = [];

  // For Logs, create a matcher based on requiredDimensions
  const suggestedEntityMatcher = convertRequiredDimensionsToMatcher(rule.requiredDimensions);
  const entityMatcher = await inputCallback(
    `Enter matcher condition for entity extraction (extractNode: false) for "${type.displayName}" (Logs)`,
    suggestedEntityMatcher,
  );

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

  // Only create node extraction processor if this entity type doesn't have one yet
  if (!entityTypesWithNodeExtraction.has(newName)) {
    // For logs, we typically use the same matcher for node extraction
    const nodeMatcher = await inputCallback(
      `Enter matcher condition for node extraction (extractNode: true) for "${type.displayName}" (Logs)`,
      suggestedEntityMatcher,
    );

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

    // Mark this entity type as having node extraction
    entityTypesWithNodeExtraction.add(newName);
  }

  return processors;
};

const suggestNewTypeName = (currentName: string): string => {
  // Entities names should be uppercase and separated by '_'
  // Example: cloudhub:org becomes CLOUDHUB_ORG
  return currentName.toUpperCase().replace(/:/g, "_");
};

/**
 * Converts requiredDimensions to a DQL matcher expression for Logs
 * @param requiredDimensions - Array of required dimensions with their value patterns
 * @returns DQL matcher expression
 */
const convertRequiredDimensionsToMatcher = (
  requiredDimensions?: Array<{ key: string; valuePattern?: string }>,
): string => {
  if (!requiredDimensions || requiredDimensions.length === 0) {
    return "isNotNull(content)";
  }

  const conditions: string[] = [];

  for (const dim of requiredDimensions) {
    if (dim.valuePattern) {
      // Handle $eq() function
      const eqMatch = dim.valuePattern.match(/\$eq\(([^)]+)\)/);
      if (eqMatch) {
        const value = eqMatch[1];
        conditions.push(`${dim.key} == "${value}"`);
        continue;
      }

      // Handle $prefix() function
      const prefixMatch = dim.valuePattern.match(/\$prefix\(([^)]+)\)/);
      if (prefixMatch) {
        const prefix = prefixMatch[1];
        conditions.push(`matchesValue(${dim.key}, "${prefix}*")`);
        continue;
      }

      // Default: exact match
      conditions.push(`${dim.key} == "${dim.valuePattern}"`);
    } else {
      // If no value pattern, just check the field exists
      conditions.push(`isNotNull(${dim.key})`);
    }
  }

  // Combine all conditions with AND
  return conditions.join(" and ");
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
const findMatchingMetric = (
  condition: string | undefined,
  metrics?: MetricMetadata[],
): string | null => {
  if (!condition) {
    return null;
  }
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
 * Extracts ID components from an idPattern string
 * Example: "squid-{dt.entity.process_group_instance}-{port}" -> ["dt.entity.process_group_instance", "port"]
 * @param idPattern - The idPattern string containing {fieldName} placeholders
 * @returns Array of field names extracted from the pattern
 */
const extractIdComponentsFromPattern = (idPattern: string): string[] => {
  const matches = idPattern.match(/\{([^}]+)\}/g);
  if (!matches) {
    return [];
  }
  return matches.map(match => match.slice(1, -1)); // Remove { and }
};

/**
 * Converts a field name to a valid ID component name (lowercase with underscores, no dots)
 * Example: "dt.entity.process_group_instance" -> "dt_entity_process_group_instance"
 * @param fieldName - The field name to convert
 * @returns Sanitized ID component name
 */
const sanitizeIdComponentName = (fieldName: string): string => {
  return fieldName.toLowerCase().replace(/\./g, "_");
};

/**
 * Extracts the field name from a pattern string
 * Example: "{org.id}" -> "org.id"
 * @param pattern - The pattern string containing {fieldName}
 * @returns The field name or the original pattern if no match
 */
const extractFieldNameFromPattern = (pattern: string): string => {
  const match = pattern.match(/\{([^}]+)\}/);
  return match ? match[1] : pattern;
};

/**
 * Extracts node name configuration from instanceNamePattern
 * @param instanceNamePattern - The pattern string (e.g., "{org.name}")
 * @param defaultValue - The default value to use if field is not found
 * @returns Node name configuration object
 */
const extractNodeNameFromPattern = (
  instanceNamePattern: string | undefined,
  defaultValue: string,
): {
  type: string;
  constant?: string;
  field?: { sourceFieldName: string; defaultValue: string };
} => {
  // If no pattern is provided, use constant with default value
  if (!instanceNamePattern) {
    return {
      type: "constant",
      constant: defaultValue,
    };
  }

  // Extract the first field name from the pattern
  const match = instanceNamePattern.match(/\{([^}]+)\}/);

  if (match) {
    const fieldName = match[1];
    return {
      type: "field",
      field: {
        sourceFieldName: fieldName,
        defaultValue: defaultValue,
      },
    };
  }

  // If no field found, use the pattern itself as constant
  return {
    type: "constant",
    constant: instanceNamePattern,
  };
};

/**
 * Creates a smartscape node processor for OpenPipeline
 */
const createSmartscapeNodeProcessor = (
  type: TopologyType,
  newName: string,
  source: { sourceType: string; condition?: string },
  rule: TopologyType["rules"][0],
  extractNode: boolean,
  matcher: string,
  counter: number,
): OpenPipelineProcessor => {
  // Validate that instanceNamePattern exists
  if (rule.instanceNamePattern === undefined) {
    throw new Error(
      `Rule for type "${type.name}" is missing instanceNamePattern. All topology rules must have an instanceNamePattern defined.`,
    );
  }

  // Build ID components from idPattern if it exists
  let idComponents: Array<{ idComponent: string; referencedFieldName: string }> = [];

  if (rule.idPattern) {
    const fieldNames = extractIdComponentsFromPattern(rule.idPattern);
    idComponents = fieldNames.map(fieldName => ({
      idComponent: sanitizeIdComponentName(fieldName),
      referencedFieldName: fieldName,
    }));
  }

  // Fallback to required dimensions if no idPattern or no components extracted
  if (idComponents.length === 0 && rule.requiredDimensions) {
    idComponents = rule.requiredDimensions.map(dim => ({
      idComponent: sanitizeIdComponentName(dim.key),
      referencedFieldName: dim.key,
    }));
  }

  // Ensure at least one ID component exists (API requirement: minimum size is 1)
  if (idComponents.length === 0) {
    const defaultIdKey = `${type.name.toLowerCase()}.id`;
    idComponents = [
      {
        idComponent: sanitizeIdComponentName(defaultIdKey),
        referencedFieldName: defaultIdKey,
      },
    ];
  }

  // Build fields to extract from attributes, filtering out blocked fields
  const fieldsToExtract = rule.attributes
    .filter(attr => !BLOCKED_FIELDS.includes(attr.key))
    .map(attr => ({
      fieldName: attr.key,
      referencedFieldName: extractFieldNameFromPattern(attr.pattern),
    }));

  const processorId = `${newName}_${extractNode ? "node" : "entity"}_${source.sourceType}_${counter}`;

  const description = extractNode
    ? `Extract node for ${type.displayName}`
    : `Create entity for ${type.displayName}`;

  // Extract node name from instanceNamePattern, defaulting to the new entity type name
  const nodeName = extractNodeNameFromPattern(rule.instanceNamePattern, newName);

  return {
    id: processorId,
    type: "smartscapeNode",
    matcher,
    description,
    smartscapeNode: {
      nodeType: newName,
      nodeIdFieldName: "node_id",
      idComponents,
      extractNode,
      nodeName,
      fieldsToExtract: fieldsToExtract.length > 0 ? fieldsToExtract : undefined,
    },
  };
};

/**
 * Writes the OpenPipeline configuration to extension/openpipeline/[metric|log].pipeline.json
 * @param pipeline - The pipeline configuration to write
 * @param scope - The config scope ("metrics" or "logs")
 */
export const writePipelineToFile = (
  pipeline: OpenPipelinePipeline,
  scope: "metrics" | "logs" = "metrics",
): void => {
  const logTrace = ["commandPalette", "writePipelineToFile"];

  try {
    // Get the extension file path and derive the openpipeline directory
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    const extensionDir = dirname(extensionFile);
    const openpipelineDir = join(extensionDir, "openpipeline");
    const filename = scope === "logs" ? "log.pipeline.json" : "metric.pipeline.json";
    const pipelineFile = join(openpipelineDir, filename);

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

    const pipelineJson = JSON.stringify(pipeline, null, 2);
    writeFileSync(pipelineFile, pipelineJson, "utf-8");

    logger.info(`${scope} pipeline written to ${pipelineFile}`, ...logTrace);
  } catch (error) {
    logger.error(`Failed to write pipeline to file: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};

/**
 * Writes the source configuration to extension/openpipeline/[metric|log].source.json
 * @param extension - The extension metadata to extract the name from
 * @param scope - The config scope ("metrics" or "logs")
 */
export const writePipelineSourceToFile = (
  extension: ExtensionStub,
  scope: "metrics" | "logs" = "metrics",
): void => {
  const logTrace = ["commandPalette", "writeMetricSourceToFile"];

  try {
    // Get the extension file path and derive the openpipeline directory
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    const extensionDir = dirname(extensionFile);
    const openpipelineDir = join(extensionDir, "openpipeline");
    const filename = scope === "logs" ? "log.source.json" : "metric.source.json";
    const sourceFile = join(openpipelineDir, filename);

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

    // Create the source configuration with static routing
    const scopeSuffix = scope === "logs" ? "-logs" : "-metrics";
    const displaySuffix = scope === "logs" ? " logs" : " metric";
    const source = {
      displayName: `${extension.name}${displaySuffix} source`,
      staticRouting: {
        pipelineId: `${extension.name}${scopeSuffix}`,
      },
    };

    // Write the source configuration
    const sourceJson = JSON.stringify(source, null, 2);
    writeFileSync(sourceFile, sourceJson, "utf-8");

    logger.info(`${scope} source written to ${sourceFile}`, ...logTrace);
  } catch (error) {
    logger.error(`Failed to write metric source to file: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};

/**
 * Updates the extension.yaml file to add OpenPipeline configuration references
 * Uses line-by-line replacement to preserve YAML formatting
 * @param pipelineExtensionYaml - The OpenPipeline configuration to write to extension.yaml
 */
export const updateExtensionYaml = (pipelineExtensionYaml: OpenPipeline): void => {
  const logTrace = ["commandPalette", "updateExtensionYaml"];

  try {
    const extensionFile = getExtensionFilePath();
    if (!extensionFile) {
      throw new Error("Could not find extension.yaml file");
    }

    // Build the openpipeline YAML node
    const openpipelineConfig = {
      openpipeline: pipelineExtensionYaml,
    };

    // Convert to YAML string
    const openpipelineYaml = yaml.stringify(openpipelineConfig);

    // Update the YAML file using line-by-line replacement to preserve formatting
    updateYamlNode(extensionFile, "openpipeline:", openpipelineYaml);

    logger.info("Updated extension.yaml with OpenPipeline configuration", ...logTrace);
  } catch (error) {
    logger.error(`Failed to update extension.yaml: ${(error as Error).message}`, ...logTrace);
    throw error;
  }
};
