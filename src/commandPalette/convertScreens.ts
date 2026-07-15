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
  VERSION,
} from "@dynatrace/unified-analysis/documents";
import * as vscode from "vscode";
import { slugify } from "../codeActions/utils/snippetBuildingUtils";
import { OpenPipelinePipeline } from "../interfaces/extensionDocs";
import {
  DetailsScreenCard,
  DetailsSettings,
  PropertiesCard,
  ScreenStub,
  TopologyStub,
} from "../interfaces/extensionMeta";
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
  buildColumnFilters,
  buildDefaultDqlTable,
  convertChartsCard,
  convertConditions,
  convertDqlTableCard,
  convertHealthCard,
  convertMessageCard,
  convertPropertiesCard,
  createConditionContext,
  dedupeTabId,
  extractConditions,
  extractExtensionCategory,
  extractExtensionTitle,
  generateConversionReport,
  getBuiltinEntityNodeContext,
  resolveTarget,
  shouldSkipByTarget,
} from "../utils/screenConversion";
import { ConfirmOption, showConfirmationInformationMessage } from "../utils/vscode";

/**
 * Workflow entry point for the "Convert Screens" command.
 * Validates preconditions, then runs the core conversion logic.
 */
export const convertScreensWorkflow = async (options?: { skipInteractive?: boolean }) => {
  // Headless callers bypass the IDE-oriented precondition gates. `isExtensionsWorkspace`
  // requires the per-extension workspaceStorage directory to exist on disk, which VSCode
  // creates lazily on first IDE activation — a fresh container never has it, so the
  // gate would block legitimate headless invocations. The conversion itself validates
  // the manifest and screens internally before writing any output.
  if (options?.skipInteractive) {
    await convertScreens(options);
    return;
  }
  if ((await checkWorkspaceOpen()) && (await isExtensionsWorkspace())) {
    await convertScreens(options);
  }
};

/**
 * Core conversion logic: parses the extension manifest, lets the user select
 * entity types, resolves node types, and produces JSON document files.
 */
async function convertScreens(options: { skipInteractive?: boolean } = {}) {
  const logTrace = ["commandPalette", "convertScreens"];
  logger.info("Starting screen conversion", ...logTrace);

  const extension = getCachedParsedExtension();
  if (!extension) {
    logger.error("Parsed extension not available in cache. Command aborted.", ...logTrace);
    return;
  }
  const extensionFilePath = getExtensionFilePath();
  if (!extensionFilePath) {
    const extFilepathError = "Could not locate extension.yaml in the workspace. Command aborted.";
    if (options?.skipInteractive) {
      logger.error(extFilepathError, ...logTrace);
    } else {
      logger.notify("ERROR", extFilepathError, ...logTrace);
    }
    return;
  }

  if (
    !extension.topology ||
    !extension.topology?.types ||
    extension.topology?.types.length === 0 ||
    !extension.screens ||
    extension.screens.length === 0
  ) {
    const noScreensError = "No topology or screens found in extension.yaml.";
    if (options?.skipInteractive) {
      logger.error(noScreensError, ...logTrace);
    } else {
      logger.notify("WARN", noScreensError, ...logTrace);
    }
    return;
  }

  // Discover smartscape nodes to entity mapping
  const entitiesWithScreens = extension.screens.map(s => s.entityType);
  const pipelineFiles = getPipelineFiles();
  if (pipelineFiles.length === 0) {
    const noPipelineError =
      "No OpenPipeline files found. Can only convert screens for Smartscape nodes";
    if (options?.skipInteractive) {
      logger.error(noPipelineError, ...logTrace);
    } else {
      logger.notify("ERROR", noPipelineError, ...logTrace);
    }
    if (!options.skipInteractive) {
      await showConfirmationInformationMessage("Convert topology instead?").then(async choice => {
        if (choice === ConfirmOption.Yes) {
          await vscode.commands.executeCommand(GlobalCommand.UploadExtension);
        }
      });
    }
    return;
  }
  const gen2FieldMap = createGen2FieldMap(extension.topology);
  const entityToNodeMap = createEntityToNodeTypeMap(pipelineFiles, gen2FieldMap);
  const validEntityTypes = Object.keys(entityToNodeMap).filter(et =>
    entitiesWithScreens.includes(et),
  );

  // Builtin entities (e.g. HOST, PROCESS_GROUP_INSTANCE) have no OpenPipeline node, so they are
  // absent from entityToNodeMap. Their screens are injection-only: include them when they carry
  // injections so their injection documents are still emitted (resolved via the static builtin
  // entity lookup).
  const builtinEntityTypes = [
    ...new Set(
      extension.screens
        .filter(
          s =>
            !entityToNodeMap[s.entityType] &&
            getBuiltinEntityNodeContext(s.entityType) !== undefined &&
            ((s.detailsInjections?.length ?? 0) > 0 || (s.listInjections?.length ?? 0) > 0),
        )
        .map(s => s.entityType),
    ),
  ];

  const convertibleEntityTypes = [...validEntityTypes, ...builtinEntityTypes];
  if (convertibleEntityTypes.length === 0) {
    const noValidEntitiesError =
      "No pipeline nodes match your screens' entity types. Ensure the 'id_classic' field is extracted";
    if (options?.skipInteractive) {
      logger.error(noValidEntitiesError, ...logTrace);
    } else {
      logger.notify("ERROR", noValidEntitiesError, ...logTrace);
    }
    return;
  }

  let selected: { label: string }[];
  if (options.skipInteractive) {
    selected = convertibleEntityTypes.map(et => ({ label: et }));
  } else {
    const picked = await vscode.window.showQuickPick(
      convertibleEntityTypes.map(et => ({ label: et })),
      {
        canPickMany: true,
        placeHolder: "Select entity types to convert screens for",
        title: "Convert Screens",
      },
    );
    if (!picked || picked.length === 0) {
      logger.info("User cancelled entity type selection", ...logTrace);
      return;
    }
    selected = picked;
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

    const isBuiltinEntity = !entityToNodeMap[screen.entityType];
    const resolvedNode =
      entityToNodeMap[screen.entityType] ?? getBuiltinEntityNodeContext(screen.entityType);
    if (!resolvedNode) {
      logger.warn(
        `No node context for entity type "${screen.entityType}"; skipping screen`,
        ...logTrace,
      );
      continue;
    }
    const conditions = extractConditions(resolvedNode, JSON.stringify(screen, undefined, 2));
    const context: ScreenConversionContext = {
      ...resolvedNode,
      extensionName: extension.name,
      entityType: screen.entityType,
      fileNamePrefix: resolvedNode.nodeType.toLowerCase(),
      screen,
      keywords: extension.keywords ?? [],
      entityToNodeMap,
      conditions: Object.fromEntries(conditions.map(c => [c.id, c])),
    };
    const result = convertSingleScreen(context, screensDir, isBuiltinEntity);
    results.push(result);
  }

  // Create the generic invEx documents
  const extensionCategory = extractExtensionCategory(extension.keywords ?? []);
  const extensionTitle = extractExtensionTitle(extension.keywords ?? [], extension.name);
  writeFileSync(
    join(screensDir, "category-inventory.screen.json"),
    JSON.stringify(createCategoryInvEx(extensionCategory), null, 2),
  );
  writeFileSync(
    join(screensDir, "extension-inventory.screen.json"),
    JSON.stringify(
      createExtensionInvEx(extensionCategory, extension.name, extensionTitle),
      null,
      2,
    ),
  );

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

  if (options.skipInteractive) {
    logger.info(message, ...logTrace);
  } else {
    logger.notify("INFO", message, ...logTrace);
  }
}

// Map out for each gen2 entity type, which attribute is extracted from which data field
// entityType: { dataField: attributeKey }
const createGen2FieldMap = (topology: TopologyStub): Record<string, Record<string, string>> => {
  const fieldMap: Record<string, Record<string, string>> = {};
  (topology.types ?? []).forEach(t => {
    if (!Object.keys(fieldMap).includes(t.name)) {
      fieldMap[t.name] = {};
    }
    (t.rules ?? []).forEach(r => {
      (r.attributes ?? []).forEach(a => {
        const dataField = a.pattern.replace("{", "").replace("}", "").trim();
        if (!Object.keys(fieldMap[t.name]).includes(dataField)) {
          fieldMap[t.name][dataField] = a.key;
        }
      });
    });
  });

  return fieldMap;
};

const createEntityToNodeTypeMap = (
  pipelineFiles: string[],
  gen2FieldMap: Record<string, Record<string, string>>,
): EntityToNodeMap => {
  const nodes: Record<
    string,
    {
      nodeType: string;
      idClassic?: string;
      gen3FieldMap: Record<string, string>;
      staticEdges: string[];
    }
  > = {};
  const entityToNodeMap: EntityToNodeMap = {};
  pipelineFiles.forEach(file => {
    const pipeline = JSON.parse(String(readFileSync(file))) as OpenPipelinePipeline;
    if (!pipeline.smartscapeNodeExtraction) return;
    pipeline.smartscapeNodeExtraction.processors.forEach(processor => {
      if (!processor.smartscapeNode || !processor.smartscapeNode.extractNode) return;
      const nodeType = processor.smartscapeNode.nodeType;
      if (!Object.keys(nodes).includes(nodeType)) {
        nodes[nodeType] = { nodeType, gen3FieldMap: {}, staticEdges: [] };
      }
      // Extract dataField -> nodeField mapping
      (processor.smartscapeNode.fieldsToExtract ?? []).forEach(field => {
        if (field.fieldName === "id_classic") {
          nodes[nodeType].idClassic = field.referencedFieldName.replace("dt.entity.", "");
        }
        if (
          field.fieldName &&
          !Object.keys(nodes[nodeType].gen3FieldMap).includes(field.referencedFieldName)
        ) {
          nodes[nodeType].gen3FieldMap[field.referencedFieldName] = field.fieldName;
        }
      });
      // Extract static edge references
      (processor.smartscapeNode.staticEdgesToExtract ?? []).forEach(edge => {
        const edgeRef = `${edge.edgeType.toLowerCase()}.${edge.targetType.toLowerCase()}`;
        if (!nodes[nodeType].staticEdges.includes(edgeRef)) {
          nodes[nodeType].staticEdges.push(edgeRef);
        }
      });
    });
  });

  // A second pass is needed for the final field map, because at the time of processing individual fields
  // the idClassic may not yet be known
  Object.values(nodes).forEach(({ nodeType, idClassic, gen3FieldMap, staticEdges }) => {
    if (!idClassic) return;
    const fieldMap: Record<string, string> = {};
    Object.entries(gen3FieldMap).forEach(([dataField, gen3Field]) => {
      if (
        Object.keys(gen2FieldMap).includes(idClassic) &&
        Object.keys(gen2FieldMap[idClassic]).includes(dataField)
      ) {
        fieldMap[gen3Field] = gen2FieldMap[idClassic][dataField];
      }
    });
    entityToNodeMap[idClassic] = { nodeType, fieldMap, staticEdges };
  });
  return entityToNodeMap;
};

/**
 * Converts a single screen entity type and writes all applicable JSON document files.
 *
 * For builtin entities (which have no OpenPipeline node) the extension does not own the entity's
 * own screen definition, so only injections are converted; any detailsSettings/listSettings
 * present are skipped with a warning.
 */
function convertSingleScreen(
  context: ScreenConversionContext,
  screensDir: string,
  isBuiltinEntity = false,
): ScreenConversionResult {
  const logTrace = ["commandPalette", "convertScreens", "convertSingleScreen"];
  const warnings: ConversionWarning[] = [];
  const documents: OutputDocument[] = [];

  const { screen, entityToNodeMap } = context;

  // 4.1 detailsSettings → EntityDetailsDefinitionDocument
  if (screen.detailsSettings) {
    if (isBuiltinEntity) {
      addWarning(
        warnings,
        "skipped-out-of-scope",
        "detailsSettings skipped for builtin entity (extension does not own its screen definition)",
        "detailsSettings",
      );
    } else {
      const doc = buildEntityDetailsDefinition(context, warnings);
      if (doc) documents.push(doc);
    }
  }

  // 4.2 listSettings → InvExDefinitionDocument
  if (screen.listSettings) {
    if (isBuiltinEntity) {
      addWarning(
        warnings,
        "skipped-out-of-scope",
        "listSettings skipped for builtin entity (extension does not own its screen definition)",
        "listSettings",
      );
    } else {
      const doc = buildInvExDefinition(context, warnings);
      if (doc) documents.push(doc);
    }
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
    addWarning(
      warnings,
      "breadcrumbs",
      "Breadcrumbs are dropped (no equivalent in new format)",
      "detailsSettings",
    );
  }

  // Resolve cards into tabs — propagate settings-level target so cards inherit it
  const [tabs, conditionIds] = resolveDetailsCards(
    context,
    settings,
    warnings,
    settings.target,
    "detailsSettings",
  );

  let propertiesCard: PropertiesCard | undefined;
  if (screen.propertiesCard && Array.isArray(screen.propertiesCard)) {
    propertiesCard = screen.propertiesCard.filter(c => c.target !== "CLASSIC")[0];
  } else {
    propertiesCard = screen.propertiesCard;
  }

  // Properties card → metadata element added as first tab
  if (propertiesCard && settings.staticContent?.showProperties !== false) {
    const metadata = convertPropertiesCard(propertiesCard, entityType, warnings, context);
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
    version: VERSION,
    type: "EntityDetailsDefinition",
    target: { app: "*", nodeType },
    conditionContext: createConditionContext(context, conditionIds),
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
    fileName: `${fileNamePrefix}-entitydetails.screen.json`,
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
    addWarning(
      warnings,
      "breadcrumbs",
      "Breadcrumbs are dropped (no equivalent in new format)",
      "listSettings",
    );
  }

  // Resolve cards into layout items
  const [items, conditionIds] = resolveListCards(context, warnings);

  // Inventory should have at least one dql table
  if (!items.some(i => i.type === "dql-table")) {
    items.push(buildDefaultDqlTable(context, context.extensionName));
  }

  const content: InvExDefinitionDocument = {
    version: VERSION,
    type: "InvExTypeDefinition",
    target: { app: "*", invExType: context.extensionName },
    conditionContext: createConditionContext(context, conditionIds),
    metadata: {
      nodeType: context.nodeType,
    },
    content: {
      id: `${nodeType}-inventory`,
      displayName,
      content: {
        type: "vertical-layout",
        items,
      },
      filtering: {
        id: `${nodeType}-filtering`,
        type: "filtering",
        filters: buildColumnFilters(items),
      },
    },
  };

  return {
    fileName: `${fileNamePrefix}-inventory.screen.json`,
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
  for (const ref of screen.detailsInjections) {
    const screenConditionIds: string[] = [];
    const injectionHint = `detailsInjections.${ref.key}`;
    if (shouldSkipByTarget(ref.target)) {
      addWarning(
        warnings,
        "skipped-classic",
        `detailsInjection "${ref.key}" skipped (target: CLASSIC)`,
        injectionHint,
      );
      continue;
    }
    const [refConditions, refConditionIds] = convertConditions(
      context,
      ref.conditions ?? [],
      warnings,
      injectionHint,
    );
    screenConditionIds.push(...refConditionIds);

    const [cardElement, cardConditionIds] = resolveCardByRef(
      ref,
      context,
      warnings,
      ref.target,
      injectionHint,
    );
    if (!cardElement) continue;
    screenConditionIds.push(...cardConditionIds);

    // Resolve target nodeType from entitySelectorTemplate
    const targetNodeType = extractEntityTypeFromSelector(ref.entitySelectorTemplate);
    if (ref.entitySelectorTemplate && !targetNodeType) {
      addWarning(
        warnings,
        "entity-selector",
        `detailsInjection "${ref.key}": could not extract target entity type from entitySelectorTemplate`,
        injectionHint,
      );
    }

    const element: Tab = {
      type: "tab",
      id: ref.key,
      title: `${ref.key} injected by ${context.extensionName}`,
      conditions: refConditions,
      content: [cardElement],
    };

    const content: EntityDetailsInjectionDocument = {
      version: VERSION,
      type: "EntityDetailsInjection",
      conditionContext: createConditionContext(context, screenConditionIds),
      target: {
        app: "*",
        nodeType: targetNodeType ?? context.nodeType,
      },
      content: element,
    };

    documents.push({
      fileName: `${fileNamePrefix}-${ref.key}-detailsinjection.screen.json`,
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
  for (const ref of screen.listInjections) {
    const injectionHint = `listInjections.${ref.key}`;
    if (shouldSkipByTarget(ref.target)) {
      addWarning(
        warnings,
        "skipped-classic",
        `listInjection "${ref.key}" skipped (target: CLASSIC)`,
        injectionHint,
      );
      continue;
    }

    const [cardElement, elementConditionIds] = resolveCardByRef(
      ref,
      context,
      warnings,
      ref.target,
      injectionHint,
    );
    if (!cardElement) continue;

    const conditionIds: string[] = [];
    const [refConditions, refConditionIds] = convertConditions(
      context,
      ref.conditions ?? [],
      warnings,
      injectionHint,
    );
    if (refConditions.length > 0) {
      conditionIds.push(...refConditionIds);
    }
    conditionIds.push(...elementConditionIds);

    if ("conditions" in cardElement && refConditions.length > 0) {
      (cardElement.conditions ?? []).push(...refConditions);
      conditionIds.push(...elementConditionIds);
    }

    const targetNodeType = extractEntityTypeFromSelector(ref.entitySelectorTemplate);
    if (ref.entitySelectorTemplate && !targetNodeType) {
      addWarning(
        warnings,
        "entity-selector",
        `listInjection "${ref.key}": could not extract target entity type from entitySelectorTemplate`,
        injectionHint,
      );
    }

    const content: InvExInjectionDocument = {
      version: VERSION,
      type: "InvExInjection",
      target: {
        app: "*",
        invExType: targetNodeType ?? context.nodeType,
      },
      conditionContext: createConditionContext(context, conditionIds),
      content: cardElement,
    };

    documents.push({
      fileName: `${fileNamePrefix}-${ref.key}-inventoryinjection.screen.json`,
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
  settingsTarget?: string,
  hint?: string,
): [Tab[], string[]] {
  const screenConditionIds: string[] = [];
  const { screen } = context;

  const cardRefs = settings?.layout?.cards ?? [];
  const tabs: Tab[] = [];
  const messageElements: Message[] = [];

  for (const ref of cardRefs) {
    // Handle cards that should be skipped entirely
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
      if (ref.type !== "INJECTIONS") {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `Card type "${ref.type}" (key: "${ref.key}") skipped`,
          hint,
        );
      }
      continue;
    }

    // Handle card groups
    if (ref.type === "CARD_GROUP") {
      const resolvedGroup = resolveCardGroup(ref, context, warnings, tabs, settingsTarget, hint);
      if (resolvedGroup === null) continue;
      const [tab, conditionIds] = resolvedGroup;
      tabs.push(tab);
      screenConditionIds.push(...conditionIds);
      continue;
    }

    const cardRefTarget = resolveTarget(ref.target, settingsTarget);
    const cardHint = hint ? `${hint}.${ref.key}` : ref.key;
    const [element, elementConditionIds] = resolveCardByRef(
      ref,
      context,
      warnings,
      cardRefTarget,
      cardHint,
    );
    if (!element) continue;
    screenConditionIds.push(...elementConditionIds);

    const [refConditions, refConditionIds] = convertConditions(
      context,
      ref.conditions ?? [],
      warnings,
      hint,
    );
    screenConditionIds.push(...refConditionIds);

    // Message cards are aggregated
    if (ref.type === "MESSAGE") {
      messageElements.push(element as Message);
    } else {
      const cardDef = lookupCardDefinition(ref.key, ref.type, screen);
      tabs.push({
        type: "tab",
        id: ref.key,
        title: getCardDisplayName(cardDef, ref.key),
        conditions: refConditions,
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

  return [tabs, screenConditionIds];
}

// Resolves a CARD_GROUP and its children (including nested CARD_GROUPs) into a single tab with a vertical layout.
function resolveCardGroup(
  cardGroup: DetailsScreenCard,
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
  existingTabs: Tab[],
  settingsTarget?: string,
  hint?: string,
): [Tab, string[]] | null {
  const groupHint = hint ? `${hint}.card-group` : "card-group";
  const conditionIds: string[] = [];
  const [childItems, childConditionIds] = resolveGroupChildren(
    context,
    cardGroup.cards ?? [],
    warnings,
    resolveTarget(cardGroup.target, settingsTarget),
    groupHint,
  );
  if (childItems.length === 0) {
    addWarning(
      warnings,
      "skipped-out-of-scope",
      `CARD_GROUP "${cardGroup.displayName ?? ""}" produced no convertible cards`,
      hint,
    );
    return null;
  }
  conditionIds.push(...childConditionIds);

  const [groupConditions, groupConditionIds] = convertConditions(
    context,
    cardGroup.conditions ?? [],
    warnings,
    hint,
  );
  conditionIds.push(...groupConditionIds);

  const baseId = cardGroup.displayName
    ? slugify(cardGroup.displayName)
    : `card-group-${existingTabs.length}`;
  const tab: Tab = {
    type: "tab",
    id: dedupeTabId(baseId, existingTabs),
    title: cardGroup.displayName?.trim() || baseId,
    conditions: groupConditions,
    content: [{ type: "vertical-layout", items: childItems }],
  };
  return [tab, conditionIds];
}

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
    // Attach the layout-ref conditions to the element itself (group children are
    // vertical-layout items, not tabs, so they carry their own conditions). Gate on the
    // element's type — not `"conditions" in element` — because converters only create the
    // `conditions` property when the card *definition* had conditions; ref-level conditions
    // would otherwise be silently dropped along with their conditionContext ids.
    if (
      refConditions.length > 0 &&
      (element.type === "chart-group" || element.type === "dql-table" || element.type === "message")
    ) {
      element.conditions = [...(element.conditions ?? []), ...refConditions];
      conditionIds.push(...refConditionIds);
    }

    items.push(element);
  }

  return [items, conditionIds];
}

/**
 * Resolves list layout cards into layout items (vertical-layout children).
 */
function resolveListCards(
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
): [LayoutElement[], string[]] {
  const conditionIds: string[] = [];
  const { screen } = context;
  const settings = screen.listSettings;

  const cardRefs = settings?.layout?.cards ?? [];
  const items: LayoutElement[] = [];

  for (const ref of cardRefs) {
    const cardHint = `listSettings.${ref.key}`;
    // Handle cards that should be skipped entirely
    if (SKIPPED_CARD_TYPES.has(ref.type)) {
      if (ref.type !== "INJECTIONS") {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `Card type "${ref.type}" (key: "${ref.key}") skipped`,
          cardHint,
        );
      }
      continue;
    }

    // Handle card groups
    if (ref.type === "CARD_GROUP") {
      const groupHint = `${cardHint}.card-group`;
      const [childItems, childConditionIds] = resolveGroupChildren(
        context,
        // Forced as DetailsScreenCard to not complicate interfaces further
        (ref as unknown as DetailsScreenCard).cards ?? [],
        warnings,
        ref.target,
        groupHint,
      );
      if (childItems.length === 0) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `CARD_GROUP "${ref.key ?? ""}" produced no convertible cards`,
          cardHint,
        );
        continue;
      }
      items.push(...childItems);
      conditionIds.push(...childConditionIds);
      continue;
    }

    const [element, elementConditionIds] = resolveCardByRef(
      ref,
      context,
      warnings,
      ref.target,
      cardHint,
    );
    if (!element) continue;

    const [refConditions, refConditionIds] = convertConditions(
      context,
      ref.conditions ?? [],
      warnings,
      cardHint,
    );
    conditionIds.push(...refConditionIds);

    if ("conditions" in element) {
      (element.conditions ?? []).push(...refConditions);
      conditionIds.push(...elementConditionIds);
    }
    items.push(element);
  }

  return [items, conditionIds];
}

/**
 * Resolves a card reference to a converted JSON element by looking up the card
 * definition from the screen and delegating to the appropriate converter.
 */
function resolveCardByRef(
  ref: { key: string; type: string },
  context: ScreenConversionContext,
  warnings: ConversionWarning[],
  parentTarget?: string,
  hint?: string,
): [TabsLayoutElement | null, string[]] {
  const { screen } = context;

  switch (ref.type) {
    case "CHART_GROUP": {
      const card = screen.chartsCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `chartsCard "${ref.key}" not found in screen definition`,
          hint,
        );
        return [null, []];
      }
      return convertChartsCard(context, card, warnings, parentTarget, hint);
    }

    case "DQL_TABLE": {
      const card = screen.dqlTableCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `dqlTableCard "${ref.key}" not found in screen definition`,
          hint,
        );
        return [null, []];
      }
      return convertDqlTableCard(context, card, warnings, parentTarget, hint);
    }

    case "MESSAGE": {
      const card = screen.messageCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `messageCard "${ref.key}" not found in screen definition`,
          hint,
        );
        return [null, []];
      }
      return convertMessageCard(context, card, context.keywords, warnings, parentTarget, hint);
    }

    // TODO: Are we actually using this??
    case "HEALTH": {
      const card = screen.healthCards?.find(c => c.key === ref.key);
      if (!card) {
        addWarning(
          warnings,
          "skipped-out-of-scope",
          `healthCard "${ref.key}" not found in screen definition`,
          hint,
        );
        return [null, []];
      }
      return convertHealthCard(card, warnings, parentTarget, hint);
    }

    case "EVENTS":
    case "LOGS":
    case "PROBLEMS":
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Card type "${ref.type}" (key: "${ref.key}") is out of scope`,
        hint,
      );
      return [null, []];

    default:
      addWarning(
        warnings,
        "skipped-out-of-scope",
        `Unknown card type "${ref.type}" (key: "${ref.key}")`,
        hint,
      );
      return [null, []];
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

const createCategoryInvEx = (category: string): InvExDefinitionDocument => ({
  version: VERSION,
  type: "InvExTypeDefinition",
  target: { app: "dynatrace.infraops" },
  content: {
    id: category,
    displayName: category.charAt(0).toUpperCase() + category.slice(1),
    content: {
      type: "vertical-layout",
      items: [],
    },
  },
});

const createExtensionInvEx = (category: string, extensionName: string, extensionTitle: string) => ({
  version: VERSION,
  type: "InvExTypeDefinition",
  target: { app: "dynatrace.infraops", invExType: category },
  content: {
    id: extensionName,
    displayName: extensionTitle,
    content: {
      type: "vertical-layout",
      items: [],
    },
  },
});
