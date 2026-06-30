# CARD_GROUP support in screen conversion

**Date:** 2026-06-11
**Status:** Approved (design)
**Area:** `src/commandPalette/convertScreens.ts`, `src/interfaces/extensionMeta.ts`

## Problem

The "Convert Screens" command translates Universal Agent screen definitions into
Extensions 2.0 document JSON. A `CARD_GROUP` is a layout card that acts as a named
container: it has a `displayName` (and **no** `key`) and wraps an ordered `cards`
array of normal card refs (`CHART_GROUP`, `DQL_TABLE`, `METRIC_TABLE`, `EVENTS`,
`LOGS`, `MESSAGE`, ...), each of which may carry its own `conditions`.

`resolveCardByRef` does not recognise `CARD_GROUP`, so it falls through to the
`default` branch and emits:

```
- [detailsSettings.undefined] Unknown card type "CARD_GROUP" (key: "undefined")
```

The whole group — and every child card inside it — is dropped.

Reference example: `supported/python-remote_unix/extension/extension.yaml`
(`detailsSettings.layout.cards`), which uses several `CARD_GROUP`s such as
"System", "CPU & memory", "Disks & mounts", "Top processes".

## Goals

- A `CARD_GROUP` in a `detailsSettings` layout is converted instead of dropped.
- The author's grouping intent is preserved.
- Child cards that are individually out of scope are handled exactly as they are
  at the top level today (skipped with a warning), without losing the rest of the
  group.

## Non-goals

- Adding support for any new *leaf* card types (EVENTS/LOGS/PROBLEMS/METRIC_TABLE
  remain out of scope as they are today).
- Changing the global "Messages" tab aggregation behaviour for top-level MESSAGE
  cards.

## Design decisions (confirmed)

1. **One tab per group.** A `CARD_GROUP` maps to a single tab whose title is the
   group's `displayName`; its child cards are stacked in that tab's
   `vertical-layout`.
2. **MESSAGE children stay inline** in the group's tab, in document order. The
   global "Messages" tab continues to collect only *top-level* MESSAGE cards.
3. **Nested `CARD_GROUP`** (a group inside a group) is flattened: the inner
   group's children are resolved recursively and placed inline in the parent
   group's tab. (Defensive — not present in the reference example.)
4. **Type change shape:** add optional `displayName` / `cards` fields to the
   existing `DetailsScreenCard` interface (discriminated by `type`) rather than
   introducing a separate `CardGroupStub`.

## Detailed design

### 1. Types — `src/interfaces/extensionMeta.ts`

- Add `CARD_GROUP: "CARD_GROUP"` to the `DetailInjectionCardType` const map (this
  feeds the `DetailsScreenCard.type` union).
- Extend `DetailsScreenCard` with two optional fields, used only when
  `type === "CARD_GROUP"`:
  - `displayName?: string` — the tab title.
  - `cards?: DetailsScreenCard[]` — the nested child card refs.

### 2. Details conversion — `resolveDetailsCards` in `convertScreens.ts`

Detect `ref.type === "CARD_GROUP"` **before** the `SKIPPED_CARD_TYPES` check and
the `resolveCardByRef` call, and build exactly one tab:

- **title** = `ref.displayName` (fall back to a generated label if absent).
- **id** = slugified `displayName`, falling back to `card-group-${index}`,
  deduplicated against tab ids already pushed in this screen.
- **content** = a single `{ type: "vertical-layout", items: [...] }` whose items
  are the resolved child elements, in document order.
- If the group's `conditions` are present on the `CARD_GROUP` ref itself, convert
  them and attach to the tab (mirrors existing per-card `refConditions` handling).
- If the group resolves to **zero** items (all children skipped / out of scope),
  drop the tab and emit a warning instead of emitting an empty tab.

A new helper resolves the children:

```
resolveGroupChildren(
  context,
  childRefs: DetailsScreenCard[],
  warnings,
  parentTarget?: string,
  hint?: string,
): [LayoutElement[], string[]]
```

For each child ref it:

- Skips `SKIPPED_CARD_TYPES` (warning, except `INJECTIONS` which is silent) —
  identical to the top-level loop.
- If the child is itself a `CARD_GROUP`, recurses and **flattens** the returned
  items into the current list.
- Otherwise calls `resolveCardByRef` to get the element.
- Converts the child ref's `conditions` and attaches them to the child *element*
  (`if ("conditions" in element)`), mirroring `resolveListCards` — children are
  layout items, not tabs, so conditions live on the element.
- Collects `conditionIds` for the screen-level `conditionContext`.

MESSAGE children are returned in-line in the items list (decision 2) rather than
being routed to the message-aggregation path.

### 3. List conversion — `resolveListCards` in `convertScreens.ts` (defensive)

`ListScreenCard`'s `type` union does not include `CARD_GROUP`, and inventory
screens render a flat `vertical-layout` with no tabs. To avoid silently dropping
content should a `CARD_GROUP` ever appear here, detect it and flatten its children
inline into the layout `items` (no grouping wrapper). This reuses the same
child-resolution logic as the details path.

### 4. Tests

Add a focused unit test driving the conversion with a `detailsSettings` layout
containing a `CARD_GROUP` (modeled on the python-remote_unix example). Assert:

- One tab is produced per group, with the group's `displayName` as the title.
- Child elements appear in document order inside the tab's vertical-layout.
- An out-of-scope child (e.g. `METRIC_TABLE`) is skipped while in-scope siblings
  (`CHART_GROUP`, `DQL_TABLE`) are kept.
- A group whose children are all out of scope produces no tab (and a warning).

## Risks / trade-offs

- **Tab id collisions:** group tab ids derive from `displayName`, which could
  collide with a card `key` or another group's slug. Mitigated by dedup against
  already-emitted ids.
- **Conditions placement:** putting child conditions on the element rather than a
  tab is consistent with `resolveListCards`; verify the target element types
  (`chart-group`, `dql-table`, `message`) accept a `conditions` field (they do in
  the converters today).
- **Flattening nested groups** loses the inner group's `displayName`. Acceptable —
  nested groups are not used in practice and the details layout has no clean
  tab-in-tab representation.
