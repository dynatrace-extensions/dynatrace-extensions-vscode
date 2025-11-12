/**
  Copyright 2023 Dynatrace LLC

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
import { EecType } from "@common";
import jszip from "jszip";
import vscode from "vscode";
import yaml from "yaml";
import { slugify } from "../codeActions/utils/snippetBuildingUtils";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import {
  ChartDto,
  ChartMetric,
  ChartMetricVisualization,
  ChartStub,
  ChartsCardStub,
  DetailInjectionCardType,
  DimensionStub,
  ExtensionStub,
  ExtensionV1,
  JMXSubGroup,
  MetricDto,
  MetricMetadata,
  MetricStub,
  MetricTableCardStub,
  MetricVisualizationType,
  ScreenStub,
  SourceDto,
  V1UI,
} from "../interfaces/extensionMeta";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { pushManifestTextForParsing } from "../utils/caching";
import { getExtensionWorkspaceDir } from "../utils/fileSystem";
import { parseJSON } from "../utils/jsonParsing";
import logger from "../utils/logging";
import { ConfirmOption, showQuickPick, showQuickPickConfirm } from "../utils/vscode";

const logTrace = ["commandPalette", "convertJMXExtension"];
const OPTION_LOCAL_FILE: vscode.QuickPickItem = {
  label: "Locally",
  description: "Browse the local filesystem for a .json or .zip file",
};
const OPTION_DYNATRACE_ENVIRONMENT: vscode.QuickPickItem = {
  label: "Remotely",
  description: "Browse your Dynatrace environment for a JMX extension",
};
const TECH_OPTIONS = [
  { label: "All other", id: "UNKNOWN" },
  { label: "Oracle DB", id: "ORACLE_DB" },
  { label: "Apache Httpd", id: "APACHE_HTTPD" },
  { label: "SQL Server", id: "MSSQL" },
  { label: "DB2", id: "DB2" },
  { label: "MySQL", id: "MYSQL" },
  { label: "Tomcat", id: "TOMCAT" },
  { label: "Websphere", id: "WEBSPHERE" },
  { label: "JBoss", id: "JBOSS" },
  { label: "Weblogic", id: "WEBLOGIC" },
  { label: "Glassfish", id: "GLASSFISH" },
  { label: "MongoDB", id: "MONGODB" },
  { label: "Cassandra", id: "CASSANDRA" },
  { label: "Hadoop", id: "HADOOP" },
  { label: "Storm", id: "STORM" },
  { label: "Couchbase", id: "COUCHBASE" },
  { label: "Jetty", id: "JETTY" },
  { label: "Elasticsearch", id: "ELASTIC_SEARCH" },
  { label: "Netty", id: "NETTY" },
  { label: "Apache Solr", id: "APACHE_SOLR" },
  { label: "Wildfly", id: "WILDFLY" },
  { label: "Apache Spark", id: "APACHE_SPARK" },
  { label: "MongoDB Client", id: "MONGODB_CLIENT" },
  { label: "Active MQ", id: "ACTIVE_MQ" },
  { label: "Thrift", id: "THRIFT" },
  { label: "SAP", id: "SAP" },
  { label: "Hornet Q", id: "HORNET_Q" },
  { label: "Artemis", id: "ARTEMIS" },
  { label: "Tibco EMS", id: "TIBCO_EMS" },
  { label: "Websphere Liberty", id: "WEBSPHERE_LIBERTY" },
  { label: "Apache Derby", id: "APACHE_DERBY" },
  { label: "SAP Hybris", id: "SAP_HYBRIS" },
  { label: "Tibco Business Works", id: "TIBCO_BW" },
  { label: "Akka", id: "AKKA" },
  { label: "Open Liberty", id: "OPEN_LIBERTY" },
  { label: "IBM Integration Bus", id: "IBM_INTEGRATION_BUS" },
  { label: "JBoss EAP", id: "JBOSS_EAP" },
  { label: "Webmethods Integration Server", id: "SAG_WEBMETHODS_IS" },
  { label: "Kafka", id: "KAFKA" },
  { label: "Spring", id: "SPRING" },
  { label: "Tibco", id: "TIBCO" },
  { label: "JAX WS", id: "JAX_WS" },
  { label: "Axis", id: "AXIS" },
  { label: "Apache CXF", id: "CXF" },
  { label: "Jersey", id: "JERSEY" },
  { label: "Restlet", id: "RESTLET" },
  { label: "Resteasy", id: "RESTEASY" },
  { label: "Apache Wink", id: "WINK" },
  { label: "Apache Synapse", id: "APACHE_SYNAPSE" },
  { label: "Mule ESB", id: "MULE_ESB" },
  { label: "Hadoop Yarn", id: "HADOOP_YARN" },
  { label: "Hadoop HDFS", id: "HADOOP_HDFS" },
  { label: "Netflix Servo", id: "NETFLIX_SERVO" },
  { label: "Apache Camel", id: "APACHE_CAMEL" },
  { label: "JDK HTTP Server", id: "JDK_HTTP_SERVER" },
  { label: "Apache HTTP Client Sync", id: "APACHE_HTTP_CLIENT_SYNC" },
  { label: "Apache HTTP Client Async", id: "APACHE_HTTP_CLIENT_ASYNC" },
  { label: "OK HTTP Client", id: "OK_HTTP_CLIENT" },
  { label: "Undertow IO", id: "UNDERTOW_IO" },
  { label: "Reactor Core", id: "REACTOR_CORE" },
  { label: "Confluent Kafka Client", id: "CONFLUENT_KAFKA_CLIENT" },
  { label: "Apache Log4j", id: "APACHE_LOG4J" },
  { label: "QOS Logback", id: "QOS_LOGBACK" },
  { label: "Vert.x", id: "VERTX" },
  { label: "RxJava", id: "RXJAVA" },
  { label: "Dynamo DB", id: "DYNAMO_DB" },
  { label: "Graph QL", id: "GRAPH_QL" },
  { label: "JDK HTTP Client", id: "JDK_HTTP_CLIENT" },
  { label: "Adobe Experience Manager", id: "ADOBE_EXPERIENCE_MANAGER" },
  { label: "Quarkus", id: "QUARKUS" },
  { label: "Micronaut", id: "MICRONAUT" },
];

export const convertJmxExtensionWorkflow = async (outputPath?: string) => {
  if (!outputPath) {
    const extensionDir = getExtensionWorkspaceDir();
    if (extensionDir) {
      outputPath = path.resolve(extensionDir, "extension.yaml");
    }
  }

  await convertJMXExtension(await getDynatraceClient(), outputPath);
};

/**
 * Get the contents of the plugin.json file from a zip file binary data
 * @param binaryData The binary data of the zip file
 * @returns The contents of the plugin.json file
 */
async function extractPluginJSONFromZip(
  binaryData: Buffer | Uint8Array,
): Promise<[ExtensionV1 | undefined, string]> {
  const zip = await jszip.loadAsync(binaryData);

  // Find the first ocurrence of plugin.json in the files in the zip
  const pluginJSONFile = Object.keys(zip.files).find(file => file.endsWith("plugin.json"));
  if (!pluginJSONFile)
    return [undefined, "The selected extension does not contain a plugin.json file."];

  const pluginJsonFileContent = await zip.file(pluginJSONFile)?.async("string");
  if (!pluginJsonFileContent) return [undefined, "Could not extract the plugin.json file."];

  const v1Extension: ExtensionV1 = parseJSON(pluginJsonFileContent);
  return [v1Extension, ""];
}

/**
 * Converts a dimension key to the v2 format.
 * Dimension keys cannot have uppercase letters. Uppercase letters are converted to lowercase
 * and prefixed by an underscore. Leading underscores are removed.
 * @param key dimension key
 * @returns converted key
 */
function fixDimensionKey(key: string): string {
  const newKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
  return newKey.startsWith("_") ? newKey.slice(1) : newKey;
}

/**
 * Creates a map of the original timeseries keys from v1 plugin to converted keys and dimensions.
 * All keys are converted based on metric ingest protocol requirements. Metric keys are prefixed
 * by the extension name.
 * @param v1Metrics metrics definition from v1 plugin
 * @param extensionName name of extension
 * @returns map of keys and dimensions
 */
function createMetricKeyMap(v1Metrics: MetricDto[], extensionName: string) {
  const metricKeyMap = new Map<string, { key: string; dimensions: string[] }>();
  v1Metrics.forEach(({ timeseries, source }) => {
    // Start with the existing key as base
    let newKey = timeseries.key;
    // Remove any illegal characters
    newKey = newKey.replace(/[^a-zA-Z0-9_\-.]/g, "");
    // Remove any illegal section starts
    newKey = newKey.replace(/\.-/g, ".");
    // Check suffix against metric type
    if (source.calculateDelta) {
      // Key must end in .count, _count, .Count, or _Count
      if (!/(\.|_)(c|C)ount$/.test(newKey)) {
        newKey += ".count";
      }
    } else {
      // Key must not end in .count, _count, .Count, or _Count
      if (/(\.|_)(c|C)ount$/.test(newKey)) {
        newKey = newKey.slice(0, -6);
      }
    }
    // Convert dimension keys
    const dimensions = timeseries.dimensions
      .filter(d => d !== "rx_pid")
      .map(d => fixDimensionKey(d));
    // Add to the map, prepending the extension name
    metricKeyMap.set(timeseries.key, { key: `${extensionName}.${newKey}`, dimensions });
  });

  return metricKeyMap;
}

/**
 * Converts a v1 JMX query to the v2 format
 * Original:
 *   {"domain": "java.lang", "keyProperties": {"name": "G1 Eden Space", "type": "MemoryPool"}},
 * Converted:
 *   java.lang:name=G1 Eden Space,type=MemoryPool
 * @param v1MetricSource The plugin v1 metric 'source' property
 * @returns The query string
 */
function extractQueryString(v1MetricSource: SourceDto): string {
  if (!v1MetricSource.domain) {
    logger.error("Error processing metric. No domain found.", ...logTrace, "extractQueryString");
    return "";
  }

  // Convert the key properties to a string separated by commas
  const keyProperties = Object.entries(v1MetricSource.keyProperties)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  const query = `${v1MetricSource.domain}:${keyProperties}`;

  if (v1MetricSource.allowAdditionalKeys) {
    return query + ",*";
  }
  return query;
}

/**
 * Converts a v1 JMX splitting (dimensions) to the v2 format
 * Original: {"name": "ConnectionPool"}
 * Converted: connection_pool
 * @param metricSource The plugin v1 metric source object
 * @returns A list of valid dimension names
 */
function extractDimensions(metricSource: SourceDto): DimensionStub[] {
  const dimensions: DimensionStub[] = [];

  // Can be a single definition
  if (metricSource.splitting) {
    dimensions.push({
      key: fixDimensionKey(metricSource.splitting.name),
      value: `property:${metricSource.splitting.name}`,
    });
  }

  // Or an array
  if (metricSource.splittings) {
    dimensions.push(
      ...metricSource.splittings.map(s => ({
        key: fixDimensionKey(s.name),
        value: `property:${s.name}`,
      })),
    );
  }

  return dimensions;
}

/**
 * Converts a v1 UI Chart to a Unified Analysis Chart.
 * @param v1Chart the v1 chart definition
 * @param metricKeyMap a map of converted metric and dimension keys (see {@link createMetricKeyMap})
 * @param detailedSelectors if true, adds an additional `metricSelectorDetailed` to the metric definition
 * @param customDimensions if provided, uses these dimensions instead of the ones from the metricKeyMap
 * @returns converted chart
 */
function convertV1Chart(
  v1Chart: ChartDto,
  metricKeyMap: Map<string, { key: string; dimensions: string[] }>,
  detailedSelectors: boolean = false,
  customDimensions?: string[],
): ChartStub {
  // Need to know in advance if Y axes will be split
  const splitYAxes = v1Chart.series.some(s => s.rightaxis);
  const chart: ChartStub = {
    displayName: v1Chart.title,
    visualizationType: "GRAPH_CHART",
    graphChartConfig: {
      stacked: v1Chart.series.every(s => s.stacked),
      metrics: v1Chart.series.map(series => {
        const visualization: ChartMetricVisualization = {};
        const metricKeyString = String(metricKeyMap.get(series.key)?.key);
        const metricSelector = `${metricKeyString}:splitBy(${
          detailedSelectors ? "" : '"dt.entity.process_group_instance"'
        })`;
        const chartMetric: ChartMetric = { metricSelector };
        // Create detailed selectors
        if (detailedSelectors) {
          const dimensionSplits = (
            customDimensions ??
            metricKeyMap.get(series.key)?.dimensions ??
            []
          )
            .map(d => `"${d}"`)
            .join(",");
          chartMetric.metricSelectorSort = `${metricKeyString}$(entityFilter)$(userFilter):splitBy(${dimensionSplits}):avg$(aggregation):last:sort(value(avg,$(sortOrder))):names`;
          chartMetric.metricSelectorDetailed = `${metricKeyString}$(entityFilter)$(userFilter):splitBy(${dimensionSplits})$(aggregation)`;
        }
        // Handle Y Axis separation
        if (splitYAxes) {
          if (series.rightaxis) {
            chartMetric.yAxisKey = "right";
          } else {
            chartMetric.yAxisKey = "left";
          }
        }
        // Handle custom visualization
        if (series.displayname) {
          visualization.displayName = series.displayname;
        }
        if (series.seriestype) {
          const seriesType = series.seriestype.toUpperCase();
          visualization.seriesType = (
            seriesType === "BAR" ? "COLUMN" : seriesType
          ) as MetricVisualizationType;
        }
        // Only add visualization if it has any details
        if (Object.keys(visualization).length > 0) {
          chartMetric.visualization = visualization;
        }
        return chartMetric;
      }),
    },
  };
  // Split the Y Axis if needed
  if (splitYAxes) {
    if (chart.graphChartConfig) {
      chart.graphChartConfig.yAxes = [
        { key: "left", position: "LEFT", visible: true },
        { key: "right", position: "RIGHT", visible: true },
      ];
    }
  }

  return chart;
}

/**
 * Converts the metrics definition of a v1 plugin.json into metric metadata.
 * All metrics are tagged with "JMX". `calculateDelta` results in count metrics and `calculateRate`
 * creates a calculated metric expressing the rate persecond.
 * @param metrics
 * @param metricKeyMap
 * @returns
 */
function convertV1MetricsToMetadata(
  metrics: MetricDto[],
  metricKeyMap: Map<string, { key: string; dimensions: string[] }>,
) {
  const metadata: MetricMetadata[] = [];

  // Parse metrics from v1 extension, extracting into the v2 format
  metrics.forEach(({ timeseries, source, entity }) => {
    if (metadata.findIndex(m => m.key === timeseries.key) === -1) {
      const newMetricName = timeseries.displayname ?? timeseries.key;
      // Extract metric metadata
      const metricKeyString = String(metricKeyMap.get(timeseries.key)?.key);
      metadata.push({
        key: metricKeyString,
        metadata: {
          displayName: newMetricName,
          description: newMetricName,
          unit: timeseries.unit,
          sourceEntityType: entity ?? "process_group_instance",
          tags: ["JMX"],
        },
      });
      // Create a rate metric if calculateRate is true
      if (source.calculateRate) {
        metadata.push({
          key: `func:${metricKeyString}_persec`,
          metadata: {
            displayName: `${newMetricName} (per second)`,
            description: `${newMetricName} expressed as a rate per second`,
            unit: ["Count", "PerSecond"].includes(timeseries.unit)
              ? "PerSecond"
              : `${timeseries.unit}PerSecond`,
            tags: ["JMX"],
          },
          query: {
            metricSelector: `${metricKeyString} / (10)`,
          },
        });
      }
    }
  });

  return metadata;
}

/**
 * Converts the metrics definition of a v1 plugin.json into an array of subgroup definitions for EF2.0.
 * The conversion will aggregate metrics that share the same query and dimensions into the same
 * subgroup.
 * @param metrics v1 metrics definition
 * @param metricKeyMap a map of converted metric and dimension keys (see {@link createMetricKeyMap})
 * @returns generated subgroups
 */
function convertV1MetricsToSubgroups(
  metrics: MetricDto[],
  metricKeyMap: Map<string, { key: string; dimensions: string[] }>,
) {
  const subgroups: JMXSubGroup[] = [];

  // Parse metrics from v1 extension, extracting into the v2 format
  metrics.forEach(({ timeseries, source }) => {
    // Extract the query; skip the metric if it fails.
    const query = extractQueryString(source);
    if (query === "") return;

    const currentMetric: MetricStub = {
      key: String(metricKeyMap.get(timeseries.key)?.key),
      value: `attribute:${source.attribute}`,
      type: source.calculateDelta ? "count" : "gauge",
    };
    const currentDimensions = extractDimensions(source);

    const sgIdx = subgroups.findIndex(
      sg =>
        // Query should match
        sg.query === query &&
        // As well as the dimensions, if any
        (!sg.dimensions || JSON.stringify(sg.dimensions) === JSON.stringify(currentDimensions)),
    );

    // If we already have a subgroup, add the metric to the definition
    if (sgIdx >= 0) {
      subgroups[sgIdx].metrics.push(currentMetric);
      // And any new dimensions
      if (currentDimensions.length > 0) {
        const existingKeys = subgroups[sgIdx].dimensions?.map(d => d.key);
        subgroups[sgIdx].dimensions?.push(
          ...currentDimensions.filter(d => !(existingKeys ?? []).includes(d.key)),
        );
      }
      // Otherwise, create a new subgroup
    } else {
      const subgroup: JMXSubGroup = {
        subgroup: query,
        query,
        metrics: [currentMetric],
      };
      // Only add dimensions if we have any
      if (currentDimensions.length > 0) {
        subgroup.dimensions = currentDimensions;
      }
      subgroups.push(subgroup);
    }
  });
  return subgroups;
}

/**
 * Converts the v1 UI definition to a Unified Analysis screens definition.
 * The user can choose to create a JMX metrics card on the Host screen.
 * If a technology was selected previously, the cards will automatically be injected into the PGI entity.
 * @param ui plugin.json ui definition
 * @param extensionName new name of the extension
 * @param technology selected technology or "UNKNOWN"
 * @param metricKeyMap map of converted metric and dimension keys (see {@link createMetricKeyMap})
 * @returns list of screens created
 */
async function convertV1UiToScreens(
  ui: V1UI,
  extensionName: string,
  technology: string,
  metricKeyMap: Map<string, { key: string; dimensions: string[] }>,
) {
  const screens: ScreenStub[] = [];
  let uiCharts = [...(ui.charts ?? []), ...(ui.keycharts ?? [])];
  uiCharts = uiCharts
    .map(elem => {
      if (elem.series.length > 10) {
        const newElem = [];
        for (let i = 0; i < elem.series.length / 10; i++) {
          const newSeries = elem.series.slice(i * 10, i * 10 + 10);
          newElem.push({
            group: `${elem.group}-${i}`,
            title: `${elem.title}`,
            description: `${elem.description}`,
            series: newSeries,
          } as ChartDto);
        }
        return newElem;
      } else {
        return elem;
      }
    })
    .flat();

  // If a technology was selected, generate PGI injections
  if (technology !== "UNKNOWN") {
    // Prepare conditions
    const injectionConditions: string[] = [
      // eslint-disable-next-line no-secrets/no-secrets
      `metricAvailable|metric=dsfm:extension.status:filter(and(eq("dt.extension.name","custom:${extensionName}"),in("dt.entity.host", entitySelector("type(host),toRelationships.isProcessOf(entityId($(entityId)))"))))|lastWrittenWithinDays=5`,
      // eslint-disable-next-line no-secrets/no-secrets
      `entityAttribute|softwareTechnologies=${technology}`,
    ];

    // Create chart groups
    const chartsCards: ChartsCardStub[] = [];
    uiCharts
      .filter(uiChart =>
        // If at least some of the metrics don't have dimensions, chart groups are better
        uiChart.series.some(s => metricKeyMap.get(s.key)?.dimensions.length === 0),
      )
      .forEach(uiChart => {
        // Create charts cards by the group
        const cardKey = `chartgroup-${uiChart.group.toLowerCase().replace(/ /g, "-")}`;
        const cardIdx = chartsCards.findIndex(c => c.key === cardKey);
        // If there's already a card for this group, add the chart to it
        if (cardIdx >= 0) {
          chartsCards[cardIdx].charts.push(convertV1Chart(uiChart, metricKeyMap));
        }
        // Otherwise, create a new card
        else {
          chartsCards.push({
            key: cardKey,
            displayName: uiChart.group,
            numberOfVisibleCharts: 3,
            chartsInRow: 3,
            mode: "NORMAL",
            hideEmptyCharts: true,
            charts: [convertV1Chart(uiChart, metricKeyMap)],
          });
        }
      });

    // Create metric table cards
    const metricTableCards: MetricTableCardStub[] = [];
    uiCharts
      .filter(uiChart =>
        // If all metrics have dimensions, metric tables are better
        uiChart.series.every(s => (metricKeyMap.get(s.key)?.dimensions ?? []).length > 0),
      )
      .forEach(uiChart => {
        // Create metric table cards by the group
        const cardKey = `metrictable-${uiChart.group.toLowerCase().replace(/ /g, "-")}`;
        const cardIdx = metricTableCards.findIndex(c => c.key === cardKey);
        // If there's already a card for this group, add the chart to it
        if (cardIdx >= 0) {
          metricTableCards[cardIdx].charts.push(convertV1Chart(uiChart, metricKeyMap, true));
        }
        // Otherwise, create a new card
        else {
          metricTableCards.push({
            key: cardKey,
            pageSize: 5,
            displayName: uiChart.group,
            numberOfVisibleCharts: 3,
            hideEmptyCharts: true,
            displayCharts: true,
            enableDetailsExpandability: true,
            charts: [convertV1Chart(uiChart, metricKeyMap, true)],
          });
        }
      });

    // Create UA Screen with PGI Injections
    screens.push({
      entityType: "PROCESS_GROUP_INSTANCE",
      detailsInjections: [
        ...chartsCards.map(card => ({
          type: DetailInjectionCardType.CHART_GROUP,
          key: card.key,
          conditions: [...injectionConditions],
        })),
        ...metricTableCards.map(card => ({
          type: DetailInjectionCardType.METRIC_TABLE,
          key: card.key,
          conditions: [...injectionConditions],
        })),
      ],
      chartsCards: chartsCards.map(card => {
        // 3 Charts per card/row looks best; avoid empty charts if less than 3
        const minNumberOfCharts = Math.min(3, card.charts.length);
        card.numberOfVisibleCharts = minNumberOfCharts;
        card.chartsInRow = minNumberOfCharts;
        return card;
      }),
      metricTableCards: metricTableCards.map(card => {
        // 3 Charts per card/row looks best; avoid empty charts if less than 3
        const minNumberOfCharts = Math.min(3, card.charts.length);
        card.numberOfVisibleCharts = minNumberOfCharts;
        return card;
      }),
    });
  }

  const createHostInjection = await showQuickPickConfirm({
    ignoreFocusOut: true,
    title: "Visualize your data",
    placeHolder: "Show this JMX data on the Host details page?",
  });

  if (createHostInjection === ConfirmOption.Yes) {
    // Create a unique card key
    const cardKey = `metrictable-jmx-${extensionName
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")}`;
    // Create the card adding all charts available
    const metricTableCard: MetricTableCardStub = {
      key: cardKey,
      displayName: `JMX Metrics (${extensionName})`,
      pageSize: 5,
      numberOfVisibleCharts: 3,
      hideEmptyCharts: true,
      displayCharts: true,
      enableDetailsExpandability: true,
      charts: uiCharts.map(uiChart =>
        convertV1Chart(uiChart, metricKeyMap, true, ["dt.entity.process_group_instance"]),
      ),
    };
    metricTableCard.numberOfVisibleCharts = Math.min(3, metricTableCard.charts.length);
    // Create UA Screen with Host Injection
    screens.push({
      entityType: "HOST",
      detailsInjections: [
        {
          type: DetailInjectionCardType.METRIC_TABLE,
          key: cardKey,
          conditions: [
            `metricAvailable|metric=dsfm:extension.status:filter(and(eq("dt.extension.name","custom:${extensionName}"),in("dt.entity.host", entitySelector("entityId($(entityId))"))))|lastWrittenWithinDays=5`,
          ],
        },
      ],
      metricTableCards: [metricTableCard],
    });
  }

  return screens;
}

/**
 * Converts a JMX extension v1 to the v2 format
 * @param jmxV1Extension The v1 extension (plugin.json)
 * @returns The converted v2 extension (extension.yaml)
 */
async function convertJMXExtensionToV2(jmxV1Extension: ExtensionV1): Promise<ExtensionStub> {
  let extensionName: string;
  extensionName = (jmxV1Extension.metricGroup ?? jmxV1Extension.name)
    .toLowerCase() // Name must be lowercase
    .replace(/_/g, ".") // No underscores allowed
    .replace(/^custom\./, ""); // Remove duplication

  // Handle length issues from converted name
  if (extensionName.length > 43) {
    const newName = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      title: "Choose a new name for your extension",
      placeHolder: `custom:${extensionName}`,
      validateInput: value => {
        if (!value.startsWith("custom:")) {
          return "Name must start with 'custom:'.";
        }
        if (value.length > 50) {
          return "Name is too long.";
        }
        if (!/^custom:[a-z][a-z0-9]*([-.][a-z0-9]+)*$/.test(value)) {
          return "Name can only contain lowercase letters, numbers, dots, and dashes.";
        }
        return undefined;
      },
    });
    if (!newName) {
      throw new Error("No extension name provided.");
    } else {
      extensionName = newName.split("custom:")[1];
    }
  }

  // This is the basic JMX V2 Extension
  const jmxV2Extension: ExtensionStub = {
    name: `custom:${extensionName}`,
    version: "2.0.0",
    minDynatraceVersion: "1.275.0",
    author: { name: "Your name here" },
  };

  // Technology is needed for ideal mapping to PGI entity
  let technology: string | undefined;
  if (jmxV1Extension.technologies) {
    technology = jmxV1Extension.technologies[0];
  } else {
    const techChoice = await showQuickPick(TECH_OPTIONS, {
      ignoreFocusOut: true,
      title: "Select a process technology",
      placeHolder: "Select a Java-based technology/framework or 'All other' if none match",
    });
    technology = techChoice?.id ?? "UNKNOWN";
  }

  // Create a metric map for key and dimension lookup
  const metricKeyMap = createMetricKeyMap(jmxV1Extension.metrics, extensionName);

  // JMX
  const subgroups = convertV1MetricsToSubgroups(jmxV1Extension.metrics, metricKeyMap);
  if (subgroups.length > 0) {
    jmxV2Extension.jmx = { groups: [{ group: "jmx", subgroups }] };
  }
  // Screens
  const screens = jmxV1Extension.ui
    ? await convertV1UiToScreens(jmxV1Extension.ui, extensionName, technology, metricKeyMap)
    : [];
  if (screens.length > 0) {
    jmxV2Extension.screens = screens;
  }
  // Metrics
  const metrics = convertV1MetricsToMetadata(jmxV1Extension.metrics, metricKeyMap);
  if (metrics.length > 0) {
    jmxV2Extension.metrics = metrics;
  }

  return jmxV2Extension;
}

/**
 * Guides the user to select an existing JMX V1 extension from their local filesystem.
 * Once either a .json or .zip file is selected, this is processed and the plugin.json
 * content is returned.
 * @returns tuple of extracted json and error message in case of failure
 */
export async function extractv1ExtensionFromLocal(): Promise<[ExtensionV1 | undefined, string]> {
  // TODO - move this to a shared file, as it is used by Python extensions as well

  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: "Select file",
    title: "Select extension .zip or plugin.json file",
    filters: {
      "Extension v1 plugin": ["json", "zip"],
    },
  };
  const pluginJSONFile = await vscode.window.showOpenDialog(options);
  if (!pluginJSONFile) return [undefined, "No selection made."];

  // If this is a zip file, extract the plugin.json file from it
  const [v1Extension, errorMessage] = pluginJSONFile[0].fsPath.endsWith(".zip")
    ? await extractPluginJSONFromZip(readFileSync(pluginJSONFile[0].fsPath))
    : // If this is a json file, just read it
      [parseJSON<ExtensionV1>(readFileSync(pluginJSONFile[0].fsPath).toString()), ""];

  return [v1Extension, errorMessage];
}

/**
 * Guides the user to select an existing V1 extension from the connected Dynatrace tenant.
 * Once selected, the extension is unpacked and the plugin.json file is extracted.
 * @param dt Dynatrace Client API
 * @returns tuple of extracted json and error message in case of failure
 */
export async function extractV1FromRemote(
  extensionType: "JMX" | "Python",
  dt?: Dynatrace,
): Promise<[ExtensionV1 | undefined, string]> {
  // TODO - move this to a shared file, as it is used by Python extensions as well

  if (!dt) return [undefined, "This option requires a Dynatrace environment connection."];
  const currentExtensions = await dt.extensionsV1.getExtensions();

  // We only want filtered custom extensions (not the built-in ones)
  // Dynatrace created extensions cannot be downloaded via the API

  const filterdExtensions = currentExtensions.filter(extension => {
    if (extensionType === "JMX") {
      return extension.type === "JMX" && !extension.id.startsWith("dynatrace.");
    } else {
      return (
        extension.type === EecType.ActiveGate ||
        (extension.type === EecType.OneAgent && !extension.id.startsWith("dynatrace."))
      );
    }
  });

  const extensionChoice = await showQuickPick(
    filterdExtensions.map(e => ({
      label: e.name,
      description: e.id,
    })),
    {
      placeHolder: "Choose a v1 extension",
      title: "Dynatrace: Convert extension",
    },
  );
  if (!extensionChoice) return [undefined, "No extension was selected."];

  // Get the binary of the extension zip file
  const extensionId = extensionChoice.description;
  const binaryData = await dt.extensionsV1.getExtensionBinary(extensionId);

  // Extract the plugin.json file from the zip
  const [v1Extension, errorMessage] = await extractPluginJSONFromZip(binaryData);
  return [v1Extension, errorMessage];
}

/**
 * Parses a JMX v1 plugin.json file and produces an equivalent 2.0 extension manifest.
 * The file can be loaded either locally or from a connected tenant and supports both direct
 * file parsing as well as zip browsing.
 * @param dt Dynatrace Client API
 * @param outputPath optional path where to save the manifest
 */
export async function convertJMXExtension(dt?: Dynatrace, outputPath?: string) {
  const fnLogTrace = [...logTrace, "convertJMXExtension"];
  logger.info("Executing Covert JMX command", ...fnLogTrace);
  // User chooses if they want to use a local file or browse from the Dynatrace environment
  const pluginJSONOrigins = [OPTION_LOCAL_FILE, OPTION_DYNATRACE_ENVIRONMENT];
  const pluginJSONOrigin = await showQuickPick(pluginJSONOrigins, {
    placeHolder: "How would you like to import the JMX V1 extension?",
    title: "Convert JMX extension",
    ignoreFocusOut: true,
  });

  if (!pluginJSONOrigin) {
    logger.notify("WARN", "No selection made. Operation cancelled.", ...fnLogTrace);
    return;
  }

  const [jmxV1Extension, errorMessage] =
    pluginJSONOrigin.label === OPTION_LOCAL_FILE.label
      ? await extractv1ExtensionFromLocal()
      : await extractV1FromRemote("JMX", dt);

  if (jmxV1Extension === undefined || errorMessage !== "") {
    logger.notify("ERROR", `Operation failed: ${errorMessage}`, ...fnLogTrace);
    return;
  }

  // Convert the JMX v1 extension to v2
  try {
    logger.debug("JSON extracted successfully. Converting it now.", ...fnLogTrace);
    const jmxV2Extension = await convertJMXExtensionToV2(jmxV1Extension);

    // Ask the user where they would like to save the file to
    const options: vscode.SaveDialogOptions = {
      saveLabel: "Save",
      title: "Save JMX v2 extension.yaml",
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "JMX v2 extension": ["yaml"],
      },
      defaultUri: vscode.Uri.file(`${slugify(jmxV2Extension.name)}.yaml`),
    };

    const extensionYAMLFile =
      outputPath ?? (await vscode.window.showSaveDialog(options).then(p => p?.fsPath));
    if (!extensionYAMLFile) {
      logger.notify("ERROR", "No file was selected. Operation cancelled.", ...fnLogTrace);
      return;
    }
    // Save the file as yaml
    const yamlFileContents = yaml.stringify(jmxV2Extension);
    writeFileSync(extensionYAMLFile, yamlFileContents);

    // Update the cache
    pushManifestTextForParsing();

    // Open the file
    const document = await vscode.workspace.openTextDocument(extensionYAMLFile);
    await vscode.window.showTextDocument(document);
  } catch (e) {
    logger.notify("ERROR", `Operation failed: ${(e as Error).message}`, ...fnLogTrace);
    return;
  }
}
