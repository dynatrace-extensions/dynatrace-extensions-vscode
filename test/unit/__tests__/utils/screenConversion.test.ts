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

import {
  ChartsCardStub,
  DqlTableCardStub,
  HealthCardStub,
  MessageCardStub,
  PropertiesCard,
} from "../../../../src/interfaces/extensionMeta";
import {
  ConversionWarning,
  ScreenConversionContext,
} from "../../../../src/interfaces/screenConversion";
import {
  addWarning,
  adjustAllDql,
  adjustEntityFetchDqlQuery,
  convertChartsCard,
  convertConditions,
  convertDqlTableCard,
  convertHealthCard,
  convertMessageCard,
  convertPropertiesCard,
  generateConversionReport,
  parseDqlQuery,
  shouldSkipByTarget,
  splitDqlPipes,
} from "../../../../src/utils/screenConversion";
import { EntityToNodeMap, NodeContext } from "../../../../src/interfaces/screenConversion";

jest.mock("fs");
jest.mock("../../../../src/utils/logging");

/** Asserts value is non-null/undefined and returns it with a narrowed type. */
function defined<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  return value as T;
}

describe("Screen Conversion Utils", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const minimalCtx: ScreenConversionContext = {
    entityType: "test:entity",
    nodeType: "TEST_NODE",
    fieldMap: {},
    staticEdges: [],
    entityToNodeMap: {},
    fileNamePrefix: "test_entity",
    extensionName: "com.dynatrace.test",
    conditions: {},
    screen: { entityType: "test:entity" } as ScreenConversionContext["screen"],
  };

  // -----------------------------------------------------------------------
  // shouldSkipByTarget
  // -----------------------------------------------------------------------
  describe("shouldSkipByTarget", () => {
    test.each([
      ["CLASSIC", true],
      ["PLATFORM", false],
      ["BOTH", false],
      [undefined, true],
    ])("target %s → skip=%s", (target, expected) => {
      expect(shouldSkipByTarget(target)).toBe(expected);
    });
  });

  // -----------------------------------------------------------------------
  // addWarning
  // -----------------------------------------------------------------------
  describe("addWarning", () => {
    it("pushes a warning to the array", () => {
      const warnings: ConversionWarning[] = [];
      addWarning(warnings, "no-dql", "test message");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEqual({ category: "no-dql", message: "test message" });
    });
  });

  // -----------------------------------------------------------------------
  // convertChartsCard
  // -----------------------------------------------------------------------
  describe("convertChartsCard", () => {
    it("converts a charts card with GRAPH_CHART and DQL", () => {
      const card: ChartsCardStub = {
        key: "cpu-charts",
        displayName: "CPU",
        mode: "NORMAL",
        numberOfVisibleCharts: 4,
        charts: [
          {
            displayName: "System CPU",
            visualizationType: "GRAPH_CHART",
            graphChartConfig: {
              metrics: [
                {
                  metricSelector: "com.dynatrace.extension.cpu.system",
                  dqlQuery: "timeseries avg(com.dynatrace.extension.cpu.system)",
                  visualization: { seriesType: "LINE" },
                },
              ],
              visualization: { seriesType: "LINE" },
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(defined(result).type).toBe("chart-group");
      expect(defined(result).id).toBe("cpu-charts");
      expect(defined(result).cardTitle).toBe("CPU");
      expect(defined(result).mode).toBe("NORMAL");
      expect(defined(result).defaultVisibleChartsNumber).toBe(4);
      expect(defined(result).charts).toHaveLength(1);

      const chart0 = (defined(result).charts as Record<string, unknown>[])[0];
      expect(chart0.dqlQuery).toBe("timeseries avg(com.dynatrace.extension.cpu.system)");
      expect((chart0.visualization as Record<string, unknown>).type).toBe("TIMESERIES_CHART");
      expect((chart0.visualization as Record<string, unknown>).variant).toBe("line");
    });

    it("skips CLASSIC target", () => {
      const card: ChartsCardStub = {
        key: "test",
        target: "CLASSIC",
        charts: [],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].category).toBe("skipped-classic");
    });

    it("handles multi-metric graph chart", () => {
      const card: ChartsCardStub = {
        key: "multi",
        charts: [
          {
            displayName: "Combined",
            visualizationType: "GRAPH_CHART",
            graphChartConfig: {
              metrics: [
                {
                  metricSelector: "metric.one",
                  dqlQuery: "timeseries avg(metric.one)",
                },
                {
                  metricSelector: "metric.two",
                  dqlQuery: "timeseries avg(metric.two)",
                },
              ],
              visualization: { seriesType: "AREA" },
              stacked: true,
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      const chart0 = (defined(result).charts as Record<string, unknown>[])[0];
      expect(chart0.dqlQuery).toContain("timeseries {");
      expect(chart0.dqlQuery).toContain("avg(metric.one)");
      expect(chart0.dqlQuery).toContain("avg(metric.two)");
    });

    it("warns and skips metrics without DQL in mixed charts", () => {
      const card: ChartsCardStub = {
        key: "mixed",
        charts: [
          {
            displayName: "Partial DQL",
            visualizationType: "GRAPH_CHART",
            graphChartConfig: {
              metrics: [
                { metricSelector: "metric.one", dqlQuery: "timeseries avg(metric.one)" },
                { metricSelector: "metric.two" },
              ],
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(warnings.some(w => w.category === "multi-metric-partial")).toBe(true);
    });

    it("returns null when all charts lack DQL", () => {
      const card: ChartsCardStub = {
        key: "no-dql",
        charts: [
          {
            displayName: "No DQL",
            visualizationType: "GRAPH_CHART",
            graphChartConfig: { metrics: [{ metricSelector: "metric.one" }] },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).toBeNull();
      expect(warnings.some(w => w.category === "no-dql")).toBe(true);
    });

    it("converts SINGLE_VALUE chart", () => {
      const card: ChartsCardStub = {
        key: "single",
        charts: [
          {
            displayName: "CPU Usage",
            visualizationType: "SINGLE_VALUE",
            singleValueConfig: {
              metric: {
                metricSelector: "cpu.usage",
                dqlQuery: "timeseries avg(cpu.usage) | fields value=arrayLast(total)",
              },
              foldTransformation: "LAST_VALUE",
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      const chart0 = (defined(result).charts as Record<string, unknown>[])[0];
      expect((chart0.visualization as Record<string, unknown>).type).toBe("SINGLE_VALUE");
      const metric = (chart0.visualization as Record<string, unknown>).metric as Record<
        string,
        unknown
      >;
      expect(metric.foldTransformation).toBe("LAST_VALUE");
    });

    it("converts PIE_CHART with color overrides", () => {
      const card: ChartsCardStub = {
        key: "pie",
        charts: [
          {
            displayName: "Status",
            visualizationType: "PIE_CHART",
            pieChartConfig: {
              metric: {
                metricSelector: "status.count",
                dqlQuery: "timeseries avg(status.count), by:{status}",
              },
              colorOverride: [
                { color: "#dc172a", seriesName: "offline(1)" },
                { color: "#2ab6f4", seriesName: "online(3)" },
              ],
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      const chart0 = (defined(result).charts as Record<string, unknown>[])[0];
      const vis = chart0.visualization as Record<string, unknown>;
      expect(vis.type).toBe("PIE_CHART");
      expect(vis.seriesOverrides).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // convertDqlTableCard
  // -----------------------------------------------------------------------
  describe("convertDqlTableCard", () => {
    it("converts a DQL table card with columns", () => {
      const card: DqlTableCardStub = {
        key: "disks-table",
        displayName: "Analyze Disks",
        query: {
          query: "fetch `dt.entity.f5:disk` | filter runs_on[`dt.entity.f5:instance`]==$(entityId)",
          lookups: [
            {
              query: "timeseries avg(disk.total)",
              sourceField: "id",
              lookupField: "`dt.entity.f5:disk`",
              fields: ["diskTotal"],
            },
          ],
        },
        columns: [
          {
            field: "disk",
            displayName: "Disk",
            columnType: "TEXT",
            widthType: "RATIO",
            widthValue: 0.5,
            sortable: true,
          },
          {
            field: "diskTotal",
            displayName: "Total",
            columnType: "NUMBER",
            widthType: "AUTO",
            sortable: true,
            formatter: "unitRenderer|unit=units.data.byte|minimumFractionDigits=2",
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertDqlTableCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(defined(result).type).toBe("dql-table");
      expect(defined(result).id).toBe("disks-table");
      expect(defined(result).title).toBe("Analyze Disks");

      const dqlQuery = defined(result).dqlQuery as Record<string, unknown>;
      expect(dqlQuery.idField).toBe("disk");
      expect(dqlQuery.query).toContain("fetch");
      expect(dqlQuery.lookups).toHaveLength(1);

      const columns = defined(result).columns as Record<string, unknown>[];
      expect(columns).toHaveLength(2);
      expect(columns[0].field).toBe("disk");
      expect(columns[0].type).toBe("text");
      expect(columns[0].widthType).toBe("ratio");

      expect(columns[1].cellRenderer).toEqual({
        type: "unitRenderer",
        unit: "units.data.byte",
        minimumFractionDigits: 2,
      });
    });

    it("skips CLASSIC target", () => {
      const card: DqlTableCardStub = {
        key: "test",
        target: "CLASSIC",
        query: { query: "test" },
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertDqlTableCard(minimalCtx, card, warnings, "PLATFORM");

      expect(result).toBeNull();
      expect(warnings[0].category).toBe("skipped-classic");
    });
  });

  // -----------------------------------------------------------------------
  // convertMessageCard
  // -----------------------------------------------------------------------
  describe("convertMessageCard", () => {
    it("converts a MESSAGE type card", () => {
      const card: MessageCardStub = {
        key: "missing-pool",
        type: "MESSAGE",
        message: {
          text: "There are no Pools running on this instance.",
          theme: "WARNING",
        },
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertMessageCard(minimalCtx, card, undefined, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(defined(result).type).toBe("message");
      expect(defined(result).id).toBe("missing-pool");

      const content = defined(result).content as Record<string, unknown>;
      expect(content.type).toBe("MESSAGE");
      expect(content.color).toBe("WARNING");
      expect(content.text).toBe("There are no Pools running on this instance.");
    });

    it("maps ERROR theme to CRITICAL", () => {
      const card: MessageCardStub = {
        key: "error-msg",
        type: "MESSAGE",
        message: { text: "Error occurred", theme: "ERROR" },
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertMessageCard(minimalCtx, card, undefined, warnings, "PLATFORM");

      const content = defined(result).content as Record<string, unknown>;
      expect(content.color).toBe("CRITICAL");
    });

    it("converts a CARD type with hubExtension buttons", () => {
      const card: MessageCardStub = {
        key: "feature-card",
        type: "CARD",
        card: {
          text: "Configure your extension.",
          displayName: "Getting Started",
          icon: "f5",
          buttons: [
            {
              actionExpression: "hubExtension|extensionId=com.dynatrace.extension.f5",
              text: "Configure",
              color: "PRIMARY",
            },
          ],
        },
      };
      const keywords = ["title:F5 BIG-IP", "network"];
      const warnings: ConversionWarning[] = [];

      const [result] = convertMessageCard(minimalCtx, card, keywords, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      const content = defined(result).content as Record<string, unknown>;
      expect(content.type).toBe("CARD");
      expect(content.title).toBe("Getting Started");
      expect(content.icon).toBe("f5");

      const actions = content.actions as Array<Record<string, unknown>>;
      expect(actions).toHaveLength(1);
      expect(actions[0].appId).toBe("dynatrace.hub");
      expect((actions[0].intentPayload as Record<string, unknown>).searchTerm).toBe("F5 BIG-IP");
    });

    it("warns on seaOtterLink actions", () => {
      const card: MessageCardStub = {
        key: "card-with-link",
        type: "CARD",
        card: {
          text: "See docs.",
          buttons: [{ actionExpression: "seaOtterLink|id=https://example.com", text: "Docs" }],
        },
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertMessageCard(minimalCtx, card, undefined, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(warnings.some(w => w.category === "actions")).toBe(true);
    });

    it("skips CLASSIC target", () => {
      const card: MessageCardStub = {
        key: "classic-msg",
        target: "CLASSIC",
        type: "MESSAGE",
        message: { text: "old message", theme: "INFO" },
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertMessageCard(minimalCtx, card, undefined, warnings, "PLATFORM");

      expect(result).toBeNull();
      expect(warnings[0].category).toBe("skipped-classic");
    });
  });

  // -----------------------------------------------------------------------
  // convertHealthCard
  // -----------------------------------------------------------------------
  describe("convertHealthCard", () => {
    it("converts health card tiles to COMPACT chart-group", () => {
      const card: HealthCardStub = {
        key: "health",
        tiles: [
          {
            displayName: "CPU Health",
            metricSelecor: "cpu.health",
            foldTransformation: "LAST_VALUE",
          },
          {
            displayName: "Memory Health",
            metricSelecor: "memory.health",
            foldTransformation: "AVG",
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const [result] = convertHealthCard(card, warnings, "PLATFORM");

      expect(result).not.toBeNull();
      expect(defined(result).type).toBe("chart-group");
      expect(defined(result).mode).toBe("COMPACT");

      const charts = defined(result).charts as Record<string, unknown>[];
      expect(charts).toHaveLength(2);
      expect(charts[0].displayName).toBe("CPU Health");
      expect((charts[0].visualization as Record<string, unknown>).type).toBe("SINGLE_VALUE");

      // All health card tiles should produce no-dql warnings
      expect(warnings.filter(w => w.category === "no-dql")).toHaveLength(2);
    });

    it("skips CLASSIC target", () => {
      const card: HealthCardStub = {
        key: "health",
        target: "CLASSIC",
        tiles: [{ displayName: "Test", metricSelecor: "test", foldTransformation: "AVG" }],
      };
      const warnings: ConversionWarning[] = [];

      expect(convertHealthCard(card, warnings, "PLATFORM")[0]).toBeNull();
      expect(warnings[0].category).toBe("skipped-classic");
    });
  });

  // -----------------------------------------------------------------------
  // convertPropertiesCard
  // -----------------------------------------------------------------------
  describe("convertPropertiesCard", () => {
    it("converts attribute properties to metadata element", () => {
      const card: PropertiesCard = {
        displayOnlyConfigured: false,
        properties: [
          { type: "ATTRIBUTE", attribute: { key: "hostname", displayName: "Hostname" } },
          { type: "ATTRIBUTE", attribute: { key: "ip_address", displayName: "IP Address" } },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const result = convertPropertiesCard(card, "f5:instance", warnings);

      expect(result).not.toBeNull();
      expect(defined(result).type).toBe("metadata");
      expect(defined(result).id).toBe("f5:instance-properties");
      expect(defined(result).dqlQuery as string).toContain("fetch `dt.entity.f5:instance`");
      expect(defined(result).dqlQuery as string).toContain("`hostname`");
      expect(defined(result).dqlQuery as string).toContain("`ip_address`");

      const registry = defined(result).overrideMetadataRegistry as Record<
        string,
        Record<string, unknown>
      >;
      expect(registry.hostname.displayName).toBe("Hostname");
      expect(registry.ip_address.displayName).toBe("IP Address");
    });

    it("warns on RELATION properties", () => {
      const card: PropertiesCard = {
        displayOnlyConfigured: false,
        properties: [
          { type: "ATTRIBUTE", attribute: { key: "hostname", displayName: "Hostname" } },
          {
            type: "RELATION",
            relation: {
              entitySelectorTemplate:
                "type(f5:instance),fromRelationships.isSameAs($(entityConditions))",
              displayName: "F5 Instance",
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const result = convertPropertiesCard(card, "network:device", warnings);

      expect(result).not.toBeNull();
      expect(warnings.some(w => w.category === "relation-properties")).toBe(true);
    });

    it("returns null when only RELATION properties exist", () => {
      const card: PropertiesCard = {
        displayOnlyConfigured: false,
        properties: [
          {
            type: "RELATION",
            relation: {
              entitySelectorTemplate: "type(f5:instance)",
              displayName: "F5 Instance",
            },
          },
        ],
      };
      const warnings: ConversionWarning[] = [];

      const result = convertPropertiesCard(card, "network:device", warnings);

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // convertConditions (stub)
  // -----------------------------------------------------------------------
  describe("convertConditions", () => {
    it("returns empty array for no conditions", () => {
      const warnings: ConversionWarning[] = [];
      const [conds1] = convertConditions(minimalCtx, undefined, warnings);
      expect(conds1).toEqual([]);
      const [conds2] = convertConditions(minimalCtx, [], warnings);
      expect(conds2).toEqual([]);
    });

    it("returns empty arrays for conditions not present in context", () => {
      const conditions = [
        "extensionConfigured|extensionId=com.dynatrace.extension.f5",
        "entityAttribute|devMonitoringMode=Extension",
      ];
      const warnings: ConversionWarning[] = [];

      const [conds, ids] = convertConditions(minimalCtx, conditions, warnings);

      expect(conds).toHaveLength(0);
      expect(ids).toHaveLength(0);
      expect(warnings.filter(w => w.category === "conditions")).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateConversionReport
  // -----------------------------------------------------------------------
  describe("generateConversionReport", () => {
    it("generates a report with files and warnings", () => {
      const context: ScreenConversionContext = {
        entityType: "f5:instance",
        nodeType: "EXT_NETWORK_DEVICE",
        fileNamePrefix: "f5_instance",
        extensionName: "com.dynatrace.test.extension",
        fieldMap: {},
        staticEdges: [],
        entityToNodeMap: {
          "f5:instance": { nodeType: "EXT_NETWORK_DEVICE", fieldMap: {}, staticEdges: [] },
        },
        screen: { entityType: "f5:instance" } as ScreenConversionContext["screen"],
        conditions: {},
      };
      const filesWritten = ["f5_instance.entitydetails.json", "f5_instance.inventory.json"];
      const warnings: ConversionWarning[] = [
        { category: "no-dql", message: "Chart X has no DQL" },
        { category: "breadcrumbs", message: "Breadcrumbs dropped" },
        { category: "no-dql", message: "Chart Y has no DQL" },
      ];

      const report = generateConversionReport(context, filesWritten, warnings);

      expect(report).toContain("## f5:instance");
      expect(report).toContain("EXT_NETWORK_DEVICE");
      expect(report).toContain("f5_instance.entitydetails.json");
      expect(report).toContain("f5_instance.inventory.json");
      expect(report).toContain("#### No Dql");
      expect(report).toContain("Chart X has no DQL");
      expect(report).toContain("#### Breadcrumbs");
    });

    it("generates a report without warnings section when none exist", () => {
      const context: ScreenConversionContext = {
        entityType: "test:entity",
        nodeType: "TEST_ENTITY",
        fieldMap: {},
        staticEdges: [],
        entityToNodeMap: {
          "test:entity": { nodeType: "test_entity", fieldMap: {}, staticEdges: [] },
        },
        fileNamePrefix: "test_entity",
        extensionName: "com.dynatrace.test.extension",
        screen: { entityType: "test:entity" } as ScreenConversionContext["screen"],
        conditions: {},
      };

      const report = generateConversionReport(context, ["test.json"], []);

      expect(report).toContain("## test:entity");
      expect(report).not.toContain("### Warnings");
    });
  });

  // -----------------------------------------------------------------------
  // parseDqlQuery
  // -----------------------------------------------------------------------
  describe("parseDqlQuery", () => {
    it("simple bare metric — no alias, no args", () => {
      const result = parseDqlQuery("timeseries avg(my.metric)");
      expect(result.metricFields).toEqual(["avg(my.metric)"]);
      expect(result.seriesText).toBe("avg(my.metric)");
      expect(result.args).toBeUndefined();
    });

    it("single metric with alias and named args", () => {
      const result = parseDqlQuery(
        "timeseries myMetric=avg(my.metric), filter:{ isNotNull(someField) }",
      );
      expect(result.metricFields).toEqual(["myMetric"]);
      expect(result.seriesText).toBe("myMetric=avg(my.metric)");
      expect(result.args).toBe("filter:{ isNotNull(someField) }");
    });

    it("fetch + summarize — last pipe stage wins", () => {
      const result = parseDqlQuery(
        'fetch logs\n| filter level == "ERROR"\n| summarize ErrorCount=count(), by:{ severity }',
      );
      expect(result.metricFields).toEqual(["ErrorCount"]);
      expect(result.args).toBe("by:{ severity }");
    });

    it("multi-metric braced timeseries with by and filter", () => {
      const query = [
        "timeseries {",
        "    used=avg(com.dynatrace.extension.f5.bigip.sys.host.memory.used),",
        "    total=avg(com.dynatrace.extension.f5.bigip.sys.host.memory.total)",
        "  },",
        "  by:{failover.state,device.address,sync.state,`dt.entity.network:device`},",
        '  filter:{`dt.entity.f5:instance`==""}',
      ].join("\n");
      const result = parseDqlQuery(query);
      expect(result.metricFields).toEqual(["used", "total"]);
      expect(result.args).toContain("by:{failover.state");
      expect(result.args).toContain("filter:{");
    });

    it("multi-metric timeseries followed by summarize — summarize wins", () => {
      const query = [
        "timeseries {",
        "    used=avg(com.dynatrace.extension.f5.bigip.sys.host.memory.used),",
        "    total=avg(com.dynatrace.extension.f5.bigip.sys.host.memory.total)",
        "  },",
        "  by:{failover.state,device.address,sync.state,`dt.entity.network:device`},",
        '  filter:{`dt.entity.f5:instance`==""}',
        "| summarize {percent=sum((used[]/total[])*100)},by:{`dt.entity.f5:instance`,interval,timeframe}",
      ].join("\n");
      const result = parseDqlQuery(query);
      expect(result.metricFields).toEqual(["percent"]);
      expect(result.args).toContain("by:{`dt.entity.f5:instance`");
    });

    it("unrecognised pattern returns empty fields", () => {
      const result = parseDqlQuery('fetch logs | filter level == "ERROR"');
      expect(result.metricFields).toEqual([]);
      expect(result.seriesText).toBe("");
      expect(result.args).toBeUndefined();
    });

    it("empty string returns empty fields", () => {
      const result = parseDqlQuery("");
      expect(result.metricFields).toEqual([]);
      expect(result.seriesText).toBe("");
    });

    it("backtick-quoted identifier with colon in by: arg", () => {
      const result = parseDqlQuery(
        "timeseries val=avg(my.metric), by:{`dt.entity.network:device`}",
      );
      expect(result.metricFields).toEqual(["val"]);
      expect(result.args).toBe("by:{`dt.entity.network:device`}");
    });
  });

  // -----------------------------------------------------------------------
  // combineDqlQueries (via convertChartsCard multi-metric path)
  // -----------------------------------------------------------------------
  describe("convertChartsCard — multi-metric combines into single timeseries", () => {
    it("two metrics produce a braced timeseries command with common args", () => {
      const card: ChartsCardStub = {
        key: "mem-card",
        charts: [
          {
            visualizationType: "GRAPH_CHART",
            graphChartConfig: {
              metrics: [
                {
                  metricSelector: "",
                  dqlQuery:
                    "timeseries used=avg(memory.used), by:{host.name}, filter:{isNotNull(host.name)}",
                },
                {
                  metricSelector: "",
                  dqlQuery:
                    "timeseries total=avg(memory.total), by:{host.name}, filter:{isNotNull(host.name)}",
                },
              ],
            },
          },
        ],
      };

      const warnings: ConversionWarning[] = [];
      const [result] = convertChartsCard(minimalCtx, card, warnings, "PLATFORM");
      const group = defined(result);

      expect(warnings).toHaveLength(0);
      const chart = group.charts[0];
      expect(chart.dqlQuery).toMatch(/^timeseries \{/);
      expect(chart.dqlQuery).toContain("used=avg(memory.used)");
      expect(chart.dqlQuery).toContain("total=avg(memory.total)");
      expect(chart.dqlQuery).toContain("by:{host.name}");
    });
  });
});

// =============================================================================
// DQL field & edge conversion
// =============================================================================

const testEntityToNodeMap: EntityToNodeMap = {
  "f5:pool:member": {
    nodeType: "F5_LTM_POOL_MEMBER",
    fieldMap: {
      cpu: "cpu_usage",
      memory: "mem_bytes",
    },
    staticEdges: ["child_of.f5_ltm_pool"],
  },
  "f5:pool": {
    nodeType: "F5_LTM_POOL",
    fieldMap: {
      poolStatus: "pool_status",
    },
    staticEdges: [],
  },
};

const memberContext: NodeContext = testEntityToNodeMap["f5:pool:member"];

const memberCtx: ScreenConversionContext = {
  entityType: "f5:pool:member",
  nodeType: "F5_LTM_POOL_MEMBER",
  fieldMap: memberContext.fieldMap,
  staticEdges: memberContext.staticEdges,
  entityToNodeMap: testEntityToNodeMap,
  conditions: {},
  extensionName: "com.dynatrace.test",
  fileNamePrefix: "f5_pool_member",
  screen: { entityType: "f5:pool:member" } as ScreenConversionContext["screen"],
};

describe("adjustEntityFetchDqlQuery", () => {
  it("returns non-fetch query unchanged", () => {
    const result = adjustEntityFetchDqlQuery("timeseries avg(cpu)", testEntityToNodeMap, []);
    expect(result).toBe("timeseries avg(cpu)");
  });

  it("converts unknown entity optimistically and emits warning, skips field processing", () => {
    const warnings: ConversionWarning[] = [];
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.unknown:type` | fieldsAdd cpu_usage",
      testEntityToNodeMap,
      warnings,
    );
    expect(result).toBe("smartscapeNodes UNKNOWN:TYPE\n| fieldsAdd cpu_usage");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("dql-conversion");
  });

  it("converts entity type and replaces plain field names in fieldsAdd", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage, mem_bytes",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| fieldsAdd cpu, memory");
  });

  it("replaces backtick-quoted field names in fields command", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fields `cpu_usage`, `mem_bytes`",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| fields cpu, memory");
  });

  it("replaces field names in summarize command", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | summarize avg_cpu=avg(cpu_usage)",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| summarize avg_cpu=avg(cpu)");
  });

  it("replaces field names in filter command", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | filter cpu_usage > 80",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| filter cpu > 80");
  });

  it("does not replace field names in non-targeted pipe commands", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | sort cpu_usage desc",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| sort cpu_usage desc");
  });

  it("leaves fields not in the map unchanged without warning", () => {
    const warnings: ConversionWarning[] = [];
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd unknown_field",
      testEntityToNodeMap,
      warnings,
    );
    expect(result).toContain("fieldsAdd unknown_field");
    expect(warnings).toHaveLength(0);
  });

  it("warns and leaves edge as-is when target entity is external", () => {
    const warnings: ConversionWarning[] = [];
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd child_of[`dt.entity.external:type`]",
      testEntityToNodeMap,
      warnings,
    );
    expect(result).toContain("child_of[`dt.entity.external:type`]");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("dql-conversion");
  });

  it("warns and leaves edge as-is when relation not in staticEdges", () => {
    const warnings: ConversionWarning[] = [];
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd runs_on[`dt.entity.f5:pool`]",
      testEntityToNodeMap,
      warnings,
    );
    expect(result).toContain("runs_on[`dt.entity.f5:pool`]");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("dql-conversion");
  });

  it("replaces edge reference when entity and staticEdge both match", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd child_of[`dt.entity.f5:pool`]",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe(
      "smartscapeNodes F5_LTM_POOL_MEMBER\n| fieldsAdd references[child_of.f5_ltm_pool]",
    );
  });

  it("replaces both fields and edges in the same query", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage, child_of[`dt.entity.f5:pool`]",
      testEntityToNodeMap,
      [],
    );
    expect(result).toBe(
      "smartscapeNodes F5_LTM_POOL_MEMBER\n| fieldsAdd cpu, references[child_of.f5_ltm_pool]",
    );
  });
});

describe("adjustAllDql — fetch-entity DQL integration", () => {
  it("converts fetch DQL inside JSON string value including pipe stage fields", () => {
    const json = JSON.stringify({
      dqlQuery: { query: "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage" },
    });
    const result = adjustAllDql(json, testEntityToNodeMap, []);
    const parsed = JSON.parse(result) as { dqlQuery: { query: string } };
    expect(parsed.dqlQuery.query).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| fieldsAdd cpu");
  });

  it("leaves timeseries DQL untouched while converting fetch DQL in the same content", () => {
    const json = JSON.stringify({
      tsQuery: "timeseries avg(cpu)",
      fetchQuery: "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage",
    });
    const result = adjustAllDql(json, testEntityToNodeMap, []);
    const parsed = JSON.parse(result) as { tsQuery: string; fetchQuery: string };
    expect(parsed.tsQuery).toBe("timeseries avg(cpu)");
    expect(parsed.fetchQuery).toBe("smartscapeNodes F5_LTM_POOL_MEMBER\n| fieldsAdd cpu");
  });

  it("converts a lookup query string inside a DqlTable JSON", () => {
    const json = JSON.stringify({
      dqlQuery: {
        query: "smartscapeNodes F5_LTM_POOL_MEMBER | fieldsAdd cpu",
        lookups: [
          {
            query: "fetch `dt.entity.f5:pool` | fields pool_status",
            sourceField: "id",
            lookupField: "pool_status",
            fields: ["pool_status"],
          },
        ],
      },
    });
    const result = adjustAllDql(json, testEntityToNodeMap, []);
    const parsed = JSON.parse(result) as {
      dqlQuery: { lookups: Array<{ query: string }> };
    };
    expect(parsed.dqlQuery.lookups[0].query).toContain("smartscapeNodes F5_LTM_POOL");
    expect(parsed.dqlQuery.lookups[0].query).toContain("poolStatus");
  });
});

describe("splitDqlPipes — bracket tracking", () => {
  it("splits a simple piped query", () => {
    const result = splitDqlPipes("fetch logs | filter level == 'ERROR' | limit 10");
    expect(result).toHaveLength(3);
  });

  it("does not split on pipe inside braces", () => {
    const result = splitDqlPipes("timeseries avg(cpu), by:{host | datacenter}");
    expect(result).toHaveLength(1);
  });

  it("does not split on pipe inside square brackets (sub-query)", () => {
    const result = splitDqlPipes(
      "fetch `dt.entity.f5:pool:member` | append [ fetch `dt.entity.f5:pool` | fields pool_status ]",
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toContain("append [");
    expect(result[1]).toContain("| fields pool_status");
  });

  it("does not split on pipe inside nested brackets", () => {
    const result = splitDqlPipes(
      "fetch `dt.entity.f5:pool:member` | join [ fetch `dt.entity.f5:pool` | filter pool_status == 'active' ], on:{id}",
    );
    expect(result).toHaveLength(2);
  });
});

describe("adjustEntityFetchDqlQuery — sub-query conversion", () => {
  it("converts fetch dt.entity sub-query inside append brackets", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | append [ fetch `dt.entity.f5:pool` | fields pool_status ]",
      testEntityToNodeMap,
      [],
    );
    expect(result).toContain("smartscapeNodes F5_LTM_POOL_MEMBER");
    expect(result).toContain("append [");
    expect(result).toContain("smartscapeNodes F5_LTM_POOL");
    expect(result).not.toContain("dt.entity.f5:pool");
  });

  it("converts fetch dt.entity sub-query inside join brackets", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | join [ fetch `dt.entity.f5:pool` | fields pool_status ], on:{id}",
      testEntityToNodeMap,
      [],
    );
    expect(result).toContain("smartscapeNodes F5_LTM_POOL");
    expect(result).not.toContain("dt.entity.f5:pool`");
  });

  it("converts fetch dt.entity sub-query inside lookup brackets", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | lookup [ fetch `dt.entity.f5:pool` | fields poolId ], sourceField: id, lookupField: poolId",
      testEntityToNodeMap,
      [],
    );
    expect(result).toContain("smartscapeNodes F5_LTM_POOL");
  });

  it("leaves non-entity sub-queries unchanged", () => {
    const result = adjustEntityFetchDqlQuery(
      "fetch `dt.entity.f5:pool:member` | append [ fetch logs | filter level == 'ERROR' ]",
      testEntityToNodeMap,
      [],
    );
    expect(result).toContain("fetch logs");
    expect(result).not.toContain("dt.entity");
  });
});

describe("convertDqlTableCard — structural field adjustment", () => {
  it("updates column field and id when nodeContext is provided", () => {
    const card: DqlTableCardStub = {
      key: "test-table",
      query: { query: "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage" },
      columns: [{ field: "cpu_usage", displayName: "CPU" }],
    };
    const [tableResult1] = convertDqlTableCard(memberCtx, card, [], "PLATFORM");
    const table = defined(tableResult1);
    expect(table.columns?.[0]).toMatchObject({ field: "cpu", id: "cpu" });
  });

  it("leaves column unchanged when field is not in the fieldMap", () => {
    const card: DqlTableCardStub = {
      key: "test-table",
      query: { query: "smartscapeNodes F5_LTM_POOL_MEMBER | fieldsAdd cpu" },
      columns: [{ field: "unknown_field", displayName: "Unknown" }],
    };
    const [tableResult2] = convertDqlTableCard(memberCtx, card, [], "PLATFORM");
    const table = defined(tableResult2);
    expect(table.columns?.[0]).toMatchObject({ field: "unknown_field" });
  });

  it("updates lookup sourceField using main entity fieldMap", () => {
    const card: DqlTableCardStub = {
      key: "test-table",
      query: {
        query: "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage",
        lookups: [
          {
            query: "fetch `dt.entity.f5:pool` | fields pool_status",
            sourceField: "cpu_usage",
            lookupField: "pool_status",
            fields: ["pool_status"],
          },
        ],
      },
      columns: [],
    };
    const [tableResult3] = convertDqlTableCard(memberCtx, card, [], "PLATFORM");
    const table = defined(tableResult3);
    const lookup = table.dqlQuery.lookups?.[0] as {
      sourceField: string;
      lookupField: string;
      fields: string[];
    };
    expect(lookup.sourceField).toBe("cpu");
  });

  it("updates lookup lookupField and fields[] using lookup entity fieldMap", () => {
    const card: DqlTableCardStub = {
      key: "test-table",
      query: {
        query: "fetch `dt.entity.f5:pool:member` | fieldsAdd cpu_usage",
        lookups: [
          {
            query: "fetch `dt.entity.f5:pool` | fields pool_status",
            sourceField: "id",
            lookupField: "pool_status",
            fields: ["pool_status"],
          },
        ],
      },
      columns: [],
    };
    const [tableResult4] = convertDqlTableCard(memberCtx, card, [], "PLATFORM");
    const table = defined(tableResult4);
    const lookup = table.dqlQuery.lookups?.[0] as {
      lookupField: string;
      fields: string[];
    };
    expect(lookup.lookupField).toBe("poolStatus");
    expect(lookup.fields).toContain("poolStatus");
  });
});

describe("convertPropertiesCard — registry key adjustment", () => {
  it("renames overrideMetadataRegistry keys to node field names", () => {
    const card: PropertiesCard = {
      displayOnlyConfigured: false,
      properties: [
        { type: "ATTRIBUTE", attribute: { key: "cpu_usage", displayName: "CPU Usage" } },
        { type: "ATTRIBUTE", attribute: { key: "mem_bytes", displayName: "Memory" } },
      ],
    };
    const metadata = defined(convertPropertiesCard(card, "f5:pool:member", [], memberContext));
    const registry = metadata.overrideMetadataRegistry ?? {};
    expect(registry).toHaveProperty("cpu");
    expect(registry).toHaveProperty("memory");
    expect(registry).not.toHaveProperty("cpu_usage");
    expect(registry).not.toHaveProperty("mem_bytes");
    expect((registry["cpu"] as Record<string, unknown>).displayName).toBe("CPU Usage");
  });

  it("leaves registry keys unchanged when not in fieldMap and emits warning", () => {
    const warnings: ConversionWarning[] = [];
    const card: PropertiesCard = {
      displayOnlyConfigured: false,
      properties: [
        { type: "ATTRIBUTE", attribute: { key: "unknown_field", displayName: "Unknown" } },
      ],
    };
    const metadata = defined(convertPropertiesCard(card, "f5:pool:member", warnings, memberContext));
    expect(metadata.overrideMetadataRegistry).toHaveProperty("unknown_field");
    const dqlWarning = warnings.find(w => w.category === "dql-conversion");
    expect(dqlWarning).toBeDefined();
    expect(dqlWarning!.message).toContain("unknown_field");
  });

  it("produces same result as before when nodeContext is omitted", () => {
    const card: PropertiesCard = {
      displayOnlyConfigured: false,
      properties: [
        { type: "ATTRIBUTE", attribute: { key: "cpu_usage", displayName: "CPU Usage" } },
      ],
    };
    const metadata = defined(convertPropertiesCard(card, "f5:pool:member", []));
    expect(metadata.overrideMetadataRegistry).toHaveProperty("cpu_usage");
  });
});
