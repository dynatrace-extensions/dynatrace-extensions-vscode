/**
  Copyright 2022 Dynatrace LLC

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

import { GlobalCommand } from "@common";
import vscode from "vscode";
import { getConnectedTenant, isConnectedToPlatform } from "../treeViews/tenantsTreeView";
import { parseJSON } from "../utils/jsonParsing";
import logger from "../utils/logging";
import { createSingletonProvider } from "../utils/singleton";

/** The kind of platform Unified Analysis screen a document represents. */
type UaScreenKind = "details" | "inventory";

/** Base of the intent routes this lens deep-links into. */
const INTENT_BASE = "ui/intent/dynatrace.infraops";
const DETAILS_INTENT = "view_smartscape_technology_details";
const INVENTORY_INTENT = "view_smartscape_technology_inventory";

/**
 * Minimal shape of the screen JSON content this lens reads. Only the fields
 * carrying the node type are relevant.
 */
interface UaScreenDocument {
  target?: { nodeType?: string };
  metadata?: { nodeType?: string };
}

/**
 * Classifies a screen file by its name into the kind of platform UA lens it
 * should get, or null if it is not a UA screen this provider handles.
 *
 * - Details: `*-entitydetails.screen.json`, `*-detailsinjection.screen.json`
 * - Inventory: `*-inventory.screen.json`, `*-inventoryinjection.screen.json`
 */
export function classifyUaScreenFile(fileName: string): UaScreenKind | null {
  const name = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/-(entitydetails|detailsinjection)\.screen\.json$/.test(name)) {
    return "details";
  }
  if (/-(inventory|inventoryinjection)\.screen\.json$/.test(name)) {
    return "inventory";
  }
  return null;
}

/**
 * Reads the node type from the screen JSON content. Details screens carry it in
 * `target.nodeType`, inventory screens in `metadata.nodeType`. Returns null if
 * the content cannot be parsed or the node type is absent.
 */
export function extractNodeType(kind: UaScreenKind, content: string): string | null {
  let parsed: UaScreenDocument;
  try {
    parsed = parseJSON<UaScreenDocument>(content);
  } catch {
    return null;
  }
  const nodeType = kind === "details" ? parsed.target?.nodeType : parsed.metadata?.nodeType;
  return typeof nodeType === "string" && nodeType.length > 0 ? nodeType : null;
}

/**
 * Builds a platform intent URL with a URL-encoded JSON payload fragment.
 */
export function buildIntentUrl(
  baseTenantUrl: string,
  intent: string,
  payload: Record<string, string>,
): string {
  const base = baseTenantUrl.replace(/\/+$/, "");
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  return `${base}/${INTENT_BASE}/${intent}#${encodedPayload}`;
}

/**
 * Code Lens provider for platform (gen3) Unified Analysis screen JSON files.
 * Emits a single lens per supported screen that deep-links into the connected
 * platform tenant's inventory or details view. Only active when connected to a
 * platform tenant.
 */
class PlatformUaLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "platformUaLens", this.constructor.name];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.commands.registerCommand(GlobalCommand.OpenPlatformUaScreen, this.openScreen.bind(this));
  }

  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    // Reuse the existing screen lens toggle; only operate on platform tenants.
    if (
      !vscode.workspace.getConfiguration("dynatraceExtensions", null).get("screenCodeLens") ||
      !(await isConnectedToPlatform())
    ) {
      return [];
    }

    const kind = classifyUaScreenFile(document.fileName);
    if (!kind) {
      return [];
    }

    const nodeType = extractNodeType(kind, document.getText());
    if (!nodeType) {
      return [];
    }

    const range = new vscode.Range(0, 0, 0, 0);
    const title = kind === "details" ? "Open Details View" : "Open Inventory View";
    const tooltip =
      kind === "details"
        ? "Open this node type's Details View in Dynatrace"
        : "Open this node type's Inventory View in Dynatrace";

    return [
      new vscode.CodeLens(range, {
        title,
        tooltip,
        command: GlobalCommand.OpenPlatformUaScreen,
        arguments: [kind, nodeType],
      }),
    ];
  }

  /**
   * Opens the platform inventory or details view for the given node type.
   * For the details view the node id is resolved via a DQL query against the
   * currently connected tenant.
   */
  private async openScreen(kind: UaScreenKind, nodeType: string) {
    try {
      const tenant = await getConnectedTenant();
      if (!tenant) {
        return;
      }

      if (kind === "inventory") {
        const url = buildIntentUrl(tenant.url, INVENTORY_INTENT, { extensionNodeType: nodeType });
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return;
      }

      // Details view: resolve the node id via DQL before navigating.
      const result = await tenant.dt.dql
        .execute(`smartscapeNodes ${nodeType} | limit 1 | fields id`)
        .catch(() => null);
      const id = result?.records[0]?.id;
      if (typeof id !== "string" || id.length === 0) {
        logger.notify("ERROR", "No nodes of this type were found in your tenant.");
        return;
      }

      const url = buildIntentUrl(tenant.url, DETAILS_INTENT, { extensionNodeId: id });
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (err) {
      logger.warn(`Could not open platform screen: ${(err as Error).message}`, ...this.logTrace);
      logger.notify("WARN", "Could not open screen.");
    }
  }
}

/**
 * Provides singleton access to the PlatformUaLensProvider.
 */
export const getPlatformUaLensProvider = createSingletonProvider(PlatformUaLensProvider);
