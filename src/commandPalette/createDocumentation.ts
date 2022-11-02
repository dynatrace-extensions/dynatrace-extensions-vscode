import * as vscode from "vscode";
import * as yaml from "yaml";
import * as path from "path";
import { readFileSync, writeFileSync } from "fs";
import { getAllMetricsByFeatureSet } from "../utils/extensionParsing";

/**
 * Delivers the "Create documentation" command functionality.
 * Reads through the extension.yaml file and any associated alerts/dashboards JSONs and produces content for
 * a README.md file which is written in the workspace at the same level as the extension folder.
 * @returns void
 */
export async function createDocumentation() {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Creating documentation" },
    async (progress) => {
      progress.report({ message: "Parsing metadata" });
      var extensionYaml = await vscode.workspace.findFiles("**/extension.yaml").then((files) => files[0].fsPath);
      var extensionDir = path.dirname(extensionYaml);
      var extension = yaml.parse(readFileSync(extensionYaml).toString());

      progress.report({ message: "Writing README.md" });
      writeDocumentation(extension, extensionDir);
    }
  );
}

/**
 * Invokes all other data collection functions and puts together the documentation style content.
 * Writes the content to README.md in the workspace. If README.md exists already it will be overwritten.
 * @param extension extension.yaml content parsed into an object
 * @param extensionDir path to the extension folder
 */
function writeDocumentation(extension: ExtensionStub, extensionDir: string) {
  // Extract required data
  var entities = extractTopology(extension);
  var metrics = extractMetrics(extension);
  var dashboards = extractDashboards(extension, extensionDir);
  var alerts = extractAlerts(extension, extensionDir);
  var featureSets = getAllMetricsByFeatureSet(extension);
  var metricsMap = mapEntitiesToMetrics(entities, metrics);

  // Translate data to readable content
  var docPath = path.join(extensionDir, "..", "README.md");
  var docContent = `# ${extension.name}\n\n`;
  docContent += `**Latest version:** ${extension.version}\n`;
  docContent +=
    "This extension is built using the Dynatrace Extension 2.0 Framework.\nThis means it will benefit of additional assets that can help you browse through the data.\n\n";
  if (entities.length > 0) {
    docContent += "## Topology\n\nThis extension will create the following types of entities:\n";
    entities.forEach((entity) => {
      docContent += `* ${entity.name} (${entity.type})\n`;
    });
    docContent += "\n";
  }
  if (metrics.length > 0) {
    docContent += "## Metrics\n\nThis extension will collect the following metrics:\n";
    metricsMap.forEach((mm) => {
      docContent += `* Split by ${mm.metricEntityString}:\n`;
      mm.metrics.forEach((m) => {
        docContent += `  * ${m.name} (\`${m.key}\`)\n`;
        docContent += `    ${m.description} (as ${m.unit})\n`;
      });
    });
    docContent += "\n";
  }
  if (alerts.length > 0) {
    docContent +=
      "## Alerts\n\nCustom events for alerting are packaged along with the extension. These should be reviewed and ajusted as needed before enabling from the Settings page.\nAlerts:\n";
    alerts.forEach((alert) => {
      docContent += `* ${alert.name}`;
      let eIdx = entities.findIndex((e) => e.type === alert.entity);
      docContent += eIdx === -1 ? "" : ` (applies to ${entities[eIdx].name})\n`;
      docContent += `  ${alert.description}\n`;
    });
    docContent += "\n";
  }
  if (dashboards.length > 0) {
    docContent += `## Dashboards\n\nThis extension is packaged with ${dashboards.length} dashboards which should serve as a starting point for data analysis.`;
    docContent += "\nYou can find these by opening the Dashboards menu and searching for:\n\n";
    dashboards.forEach((dashboard) => {
      docContent += `* ${dashboard.name}\n`;
    });
    docContent += "\n";
  }
  docContent += "# Configuration\n\n";
  if (featureSets) {
    docContent += "## Feature sets\n\n";
    docContent +=
      "Feature sets can be used to opt in and out of metric data collection.\nThis extension groups together metrics within the following feature sets:\n\n";
    featureSets.forEach((featureSet) => {
      docContent += `* ${featureSet.name}\n`;
      featureSet.metrics.forEach((metric) => {
        docContent += `  * ${metric}\n`;
      });
    });
    docContent += "\n";
  }
  if (extension.vars) {
    docContent +=
      "## Variables\n\nVariables are used in monitoring configurations for filtering and adding additional dimensions.\n";
    docContent += "This extension exposes the following variables:\n\n";
    extension.vars.forEach((v) => {
      docContent += `* \`${v.id}\` (${v.type}) - ${v.displayName}\n`;
    });
    docContent += "\n";
  }

  // Write the README.md file
  writeFileSync(docPath, docContent, { encoding: "utf-8" });
}

/**
 * Reads extension.yaml data and extracts relevant details for documenting custom events for alerting.
 * @param extension extension.yaml content parsed into an object
 * @param extensionDir path to the extension folder
 * @returns processed alerts metadata
 */
function extractAlerts(extension: ExtensionStub, extensionDir: string): AlertDoc[] {
  if (!extension.alerts) {
    return [];
  }
  return extension.alerts.map((pathEntry) => {
    var alert = JSON.parse(readFileSync(path.join(extensionDir, pathEntry.path)).toString());

    let alertCondition = alert.monitoringStrategy.alertCondition.toLowerCase();
    let violatingSamples = alert.monitoringStrategy.violatingSamples;
    let samples = alert.monitoringStrategy.samples;
    let threshold = alert.monitoringStrategy.threshold;
    let unit = alert.monitoringStrategy.unit.toLowerCase();
    let severity = alert.severity.replace("_", " ").toUpperCase();
    let entity = alert.primaryDimensionKey.toLowerCase();
    if (entity.startsWith("dt.entity.")) {
      entity = entity.substring(10, entity.length);
    }

    return {
      name: alert.name,
      description: `Will raise a ${severity} alert when the metric is ${alertCondition} ${threshold} ${unit} for ${violatingSamples} out of ${samples} monitoring intervals`,
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
  return extension.dashboards.map((pathEntry) => {
    var dashboard = JSON.parse(readFileSync(path.join(extensionDir, pathEntry.path)).toString());

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
  if (!extension.topology || !extension.topology.types) {
    return [];
  }
  return extension.topology.types.map((topologyType): EntityDoc => {
    var entitySources: string[] = [];
    topologyType.rules.forEach((rule) => {
      rule.sources
        .filter((source) => source.sourceType === "Metrics")
        .forEach((source) => {
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
  return extension.metrics.map((metric) => {
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
  entities = entities.map((entity) => {
    let entityMetrics: string[] = [];

    entity.sources.forEach((pattern) => {
      let operator = pattern.split("(")[0];
      let keyPattern = pattern.split("(")[1].split(")")[0];
      entityMetrics.push(
        ...metrics
          .filter((m) => {
            if (operator === "$eq") {
              return m.key === keyPattern;
            } else if (operator === "$prefix") {
              return m.key.startsWith(keyPattern);
            }
            return false;
          })
          .map((m) => m.key)
      );
    });
    entity.metrics = entityMetrics;
    return entity;
  });

  metrics = metrics.map((m) => {
    m.entities = entities.filter((e) => e.metrics.includes(m.key)).map((e) => e.name);
    return m;
  });

  let metricEntityMap: MetricEntityMap[] = [];
  metrics.forEach((m) => {
    let metricStr = m.entities.join(", ");
    let idx = metricEntityMap.findIndex((mm) => mm.metricEntityString === metricStr);
    if (idx === -1) {
      metricEntityMap.push({ metricEntityString: metricStr, metrics: [m] });
    } else {
      metricEntityMap[idx].metrics.push(m);
    }
  });

  return metricEntityMap;
}
