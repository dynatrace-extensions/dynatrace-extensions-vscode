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

import { exec } from "child_process";
import * as vscode from "vscode";
import { CachedData } from "../../utils/dataCaching";
import { getLogger } from "../../utils/logging";
import { REGISTERED_PANELS, WebviewPanelManager } from "../../webviews/webviewPanel";
import { ValidationStatus } from "./selectorUtils";

const logger = getLogger("codeLens", "utils", "wmiUtils");
const ignoreProperties =
  'Select-Object -Property * -ExcludeProperty @("Scope", "Path", "Options", "Properties", ' +
  '"SystemProperties", "ClassPath", "Qualifiers", "Site", "Container", "PSComputerName", ' +
  '"__GENUS", "__CLASS", "__SUPERCLASS", "__DYNASTY", "__RELPATH", "__PROPERTY_COUNT", ' +
  '"__DERIVATION", "__SERVER", "__NAMESPACE", "__PATH")';

export interface WmiQueryResult {
  query: string;
  responseTime: string;
  error: boolean;
  errorMessage?: string;
  results: Array<Record<string, string | number>>;
}

/**
 * Runs a WMI query using PowerShell and returns the JSON format of the results
 * @param query The WMI query to run
 * @param oc The output channel to use for logging
 * @param updateCallback The callback to call when the query is complete, used to return the
 * results and status
 */
export async function runWMIQuery(
  query: string,
  oc: vscode.OutputChannel,
  panelManager: WebviewPanelManager,
  cachedData: CachedData,
  updateCallback: (query: string, status: ValidationStatus, result?: WmiQueryResult) => void,
) {
  updateCallback(query, { status: "loading" });

  // First check for cached data...
  const cachedWmiData: Record<string, WmiQueryResult> = cachedData.getCached("wmiData");
  if (Object.keys(cachedWmiData).includes(query)) {
    if (cachedWmiData[query].error) {
      updateCallback(query, { status: "invalid" });
      oc.clear();
      oc.appendLine(cachedWmiData[query].errorMessage);
      oc.show();
    } else {
      updateCallback(query, { status: "valid" });
      panelManager.render(REGISTERED_PANELS.WMI_RESULTS, "WMI query results", {
        dataType: "WMI_RESULT",
        data: cachedWmiData[query],
      });
    }
    // Otherwise, run query...
  } else {
    const command = `Get-WmiObject -Query "${query}" | ${ignoreProperties} | ConvertTo-Json`;
    const startTime = new Date();
    logger.info(`Running command: ${command}`);

    exec(
      command,
      { shell: "powershell.exe", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          logger.info(`error: ${error.message}`);
          oc.clear();
          oc.appendLine(error.message);
          oc.show();
          const responseTime = ((new Date().getTime() - startTime.getTime()) / 1000).toString();
          updateCallback(
            query,
            { status: "invalid" },
            {
              query,
              error: true,
              errorMessage: error.message,
              results: [],
              responseTime,
            },
          );
          return;
        }
        if (stderr) {
          logger.info(`stderr: ${stderr}`);
          oc.clear();
          oc.appendLine(stderr);
          oc.show();
          const responseTime = ((new Date().getTime() - startTime.getTime()) / 1000).toString();
          updateCallback(
            query,
            { status: "invalid" },
            {
              query,
              error: true,
              errorMessage: stderr,
              results: [],
              responseTime,
            },
          );
          return;
        }

        // Wrap single objects in an array for type safety
        const jsonResponse = JSON.parse(stdout.startsWith("[") ? stdout : `[${stdout}]`) as Record<
          string,
          string | number
        >[];

        const responseTime = ((new Date().getTime() - startTime.getTime()) / 1000).toString();
        const queryResult = {
          query,
          error: false,
          results: jsonResponse,
          responseTime,
        };
        panelManager.render(REGISTERED_PANELS.WMI_RESULTS, "WMI query results", {
          dataType: "WMI_RESULT",
          data: queryResult,
        });
        updateCallback(query, { status: "valid" }, queryResult);
        oc.clear();
      },
    );
  }
}
