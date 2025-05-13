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

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
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
    w: 3,
    h: 4,
  },
};

const tileTitle = {
  type: "markdown",
  content: `## Overview of ${extNameFind} extension data\n\nStart here to navigate to the extension configuration and entity pages to view charts displaying data collected.\n\n-----\n#### [⚙️ Configure Extension]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/${extIdFind}/configs)\n#### [📖 Documentation]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/${extIdFind}/details)`,
  layout: {
    x: 3,
    y: 0,
    w: 37,
    h: 4,
  },
};

const tileCurrentlyMonitoring = {
  type: "markdown",
  title: "",
  content: "### Currently Monitoring\n",
  layout: {
    x: 0,
    y: 4,
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
  content: "#### 🔗 Navigate to entities:\n",
  layout: {
    x: 30, // default
    y: -1, // calculated
    w: 10, // default
    h: 3, // default
  },
};

const tileMetricsTitle = {
  type: "markdown",
  content: "## Metric Summary 📈\n",
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

const metric1KeyFind = "<METRIC_KEY1>";
const metric2KeyFind = "<METRIC_KEY2>";
const metric1NameFind = "<METRIC_NAME1>";
const metric2NameFind = "<METRIC_NAME2>";
const fieldsLine = `fields entity, \`${metric1NameFind}\`, \`${metric2NameFind}\`\n`;
const tileMetricsTable = {
  type: "data",
  title: "",
  query: `timeseries {\n  metric1=avg(\`${metric1KeyFind}\`),\n  metric2=avg(\`${metric2KeyFind}\`)\n},\nby: {\`dt.entity.${entityTypeFind}\`}\n| fieldsAdd entity_name = entityName(\`dt.entity.${entityTypeFind}\`)\n| fieldsAdd entity_id = \`dt.entity.${entityTypeFind}\`\n| fieldsAdd entity_url = concat($TenantUrl, "/ui/apps/dynatrace.classic.technologies/ui/entity/", entity_id)\n| fieldsAdd entity = concat("[", entity_name, "]", "(", entity_url, ")")\n| fieldsAdd \`${metric1NameFind}\` = arrayLast(metric1)\n| fieldsAdd \`${metric2NameFind}\` = arrayLast(metric2)\n| sort entity_name asc\n| ${fieldsLine}| limit 20`,
  davis: {
    enabled: false,
    davisVisualization: {
      isAvailable: true,
    },
  },
  visualizationSettings: {
    autoSelectVisualization: false,
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
          id: 913702.4000000004,
          fields: ["entity"],
          value: "markdown",
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
  },
  visualization: "table",
  querySettings: {
    maxResultRecords: 1000,
    defaultScanLimitGbytes: 500,
    maxResultMegaBytes: 1,
    defaultSamplingRatio: 10,
    enableSampling: false,
  },
};

const tileMetricsChart = {
  type: "data",
  title: "",
  query: `timeseries average = avg(\`${metricKeyFind}\`), by: {\`dt.entity.${entityTypeFind}\`}\n| sort arrayAvg(average) desc\n| fieldsAdd name=entityName(\`dt.entity.${entityTypeFind}\`)\n| fieldsAdd name = coalesce(name, "environment")\n| fieldsRemove \`dt.entity.${entityTypeFind}\`\n| limit 20`,
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
      hiddenLegendFields: ["interval", "average"],
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
const tileBlankSpace = {
  type: "markdown",
  content: "\n",
  layout: {
    x: 0,
    y: -1, // calculated
    w: 40,
    h: 1,
  },
};

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
  const eCountStartY = 5;
  const eCountTileWidth = 6;
  const eCountTileHeight = 3;
  const eCountTileTotalWidth = 30;
  let firstRowlastTileXPos = 0;
  const eCountTilesPerRow = Math.floor(eCountTileTotalWidth / eCountTileWidth);
  let entityCountExtraRows = 0; // Wrapper
  const { layout: eLinkLayout, ...newEntityLinks } = tileEntityLinks;
  // TODO gen3 link / app instead
  const entityLinkString = `* [${entityNameFind}]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/${entityTypeFind})`;
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

    // Tiles should wrap around when xPos >= 30 (space for navigate to entities)
    const tileDrawNumber = tileCountNow - tileECountStart; // 0, 1, 2, 3, 4, 5, 6
    const xTotalStart = tileDrawNumber * eCountTileWidth;
    const xTotalEnd = xTotalStart + eCountTileWidth;
    const xPosition = (tileDrawNumber % eCountTilesPerRow) * eCountTileWidth;
    if (xTotalEnd > eCountTileTotalWidth) {
      entityCountExtraRows = Math.floor(xTotalEnd / eCountTileTotalWidth);
    }
    const yPosition = eCountStartY + entityCountExtraRows * eCountTileHeight;

    if (entityCountExtraRows === 0) {
      firstRowlastTileXPos = xPosition + eCountTileWidth;
    }

    newDashboard.tiles[String(tileCountNow)] = newEntityCountData;
    newDashboard.layouts[String(tileCountNow)] = {
      x: xPosition,
      y: yPosition,
      w: eCountTileWidth,
      h: eCountTileHeight,
    };

    tileCountNow++;
  });

  newEntityLinks.content = newEntityLinks.content + entityLinkStringList.join("\n");
  eLinkLayout.y = eCountStartY;
  eLinkLayout.h = eCountTileHeight + entityCountExtraRows * eCountTileHeight;
  if (entityCountExtraRows === 0) {
    eLinkLayout.w = dashboardRowWidth - firstRowlastTileXPos;
  } else {
    firstRowlastTileXPos = eCountTileTotalWidth;
  }
  eLinkLayout.x = firstRowlastTileXPos;
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
    if (metric.key.startsWith("func")) {
      // Not applicable for gen3
      return;
    }
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

  // Divider
  let metricStartY = eLinkLayout.y + eLinkLayout.h;
  const { layout: blankSpaceLayout, ...blankTile } = tileBlankSpace;
  newDashboard.tiles[String(tileCountNow)] = blankTile;
  newDashboard.layouts[String(tileCountNow)] = {
    ...blankSpaceLayout,
    y: metricStartY,
  };
  metricStartY += blankSpaceLayout.h;
  tileCountNow++;

  // Metrics Header
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
  // 2 metrics per type.
  // Charts - 1 overview table (2 metrics) + x basic line charts
  const maxMetricsPerType = 2; // set -1 for all.
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

    // Overview Table
    if (chartMetrics.length > 0) {
      const newMetricTable = { ...tileMetricsTable };
      newMetricTable.title = "Summary - last value";
      const metric1 = chartMetrics[0];
      const metric2 = chartMetrics[1] ?? chartMetrics[0];
      const dropMetric2 = chartMetrics[1] === undefined;

      if (dropMetric2) {
        const newFieldsLine = `fields entity, \`${metric1NameFind}\`\n`;
        newMetricTable.query = newMetricTable.query.replace(fieldsLine, newFieldsLine);
      }

      // No dt.entity.environemnt link
      if (eTypeKey == defaultEnvType) {
        const entityField = "entity,";
        newMetricTable.query = newMetricTable.query.replace(entityField, "");
      }

      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(entityTypeFind, "g"),
        eTypeKey,
      );

      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(metric1KeyFind, "g"),
        metric1.key,
      );
      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(metric1NameFind, "g"),
        metric1.displayName,
      );

      if (!dropMetric2) {
        newMetricTable.query = newMetricTable.query.replace(
          new RegExp(metric2NameFind, "g"),
          metric2.displayName,
        );
        newMetricTable.query = newMetricTable.query.replace(
          new RegExp(metric2KeyFind, "g"),
          metric2.key,
        );
      }

      newDashboard.tiles[String(tileCountNow)] = newMetricTable;
      newDashboard.layouts[String(tileCountNow)] = {
        x: 0,
        y: metricStartY,
        w: metricChartWidth,
        h: metricChartHeight,
      };
      tileCountNow++;
    }

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

      // Tiles should wrap around when xPos >= dashboardRowWidth (40)
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

    // Divider
    metricStartY = metricStartY + metricChartHeight + metricChartExtraRows * metricChartHeight;
    const { layout: metricSpaceLayout, ...blankMetricTile } = tileBlankSpace;
    newDashboard.tiles[String(tileCountNow)] = blankMetricTile;
    newDashboard.layouts[String(tileCountNow)] = {
      ...metricSpaceLayout,
      y: metricStartY,
    };
    metricStartY += blankSpaceLayout.h;
    tileCountNow++;
  });

  // Dynamic metric generation
  return JSON.stringify(newDashboard);
}

/**
 * Build the extension yaml documents: block
 * @param extension extension.yaml serialized as object
 * @param newDashboard Object with the dashboard name and path
 * @returns yaml string representing the documents: node
 */
function buildUpdatedDocumentYaml(
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

  // Returns just the updated documents yaml.
  // Returning and rewriting all yaml reformats and reorders things
  const newDocumentYaml = { documents: extension.documents };
  return yaml.stringify(newDocumentYaml);
}

/**
 * Update (or add) the extension yaml documents: block. Writes the updated extension.yaml file
 * String replacement to preserve file order and formatting.
 * line by line parsing, instead of regex for match consistency
 * @param filePath extension.yaml file path
 * @param newDocumentsBlock yaml string containing the new documents: node
 * @returns
 */
function updateYamlDocumentsBlock(filePath: string, newDocumentsBlock: string): void {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const startIndex = lines.findIndex(line => line.trim() === "documents:");

  if (startIndex === -1) {
    // No documents block found, append at the end
    const updatedText = `${lines.join("\n")}\n\n${newDocumentsBlock.trim()}\n`;
    writeFileSync(filePath, updatedText);
    return;
  }

  // Find the end of the documents block
  let endIndex = startIndex + 1;
  while (
    endIndex < lines.length &&
    (/^\s/.test(lines[endIndex]) || lines[endIndex].trim() === "")
  ) {
    endIndex++;
  }

  // Count trailing blank lines after the block
  let blankLineCount = 0;
  while (
    endIndex + blankLineCount < lines.length &&
    lines[endIndex + blankLineCount].trim() === ""
  ) {
    blankLineCount++;
  }

  const preservedBlankLines = "\n".repeat(blankLineCount);
  const updatedLines = [
    ...lines.slice(0, startIndex),
    ...newDocumentsBlock.trimEnd().split("\n"),
    preservedBlankLines,
    ...lines.slice(endIndex + blankLineCount),
  ];

  let updatedText = updatedLines.join("\n");
  if (!updatedText.endsWith("\n")) {
    updatedText += "\n";
  }

  writeFileSync(filePath, updatedText);
}

/**
 * Workflow for creating an Gen3 overview dashboard based on the content of the extension.yaml.
 * Requires min Dynatrace version of 1.309.0
 * Based on the defined template
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

  // Gen3 Dashboard documents only supported from version: 1.309+
  const [majorStr, minorStr] = extension.minDynatraceVersion.split(".");
  const majorVersion = parseInt(majorStr, 10);
  const minorVersion = parseInt(minorStr, 10);

  if (majorVersion === 1 && minorVersion < 309) {
    logger.notify(
      "WARN",
      "Extension version must be >= 1.309.0 for gen3 document dashboards",
      ...fnLogTrace,
    );
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
  const updatedDocumentText = buildUpdatedDocumentYaml(extension, newDashboardYaml);
  updateYamlDocumentsBlock(extensionFile, updatedDocumentText);

  logger.notify("INFO", "Dashboard created successfully", ...fnLogTrace);
}
