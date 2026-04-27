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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { GlobalCommand } from "@common";
import {
  EntityDetailsDefinitionDocument,
  EntityDetailsInjectionDocument,
  Header,
  InvExDefinitionDocument,
  InvExInjectionDocument,
  LayoutElement,
  Message,
  Tab,
} from "@dynatrace/unified-analysis/documents";
import * as vscode from "vscode";
import { OpenPipelinePipeline } from "../interfaces/extensionDocs";
import { DetailsSettings, ScreenStub } from "../interfaces/extensionMeta";
import {
  ConversionWarning,
  EntityToNodeMap,
  OutputDocument,
  ScreenConversionContext,
  ScreenConversionResult,
  TabsLayoutElement,
} from "../interfaces/screenConversion";
import { getCachedParsedExtension } from "../utils/caching";
import { checkWorkspaceOpen, isExtensionsWorkspace } from "../utils/conditionCheckers";
import { getExtensionFilePath, getPipelineFiles } from "../utils/fileSystem";
import logger from "../utils/logging";
import {
  addWarning,
  adjustAllDql,
  buildDefaultDqlTable,
  convertChartsCard,
  convertConditions,
  convertDqlTableCard,
  convertHealthCard,
  convertMessageCard,
  convertPropertiesCard,
  generateConversionReport,
  shouldSkipByTarget,
} from "../utils/screenConversion";
import { ConfirmOption, showConfirmationInformationMessage } from "../utils/vscode";

const DOCUMENT_VERSION = "0.35.0";

/**
 * Workflow entry point for the "Convert Screens" command.
 * Validates preconditions, then runs the core conversion logic.
 */
export const convertScreensWorkflow = async () => {
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await convertScreens();
  }
};

/**
 * Core conversion logic: parses the extension manifest, lets the user select
 * entity types, resolves node types, and produces JSON document files.
 */
async function convertScreens() {
  const logTrace = ["commandPalette", "convertScreens"];
  logger.info("Starting screen conversion", ...logTrace);

  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension not available in cache. Command aborted.", ...logTrace);
    return;
  }
  const extensionFilePath = getExtensionFilePath();
  if (!extensionFilePath) {
    logger.notify("ERROR", "Could not locate extension.yaml in the workspace.", ...logTrace);
    return;
  }

  if (
    !extension.topology?.types ||
    extension.topology?.types.length === 0 ||
    !extension.screens ||
    extension.screens.length === 0
  ) {
    logger.notify("WARN", "No topology or screens found in extension.yaml.", ...logTrace);
    return;
  }

  // Discover smartscape nodes to entity mapping
  const entitiesWithScreens = extension.screens.map(s => s.entityType);
  const pipelineFiles = getPipelineFiles();
  if (pipelineFiles.length === 0) {
    logger.notify(
      "ERROR",
      "No OpenPipeline files found. Can only convert screens for Smartscape nodes",
      ...logTrace,
    );
    await showConfirmationInformationMessage("Convert topology instead?").then(async choice => {
      if (choice === ConfirmOption.Yes) {
        await vscode.commands.executeCommand(GlobalCommand.UploadExtension);
      }
    });
    return;
  }
  const entityToNodeMap = createEntityToNodeTypeMap(pipelineFiles);
  const validEntityTypes = Object.keys(entityToNodeMap).filter(et =>
    entitiesWithScreens.includes(et),
  );
  if (validEntityTypes.length === 0) {
    logger.notify(
      "ERROR",
      "No pipeline nodes match your screens' entity types. Ensure the 'id_classic' field is extracted",
      ...logTrace,
    );
    return;
  }

  // Let the user pick which entity types to convert
  const selected = await vscode.window.showQuickPick(
    validEntityTypes.map(et => ({ label: et })),
    {
      canPickMany: true,
      placeHolder: "Select entity types to convert screens for",
      title: "Convert Screens",
    },
  );

  if (!selected || selected.length === 0) {
    logger.info("User cancelled entity type selection", ...logTrace);
    return;
  }

  const extensionDir = dirname(extensionFilePath);
  const screensDir = join(extensionDir, "screens");
  if (!existsSync(screensDir)) {
    mkdirSync(screensDir, { recursive: true });
  }

  const selectedEntityTypes = new Set(selected.map(s => s.label));
  const results: ScreenConversionResult[] = [];

  for (const screen of extension.screens) {
    if (!selectedEntityTypes.has(screen.entityType)) continue;

    const resolvedNode = entityToNodeMap[screen.entityType];
    const context: ScreenConversionContext = {
      ...resolvedNode,
      extensionName: extension.name,
      entityType: screen.entityType,
      fileNamePrefix: resolvedNode.nodeType,
      screen,
      keywords: extension.keywords ?? [],
      entityToNodeMap,
    };
    const result = convertSingleScreen(context, screensDir);
    results.push(result);
  }

  // Show summary
  const totalFiles = results.reduce((sum, r) => sum + r.filesWritten.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  const message =
    totalFiles > 0
      ? `Converted ${results.length} screen(s): ${totalFiles} file(s) created.` +
        (totalWarnings > 0 ? ` ${totalWarnings} warning(s) — see conversion report.` : "")
      : "No files were generated. Check the conversion reports for details.";

  const fullReport =
    "# Conversion Report\n\n" + results.map(r => r.conversionReport).join("\n---\n");
  const reportFilePath = join(screensDir, "conversion-report.md");
  writeFileSync(reportFilePath, fullReport);

  logger.notify("INFO", message, ...logTrace);
}

const createEntityToNodeTypeMap = (pipelineFiles: string[]): EntityToNodeMap => {
  const nodes: Record<string, { nodeType: string; idClassic?: string; fields: Set<string> }> = {};
  const entityToNodeMap: EntityToNodeMap = {};
  for (const file of pipelineFiles) {
    const pipeline = JSON.parse(String(readFileSync(file))) as OpenPipelinePipeline;
    if (pipeline.smartscapeNodeExtraction) {
      for (const processor of pipeline.smartscapeNodeExtraction.processors) {
        if (processor.smartscapeNode && processor.smartscapeNode.extractNode) {
          const nodeType = processor.smartscapeNode.nodeType;
          if (!Object.keys(nodes).includes(nodeType)) {
            nodes[nodeType] = { nodeType, fields: new Set() };
          }
          const fields = processor.smartscapeNode.fieldsToExtract ?? [];
          fields.forEach(field => {
            if (field.fieldName === "id_classic") {
              nodes[nodeType].idClassic = field.referencedFieldName;
            }
            nodes[nodeType].fields.add(field.fieldName ?? field.referencedFieldName);
          });
        }
      }
    }
  }
  Object.values(nodes).forEach(({ nodeType, idClassic, fields }) => {
    if (idClassic) {
      entityToNodeMap[idClassic] = { nodeType, fields };
    }
  });
  return entityToNodeMap;
};

/**
 * Converts a single screen entity type and writes all applicable JSON document files.
 */
function convertSingleScreen(
  context: ScreenConversionContext,
  screensDir: string,
): ScreenConversionResult {
  const logTrace = ["commandPalette", "convertScreens", "convertSingleScreen"];
  const warnings: ConversionWarning[] = [];
  const documents: OutputDocument[] = [];

  const { screen, entityToNodeMap } = context;

  // 4.1 detailsSettings → EntityDetailsDefinitionDocument
  if (screen.detailsSettings) {
    const doc = buildEntityDetailsDefinition(context, warnings);
    if (doc) documents.push(doc);
  }

  // 4.2 listSettings → InvExDefinitionDocument
  if (screen.listSettings) {
    const doc = buildInvExDefinition(context, warnings);
    if (doc) documents.push(doc);
  }

  // 4.3 detailsInjections → EntityDetailsInjectionDocument(s)
  if (screen.detailsInjections) {
    const docs = buildDetailsInjections(context, warnings);
    documents.push(...docs);
  }

  // 4.4 listInjections → InvExInjectionDocument(s)
  if (screen.listInjections) {
    const docs = buildListInjections(context, warnings);
    documents.push(...docs);
  }

  // Write all documents to disk
  const filesWritten: string[] = [];
  for (const doc of documents) {
    const filePath = join(screensDir, doc.fileName);
    const content = adjustAllDql(JSON.stringify(doc.content, null, 2), entityToNodeMap, warnings);
    writeFileSync(filePath, content);
    filesWritten.push(doc.fileName);
    logger.info(`Wrote ${doc.fileName}`, ...logTrace);
  }

  // Write conversion report
  const conversionReport = generateConversionReport(context, filesWritten, warnings);

  return { filesWritten, warnings, conversionReport };
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

/**
 * Builds an EntityDetailsDefinitionDocument from detailsSettings.
 * Resolves layout cards into a tabs layout with one tab per card.
 * Message cards are aggregated into a single "Messages" tab.
 */
function buildEntityDetailsDefinition(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): OutputDocument | null {
  const { nodeType, fileNamePrefix, screen, entityType } = context;
  const settingsDef = screen.detailsSettings;
  if (!settingsDef) return null;

  let settings: DetailsSettings;
  if (Array.isArray(settingsDef)) {
    settings = settingsDef.filter(s => s.target !== "CLASSIC")[0];
  } else {
    settings = settingsDef;
  }

  if (shouldSkipByTarget(settings.target)) {
    addWarning(warnings, "skipped-classic", "detailsSettings skipped (target: CLASSIC)");
    return null;
  }

  // Header
  let header: Header | undefined = undefined;
  if (settings.staticContent?.header) {
    header = {
      title: settings.staticContent.header.title,
      subtitle: settings.staticContent.header.description,
    };
  }

  // Breadcrumbs warning
  if (settings.staticContent?.breadcrumbs) {
    addWarning(warnings, "breadcrumbs", "Breadcrumbs are dropped (no equivalent in new format)");
  }

  // Resolve cards into tabs
  const tabs = resolveDetailsCards(context, settings, warnings);

  // Properties card → metadata element added as first tab
  if (screen.propertiesCard && settings.staticContent?.showProperties !== false) {
    const metadata = convertPropertiesCard(screen.propertiesCard, entityType, warnings);
    if (metadata) {
      tabs.unshift({
        type: "tab",
        id: `${entityType}-properties`,
        title: "Properties",
        content: [{ type: "vertical-layout", items: [metadata] }],
      });
    }
  }

  const content: EntityDetailsDefinitionDocument = {
    version: DOCUMENT_VERSION,
    type: "EntityDetailsDefinition",
    target: { app: "*", nodeType },
    content: {
      type: "details",
      id: `${entityType}-details`,
      header,
      content: {
        type: "tabs",
        items: tabs,
      },
    },
  };

  return {
    fileName: `${fileNamePrefix}.entitydetails.json`,
    content,
  };
}

/**
 * Builds an InvExDefinitionDocument from listSettings.
 * Resolves layout cards into a vertical layout.
 */
function buildInvExDefinition(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): OutputDocument | null {
  const { nodeType, fileNamePrefix, screen, entityType } = context;
  const settings = screen.listSettings;
  if (!settings) return null;

  const displayName = settings.staticContent?.header?.title ?? entityType;

  // Breadcrumbs warning
  if (settings.staticContent?.breadcrumbs) {
    addWarning(warnings, "breadcrumbs", "Breadcrumbs are dropped (no equivalent in new format)");
  }

  // Resolve cards into layout items
  const items = resolveListCards(context, warnings);

  // Inventory should have at least one dql table
  if (!items.some(i => i.type === "dql-table")) {
    items.push(buildDefaultDqlTable(context, context.extensionName));
  }

  const content: InvExDefinitionDocument = {
    version: DOCUMENT_VERSION,
    type: "InvExTypeDefinition",
    target: { app: "*" },
    content: {
      id: `${nodeType}-inventory`,
      displayName,
      content: {
        type: "vertical-layout",
        items,
      },
    },
  };

  return {
    fileName: `${fileNamePrefix}.inventory.json`,
    content,
  };
}

/**
 * Builds EntityDetailsInjectionDocument(s) from detailsInjections.
 * Each injection produces a separate JSON file. CLASSIC targets are skipped.
 */
function buildDetailsInjections(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): OutputDocument[] {
  // TODO -- review injections; we probably want to aggregate all cards into single tab ??
  const { screen, fileNamePrefix } = context;
  if (!screen.detailsInjections) return [];

  const documents: OutputDocument[] = [];
  for (const injection of screen.detailsInjections) {
    if (shouldSkipByTarget(injection.target)) {
      addWarning(
        warnings,
        "skipped-classic",
        `detailsInjection "${injection.key}" skipped (target: CLASSIC)`,
      );
      continue;
    }

    const cardElement = resolveCardByRef(injection, context, warnings);
    if (!cardElement) continue;

    // Resolve target nodeType from entitySelectorTemplate
    const targetNodeType = extractEntityTypeFromSelector(injection.entitySelectorTemplate);
    if (injection.entitySelectorTemplate && !targetNodeType) {
      addWarning(
        warnings,
        "entity-selector",
        `detailsInjection "${injection.key}": could not extract target entity type from entitySelectorTemplate`,
      );
    }

    const element: Tab = {
      type: "tab",
      id: injection.key,
      title: `${injection.key} injected by ${context.extensionName}`,
      content: [cardElement],
    };
    if (injection.conditions) {
      element.conditions = convertConditions(injection.conditions, warnings);
    }

    const content: EntityDetailsInjectionDocument = {
      version: DOCUMENT_VERSION,
      type: "EntityDetailsInjection",
      target: {
        app: "*",
        nodeType: targetNodeType ?? context.nodeType,
      },
      content: element,
    };

    documents.push({
      fileName: `${fileNamePrefix}.${injection.key}.detailsinjection.json`,
      content,
    });
  }

  return documents;
}

/**
 * Builds InvExInjectionDocument(s) from listInjections.
 * Same pattern as details injections.
 */
function buildListInjections(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): OutputDocument[] {
  const { screen, fileNamePrefix } = context;
  if (!screen.listInjections) return [];

  const documents: OutputDocument[] = [];
  for (const injection of screen.listInjections) {
    if (shouldSkipByTarget(injection.target)) {
      addWarning(
        warnings,
        "skipped-classic",
        `listInjection "${injection.key}" skipped (target: CLASSIC)`,
      );
      continue;
    }

    const cardElement = resolveCardByRef(injection, context, warnings);
    if (!cardElement) continue;

    const targetNodeType = extractEntityTypeFromSelector(injection.entitySelectorTemplate);
    if (injection.entitySelectorTemplate && !targetNodeType) {
      addWarning(
        warnings,
        "entity-selector",
        `listInjection "${injection.key}": could not extract target entity type from entitySelectorTemplate`,
      );
    }

    const element: TabsLayoutElement = { ...cardElement };
    // TODO: Figure out how to do this:
    // if (injection.conditions) {
    //   element.conditions = convertConditions(injection.conditions, warnings);
    // }

    const content: InvExInjectionDocument = {
      version: DOCUMENT_VERSION,
      type: "InvExInjection",
      target: {
        app: "*",
        invExType: targetNodeType ?? context.nodeType,
      },
      content: element,
    };

    documents.push({
      fileName: `${fileNamePrefix}.${injection.key}.inventoryinjection.json`,
      content,
    });
  }

  return documents;
}

// ---------------------------------------------------------------------------
// Card resolution helpers
// ---------------------------------------------------------------------------

/** Skippable card types that have no equivalent in the new format. */
const SKIPPED_CARD_TYPES = new Set(["INJECTIONS", "BREAK_LINE", "ENTITIES_LIST", "METRIC_TABLE"]);

/**
 * Resolves details layout cards into tab items.
 * If layout is not specified or autoGenerate is true, all screen-level cards are included.
 */
function resolveDetailsCards(
  context: ScreenConversionContext,
  settings: DetailsSettings,
  warnings: ConversionWarning[],
): Tab[] {
  const { screen } = context;

  const cardRefs = settings?.layout?.cards ?? [];
  const tabs: Tab[] = [];
  const messageElements: Message[] = [];

  for (const ref of cardRefs) {
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
      if (ref.type !== "INJECTIONS") {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `Card type "${ref.type}" (key: "${ref.key}") skipped`,
        );
      }
      continue;
    }

    const element = resolveCardByRef(ref, context, warnings);
    if (!element) continue;

    // Message cards are aggregated
    if (ref.type === "MESSAGE") {
      messageElements.push(element as Message);
    } else {
      const cardDef = lookupCardDefinition(ref.key, ref.type, screen);
      tabs.push({
        type: "tab",
        id: ref.key,
        title: getCardDisplayName(cardDef, ref.key),
        content: [{ type: "vertical-layout", items: [element] }],
      });
    }
  }

  // Aggregate message cards into a single "Messages" tab
  if (messageElements.length > 0) {
    tabs.push({
      type: "tab",
      id: "messages",
      title: "Messages",
      content: [{ type: "vertical-layout", items: messageElements }],
    });
  }

  return tabs;
}

/**
 * Resolves list layout cards into layout items (vertical-layout children).
 */
function resolveListCards(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): LayoutElement[] {
  const { screen } = context;
  const settings = screen.listSettings;

  const cardRefs = settings?.layout?.cards ?? [];
  const items: LayoutElement[] = [];

  for (const ref of cardRefs) {
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
      if (ref.type !== "INJECTIONS") {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `Card type "${ref.type}" (key: "${ref.key}") skipped`,
        );
      }
      continue;
    }

    const element = resolveCardByRef(ref, context, warnings);
    if (element) items.push(element);
  }

  return items;
}

/**
 * Resolves a card reference to a converted JSON element by looking up the card
 * definition from the screen and delegating to the appropriate converter.
 */
function resolveCardByRef(
  ref: { key: string; type: string },
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): TabsLayoutElement | null {
  const { screen } = context;

  switch (ref.type) {
    case "CHART_GROUP": {
      const card = screen.chartsCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `chartsCard "${ref.key}" not found in screen definition`,
        );
        return null;
      }
      return convertChartsCard(card, warnings);
    }

    case "DQL_TABLE": {
      const card = screen.dqlTableCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `dqlTableCard "${ref.key}" not found in screen definition`,
        );
        return null;
      }
      return convertDqlTableCard(card, warnings);
    }

    case "MESSAGE": {
      const card = screen.messageCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `messageCard "${ref.key}" not found in screen definition`,
        );
        return null;
      }
      return convertMessageCard(card, context.keywords, warnings);
    }

    // TODO: Are we actually using this??
    case "HEALTH": {
      const card = screen.healthCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `healthCard "${ref.key}" not found in screen definition`,
        );
        return null;
      }
      return convertHealthCard(card, warnings);
    }

    case "EVENTS":
    case "LOGS":
    case "PROBLEMS":
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Card type "${ref.type}" (key: "${ref.key}") is out of scope`,
      );
      return null;

    default:
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Unknown card type "${ref.type}" (key: "${ref.key}")`,
      );
      return null;
  }
}

/**
 * Looks up the original card definition from screen-level arrays to retrieve displayName.
 */
function lookupCardDefinition(
  key: string,
  type: string,
  screen: ScreenStub,
): { displayName?: string } | undefined {
  switch (type) {
    case "CHART_GROUP":
      return screen.chartsCards?.find(c => c.key === key);
    case "DQL_TABLE":
      return screen.dqlTableCards?.find(c => c.key === key);
    case "MESSAGE":
      return screen.messageCards?.find(c => c.key === key);
    case "HEALTH":
      // HealthCardStub has no displayName — return key as fallback
      return screen.healthCards?.find(c => c.key === key) ? { displayName: key } : undefined;
    default:
      return undefined;
  }
}

function getCardDisplayName(
  cardDef: { displayName?: string } | undefined,
  fallbackKey: string,
): string {
  return cardDef?.displayName ?? fallbackKey;
}

/**
 * Extracts the entity type from an entitySelectorTemplate string.
 * Looks for `type(<entityType>)` pattern.
 */
function extractEntityTypeFromSelector(selector?: string): string | undefined {
  if (!selector) return undefined;
  const match = /type\(([^)]+)\)/.exec(selector);
  return match?.[1]?.replace(/"/g, "");
}
