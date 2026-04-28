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
  convertChartsCard,
  convertConditions,
  convertDqlTableCard,
  convertHealthCard,
  convertMessageCard,
  convertPropertiesCard,
  generateConversionReport,
  parseDqlQuery,
  shouldSkipByTarget,
} from "../../../../src/utils/screenConversion";

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

  // -----------------------------------------------------------------------
  // shouldSkipByTarget
  // -----------------------------------------------------------------------
  describe("shouldSkipByTarget", () => {
    test.each([
      ["CLASSIC", true],
      ["PLATFORM", false],
      ["BOTH", false],
      [undefined, false],
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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertChartsCard(card, warnings);

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

      const result = convertDqlTableCard(card, warnings);

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

      const result = convertDqlTableCard(card, warnings);

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

      const result = convertMessageCard(card, undefined, warnings);

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

      const result = convertMessageCard(card, undefined, warnings);

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

      const result = convertMessageCard(card, keywords, warnings);

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

      const result = convertMessageCard(card, undefined, warnings);

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

      const result = convertMessageCard(card, undefined, warnings);

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

      const result = convertHealthCard(card, warnings);

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

      expect(convertHealthCard(card, warnings)).toBeNull();
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
      expect(convertConditions(undefined, warnings)).toEqual([]);
      expect(convertConditions([], warnings)).toEqual([]);
    });

    it("generates placeholder conditions and warnings", () => {
      const conditions = [
        "extensionConfigured|extensionId=com.dynatrace.extension.f5",
        "entityAttribute|devMonitoringMode=Extension",
      ];
      const warnings: ConversionWarning[] = [];

      const result = convertConditions(conditions, warnings);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("dql-variable");
      expect(result[0].variable).toBe("condition_0");
      expect(warnings.filter(w => w.category === "conditions")).toHaveLength(2);
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
        fields: new Set(["field1", "field2"]),
        entityToNodeMap: {
          "f5:instance": { nodeType: "EXT_NETWORK_DEVICE", fields: new Set(["field1", "field2"]) },
        },
        screen: { entityType: "f5:instance" } as ScreenConversionContext["screen"],
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
        fields: new Set(["field1", "field2"]),
        entityToNodeMap: {
          "test:entity": { nodeType: "test_entity", fields: new Set(["field1", "field2"]) },
        },
        fileNamePrefix: "test_entity",
        extensionName: "com.dynatrace.test.extension",
        screen: { entityType: "test:entity" } as ScreenConversionContext["screen"],
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
      const group = defined(convertChartsCard(card, warnings));

      expect(warnings).toHaveLength(0);
      const chart = group.charts[0];
      expect(chart.dqlQuery).toMatch(/^timeseries \{/);
      expect(chart.dqlQuery).toContain("used=avg(memory.used)");
      expect(chart.dqlQuery).toContain("total=avg(memory.total)");
      expect(chart.dqlQuery).toContain("by:{host.name}");
    });
  });
});
