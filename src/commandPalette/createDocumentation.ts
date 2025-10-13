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

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import vscode from "vscode";
import {
  AlertDefinition,
  AlertDoc,
  DashboardDoc,
  DynatraceDashboard,
  EntityDoc,
  MetricDoc,
  MetricEntityMap,
} from "../interfaces/extensionDocs";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { getCachedParsedExtension } from "../utils/caching";
import { checkWorkspaceOpen, isExtensionsWorkspace } from "../utils/conditionCheckers";
import { getAllMetricsByFeatureSet } from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";
import { parseJSON } from "../utils/jsonParsing";
import logger from "../utils/logging";

const logTrace = ["commandPalette", "createDocumentation"];

export const createDocumentationWorkflow = async () => {
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await createDocumentation();
  }
};

/**
 * Reads extension.yaml data and extracts relevant details for documenting custom events for
 * alerting.
 * @param extension extension.yaml content parsed into an object
 * @param extensionDir path to the extension folder
 * @returns processed alerts metadata
 */
function extractAlerts(extension: ExtensionStub, extensionDir: string): AlertDoc[] {
  if (!extension.alerts) {
    return [];
  }
  return extension.alerts.map(pathEntry => {
    const alert: AlertDefinition = parseJSON(
      readFileSync(path.join(extensionDir, pathEntry.path)).toString(),
    );

    const alertCondition = alert.monitoringStrategy.alertCondition.toLowerCase();
    const violatingSamples = alert.monitoringStrategy.violatingSamples;
    const samples = alert.monitoringStrategy.samples;
    let threshold = `${alert.monitoringStrategy.threshold}`;
    const unit = alert.monitoringStrategy.unit;
    if (unit) {
      threshold += ` ${unit.toLowerCase()}`;
    }
    let alertSeverity = "an alert";
    if (alert.severity) {
      alertSeverity = `a ${alert.severity.replace("_", " ").toUpperCase()} alert`;
    } else if (alert.eventType) {
      alertSeverity = `a ${alert.eventType.replace("_", " ").toUpperCase()} alert`;
    }
    let entity;
    if (alert.primaryDimensionKey) {
      entity = alert.primaryDimensionKey.toLowerCase();
      if (entity.startsWith("dt.entity.")) {
        entity = entity.substring(10, entity.length);
      }
    }

    return {
      name: alert.name,
      description:
        `Will raise ${alertSeverity} when the metric is ${alertCondition} ${threshold} ` +
        `for ${violatingSamples} out of ${samples} monitoring intervals`,
      entity: entity,
    };
  });
}

/**
 * Reads extension.yaaml data and extracts relevant details for documenting dashboards.
 * @param extension extension.yaml content parsed into an object
 * @param extensionDir path to the extension folder
 * @returns processed dashboard metadata
 */
function extractDashboards(extension: ExtensionStub, extensionDir: string): DashboardDoc[] {
  if (!extension.dashboards) {
    return [];
  }
  return extension.dashboards.map(pathEntry => {
    const dashboard: DynatraceDashboard = parseJSON(
      readFileSync(path.join(extensionDir, pathEntry.path)).toString(),
    );

    return {
      name: dashboard.dashboardMetadata.name,
    };
  });
}

/**
 * Reads through extension.yaml data and extracts relevant details for documenting topology.
 * @param extension extension.yaml content parsed into an object
 * @returns topology processed metadata
 */
function extractTopology(extension: ExtensionStub): EntityDoc[] {
  if (!extension.topology?.types) {
    return [];
  }
  return extension.topology.types.map((topologyType): EntityDoc => {
    const entitySources: string[] = [];
    topologyType.rules.forEach(rule => {
      rule.sources
        .filter(source => source.sourceType === "Metrics")
        .forEach(source => {
          if (!entitySources.includes(source.condition)) {
            entitySources.push(source.condition);
          }
        });
    });
    return {
      name: topologyType.displayName,
      type: topologyType.name,
      sources: entitySources,
      metrics: [],
    };
  });
}

/**
 * Reads through extension.yaml data and extracts relevant details for documenting metrics.
 * @param extension extension.yaml content parsed into an object
 * @returns metrics processed metadata
 */
function extractMetrics(extension: ExtensionStub): MetricDoc[] {
  if (!extension.metrics) {
    return [];
  }
  return extension.metrics.map(metric => {
    return {
      key: metric.key,
      name: metric.metadata.displayName,
      description: metric.metadata.description,
      unit: metric.metadata.unit,
      tags: metric.metadata.tags,
      entities: [],
    };
  });
}

/**
 * Maps out which metrics can be split by which entities to create a more relevant and useful
 * documentation later on.
 * @param entities topology metadata as produced by {@link extractTopology}
 * @param metrics metrics metadata as produced by {@link extractMetrics}
 * @returns list of mappings between metrics and entities
 */
function mapEntitiesToMetrics(entities: EntityDoc[], metrics: MetricDoc[]): MetricEntityMap[] {
  entities = entities.map(entity => {
    const entityMetrics: string[] = [];

    entity.sources.forEach(pattern => {
      const operator = pattern.split("(")[0];
      const keyPattern = pattern.split("(")[1].split(")")[0];
      entityMetrics.push(
        ...metrics
          .filter(m => {
            if (operator === "$eq") {
              return m.key === keyPattern;
            } else if (operator === "$prefix") {
              return m.key.startsWith(keyPattern);
            }
            return false;
          })
          .map(m => m.key),
      );
    });
    entity.metrics = entityMetrics;
    return entity;
  });

  metrics = metrics.map(m => {
    m.entities = entities.filter(e => e.metrics.includes(m.key)).map(e => e.name);
    return m;
  });

  const metricEntityMap: MetricEntityMap[] = [];
  metrics.forEach(m => {
    const metricStr = m.entities.join(", ");
    const idx = metricEntityMap.findIndex(mm => mm.metricEntityString === metricStr);
    if (idx === -1) {
      metricEntityMap.push({ metricEntityString: metricStr, metrics: [m] });
    } else {
      metricEntityMap[idx].metrics.push(m);
    }
  });

  return metricEntityMap;
}

/**
 * Invokes all other data collection functions and puts together the documentation style content.
 * Writes the content to README.md in the workspace. If README.md exists already it will be
 * overwritten.
 * @param extension extension.yaml content parsed into an object
 * @param extensionDir path to the extension folder
 */
function writeDocumentation(extension: ExtensionStub, extensionDir: string) {
  // Extract required data
  const entities = extractTopology(extension);
  const metrics = extractMetrics(extension);
  const dashboards = extractDashboards(extension, extensionDir);
  const alerts = extractAlerts(extension, extensionDir);
  const featureSets = getAllMetricsByFeatureSet(extension);
  const metricsMap = mapEntitiesToMetrics(entities, metrics);

  // Translate data to readable content
  const docPath = path.join(extensionDir, "..", "README.md");
  let docContent = `# ${extension.name}\n\n`;
  docContent += `**Latest version:** ${extension.version}\n`;
  docContent +=
    "This extension is built using the Dynatrace Extension 2.0 Framework.\nThis means it will " +
    "benefit of additional assets that can help you browse through the data.\n\n";
  if (entities.length > 0) {
    docContent += "## Topology\n\nThis extension will create the following types of entities:\n";
    entities.forEach(entity => {
      docContent += `* ${entity.name} (${entity.type})\n`;
    });
    docContent += "\n";
  }
  if (metrics.length > 0) {
    docContent += "## Metrics\n\nThis extension will collect the following metrics:\n";
    metricsMap.forEach(mm => {
      docContent += `* Split by ${mm.metricEntityString}:\n`;
      mm.metrics.forEach(m => {
        docContent += `  * ${m.name} (\`${m.key}\`)\n`;
        if (m.description && m.unit) {
          docContent += `    ${m.description} (as ${m.unit})\n`;
        }
      });
    });
    docContent += "\n";
  }
  if (alerts.length > 0) {
    docContent +=
      "## Alerts\n\nCustom events for alerting are packaged along with the extension. These " +
      "should be reviewed and ajusted as needed before enabling from the Settings page.\nAlerts:\n";
    alerts.forEach(alert => {
      docContent += `* ${alert.name}`;
      if (alert.entity) {
        const eIdx = entities.findIndex(e => e.type === alert.entity);
        docContent += eIdx === -1 ? "" : ` (applies to ${entities[eIdx].name})\n`;
      }
      docContent += `  ${alert.description}\n`;
    });
    docContent += "\n";
  }
  if (dashboards.length > 0) {
    docContent +=
      `## Dashboards\n\nThis extension is packaged with ${dashboards.length} ` +
      "dashboards which should serve as a starting point for data analysis.";
    docContent += "\nYou can find these by opening the Dashboards menu and searching for:\n\n";
    dashboards.forEach(dashboard => {
      docContent += `* ${dashboard.name}\n`;
    });
    docContent += "\n";
  }
  docContent += "# Configuration\n\n";
  if (featureSets.length > 0) {
    docContent += "## Feature sets\n\n";
    docContent +=
      "Feature sets can be used to opt in and out of metric data collection.\nThis extension " +
      "groups together metrics within the following feature sets:\n\n";
    featureSets.forEach(featureSet => {
      docContent += `* ${featureSet.name}\n`;
      featureSet.metrics.forEach(metric => {
        docContent += `  * ${metric}\n`;
      });
    });
    docContent += "\n";
  }
  if (extension.vars) {
    docContent +=
      "## Variables\n\nVariables are used in monitoring configurations for filtering and adding " +
      "additional dimensions.\n";
    docContent += "This extension exposes the following variables:\n\n";
    extension.vars.forEach(v => {
      docContent += `* \`${v.id}\` (${v.type}) - ${v.displayName}\n`;
    });
    docContent += "\n";
  }

  // Write the README.md file
  writeFileSync(docPath, docContent, { encoding: "utf-8" });
}

/**
 * Delivers the "Create documentation" command functionality.
 * Reads through the extension.yaml file and any associated alerts/dashboards JSONs and produces
 * content for a README.md file which is written in the workspace at the same level as the extension
 * folder.
 */
export async function createDocumentation() {
  const fnLogTrace = [...logTrace, "createDocumentation"];
  logger.info("Executing Create Documentation command", ...fnLogTrace);
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Creating documentation" },
    async progress => {
      progress.report({ message: "Parsing metadata" });
      const extensionFile = getExtensionFilePath();
      if (!extensionFile) {
        logger.error("Missing extension file. Command aborted.", ...fnLogTrace);
        return;
      }
      const extensionDir = path.dirname(extensionFile);
      const extension = getCachedParsedExtension();
      if (!extension) {
        logger.error("Parsed extension does not exist in cache. Command aborted.", ...fnLogTrace);
        return;
      }

      progress.report({ message: "Writing README.md" });
      writeDocumentation(extension, extensionDir);
    },
  );
}
