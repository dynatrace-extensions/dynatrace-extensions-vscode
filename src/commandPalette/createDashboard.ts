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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Dashboard } from "../dynatrace-api/interfaces/dashboards";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { showMessage } from "../utils/code";
import { CachedDataProvider } from "../utils/dataCaching";
import { getEntityMetrics, getMetricDisplayName } from "../utils/extensionParsing";
import { getExtensionFilePath } from "../utils/fileSystem";

/*======================================================*
 * TEMPLATES THAT CREATE VARIOUS PARTS OF THE DASHBOARD *
 *======================================================*/

const graphChartTile = `\
    {
      "name": "<metric-name>",
      "tileType": "DATA_EXPLORER",
      "configured": true,
      "bounds": {
        "top": <top-bound>,
        "left": <left-bound>,
        "width": 418,
        "height": 266
      },
      "tileFilter": {},
      "customName": "Data explorer results",
      "queries": [
        {
          "id": "A",
          "metric": "<metric-key>",
          "spaceAggregation": "AVG",
          "timeAggregation": "DEFAULT",
          "splitBy": ["dt.entity.<entity-type>"],
          "enabled": true
        }
      ],
      "visualConfig": {
        "type": "GRAPH_CHART",
        "global": {},
        "rules": [
          {
            "matcher": "A:",
            "properties": {"color": "DEFAULT"},
            "seriesOverrides": []
          }
        ],
        "axes": {
          "xAxis": {"visible": true},
          "yAxes": []
        },
        "heatmapSettings": {},
        "thresholds": [
          {
            "axisTarget": "LEFT",
            "rules": [
              {"color": "#7dc540"},
              {"color": "#f5d30f"},
              {"color": "#dc172a"}
            ],
            "visible": true
          }
        ],
        "tableSettings": {},
        "graphChartSettings": {"connectNulls": false},
        "honeycombSettings": {}
      }
    }`;

const tableQuery = `\
        {
          "id": "<letter>",
          "metric": "<metric-key>",
          "spaceAggregation": "AVG",
          "timeAggregation": "DEFAULT",
          "splitBy": [ "dt.entity.<entity-type>" ],
          "enabled": true
        }`;

const entityTableTile = `\
    {
      "name": "<entity-name>",
      "tileType": "DATA_EXPLORER",
      "configured": true,
      "bounds": {
        "top": <top-bound>,
        "left": 0,
        "width": 570,
        "height": 266
      },
      "tileFilter": {},
      "customName": "Table",
      "queries": [
        <table-queries>
      ],
      "visualConfig": {
        "type": "TABLE",
        "global": {},
        "rules": [
          {
            "matcher": "A:",
            "properties": {"color": "DEFAULT"},
            "seriesOverrides": []
          }
        ],
        "axes": {
          "xAxis": {"visible": true},
          "yAxes": []
        },
        "heatmapSettings": {},
        "thresholds": [
          {
            "axisTarget": "LEFT",
            "rules": [
              {"color": "#7dc540"},
              {"color": "#f5d30f"},
              {"color": "#dc172a"}
            ],
            "visible": true
          }
        ],
        "tableSettings": {},
        "graphChartSettings": {"connectNulls": false},
        "honeycombSettings": {}
      }
    }`;

const currentlyMonitoringTile = `\
    {
      "name": "<entity-name>",
      "tileType": "DATA_EXPLORER",
      "configured": true,
      "bounds": {
        "top": 190,
        "left": <left-bound>,
        "width": 152,
        "height": 152
      },
      "tileFilter": {},
      "customName": "Single value",
      "queries": [
        {
          "id": "A",
          "timeAggregation": "DEFAULT",
          "metricSelector": "<metric-key>:splitBy(\\"dt.entity.<entity-type>\\"):auto:splitBy():count",
          "enabled": true
        }
      ],
      "visualConfig": {
        "type": "SINGLE_VALUE",
        "global": {},
        "rules": [
          {
            "matcher": "A:",
            "properties": {
              "color": "DEFAULT",
              "seriesType": "COLUMN"
            },
            "seriesOverrides": []
          }
        ],
        "axes": {
          "xAxis": {
            "displayName": "",
            "visible": true
          },
          "yAxes": [
            {
              "displayName": "",
              "visible": true,
              "min": "AUTO",
              "max": "AUTO",
              "position": "LEFT",
              "queryIds": [ "A" ],
              "defaultAxis": true
            }
          ]
        },
        "heatmapSettings": {},
        "singleValueSettings": {
          "showSparkLine": false
        },
        "thresholds": [
          {
            "axisTarget": "LEFT",
            "rules": [
              { "color": "#7dc540" },
              { "color": "#f5d30f" },
              { "color": "#dc172a" }
            ],
            "visible": true
          }
        ],
        "tableSettings": {},
        "graphChartSettings": {
          "connectNulls": false
        },
        "honeycombSettings": {}
      }
    }`;

const entityTitleTile = `\
    {
      "name": "Title <entity-name>",
      "tileType": "MARKDOWN",
      "configured": true,
      "bounds": {
        "top": <top-bound>,
        "left": 0,
        "width": 1406,
        "height": 38
      },
      "tileFilter": {},
      "markdown": "## <entity-name>"
    }`;

const dashboardTemplate = `\
{
  "dashboardMetadata": {
    "name": "<dashboard-title>",
    "shared": true,
    "owner": "Dynatrace",
    "tags": [
      "Overview",
      "<extension-short>"
    ],
    "preset": true,
    "popularity": 1
  },
  "tiles": [
    {
      "name": "Markdown",
      "nameSize": "",
      "tileType": "MARKDOWN",
      "configured": true,
      "bounds": {
        "top": 0,
        "left": 152,
        "width": 1254,
        "height": 76
      },
      "tileFilter": {},
      "markdown": "# <extension-short> Monitoring Overview\\n***"
    },
    {
      "name": "Image",
      "nameSize": "",
      "tileType": "IMAGE",
      "configured": true,
      "bounds": {
        "top": 0,
        "left": 0,
        "width": 152,
        "height": 152
      },
      "tileFilter": {},
      "image": "data:image/webp;base64,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"
    },
    {
      "name": "Markdown",
      "tileType": "MARKDOWN",
      "configured": true,
      "bounds": {
        "top": 152,
        "left": 0,
        "width": <currently-monitoring-width>,
        "height": 38
      },
      "tileFilter": {},
      "markdown": "## Currently monitoring\\n"
    },
    {
      "name": "Markdown",
      "nameSize": "",
      "tileType": "MARKDOWN",
      "configured": true,
      "bounds": {
        "top": 76,
        "left": 152,
        "width": 1254,
        "height": 76
      },
      "tileFilter": {},
      "markdown": "## ⚙️ [Configure extension](/ui/hub/ext/<extension-id>)\\n## 🔗 Navigate to entities: <navigation-links>"
    },
<custom-tiles>
  ]
}`;

/**
 * Populates the dynamic details of a template which creates a Markdown tile with
 * an entity's human readable type name.
 * @param entityName the name of the entity type
 * @param topBound upper boundary of the tile
 * @returns JSON string representing the tile
 */
function buildEntityTitleTile(entityName: string, topBound: number): string {
  let tile = entityTitleTile;
  tile = tile.replace(/<entity-name>/g, entityName);
  tile = tile.replace("<top-bound>", topBound.toString());
  return tile;
}

/**
 * Populates the dynamic details of a template which creates a Single Value tile
 * with the count of entities of a given type.
 * @param entityName the name of the entity type
 * @param entityType the entity type (internal name)
 * @param metricKey key of the metric to use in the tile
 * @param leftBound left boundary of the tile
 * @returns JSON string representing the tile
 */
function buildCurrentlyMonitoringTile(
  entityName: string,
  entityType: string,
  metricKey: string,
  leftBound: number,
): string {
  let tile = currentlyMonitoringTile;
  tile = tile.replace("<entity-name>", entityName);
  tile = tile.replace("<entity-type>", entityType);
  tile = tile.replace("<metric-key>", metricKey);
  tile = tile.replace("<left-bound>", leftBound.toString());
  return tile;
}

/**
 * Populates the dynamic details of a template which creates a Table tile with one or
 * two metrics for a given entity type.
 * @param entityName name of the entity type
 * @param topBound upper boundary of the tile
 * @param tableQueries table queries to use within the table (see {@link buildTableQuery})
 * @returns JSON string representing the tile
 */
function buildEntityTableTile(
  entityName: string,
  topBound: number,
  tableQueries: string = "",
): string {
  let tile = entityTableTile;
  tile = tile.replace("<entity-name>", entityName);
  tile = tile.replace("<top-bound>", topBound.toString());
  tile = tile.replace("<table-queries>", tableQueries);
  return tile;
}

/**
 * Populates the dynamic details of a template which creates a Table Query object. Table
 * queries are used within Table (data explorer) tiles (see {@link buildEntityTableTile}).
 * @param letter index letter of this query
 * @param metricKey key of the metric to use in the query
 * @param entityType name of the entity type queried
 * @returns JSON string representing a Table Query object
 */
function buildTableQuery(letter: string, metricKey: string, entityType: string): string {
  let query = tableQuery;
  query = query.replace("<letter>", letter);
  query = query.replace("<metric-key>", metricKey);
  query = query.replace("<entity-type>", entityType);
  return query;
}

/**
 * Populates the dynamic details of a template which creates a Graph Chart tile.
 * @param metricKey key of the metric to use in the chart
 * @param metricName the display name of the metric to use in the chart
 * @param entityType entity type (internal name) who's metric is queried
 * @param topBound upper boundary of the tile
 * @param leftBound left boundary of the tile
 * @returns
 */
function buildGraphChartTile(
  metricKey: string,
  metricName: string,
  entityType: string,
  topBound: number,
  leftBound: number,
): string {
  let tile = graphChartTile;
  tile = tile.replace("<metric-name>", metricName);
  tile = tile.replace("<metric-key>", metricKey);
  tile = tile.replace("<entity-type>", entityType);
  tile = tile.replace("<top-bound>", topBound.toString());
  tile = tile.replace("<left-bound>", leftBound.toString());
  return tile;
}

/**
 * Parses the extension yaml, collects relevant data, and populates a series of JSON templates
 * that together form an overview dashboard.
 * @param extension extension.yaml serialized as object
 * @param short optional prefix/technology for the extension/dashboard
 * @returns JSON string representing the dashboard
 */
function buildDashboard(extension: ExtensionStub, short: string = "Extension"): string {
  const navigationLinks: string[] = [];
  const customTiles: string[] = [];

  // Gather dynamic content
  const currentlyMonitoringWidth = Math.max(extension.topology?.types?.length ?? 0 * 152, 304);
  extension.topology?.types?.forEach((type, idx) => {
    const tableQueries: string[] = [];
    navigationLinks.push(`[${type.displayName}](ui/entity/list/${type.name})`);
    customTiles.push(buildEntityTitleTile(type.displayName, 76 + (idx + 1) * 304));
    const entityMetrics = getEntityMetrics(idx, extension)
      .map(m => ({
        key: m,
        name: getMetricDisplayName(m, extension),
      }))
      .filter(m => m.name !== "");
    // First found metric used for entity table, graph chart, and single value tile
    if (entityMetrics.length > 0) {
      customTiles.push(
        buildCurrentlyMonitoringTile(type.displayName, type.name, entityMetrics[0].key, idx * 152),
      );
      tableQueries.push(buildTableQuery("A", entityMetrics[0].key, type.name));
      customTiles.push(
        buildGraphChartTile(
          entityMetrics[0].key,
          entityMetrics[0].name,
          type.name,
          114 + (idx + 1) * 304,
          570,
        ),
      );
    }
    // Second found metric used for entity table and graph chart
    if (entityMetrics.length > 1) {
      tableQueries.push(buildTableQuery("B", entityMetrics[1].key, type.name));
      customTiles.push(
        buildGraphChartTile(
          entityMetrics[1].key,
          entityMetrics[1].name,
          type.name,
          114 + (idx + 1) * 304,
          988,
        ),
      );
    }
    customTiles.push(
      buildEntityTableTile(type.displayName, 114 + (idx + 1) * 304, tableQueries.join(",\n")),
    );
  });
  // Put together the details
  let dashboard = dashboardTemplate;
  dashboard = dashboard.replace("<extension-id>", extension.name);
  dashboard = dashboard.replace(
    "<dashboard-title>",
    `Extension Overview (${extension.name}:${extension.version})`,
  );
  dashboard = dashboard.replace(/<extension-short>/g, short);
  dashboard = dashboard.replace(
    "<currently-monitoring-width>",
    currentlyMonitoringWidth.toString(),
  );
  dashboard = dashboard.replace("<navigation-links>", navigationLinks.join(" | "));
  dashboard = dashboard.replace("<custom-tiles>", [...customTiles].join(",\n"));
  return dashboard;
}

/**
 * Workflow for creating an overview dashboard based on the content of the extension.yaml.
 * The extension should have topology defined otherwise the dashboard doesn't have much
 * data to render and is pointless. The extension yaml is adapted to include the newly
 * created dashboard. At the end, the user is prompted to upload the dashboard to Dynatrace
 * @param tenantsProvider environments details proivder
 * @param cachedData provider for cacheable data
 * @param outputChannel JSON output channel for communicating errors
 * @returns
 */
export async function createOverviewDashboard(
  tenantsProvider: EnvironmentsTreeDataProvider,
  cachedData: CachedDataProvider,
  outputChannel: vscode.OutputChannel,
) {
  const DASHBOARD_PATH = "dashboards/overview_dashboard.json";
  // Read extension.yaml
  const extensionFile = getExtensionFilePath();
  if (!extensionFile) {
    return;
  }
  const extensionText = readFileSync(extensionFile).toString();
  const extension = cachedData.getExtensionYaml(extensionText);
  // Check topology. No topology = pointless dashboard
  if (!extension.topology) {
    showMessage("warn", "Please define your topology before running this command.");
    return;
  }

  // Create dashboard
  const dashboardJson = buildDashboard(extension);
  // Create directories for dashboard
  const extensionDir = path.resolve(extensionFile, "..");
  const dashboardsDir = path.resolve(extensionDir, "dashboards");
  if (!existsSync(dashboardsDir)) {
    mkdirSync(dashboardsDir);
  }
  // Write dashboard to file
  const dashboardFile = path.resolve(dashboardsDir, "overview_dashboard.json");
  writeFileSync(dashboardFile, dashboardJson);
  // Edit extension.yaml to include it
  const dashboardsMatch = extensionText.search(/^dashboards:$/gm);
  let updatedExtensionText;
  if (dashboardsMatch > -1) {
    if (!extensionText.includes(`path: ${DASHBOARD_PATH}`)) {
      const indent = extensionText.slice(dashboardsMatch).indexOf("-") - 12;
      const beforeText = extensionText.slice(0, dashboardsMatch);
      const afterText = extensionText.slice(dashboardsMatch + 12);
      updatedExtensionText = `${beforeText}dashboards:\n${" ".repeat(
        indent,
      )}- path: ${DASHBOARD_PATH}\n${afterText}`;
    } else {
      // Nothing to do, dashboard is already present
      updatedExtensionText = extensionText;
    }
  } else {
    updatedExtensionText = `${extensionText}\ndashboards:\n  - path: ${DASHBOARD_PATH}\n`;
  }

  writeFileSync(extensionFile, updatedExtensionText);

  showMessage("info", "Dashboard created successfully");

  // If we're connected to the API, prompt for upload.
  await tenantsProvider.getDynatraceClient().then(async dt => {
    if (dt) {
      await vscode.window
        .showInformationMessage("Would you like to upload it to Dynatrace?", "Yes", "No")
        .then(choice => {
          if (choice === "Yes") {
            dt.dashboards
              .post(JSON.parse(dashboardJson) as Dashboard)
              .then(() => {
                showMessage("info", "Upload successful.");
              })
              .catch(err => {
                outputChannel.replace(JSON.stringify(err, null, 2));
                outputChannel.show();
              });
          }
        });
    }
  });
}
