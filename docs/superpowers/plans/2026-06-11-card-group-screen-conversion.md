# CARD_GROUP Screen Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Universal Agent `CARD_GROUP` layout cards into a single Extensions 2.0 details tab per group instead of dropping them with an "Unknown card type" warning.

**Architecture:** A `CARD_GROUP` is a named container (`displayName`, no `key`) wrapping an ordered `cards` array of normal card refs. We add `CARD_GROUP` to the card-type union and two optional fields to `DetailsScreenCard`, then handle the type in `resolveDetailsCards` (details) by building one tab whose `vertical-layout` holds the resolved children, and defensively in `resolveListCards` (inventory) by flattening children inline. Children are resolved by a new `resolveGroupChildren` helper that reuses the existing `resolveCardByRef` per-child logic, skips out-of-scope children, keeps MESSAGE children inline, and flattens nested groups.

**Tech Stack:** TypeScript, Jest (`ts-jest`, Unit project), VS Code extension. Tests live in `test/unit/__tests__/`. The `vscode` module is auto-mocked via `test/unit/__mocks__/vscode.ts`, and `commandPalette/*` modules are already imported directly in unit tests (see `convertTopology.test.ts`).

**Reference example:** `supported/python-remote_unix/extension/extension.yaml` (`detailsSettings.layout.cards`).

**Design spec:** `docs/superpowers/specs/2026-06-11-card-group-screen-conversion-design.md`

---

## File Structure

- **Modify** `src/interfaces/extensionMeta.ts` — add `CARD_GROUP` to `DetailInjectionCardType`; add optional `displayName` / `cards` to `DetailsScreenCard`.
- **Modify** `src/commandPalette/convertScreens.ts` — `export` `resolveDetailsCards`; add `CARD_GROUP` handling there; add `resolveGroupChildren` helper; add defensive `CARD_GROUP` flattening in `resolveListCards`; import `DetailsScreenCard`.
- **Create** `test/unit/__tests__/commandPalette/convertScreens.test.ts` — unit tests driving `resolveDetailsCards` with CARD_GROUP layouts.

---

## Task 1: Add CARD_GROUP to the card-type definitions

**Files:**
- Modify: `src/interfaces/extensionMeta.ts:34-44` (const map + type) and `src/interfaces/extensionMeta.ts:184-189` (`DetailsScreenCard`)

- [ ] **Step 1: Add `CARD_GROUP` to the `DetailInjectionCardType` const map**

In `src/interfaces/extensionMeta.ts`, change the const map (currently lines 34-42) to include `CARD_GROUP`:

```typescript
export const DetailInjectionCardType = {
  ENTITIES_LIST: "ENTITIES_LIST",
  CHART_GROUP: "CHART_GROUP",
  MESSAGE: "MESSAGE",
  LOGS: "LOGS",
  EVENTS: "EVENTS",
  METRIC_TABLE: "METRIC_TABLE",
  INJECTIONS: "INJECTIONS",
  CARD_GROUP: "CARD_GROUP",
} as const;
```

- [ ] **Step 2: Add optional group fields to `DetailsScreenCard`**

Change the `DetailsScreenCard` interface (currently lines 184-189) to:

```typescript
export interface DetailsScreenCard extends Conditional {
  key: string;
  entitySelectorTemplate?: string;
  target?: string;
  type: DetailInjectionCardType;
  // Populated only when type === "CARD_GROUP": a named container with no key
  // wrapping an ordered list of child card refs.
  displayName?: string;
  cards?: DetailsScreenCard[];
}
```

Note: `key` stays required to match the rest of the codebase; CARD_GROUP refs have no key in the YAML, so it will be `undefined` at runtime — that is fine because the group branch never reads `ref.key`.

- [ ] **Step 3: Verify the project still compiles**

Run: `npm run compile`
Expected: PASS (no TypeScript errors).

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/extensionMeta.ts
git commit -m "feat: add CARD_GROUP to screen card type definitions"
```

---

## Task 2: Export resolveDetailsCards and write the failing CARD_GROUP test

**Files:**
- Modify: `src/commandPalette/convertScreens.ts:716` (add `export`)
- Create: `test/unit/__tests__/commandPalette/convertScreens.test.ts`

- [ ] **Step 1: Export `resolveDetailsCards`**

In `src/commandPalette/convertScreens.ts`, change the function declaration (currently line 716) from:

```typescript
function resolveDetailsCards(
```

to:

```typescript
export function resolveDetailsCards(
```

- [ ] **Step 2: Write the failing test file**

Create `test/unit/__tests__/commandPalette/convertScreens.test.ts` with this exact content:

```typescript
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

import { resolveDetailsCards } from "../../../../src/commandPalette/convertScreens";
import { DetailsSettings } from "../../../../src/interfaces/extensionMeta";
import {
  ConversionWarning,
  ScreenConversionContext,
} from "../../../../src/interfaces/screenConversion";

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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- convertScreens`
Expected: FAIL. The first test fails because the CARD_GROUP falls into `resolveCardByRef`'s default branch and produces no tab (`tabs` has length 0, not 1), with an "Unknown card type" warning.

- [ ] **Step 4: Commit the failing test**

```bash
git add test/unit/__tests__/commandPalette/convertScreens.test.ts src/commandPalette/convertScreens.ts
git commit -m "test: add failing CARD_GROUP conversion tests"
```

---

## Task 3: Implement CARD_GROUP handling in resolveDetailsCards

**Files:**
- Modify: `src/commandPalette/convertScreens.ts` (import line 33-38; `resolveDetailsCards` body ~716-789; add `resolveGroupChildren` helper after `resolveListCards`)

- [ ] **Step 1: Import the `DetailsScreenCard` type**

In `src/commandPalette/convertScreens.ts`, add `DetailsScreenCard` to the existing import from `../interfaces/extensionMeta` (currently lines 33-38):

```typescript
import {
  DetailsScreenCard,
  DetailsSettings,
  PropertiesCard,
  ScreenStub,
  TopologyStub,
} from "../interfaces/extensionMeta";
```

- [ ] **Step 2: Add the CARD_GROUP branch at the top of the `resolveDetailsCards` loop**

In `resolveDetailsCards`, the loop currently begins (around line 730) with:

```typescript
  for (const ref of cardRefs) {
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
```

Insert the CARD_GROUP handling as the first statement inside the `for` loop, **before** the `SKIPPED_CARD_TYPES` check:

```typescript
  for (const ref of cardRefs) {
    if (ref.type === "CARD_GROUP") {
      const groupHint = hint ? `${hint}.card-group` : "card-group";
      const [childItems, childConditionIds] = resolveGroupChildren(
        context,
        ref.cards ?? [],
        warnings,
        resolveTarget(ref.target, settingsTarget),
        groupHint,
      );
      if (childItems.length === 0) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `CARD_GROUP "${ref.displayName ?? ""}" produced no convertible cards`,
          hint,
        );
        continue;
      }
      screenConditionIds.push(...childConditionIds);

      const [groupConditions, groupConditionIds] = convertConditions(
        context,
        ref.conditions ?? [],
        warnings,
        hint,
      );
      screenConditionIds.push(...groupConditionIds);

      const baseId = slugifyTabId(ref.displayName) || `card-group-${tabs.length}`;
      tabs.push({
        type: "tab",
        id: dedupeTabId(baseId, tabs),
        title: ref.displayName ?? baseId,
        conditions: groupConditions,
        content: [{ type: "vertical-layout", items: childItems }],
      });
      continue;
    }

    if (SKIPPED_CARD_TYPES.has(ref.type)) {
```

- [ ] **Step 3: Add the `resolveGroupChildren` helper and id utilities**

Add these functions immediately after `resolveListCards` (after its closing brace, around line 844):

```typescript
/**
 * Resolves the child cards of a CARD_GROUP into vertical-layout items, in document order.
 * Out-of-scope children are skipped with a warning, MESSAGE children are kept inline,
 * and nested CARD_GROUPs are flattened into the same item list.
 */
function resolveGroupChildren(
  context: ScreenConversionContext,
  childRefs: DetailsScreenCard[],
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [LayoutElement[], string[]] {
  const items: LayoutElement[] = [];
  const conditionIds: string[] = [];

  for (const child of childRefs) {
    const childHint = hint ? `${hint}.${child.key ?? child.displayName ?? "card"}` : child.key;

    if (child.type === "CARD_GROUP") {
      const [nestedItems, nestedConditionIds] = resolveGroupChildren(
        context,
        child.cards ?? [],
        warnings,
        resolveTarget(child.target, parentTarget),
        childHint,
      );
      items.push(...nestedItems);
      conditionIds.push(...nestedConditionIds);
      continue;
    }

    if (SKIPPED_CARD_TYPES.has(child.type)) {
      if (child.type !== "INJECTIONS") {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `Card type "${child.type}" (key: "${child.key}") skipped`,
          childHint,
        );
      }
      continue;
    }

    const [element, elementConditionIds] = resolveCardByRef(
      child,
      context,
      warnings,
      resolveTarget(child.target, parentTarget),
      childHint,
    );
    if (!element) continue;
    conditionIds.push(...elementConditionIds);

    const [refConditions, refConditionIds] = convertConditions(
      context,
      child.conditions ?? [],
      warnings,
      childHint,
    );
    if ("conditions" in element && refConditions.length > 0) {
      if (!element.conditions) element.conditions = [];
      element.conditions.push(...refConditions);
      conditionIds.push(...refConditionIds);
    }

    items.push(element);
  }

  return [items, conditionIds];
}

/** Lowercases and hyphenates a displayName into a stable tab id fragment. */
function slugifyTabId(displayName?: string): string {
  if (!displayName) return "";
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ensures the candidate tab id is unique among already-emitted tabs. */
function dedupeTabId(candidate: string, tabs: Tab[]): string {
  const used = new Set(tabs.map(t => t.id));
  if (!used.has(candidate)) return candidate;
  let i = 2;
  while (used.has(`${candidate}-${i}`)) i++;
  return `${candidate}-${i}`;
}
```

- [ ] **Step 4: Run the CARD_GROUP tests to verify they pass**

Run: `npm run test:unit -- convertScreens`
Expected: PASS (all 4 tests in `resolveDetailsCards - CARD_GROUP`).

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS (existing `screenConversion` and other unit tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/commandPalette/convertScreens.ts
git commit -m "feat: convert CARD_GROUP into a details tab with grouped children"
```

---

## Task 4: Defensively flatten CARD_GROUP in the inventory (list) layout

**Files:**
- Modify: `src/commandPalette/convertScreens.ts` (`resolveListCards` body ~805-841)
- Modify: `test/unit/__tests__/commandPalette/convertScreens.test.ts` (add a test)

- [ ] **Step 1: Write the failing list test**

Append this `describe` block to `test/unit/__tests__/commandPalette/convertScreens.test.ts`, and add `resolveListCards` to the import from `convertScreens`:

Change the import line:

```typescript
import { resolveDetailsCards, resolveListCards } from "../../../../src/commandPalette/convertScreens";
```

Add the block at the end of the file:

```typescript
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
```

Note: `resolveListCards` is already module-private; export it the same way as `resolveDetailsCards` in Step 3 below if not yet exported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- convertScreens`
Expected: FAIL — `resolveListCards` either isn't exported (import error) or the CARD_GROUP is dropped, so `items` has length 0.

- [ ] **Step 3: Export `resolveListCards` and add the CARD_GROUP branch**

In `src/commandPalette/convertScreens.ts`, change the declaration (currently line 794) from `function resolveListCards(` to `export function resolveListCards(`.

Then, inside the `for (const ref of cardRefs)` loop in `resolveListCards`, add this as the first statement (before the `SKIPPED_CARD_TYPES` check at ~807):

```typescript
  for (const ref of cardRefs) {
    if (ref.type === "CARD_GROUP") {
      const groupHint = `listSettings.card-group`;
      const [childItems, childConditionIds] = resolveGroupChildren(
        context,
        (ref as DetailsScreenCard).cards ?? [],
        warnings,
        ref.target,
        groupHint,
      );
      items.push(...childItems);
      conditionIds.push(...childConditionIds);
      continue;
    }

    const cardHint = `listSettings.${ref.key}`;
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
```

Note: the existing first line of the loop body is `const cardHint = ...`; keep it where shown above (the CARD_GROUP branch is inserted before it). `ListScreenCard` does not declare `cards`, so the `as DetailsScreenCard` cast bridges the defensive path.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- convertScreens`
Expected: PASS (all details and list CARD_GROUP tests).

- [ ] **Step 5: Commit**

```bash
git add src/commandPalette/convertScreens.ts test/unit/__tests__/commandPalette/convertScreens.test.ts
git commit -m "feat: defensively flatten CARD_GROUP in inventory layout"
```

---

## Task 5: Final verification against the real example and linting

**Files:** none (verification only)

- [ ] **Step 1: Run lint and compile**

Run: `npm run pretest`
Expected: PASS (compile + eslint clean). Fix any lint/format issues reported in the touched files.

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Sanity-check the warning is gone (optional, manual)**

If a headless conversion run is available for `supported/python-remote_unix`, confirm the conversion report no longer contains `Unknown card type "CARD_GROUP"` and that tabs titled "System", "CPU & memory", "Top processes", etc. are produced. (The unit tests already assert the equivalent behavior; this is a confidence check only.)

- [ ] **Step 4: Final commit (if any lint fixes were made)**

```bash
git add -A
git commit -m "chore: lint fixes for CARD_GROUP conversion"
```
```

---

## Notes for the implementer

- `LayoutElement`, `Tab`, `Message`, `ConversionWarning`, `convertConditions`, `resolveCardByRef`, `resolveTarget`, `addWarning`, and `SKIPPED_CARD_TYPES` are all already present in `convertScreens.ts` — no new imports beyond `DetailsScreenCard`.
- Child element types returned by `resolveCardByRef` (`chart-group`, `dql-table`, `message`) already support an optional `conditions` array, so attaching child ref conditions to the element is safe.
- Do not change the global "Messages" tab aggregation: it intentionally only collects top-level MESSAGE cards. MESSAGE cards inside a group stay inline because `resolveGroupChildren` pushes whatever `resolveCardByRef` returns.
