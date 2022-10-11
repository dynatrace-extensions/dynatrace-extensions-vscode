import * as vscode from "vscode";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { DynatraceAPIError } from "../dynatrace-api/errors";
import { MetricResultsPanel } from "../webviews/metricResults";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

export interface ValidationStatus {
  status: "valid" | "invalid" | "unknown";
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Runs a query and reports the status of validating the result.
 * If no errors were experienced, the check is successful, otherwise it is considered failed and the details are
 * contained within the returned object.
 * @param selector metric selector to validate
 * @param selectorType either metric or entity selector
 * @param dt Dynatrace API Client
 * @returns validation status
 */
export async function validateSelector(
  selector: string,
  selectorType: "metric" | "entity",
  dt: Dynatrace
): Promise<ValidationStatus> {
  return selectorType === "metric"
    ? dt.metrics
        .query(selector)
        .then(() => ({ status: "valid" } as ValidationStatus))
        .catch(
          (err: DynatraceAPIError) =>
            ({
              status: "invalid",
              error: {
                code: err.errorParams.code,
                message: err.errorParams.message,
              },
            } as ValidationStatus)
        )
    : dt.entitiesV2
        .list(selector)
        .then(() => ({ status: "valid" } as ValidationStatus))
        .catch(
          (err: DynatraceAPIError) =>
            ({
              status: "invalid",
              error: {
                code: err.errorParams.code,
                message: err.errorParams.message,
              },
            } as ValidationStatus)
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
 */
export async function runSelector(
  selector: string,
  selectorType: "metric" | "entity",
  dt: Dynatrace,
  oc: vscode.OutputChannel
) {
  if (selectorType === "metric") {
    dt.metrics
      .query(selector, "5m")
      .then((res: MetricSeriesCollection[]) => {
        MetricResultsPanel.createOrShow(res);
      })
      .catch((err: DynatraceAPIError) => {
        oc.clear();
        oc.appendLine(
          JSON.stringify(
            {
              metricSelector: selector,
              responseCode: err.errorParams.code,
              message: err.errorParams.message,
              details: err.errorParams.data.constraintViolations,
            },
            null,
            2
          )
        );
        oc.show();
      });
  } else if (selectorType === "entity") {
    dt.entitiesV2
      .list(selector, "now-2h", undefined, "properties,toRelationships,fromRelationships")
      .then((res: Entity[]) => {
        oc.clear();
        oc.appendLine(JSON.stringify({ selector: selector, entities: res }, null, 2));
        oc.show();
      })
      .catch((err: DynatraceAPIError) => {
        oc.clear();
        oc.appendLine(
          JSON.stringify(
            {
              entitySelector: selector,
              responseCode: err.errorParams.code,
              message: err.errorParams.message,
              details: err.errorParams.data.constraintViolations,
            },
            null,
            2
          )
        );
        oc.show();
      });
  }
}

/**
 * Resolves an `entitySelectorTemplate` into an entity selector by replacing $(entityConditions)
 * with the minimum viable selector for that type of entity.
 * @param selectorTemplate the entitySelectorTemplate to resolve
 * @param document the document where the template is found
 * @param position the position at which the template is found
 * @returns entity selector
 */
export function resolveSelectorTemplate(
  selectorTemplate: string,
  document: vscode.TextDocument,
  position: vscode.Position
): string {
  const extension = yaml.parse(document.getText()) as ExtensionStub;
  const screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());
  const parentBlocks = getParentBlocks(position.line, document.getText());

  var entityType = extension.screens![screenIdx].entityType;
  if (
    parentBlocks[parentBlocks.length - 1] === "relation" &&
    parentBlocks[parentBlocks.length - 3] === "entitiesListCards"
  ) {
    const cardIdx = getBlockItemIndexAtLine("entitiesListCards", position.line, document.getText());
    const selector = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
    if (selector) {
      entityType = selector.split("type(")[1].split(")")[0].replace('"', "");
    }
  }

  return selectorTemplate.replace("$(entityConditions)", `type("${entityType}")`);
}
