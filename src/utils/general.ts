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

/********************************************************************************
 * UTILITIES FOR CODE PATTERNS AND ANY REUSABLE FUNCTIONS
 ********************************************************************************/

import { readFileSync } from "fs";
import { globalAgent } from "https";
import vscode from "vscode";
import logger from "./logging";

/**
 * Loop-safe function to make use of setTimeout
 */
export async function loopSafeWait(duration: number) {
  await new Promise(resolve => setTimeout(resolve, duration));
}

type WaitOptions = {
  interval?: number;
  timeout?: number;
  waitFirst?: boolean;
};

export async function waitForCondition(
  condition: () => boolean | PromiseLike<boolean> | Thenable<boolean>,
  { interval = 50, timeout = Number.POSITIVE_INFINITY, waitFirst = true }: WaitOptions = {},
): Promise<void> {
  const startTime = Date.now();

  const checkCondition = async () => {
    const result = await condition();

    if (result) {
      return;
    } else if (Date.now() - startTime >= timeout) {
      throw new Error(`Timeout after ${timeout} ms`);
    } else {
      await loopSafeWait(interval);
      return checkCondition();
    }
  };

  if (waitFirst) {
    await loopSafeWait(interval);
  }

  return checkCondition();
}

interface TenantConnectivitySettings {
  tenantUrl: string;
  disableSSLVerification?: boolean;
  certificatePath?: string;
}

/**
 * Function reads through the extension settings and sets a custom HTTPS Agent where needed.
 * @param baseUrl base URL to match against the configuration
 */
export const setHttpsAgent = (baseUrl: string) => {
  let caFile = "";
  let disableSSL = false;

  const configList = (
    vscode.workspace
      .getConfiguration("dynatraceExtensions", null)
      // The defaultValue in vscode's .get method is buggy. Returns undefined if not found.
      .get<TenantConnectivitySettings[]>("tenantConnectivitySettings", []) ?? []
  ).filter(cfg => baseUrl.startsWith(cfg.tenantUrl));

  if (configList.length > 0) {
    caFile = configList[0].certificatePath ?? "";
    disableSSL = configList[0].disableSSLVerification ?? false;

    if (caFile !== "") {
      logger.debug(
        `Using ${
          disableSSL ? "insecure connection" : `secure connection with CA "${caFile}"`
        } for URL ${baseUrl}`,
      );
      globalAgent.options.ca = [readFileSync(caFile)];
      globalAgent.options.rejectUnauthorized = !disableSSL;
    } else if (disableSSL) {
      logger.debug(`Using insecure connection for URL ${baseUrl}`);
      globalAgent.options.ca = undefined;
      globalAgent.options.rejectUnauthorized = false;
    }
  } else {
    logger.debug(`Using secure connection for URL ${baseUrl}`);
    globalAgent.options.ca = undefined;
    globalAgent.options.rejectUnauthorized = true;
  }
};
