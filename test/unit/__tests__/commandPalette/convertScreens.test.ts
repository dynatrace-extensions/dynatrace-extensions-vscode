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
  resolveDetailsCards,
  resolveListCards,
} from "../../../../src/commandPalette/convertScreens";
import { DetailsSettings } from "../../../../src/interfaces/extensionMeta";
import {
  ConversionWarning,
  ScreenConversionContext,
} from "../../../../src/interfaces/screenConversion";
import { extractCondition } from "../../../../src/utils/screenConversion";

jest.mock("../../../../src/utils/logging");

/** Builds a context whose screen carries the card definitions used by the tests. */
function buildContext(screen: ScreenConversionContext["screen"]): ScreenConversionContext {
  return {
    entityType: "test:entity",
    nodeType: "TEST_NODE",
    fieldMap: {},
    staticEdges: [],
    entityToNodeMap: {},
    fileNamePrefix: "test_entity",
    extensionName: "com.dynatrace.test",
    conditions: {},
    screen,
  };
}

/** A minimal CHART_GROUP card definition that converts to a non-null element. */
function chartCard(key: string) {
  return {
    key,
    displayName: key,
    charts: [
      {
        displayName: `${key} chart`,
        visualizationType: "GRAPH_CHART",
        graphChartConfig: {
          metrics: [
            {
              metricSelector: `metric.${key}`,
              dqlQuery: `timeseries avg(metric.${key})`,
            },
          ],
        },
      },
    ],
  };
}

describe("resolveDetailsCards - CARD_GROUP", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("converts a CARD_GROUP into a single tab titled by displayName", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("system"), chartCard("memory")],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "System",
            cards: [
              { type: "CHART_GROUP", key: "system" },
              { type: "CHART_GROUP", key: "memory" },
            ],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    expect(tabs).toHaveLength(1);
    expect(tabs[0].title).toBe("System");
    const layout = tabs[0].content[0] as { type: string; items: unknown[] };
    expect(layout.type).toBe("vertical-layout");
    expect(layout.items).toHaveLength(2);
    expect((layout.items[0] as { id: string }).id).toBe("system");
    expect((layout.items[1] as { id: string }).id).toBe("memory");
  });

  it("skips out-of-scope children but keeps in-scope siblings", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("cpu")],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "CPU & memory",
            cards: [
              { type: "CHART_GROUP", key: "cpu" },
              { type: "METRIC_TABLE", key: "cpu_breakdown" },
            ],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    expect(tabs).toHaveLength(1);
    const layout = tabs[0].content[0] as { items: unknown[] };
    expect(layout.items).toHaveLength(1);
    expect((layout.items[0] as { id: string }).id).toBe("cpu");
  });

  it("drops a CARD_GROUP whose children are all out of scope", () => {
    const screen = {
      entityType: "test:entity",
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "Disks & mounts",
            cards: [
              { type: "METRIC_TABLE", key: "disks" },
              { type: "EVENTS", key: "disk-events" },
            ],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    expect(tabs).toHaveLength(0);
    expect(warnings.some(w => w.message.includes("Disks & mounts"))).toBe(true);
  });

  it("flattens a nested CARD_GROUP into the parent tab", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("outer"), chartCard("inner")],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "Outer",
            cards: [
              { type: "CHART_GROUP", key: "outer" },
              {
                type: "CARD_GROUP",
                displayName: "Inner",
                cards: [{ type: "CHART_GROUP", key: "inner" }],
              },
            ],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    expect(tabs).toHaveLength(1);
    const layout = tabs[0].content[0] as { items: unknown[] };
    expect(layout.items).toHaveLength(2);
    expect((layout.items[0] as { id: string }).id).toBe("outer");
    expect((layout.items[1] as { id: string }).id).toBe("inner");
  });

  it("dedupes tab ids when two groups share a displayName", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("sysA"), chartCard("sysB")],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "System",
            cards: [{ type: "CHART_GROUP", key: "sysA" }],
          },
          {
            type: "CARD_GROUP",
            displayName: "System",
            cards: [{ type: "CHART_GROUP", key: "sysB" }],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    expect(tabs).toHaveLength(2);
    expect(tabs[0].title).toBe("System");
    expect(tabs[1].title).toBe("System");
    expect(tabs[0].id).toBe("system");
    expect(tabs[1].id).toBe("system-2");
  });

  it("keeps a MESSAGE child inline in the group tab", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("cpu")],
      messageCards: [
        {
          key: "warn1",
          type: "MESSAGE",
          message: { text: "heads up", theme: "WARNING" },
        },
      ],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "CPU",
            cards: [
              { type: "MESSAGE", key: "warn1" },
              { type: "CHART_GROUP", key: "cpu" },
            ],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs] = resolveDetailsCards(context, settings, warnings, "PLATFORM", "detailsSettings");

    // Exactly one tab (the group) — no separate aggregated "Messages" tab.
    expect(tabs).toHaveLength(1);
    expect(tabs.some(t => t.id === "messages")).toBe(false);

    const items = (tabs[0].content[0] as { items: Array<{ type: string; id: string }> }).items;
    expect(items.map(i => i.id)).toEqual(["warn1", "cpu"]);
    expect(items[0].type).toBe("message");
  });

  it("attaches a grouped child's layout-ref conditions to the element and collects the id", () => {
    // The condition lives only on the layout ref (not the card definition), the same
    // shape as the disks/cpu cards in python-remote_unix. It must end up on the element
    // AND have its id collected so the document conditionContext is generated.
    const conditionStr = "entityAttribute|extension_os=MacOS";
    const screen = {
      entityType: "test:entity",
      dqlTableCards: [{ key: "disks_dql", query: { query: "fetch dt.entity.host" }, columns: [] }],
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const info = extractCondition(context, conditionStr);
    expect(info).not.toBeNull();
    context.conditions = { [info!.id]: info! };

    const settings: DetailsSettings = {
      target: "PLATFORM",
      layout: {
        autoGenerate: false,
        cards: [
          {
            type: "CARD_GROUP",
            displayName: "Disks",
            cards: [{ type: "DQL_TABLE", key: "disks_dql", conditions: [conditionStr] }],
          },
        ],
      },
    } as unknown as DetailsSettings;
    const warnings: ConversionWarning[] = [];

    const [tabs, conditionIds] = resolveDetailsCards(
      context,
      settings,
      warnings,
      "PLATFORM",
      "detailsSettings",
    );

    expect(tabs).toHaveLength(1);
    const items = (
      tabs[0].content[0] as { items: Array<{ id: string; conditions?: unknown[] }> }
    ).items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("disks_dql");
    expect(items[0].conditions).toEqual([
      { type: "dql-variable", variable: info!.field, value: true },
    ]);
    expect(conditionIds).toContain(info!.id);
  });
});

describe("resolveListCards - CARD_GROUP", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("flattens a CARD_GROUP's children inline into the layout items", () => {
    const screen = {
      entityType: "test:entity",
      chartsCards: [chartCard("a"), chartCard("b")],
      listSettings: {
        layout: {
          autoGenerate: false,
          cards: [
            {
              type: "CARD_GROUP",
              target: "PLATFORM",
              displayName: "Group",
              cards: [
                { type: "CHART_GROUP", key: "a" },
                { type: "CHART_GROUP", key: "b" },
              ],
            },
          ],
        },
      },
    } as unknown as ScreenConversionContext["screen"];
    const context = buildContext(screen);
    const warnings: ConversionWarning[] = [];

    const [items] = resolveListCards(context, warnings);

    expect(items).toHaveLength(2);
    expect((items[0] as { id: string }).id).toBe("a");
    expect((items[1] as { id: string }).id).toBe("b");
  });
});
