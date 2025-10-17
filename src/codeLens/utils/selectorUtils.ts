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

import { PanelDataType, ViewType, MetricSeriesCollection, CodeLensCommand } from "@common";
import vscode from "vscode";
import { Dynatrace } from "../../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../../dynatrace-api/errors";
import { Entity } from "../../dynatrace-api/interfaces/monitoredEntities";
import { ExtensionStub } from "../../interfaces/extensionMeta";
import { getDynatraceClient } from "../../treeViews/tenantsTreeView";
import { checkTenantConnected } from "../../utils/conditionCheckers";
import logger from "../../utils/logging";
import { getBlockItemIndexAtLine, getParentBlocks } from "../../utils/yamlParsing";
import { renderPanel } from "../../webviews/webview-utils";
import { updateSelectorValidationStatus } from "../selectorCodeLens";

export interface ValidationStatus {
  status: "valid" | "invalid" | "unknown" | "loading";
  error?: {
    code: number | string;
    message: string;
  };
}

export const registerSelectorCommands = () => {
  return [
    vscode.commands.registerCommand(
      CodeLensCommand.ValidateSelector,
      async (selector: string, type: "metric" | "entity") => {
        if (await checkTenantConnected()) {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            const status = await validateSelector(selector, type, dtClient);
            updateSelectorValidationStatus(type, selector, status);
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      CodeLensCommand.RunSelector,
      async (selector: string, type: "metric" | "entity") => {
        const updateCallback = (checkedSelector: string, status: ValidationStatus) =>
          updateSelectorValidationStatus(type, checkedSelector, status);
        if (await checkTenantConnected()) {
          const dtClient = await getDynatraceClient();
          if (dtClient) {
            runSelector(selector, type, dtClient, logger.getGenericChannel(), updateCallback).catch(
              err => {
                logger.info(`Running selector failed unexpectedly. ${(err as Error).message}`);
              },
            );
          }
        }
      },
    ),
  ];
};

/**
 * Runs a query and reports the status of validating the result.
 * If no errors were experienced, the check is successful, otherwise it is considered failed and
 * the details are contained within the returned object.
 * @param selector metric selector to validate
 * @param selectorType either metric or entity selector
 * @param dt Dynatrace API Client
 * @returns validation status
 */
export async function validateSelector(
  selector: string,
  selectorType: "metric" | "entity",
  dt: Dynatrace,
): Promise<ValidationStatus> {
  if (selectorType === "metric") {
    return dt.metrics
      .query(selector)
      .then((): ValidationStatus => ({ status: "valid" }))
      .catch(
        (err: DynatraceAPIError): ValidationStatus => ({
          status: "invalid",
          error: {
            code: err.errorParams.code,
            message: err.errorParams.message,
          },
        }),
      );
  }
  return dt.entitiesV2
    .list(selector)
    .then((): ValidationStatus => ({ status: "valid" }))
    .catch(
      (err: DynatraceAPIError): ValidationStatus => ({
        status: "invalid",
        error: {
          code: err.errorParams.code,
          message: err.errorParams.message,
        },
      }),
    );
}

/**
 * Queries Dynatrace data using the given selector and displays the results.
 * Metric query results are desplayed in a chart in a WebView panel. Entity query results as well as
 * any API errors are displayed as JSON within a Dynatrace Output channel of the editor.
 * @param selector the selector to query Dynatrace with
 * @param selectorType what type of selector it is
 * @param dt Dynatrace API Client
 * @param oc JSON OutputChannel where error details can be shown. It will also be used to show
 *           entity queries results.
 * @param panelManager a webview panel manager to render the result data
 * @param statusCallback a callback for updating the selector validation lens status
 */
export async function runSelector(
  selector: string,
  selectorType: "metric" | "entity",
  dt: Dynatrace,
  oc: vscode.OutputChannel,
  statusCallback: (selector: string, status: ValidationStatus) => void,
) {
  try {
    if (selectorType === "metric") {
      await dt.metrics.query(selector, "5m").then((res: MetricSeriesCollection[]) => {
        statusCallback(selector, { status: "valid" });
        renderPanel(ViewType.MetricResults, "Metric selector results", {
          dataType: PanelDataType.MetricResults,
          data: res,
        });
      });
    } else {
      await dt.entitiesV2
        .list(selector, "now-2h", undefined, "properties,toRelationships,fromRelationships")
        .then((res: Entity[]) => {
          statusCallback(selector, { status: "valid" });
          oc.clear();
          oc.appendLine(JSON.stringify({ selector: selector, entities: res }, null, 2));
          oc.show();
        });
    }
  } catch (err: unknown) {
    const errorParams = (err as DynatraceAPIError).errorParams;
    statusCallback(selector, { status: "invalid", error: errorParams });
    oc.clear();
    oc.appendLine(
      JSON.stringify(
        {
          metricSelector: selector,
          responseCode: errorParams.code,
          message: errorParams.message,
          details: errorParams.constraintViolations,
        },
        null,
        2,
      ),
    );
    oc.show();
  }
}

/**
 * Resolves an `entitySelectorTemplate` into an entity selector by replacing $(entityConditions)
 * with the minimum viable selector for that type of entity.
 * @param selectorTemplate the entitySelectorTemplate to resolve
 * @param extension extension.yaml serialized as object
 * @param document the document where the template is found
 * @param position the position at which the template is found
 * @returns entity selector
 */
export function resolveSelectorTemplate(
  selectorTemplate: string,
  extension: ExtensionStub,
  document: vscode.TextDocument,
  position: vscode.Position,
): string {
  const screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());
  const parentBlocks = getParentBlocks(position.line, document.getText());
  const screen = extension.screens?.[screenIdx];

  if (!screen) {
    return "";
  }

  let entityType = screen.entityType;
  if (
    parentBlocks[parentBlocks.length - 1] === "relation" &&
    parentBlocks[parentBlocks.length - 3] === "entitiesListCards"
  ) {
    const cardIdx = getBlockItemIndexAtLine("entitiesListCards", position.line, document.getText());
    const card = screen.entitiesListCards?.[cardIdx];
    if (card) {
      const selector = card.entitySelectorTemplate;
      if (selector) {
        entityType = selector.split("type(")[1].split(")")[0].replace('"', "");
      }
    }
  }

  return selectorTemplate.replace("$(entityConditions)", `type("${entityType}")`);
}
