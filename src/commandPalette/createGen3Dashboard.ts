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

export const createGen3DashboardWorkflow = async () => {
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await createGen3OverviewDashboard();
  }
};

const extNameFind = "<EXTENSION_NAME>";
const extIdFind = "<EXTENSION_ID>";
const entityNameFind = "<ENTITY_NAME>";
const entityTypeFind = "<ENTITY_TYPE>";
const logoLinkFind = "<IMAGE_LINK>";
const metricKeyFind = "<METRIC_KEY>";

interface Tile {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Variable {
  key: string;
  type: string;
  visible: boolean;
  input: string;
  multiple: boolean;
}

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GrailDashboard {
  version: number;
  variables: Variable[];
  tiles: {
    [key: string]: Tile;
  };
  layouts: {
    [key: string]: Layout;
  };
}

const dashboardJsonTemplate = {
  version: 18,
  importedWithCode: true,
  settings: {
    gridLayout: {
      mode: "responsive",
      columnsCount: 40,
    },
  },
  variables: [
    {
      key: "TenantUrl",
      type: "code",
      visible: false,
      input:
        'import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment"\n\nexport default function () {\n  return [getEnvironmentUrl()];\n}',
      multiple: false,
    },
  ],
  tiles: {
    // All tiles dynamically added
  },
  layouts: {
    // All layouts dynamically added
  },
};

// Tiles ordered from top to bottom and left to right
const tileLogo = {
  type: "markdown",
  content: `![](${logoLinkFind})`,
  layout: {
    x: 0,
    y: 0,
    w: 2,
    h: 3,
  },
};

const tileTitle = {
  type: "markdown",
  content: `## Overview of ${extNameFind} extension data\n\nStart here to navigate to the extension configuration and/or entity pages and view charts displaying data collected. **Additional Resources: [${extNameFind} Extension Documentation]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/${extIdFind}/details)**\n\n-----\n#### If you don't see data: ⚙️ [Configure extension]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/${extIdFind}/configs)`,
  layout: {
    x: 2,
    y: 0,
    w: 38,
    h: 3,
  },
};

const tileCurrentlyMonitoring = {
  type: "markdown",
  title: "",
  content: "### Currently Monitoring\n",
  layout: {
    x: 0,
    y: 3,
    w: 40,
    h: 1,
  },
};

const tileEntityCount = {
  type: "data",
  title: `${entityNameFind}`,
  query: `fetch \`dt.entity.${entityTypeFind}\`\n| summarize count()`,
  davis: {
    enabled: false,
    davisVisualization: {
      isAvailable: true,
    },
  },
  visualization: "singleValue",
  visualizationSettings: {
    thresholds: [
      {
        id: "0",
        title: "",
        field: "count()",
        rules: [
          {
            id: 3,
            color: {
              Default: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)",
            },
            comparator: ">",
            label: "",
            value: 0,
          },
        ],
        isEnabled: true,
      },
    ],
    chartSettings: {
      xAxisScaling: "analyzedTimeframe",
      gapPolicy: "connect",
      circleChartSettings: {
        groupingThresholdType: "relative",
        groupingThresholdValue: 0,
        valueType: "relative",
      },
      categoryOverrides: {},
      hiddenLegendFields: [],
      categoricalBarChartSettings: {
        categoryAxis: ["count()"],
        categoryAxisLabel: "count()",
        valueAxis: ["count()"],
        valueAxisLabel: "count()",
        tooltipVariant: "single",
      },
      truncationMode: "middle",
    },
    singleValue: {
      showLabel: false,
      recordField: "count()",
      autoscale: true,
      sparklineSettings: {
        showTicks: true,
        variant: "area",
        record: "host_info",
        visible: false,
        isVisible: false,
      },
      trend: {
        relative: true,
        visible: false,
        isVisible: false,
        trendType: "auto",
      },
      colorThresholdTarget: "background",
      label: "count()",
    },
    table: {
      rowDensity: "condensed",
      enableSparklines: false,
      hiddenColumns: [],
      lineWrapIds: [],
      columnWidths: {},
      columnTypeOverrides: [],
    },
    honeycomb: {
      shape: "hexagon",
      legend: {
        hidden: false,
        position: "auto",
      },
      colorMode: "color-palette",
      colorPalette: "blue",
      dataMappings: {
        value: "count()",
      },
      displayedFields: [null],
    },
    histogram: {
      dataMappings: [
        {
          valueAxis: "count()",
          rangeAxis: "",
        },
      ],
      variant: "single",
      displayedFields: [],
    },
    label: {
      showLabel: false,
      label: "count()",
    },
    icon: {
      showIcon: false,
      icon: "",
    },
    valueBoundaries: {
      min: "auto",
      max: "auto",
    },
    unitsOverrides: [
      {
        identifier: "host_info.single_value",
        unitCategory: "unspecified",
        baseUnit: "count",
        displayUnit: "",
        decimals: 0,
        suffix: "",
        delimiter: false,
        added: 0,
        id: "host_info.single_value",
      },
    ],
    dataMapping: {
      value: "count()",
    },
  },
  querySettings: {
    maxResultRecords: 1000,
    defaultScanLimitGbytes: 500,
    maxResultMegaBytes: 1,
    defaultSamplingRatio: 10,
    enableSampling: false,
  },
};

const tileEntityLinks = {
  type: "markdown",
  content: "#### 🔗 Navigate to entities: ",
  layout: {
    x: 0,
    y: -1, // calculated
    w: 40,
    h: 3,
  },
};

const tileMetricsTitle = {
  type: "markdown",
  content: "## Metrics 📈\n",
  layout: {
    x: 0,
    y: -1, // calculated
    w: 40,
    h: 1,
  },
};

const tileEntityMetricsSection = {
  type: "markdown",
  content: `### ${entityNameFind}`,
  layout: {
    x: 0,
    y: -1, // calculated
    w: 40,
    h: 1,
  },
};

const tileMetricsChart = {
  type: "data",
  title: "",
  query: `timeseries average = avg(\`${metricKeyFind}\`), by: {\`dt.entity.${entityTypeFind}\`}\n| sort arrayAvg(average) desc\n| fieldsAdd entityName(\`dt.entity.${entityTypeFind}\`)\n| limit 20`,
  davis: {
    enabled: false,
    davisVisualization: {
      isAvailable: true,
    },
  },
  visualizationSettings: {
    thresholds: [],
    chartSettings: {
      gapPolicy: "gap",
      circleChartSettings: {
        groupingThresholdType: "relative",
        groupingThresholdValue: 0,
        valueType: "relative",
      },
      categoryOverrides: {},
      curve: "linear",
      pointsDisplay: "auto",
      categoricalBarChartSettings: {
        layout: "horizontal",
        categoryAxisTickLayout: "horizontal",
        scale: "absolute",
        groupMode: "stacked",
        colorPaletteMode: "multi-color",
        valueAxisScale: "linear",
      },
      colorPalette: "categorical",
      valueRepresentation: "absolute",
      truncationMode: "middle",
      xAxisScaling: "analyzedTimeframe",
      xAxisLabel: "timeframe",
      xAxisIsLabelVisible: false,
      hiddenLegendFields: [`dt.entity.${entityTypeFind}`, "interval", "average"],
      fieldMapping: {
        timestamp: "timeframe",
        leftAxisValues: ["average"],
      },
      leftYAxisSettings: {
        isLabelVisible: true,
        label: "",
      },
    },
    singleValue: {
      showLabel: true,
      label: "",
      prefixIcon: "AnalyticsIcon",
      isIconVisible: false,
      autoscale: true,
      alignment: "center",
      colorThresholdTarget: "value",
    },
    table: {
      rowDensity: "condensed",
      enableSparklines: false,
      hiddenColumns: [],
      linewrapEnabled: false,
      lineWrapIds: [],
      monospacedFontEnabled: false,
      monospacedFontColumns: [],
      columnWidths: {},
      columnTypeOverrides: [
        {
          fields: ["average"],
          value: "sparkline",
          id: 1746072737696,
        },
      ],
    },
    honeycomb: {
      shape: "hexagon",
      legend: {
        hidden: false,
        position: "auto",
        ratio: "auto",
      },
      dataMappings: {},
      displayedFields: [],
      truncationMode: "middle",
      colorMode: "color-palette",
      colorPalette: "categorical",
    },
    histogram: {
      legend: {
        position: "auto",
      },
      yAxis: {
        label: "Frequency",
        isLabelVisible: true,
        scale: "linear",
      },
      colorPalette: "categorical",
      dataMappings: [],
      variant: "single",
      truncationMode: "middle",
    },
    valueBoundaries: {
      min: "auto",
      max: "auto",
    },
    autoSelectVisualization: true,
  },
  visualization: "lineChart",
  querySettings: {
    maxResultRecords: 1000,
    defaultScanLimitGbytes: 500,
    maxResultMegaBytes: 1,
    defaultSamplingRatio: 10,
    enableSampling: false,
  },
};

// If line space needed between tiles
// const tileBlankSpace = {
//   type: "markdown",
//   content: "\n",
//   layout: {
//     x: 0,
//     y: -1, // calculated
//     w: 40,
//     h: 1,
//   },
// };

interface MetricMetadata {
  key: string;
  displayName: string;
}

function appendToListMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Parses the extension yaml, collects relevant data, and populates a series of JSON templates
 * that together form an overview dashboard.
 * @param extension extension.yaml serialized as object
 * @param extDisplayName Extension Display name
 * @param logo link to the CDN image to use
 * @returns JSON string representing the dashboard
 */
function buildDashboard(
  extension: ExtensionStub,
  extDisplayName: string,
  logo: string,
  includeMetrics: boolean = true,
): string {
  const newDashboard = { ...dashboardJsonTemplate } as GrailDashboard;
  const dashboardRowWidth = 40;
  let tileCountNow = 1;

  // title, config link, doc link
  const { layout: titleLayout, ...newTitle } = tileTitle;
  newTitle.content = newTitle.content.replace(new RegExp(extNameFind, "g"), extDisplayName);
  newTitle.content = newTitle.content.replace(new RegExp(extIdFind, "g"), extension.name);
  newDashboard.tiles[String(tileCountNow)] = newTitle;
  newDashboard.layouts[String(tileCountNow)] = titleLayout;
  tileCountNow += 1;

  // logo
  const { layout: logoLayout, ...newLogo } = tileLogo;
  newLogo.content = newLogo.content.replace(logoLinkFind, logo);
  newDashboard.tiles[String(tileCountNow)] = newLogo;
  newDashboard.layouts[String(tileCountNow)] = logoLayout;
  tileCountNow += 1;

  // Current Monitoring Header
  const { layout: cmLayout, ...cmTile } = tileCurrentlyMonitoring;
  newDashboard.tiles[String(tileCountNow)] = cmTile;
  newDashboard.layouts[String(tileCountNow)] = cmLayout;
  tileCountNow += 1;

  // Entity Links and Data tiles
  const eCountStartY = 4;
  const eCountTileWidth = 5;
  const eCountTileHeight = 3;
  const eCountTilesPerRow = Math.floor(dashboardRowWidth / eCountTileWidth);
  let entityCountExtraRows = 0; // Wrapper
  const { layout: eLinkLayout, ...newEntityLinks } = tileEntityLinks;
  // TODO gen3 link / app instead
  const entityLinkString = `[${entityNameFind}]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/${entityTypeFind})`;
  const topologyTypes = extension.topology?.types ?? [];
  const entityLinkStringList: string[] = [];
  const tileECountStart = tileCountNow;
  topologyTypes.forEach(eType => {
    // Entity Link Markdown Tile
    let newEntityLink = entityLinkString.replace(entityNameFind, eType.displayName);
    newEntityLink = newEntityLink.replace(entityTypeFind, eType.name);
    entityLinkStringList.push(newEntityLink);

    // New data tile for the Entity count
    const newEntityCountData = { ...tileEntityCount };
    newEntityCountData.title = newEntityCountData.title.replace(entityNameFind, eType.displayName);
    newEntityCountData.query = newEntityCountData.query.replace(entityTypeFind, eType.name);

    // Tiles should wrap around when xPos >= 40
    const tileDrawNumber = tileCountNow - tileECountStart; // 0, 1, 2, 3, 4, 5, 6
    const xTotalStart = tileDrawNumber * eCountTileWidth;
    const xTotalEnd = xTotalStart + eCountTileWidth;
    const xPosition = (tileDrawNumber % eCountTilesPerRow) * eCountTileWidth;
    if (xTotalEnd > dashboardRowWidth) {
      entityCountExtraRows = Math.floor(xTotalEnd / dashboardRowWidth);
    }
    const yPosition = eCountStartY + entityCountExtraRows * eCountTileHeight;

    newDashboard.tiles[String(tileCountNow)] = newEntityCountData;
    newDashboard.layouts[String(tileCountNow)] = {
      x: xPosition,
      y: yPosition,
      w: eCountTileWidth,
      h: eCountTileHeight,
    };

    tileCountNow++;
  });

  newEntityLinks.content = newEntityLinks.content + entityLinkStringList.join(" | ");
  eLinkLayout.y = eCountStartY + eCountTileHeight + entityCountExtraRows * eCountTileHeight;
  newDashboard.tiles[String(tileCountNow)] = newEntityLinks;
  newDashboard.layouts[String(tileCountNow)] = eLinkLayout;
  tileCountNow++;

  if (!includeMetrics) {
    return JSON.stringify(newDashboard);
  }

  const metrics = extension.metrics ?? [];
  const defaultEnvType = "environment";
  const defaultEnvName = "Environment";

  // Maintain order - assuming most generic useful metrics are at the top
  const entityMetricMap = new Map<string, MetricMetadata[]>();
  metrics.forEach(metric => {
    const sourceEntity = metric.metadata.sourceEntityType ?? defaultEnvType; // General environment metrics such as 'api connectivity'.
    appendToListMap(entityMetricMap, sourceEntity, {
      key: metric.key,
      displayName: metric.metadata.displayName,
    });
  });

  if (entityMetricMap.size < 1) {
    // No metrics defined
    return JSON.stringify(newDashboard);
  }

  // Metrics Header
  let metricStartY = eLinkLayout.y + eLinkLayout.h;
  const { layout: metricTitleLayout, ...metricTitle } = tileMetricsTitle;
  newDashboard.tiles[String(tileCountNow)] = metricTitle;
  newDashboard.layouts[String(tileCountNow)] = {
    ...metricTitleLayout,
    y: metricStartY,
  };
  metricStartY += metricTitleLayout.h;
  tileCountNow++;

  // Lookup the Topology Type display name
  const topologyMap = new Map<string, string>();
  topologyMap.set(defaultEnvType, defaultEnvName);
  topologyTypes.forEach(eType => {
    topologyMap.set(eType.name, eType.displayName);
  });

  // Compute each metric section
  // X metrics per type? or just everything.
  const maxMetricsPerType = -1; // set -1 for all.
  const metricChartsPerRow = 3;
  const metricChartWidth = Math.floor(dashboardRowWidth / metricChartsPerRow);
  const metricChartHeight = 4;

  entityMetricMap.forEach((metricList, eTypeKey) => {
    const entityDisplayName = topologyMap.get(eTypeKey) ?? eTypeKey;
    const { layout: entityTitleLayout, ...newEntityTitle } = tileEntityMetricsSection;
    newEntityTitle.content = newEntityTitle.content.replace(entityNameFind, entityDisplayName);
    newDashboard.tiles[String(tileCountNow)] = newEntityTitle;
    newDashboard.layouts[String(tileCountNow)] = {
      ...entityTitleLayout,
      y: metricStartY,
    };
    tileCountNow++;
    metricStartY += entityTitleLayout.h;

    const tileMetricStart = tileCountNow;
    let metricChartExtraRows = 0;
    const chartMetrics =
      maxMetricsPerType < 0 ? metricList : metricList.slice(0, maxMetricsPerType);
    chartMetrics.forEach(metricMeta => {
      const newMetricChart = { ...tileMetricsChart };
      newMetricChart.title = metricMeta.displayName;
      newMetricChart.query = newMetricChart.query.replace(metricKeyFind, metricMeta.key);
      newMetricChart.query = newMetricChart.query.replace(
        new RegExp(entityTypeFind, "g"),
        eTypeKey,
      );

      newMetricChart.visualizationSettings.chartSettings.leftYAxisSettings.label =
        metricMeta.displayName;

      // Hide the entity ID from charts
      newMetricChart.visualizationSettings.chartSettings.hiddenLegendFields =
        newMetricChart.visualizationSettings.chartSettings.hiddenLegendFields.map(str =>
          str.replace(entityTypeFind, eTypeKey),
        );

      // Tiles should wrap around when xPos >= 40
      const tileDrawNumber = tileCountNow - tileMetricStart;
      const xTotalStart = tileDrawNumber * metricChartWidth;
      const xTotalEnd = xTotalStart + metricChartWidth;
      const xPosition = (tileDrawNumber % metricChartsPerRow) * metricChartWidth;
      if (xTotalEnd > dashboardRowWidth) {
        metricChartExtraRows = Math.floor(xTotalEnd / dashboardRowWidth);
      }
      const yPosition = metricStartY + metricChartExtraRows * metricChartHeight;

      newDashboard.tiles[String(tileCountNow)] = newMetricChart;
      newDashboard.layouts[String(tileCountNow)] = {
        x: xPosition,
        y: yPosition,
        w: metricChartWidth,
        h: metricChartHeight,
      };

      tileCountNow++;
    });
    metricStartY = metricStartY + metricChartHeight + metricChartExtraRows * metricChartHeight;
  });

  // Dynamic metric generation
  return JSON.stringify(newDashboard);
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

  const defaultExtName = "Extension";
  const userExtName = await vscode.window.showInputBox({
    title: "Extension Name",
    value: defaultExtName,
    ignoreFocusOut: true,
  });
  const extDisplayName = userExtName ?? defaultExtName;

  // example Oracle logo: https://dt-cdn.net/hub/oracle_gkmEyXV.png
  const defaultLogo = "https://dt-cdn.net/hub/logos/extensions-health.png";
  const userLogo = await vscode.window.showInputBox({
    title: "Dashboard Logo Image",
    value: defaultLogo,
    ignoreFocusOut: true,
  });
  const dashboardLogo = userLogo ?? defaultLogo;
  const dashboardJson = buildDashboard(extension, extDisplayName, dashboardLogo);

  // Create directories and json file for dashboard
  const documentsDirName = "documents";
  const extfilePrefix = extDisplayName.toLowerCase().replace(/ /g, "_");
  const overviewDashboardName = `${extfilePrefix}_overview.dashboard.json`;
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
    displayName: `${extDisplayName} Overview`,
    path: dashboardPath,
  };

  // NOTE THIS WORKS, but updates and reformats all of the existing yaml. TODO clean this up
  const updatedExtensionText = getUpdatedExtensionString(extension, newDashboardYaml);
  writeFileSync(extensionFile, updatedExtensionText);

  logger.notify("INFO", "Dashboard created successfully", ...fnLogTrace);
}
