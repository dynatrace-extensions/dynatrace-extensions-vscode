export const EXTENSION_TEMPLATE = () => {
  const extJson = {
    version: 17,
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
      "1": {
        type: "markdown",
        title: "",
        content:
          "### Overview of <EXTENSION_NAME> extension data\n\nStart here to navigate to the extension configuration and/or entity pages and view charts displaying data collected. If you don't see data: ⚙️ [Configure extension]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/<EXTENSION_ID>/configs)\n\n-----",
      },
      "3": {
        type: "markdown",
        title: "",
        content: "### Currently Monitoring\n",
      },
      "4": {
        type: "data",
        title: "Clusters",
        query:
          "fetch `dt.entity.sql:com_dynatrace_extension_sql-oracle_cluster`\n| summarize count()",
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
      "28": {
        type: "data",
        title: "Instances",
        query:
          "fetch `dt.entity.sql:com_dynatrace_extension_sql-oracle_instance`\n| summarize count()",
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
                  id: "0",
                  label: "",
                  comparator: ">",
                  color: {
                    Default: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)",
                  },
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
      "29": {
        type: "data",
        title: "Databases",
        query:
          "fetch `dt.entity.sql:com_dynatrace_extension_sql-oracle_database`\n| summarize count()",
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
                  id: "0",
                  label: "",
                  comparator: ">",
                  color: {
                    Default: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)",
                  },
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
            alignment: "center",
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
      "30": {
        type: "data",
        title: "ASM Disks",
        query:
          "fetch `dt.entity.sql:com_dynatrace_extension_sql-oracle_asm_disk`\n| summarize count()",
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
                  id: "0",
                  label: "",
                  comparator: ">",
                  color: {
                    Default: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)",
                  },
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
      "35": {
        type: "data",
        title: "ASM Disk Groups",
        query:
          "fetch `dt.entity.sql:com_dynatrace_extension_sql-oracle_asm_disk_group`\n| summarize count()",
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
                  id: "0",
                  label: "",
                  comparator: ">",
                  color: {
                    Default: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)",
                  },
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
      "44": {
        type: "markdown",
        title: "",
        content:
          "### Additional Resources:\n#### [<EXTENSION_NAME> Extension Documentation]($TenantUrl/ui/apps/dynatrace.extensions.manager/configurations/<EXTENSION_ID>/details)",
      },
      "45": {
        type: "markdown",
        title: "",
        content: "![](https://dt-cdn.net/hub/logos/extensions-health.png)",
      },
      "48": {
        type: "markdown",
        title: "",
        content:
          "#### 🔗 Navigate to entities:\n##### [Clusters]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/sql:com_dynatrace_extension_sql-oracle_cluster) \n##### [Instances]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/sql:com_dynatrace_extension_sql-oracle_instance)\n##### [Databases]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/sql:com_dynatrace_extension_sql-oracle_database)\n##### [ASM Disk Groups]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/sql:com_dynatrace_extension_sql-oracle_asm_disk_group)\n##### [ASM Disks]($TenantUrl/ui/apps/dynatrace.classic.technologies/ui/entity/list/sql:com_dynatrace_extension_sql-oracle_asm_disk)",
      },
    },
    layouts: {
      "1": {
        x: 2,
        y: 0,
        w: 38,
        h: 2,
      },
      "3": {
        x: 0,
        y: 2,
        w: 40,
        h: 1,
      },
      "4": {
        x: 0,
        y: 3,
        w: 6,
        h: 3,
      },
      "28": {
        x: 24,
        y: 3,
        w: 6,
        h: 3,
      },
      "29": {
        x: 6,
        y: 3,
        w: 6,
        h: 3,
      },
      "30": {
        x: 18,
        y: 3,
        w: 6,
        h: 3,
      },
      "35": {
        x: 12,
        y: 3,
        w: 6,
        h: 3,
      },
      "44": {
        x: 0,
        y: 12,
        w: 40,
        h: 3,
      },
      "45": {
        x: 0,
        y: 0,
        w: 2,
        h: 2,
      },
      "48": {
        x: 0,
        y: 6,
        w: 9,
        h: 6,
      },
    },
    importedWithCode: true,
    settings: {
      gridLayout: {
        mode: "responsive",
        columnsCount: 40,
      },
    },
  };

  return JSON.stringify(extJson);
};
