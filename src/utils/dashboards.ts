import { writeFileSync, readFileSync } from "fs";
import yaml from "yaml";
import { ExtensionStub, DocumentDashboard } from "../interfaces/extensionMeta";

export const TemplateText = {
  extName: "<EXTENSION_NAME>",
  extId: "<EXTENSION_ID>",
  entityName: "<ENTITY_NAME>",
  entityType: "<ENTITY_TYPE>",
  logoLink: "<IMAGE_LINK>",
  metricKey: "<METRIC_KEY>",
  metric1Key: "<METRIC_KEY1>",
  metric2Key: "<METRIC_KEY2>",
  metric1Name: "<METRIC_NAME1>",
  metric2Name: "<METRIC_NAME2>",
} as const;

export const PlatformDashboardSize = {
  totalColumnsWidth: 24, // Recommended number of dashboard columns for responsive sizing
  logoImageWidth: 2,
  entityLinksTileWidth: 4,
  entityCountTileWidth: 4,
  entityCountTileHeight: 3,
  logoOverviewHeight: 4,
  dividerHeadingHeight: 1,
  metricChartHeight: 4,
  calculatedValue: -1,
};

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const dashboardJsonTemplate: GrailDashboard = {
  version: 18,
  importedWithCode: true,
  settings: {
    gridLayout: {
      mode: "responsive",
      columnsCount: PlatformDashboardSize.totalColumnsWidth,
    },
  },
  variables: [],
  tiles: {
    // All tiles dynamically added
  },
  layouts: {
    // All layouts dynamically added
  },
};

const metricTableQuerySingle = `timeseries {\n  metric1=avg(\`${TemplateText.metric1Key}\`)},\nby: {\`dt.entity.${TemplateText.entityType}\`}\n| fieldsAdd entity_name = entityName(\`dt.entity.${TemplateText.entityType}\`)\n| fieldsAdd entity_id = \`dt.entity.${TemplateText.entityType}\`\n| fieldsAdd entity_url = concat("/ui/apps/dynatrace.classic.technologies/ui/entity/", entity_id)\n| fieldsAdd entity = concat("[", entity_name, "]", "(", entity_url, ")")\n| fieldsAdd \`${TemplateText.metric1Name}\` = arrayLast(metric1)\n| sort entity_name asc\n| fields entity, \`${TemplateText.metric1Name}\`\n| limit 20`;
const metricTableQueryDouble = `timeseries {\n  metric1=avg(\`${TemplateText.metric1Key}\`),\n  metric2=avg(\`${TemplateText.metric2Key}\`)\n},\nby: {\`dt.entity.${TemplateText.entityType}\`}\n| fieldsAdd entity_name = entityName(\`dt.entity.${TemplateText.entityType}\`)\n| fieldsAdd entity_id = \`dt.entity.${TemplateText.entityType}\`\n| fieldsAdd entity_url = concat("/ui/apps/dynatrace.classic.technologies/ui/entity/", entity_id)\n| fieldsAdd entity = concat("[", entity_name, "]", "(", entity_url, ")")\n| fieldsAdd \`${TemplateText.metric1Name}\` = arrayLast(metric1)\n| fieldsAdd \`${TemplateText.metric2Name}\` = arrayLast(metric2)\n| sort entity_name asc\n| fields entity, \`${TemplateText.metric1Name}\`, \`${TemplateText.metric2Name}\`\n| limit 20`;

const TemplateTile = {
  logo: {
    type: "markdown",
    content: `![](${TemplateText.logoLink})`,
    layout: {
      x: 0,
      y: 0,
      w: PlatformDashboardSize.logoImageWidth,
      h: PlatformDashboardSize.logoOverviewHeight,
    },
  },
  title: {
    type: "markdown",
    content: `## Overview of ${TemplateText.extName} extension data\n\nStart here to navigate to the extension configuration and entity pages to view charts displaying data collected.\n\n-----\n#### [⚙️ Configure Extension](/ui/apps/dynatrace.extensions.manager/configurations/${TemplateText.extId}/configs)\n#### [📖 Documentation](/ui/apps/dynatrace.extensions.manager/configurations/${TemplateText.extId}/details)`,
    layout: {
      x: PlatformDashboardSize.logoImageWidth,
      y: 0,
      w: PlatformDashboardSize.totalColumnsWidth - PlatformDashboardSize.logoImageWidth,
      h: PlatformDashboardSize.logoOverviewHeight,
    },
  },
  currentlyMonitoring: {
    type: "markdown",
    title: "",
    content: "### Currently Monitoring\n",
    layout: {
      x: 0,
      y: PlatformDashboardSize.logoOverviewHeight,
      w: PlatformDashboardSize.totalColumnsWidth,
      h: PlatformDashboardSize.dividerHeadingHeight,
    },
  },
  entityCount: {
    type: "data",
    title: `${TemplateText.entityName}`,
    query: `fetch \`dt.entity.${TemplateText.entityType}\`\n| summarize count()`,
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
  },
  entityLinks: {
    type: "markdown",
    content: "#### 🔗 Navigate to entities:\n",
    layout: {
      x: PlatformDashboardSize.totalColumnsWidth - PlatformDashboardSize.entityLinksTileWidth, // default 20
      y: PlatformDashboardSize.calculatedValue,
      w: PlatformDashboardSize.entityLinksTileWidth, // default 4
      h: PlatformDashboardSize.calculatedValue,
    },
  },
  metricsTitle: {
    type: "markdown",
    content: "## Metric Summary 📈\n",
    layout: {
      x: 0,
      y: PlatformDashboardSize.calculatedValue,
      w: PlatformDashboardSize.totalColumnsWidth,
      h: PlatformDashboardSize.dividerHeadingHeight,
    },
  },
  metricsSection: {
    type: "markdown",
    content: `### ${TemplateText.entityName}`,
    layout: {
      x: 0,
      y: PlatformDashboardSize.calculatedValue,
      w: PlatformDashboardSize.totalColumnsWidth,
      h: PlatformDashboardSize.dividerHeadingHeight,
    },
  },
  metricsTable: {
    type: "data",
    title: "",
    query: metricTableQueryDouble,
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
  },
  metricsChart: {
    type: "data",
    title: "",
    query: `timeseries average = avg(\`${TemplateText.metricKey}\`), by: {\`dt.entity.${TemplateText.entityType}\`}\n| sort arrayAvg(average) desc\n| fieldsAdd name=entityName(\`dt.entity.${TemplateText.entityType}\`)\n| fieldsAdd name = coalesce(name, "environment")\n| fieldsRemove \`dt.entity.${TemplateText.entityType}\`\n| limit 20`,
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
  },
  blankDivider: {
    type: "markdown",
    content: "\n",
    layout: {
      x: 0,
      y: PlatformDashboardSize.calculatedValue,
      w: PlatformDashboardSize.totalColumnsWidth,
      h: PlatformDashboardSize.dividerHeadingHeight,
    },
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
export function buildPlatformDashboard(
  extension: ExtensionStub,
  extDisplayName: string,
  logo: string,
  includeMetrics: boolean = true,
): string {
  const newDashboard = { ...dashboardJsonTemplate } as GrailDashboard;
  let tileCountNow = 1;

  // title, config link, doc link
  const { layout: titleLayout, ...newTitle } = TemplateTile.title;
  newTitle.content = newTitle.content.replace(
    new RegExp(TemplateText.extName, "g"),
    extDisplayName,
  );
  newTitle.content = newTitle.content.replace(new RegExp(TemplateText.extId, "g"), extension.name);
  newDashboard.tiles[String(tileCountNow)] = newTitle;
  newDashboard.layouts[String(tileCountNow)] = titleLayout;
  tileCountNow += 1;

  // logo
  const { layout: logoLayout, ...newLogo } = TemplateTile.logo;
  newLogo.content = newLogo.content.replace(TemplateText.logoLink, logo);
  newDashboard.tiles[String(tileCountNow)] = newLogo;
  newDashboard.layouts[String(tileCountNow)] = logoLayout;
  tileCountNow += 1;

  // Current Monitoring Header
  const { layout: cmLayout, ...cmTile } = TemplateTile.currentlyMonitoring;
  newDashboard.tiles[String(tileCountNow)] = cmTile;
  newDashboard.layouts[String(tileCountNow)] = cmLayout;
  tileCountNow += 1;

  // Entity Links and Data tiles
  const eCountStartY =
    PlatformDashboardSize.logoOverviewHeight + PlatformDashboardSize.dividerHeadingHeight; // Default 5
  const eCountTileTotalWidth =
    PlatformDashboardSize.totalColumnsWidth - PlatformDashboardSize.entityLinksTileWidth; // Default 20
  let firstRowlastTileXPos = 0;
  const eCountTilesPerRow = Math.floor(
    eCountTileTotalWidth / PlatformDashboardSize.entityCountTileWidth,
  );
  let entityCountExtraRows = 0; // Wrapper
  const { layout: eLinkLayout, ...newEntityLinks } = TemplateTile.entityLinks;
  // TODO gen3 link / app instead
  const entityLinkString = `* [${TemplateText.entityName}](/ui/apps/dynatrace.classic.technologies/ui/entity/list/${TemplateText.entityType})`;
  const topologyTypes = extension.topology?.types ?? [];
  const entityLinkStringList: string[] = [];
  const tileECountStart = tileCountNow;
  topologyTypes.forEach(eType => {
    // Entity Link Markdown Tile
    let newEntityLink = entityLinkString.replace(TemplateText.entityName, eType.displayName);
    newEntityLink = newEntityLink.replace(TemplateText.entityType, eType.name);
    entityLinkStringList.push(newEntityLink);

    // New data tile for the Entity count
    const newEntityCountData = { ...TemplateTile.entityCount };
    newEntityCountData.title = newEntityCountData.title.replace(
      TemplateText.entityName,
      eType.displayName,
    );
    newEntityCountData.query = newEntityCountData.query.replace(
      TemplateText.entityType,
      eType.name,
    );

    // Tiles should wrap around when xPos >= eCountTileTotalWidth (space for navigate to entities)
    const tileDrawNumber = tileCountNow - tileECountStart; // 0, 1, 2, 3, 4, 5, 6
    const xTotalStart = tileDrawNumber * PlatformDashboardSize.entityCountTileWidth;
    const xTotalEnd = xTotalStart + PlatformDashboardSize.entityCountTileWidth;
    const xPosition =
      (tileDrawNumber % eCountTilesPerRow) * PlatformDashboardSize.entityCountTileWidth;
    if (xTotalEnd > eCountTileTotalWidth) {
      entityCountExtraRows = Math.floor(xTotalEnd / eCountTileTotalWidth);
    }
    const yPosition =
      eCountStartY + entityCountExtraRows * PlatformDashboardSize.entityCountTileHeight;

    if (entityCountExtraRows === 0) {
      firstRowlastTileXPos = xPosition + PlatformDashboardSize.entityCountTileWidth;
    }

    newDashboard.tiles[String(tileCountNow)] = newEntityCountData;
    newDashboard.layouts[String(tileCountNow)] = {
      x: xPosition,
      y: yPosition,
      w: PlatformDashboardSize.entityCountTileWidth,
      h: PlatformDashboardSize.entityCountTileHeight,
    };

    tileCountNow++;
  });

  newEntityLinks.content = newEntityLinks.content + entityLinkStringList.join("\n");
  eLinkLayout.y = eCountStartY;
  eLinkLayout.h =
    PlatformDashboardSize.entityCountTileHeight +
    entityCountExtraRows * PlatformDashboardSize.entityCountTileHeight;
  if (entityCountExtraRows === 0) {
    eLinkLayout.w = PlatformDashboardSize.totalColumnsWidth - firstRowlastTileXPos;
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
  const { layout: blankSpaceLayout, ...blankTile } = TemplateTile.blankDivider;
  newDashboard.tiles[String(tileCountNow)] = blankTile;
  newDashboard.layouts[String(tileCountNow)] = {
    ...blankSpaceLayout,
    y: metricStartY,
  };
  metricStartY += blankSpaceLayout.h;
  tileCountNow++;

  // Metrics Header
  const { layout: metricTitleLayout, ...metricTitle } = TemplateTile.metricsTitle;
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
  const metricChartWidth = Math.floor(PlatformDashboardSize.totalColumnsWidth / metricChartsPerRow);

  entityMetricMap.forEach((metricList, eTypeKey) => {
    const entityDisplayName = topologyMap.get(eTypeKey) ?? eTypeKey;
    const { layout: entityTitleLayout, ...newEntityTitle } = TemplateTile.metricsSection;
    newEntityTitle.content = newEntityTitle.content.replace(
      TemplateText.entityName,
      entityDisplayName,
    );
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
      const newMetricTable = { ...TemplateTile.metricsTable };
      newMetricTable.title = "Summary - last value";
      const metric1 = chartMetrics[0];
      const metric2 = chartMetrics[1] ?? chartMetrics[0];
      const dropMetric2 = chartMetrics[1] === undefined;

      if (dropMetric2) {
        newMetricTable.query = metricTableQuerySingle;
      }

      // No dt.entity.environemnt link
      if (eTypeKey == defaultEnvType) {
        const entityField = "entity,";
        newMetricTable.query = newMetricTable.query.replace(entityField, "");
      }

      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(TemplateText.entityType, "g"),
        eTypeKey,
      );

      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(TemplateText.metric1Key, "g"),
        metric1.key,
      );
      newMetricTable.query = newMetricTable.query.replace(
        new RegExp(TemplateText.metric1Name, "g"),
        metric1.displayName,
      );

      if (!dropMetric2) {
        newMetricTable.query = newMetricTable.query.replace(
          new RegExp(TemplateText.metric2Name, "g"),
          metric2.displayName,
        );
        newMetricTable.query = newMetricTable.query.replace(
          new RegExp(TemplateText.metric2Key, "g"),
          metric2.key,
        );
      }

      newDashboard.tiles[String(tileCountNow)] = newMetricTable;
      newDashboard.layouts[String(tileCountNow)] = {
        x: 0,
        y: metricStartY,
        w: metricChartWidth,
        h: PlatformDashboardSize.metricChartHeight,
      };
      tileCountNow++;
    }

    chartMetrics.forEach(metricMeta => {
      const newMetricChart = structuredClone(TemplateTile.metricsChart); // AxisLabels get updated and are deeply nested
      newMetricChart.title = metricMeta.displayName;
      newMetricChart.query = newMetricChart.query.replace(TemplateText.metricKey, metricMeta.key);
      newMetricChart.query = newMetricChart.query.replace(
        new RegExp(TemplateText.entityType, "g"),
        eTypeKey,
      );

      newMetricChart.visualizationSettings.chartSettings.leftYAxisSettings.label =
        metricMeta.displayName;

      // Tiles will automatically wrap around
      const tileDrawNumber = tileCountNow - tileMetricStart;
      const xTotalStart = tileDrawNumber * metricChartWidth;
      const xTotalEnd = xTotalStart + metricChartWidth;
      const xPosition = (tileDrawNumber % metricChartsPerRow) * metricChartWidth;
      if (xTotalEnd > PlatformDashboardSize.totalColumnsWidth) {
        metricChartExtraRows = Math.floor(xTotalEnd / PlatformDashboardSize.totalColumnsWidth);
      }
      const yPosition =
        metricStartY + metricChartExtraRows * PlatformDashboardSize.metricChartHeight;

      newDashboard.tiles[String(tileCountNow)] = newMetricChart;
      newDashboard.layouts[String(tileCountNow)] = {
        x: xPosition,
        y: yPosition,
        w: metricChartWidth,
        h: PlatformDashboardSize.metricChartHeight,
      };

      tileCountNow++;
    });

    // Divider
    metricStartY =
      metricStartY +
      PlatformDashboardSize.metricChartHeight +
      metricChartExtraRows * PlatformDashboardSize.metricChartHeight;
    const { layout: metricSpaceLayout, ...blankMetricTile } = TemplateTile.blankDivider;
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
export function buildUpdatedDocumentYaml(
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
 * Update (or add) the extension yaml documents: or dashboards: block. Writes the updated extension.yaml file
 * String replacement to preserve file order and formatting.
 * line by line parsing, instead of regex for match consistency
 * @param filePath extension.yaml file path
 * @param nodeName parent level yaml node - e.g., documents: or dashboards:
 * @param newNode yaml string containing the new documents: node
 * @returns
 */
export function updateYamlNode(filePath: string, nodeName: string, newNode: string): void {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const startIndex = lines.findIndex(line => line.startsWith(nodeName));

  if (startIndex === -1) {
    // No existing yaml node found, append at the end
    const updatedText = `${lines.join("\n")}\n\n${newNode.trim()}\n`;
    writeFileSync(filePath, updatedText);
    return;
  }

  // Find the end of yaml node
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
    ...newNode.trimEnd().split("\n"),
    preservedBlankLines,
    ...lines.slice(endIndex + blankLineCount),
  ];

  let updatedText = updatedLines.join("\n");
  if (!updatedText.endsWith("\n")) {
    updatedText += "\n";
  }

  writeFileSync(filePath, updatedText);
}
