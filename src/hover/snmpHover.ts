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

import * as path from "path";
import * as vscode from "vscode";
import { getCachedOid, updateCachedOid } from "../utils/caching";
import { getMibStoragePath } from "../utils/snmp";

let instance: SnmpHoverProvider | undefined;

/**
 * Provides singleton access to the SnmpHoverProvider
 */
export const getSnmpHoverProvider = (() => {
  return () => {
    instance = instance === undefined ? new SnmpHoverProvider() : instance;
    return instance;
  };
})();

/**
 * Simple hover provider to bring out details behind SNMP OIDs
 */
class SnmpHoverProvider implements vscode.HoverProvider {
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    // Word range generally picks up YAML node values correctly
    const hoverText = document.getText(document.getWordRangeAtPosition(position));

    if (hoverText.startsWith("oid:")) {
      // .0 ending is only used in extension manifest notation
      const oid = hoverText.endsWith(".0")
        ? hoverText.slice(4, hoverText.length - 2)
        : hoverText.slice(4);

      await updateCachedOid(oid);
      const oidInfo = getCachedOid(oid);

      if (!oidInfo) {
        return undefined;
      }

      // Build the hover content; do not assume anything exists
      if (oidInfo.objectType) {
        let hoverContent = `### ${oidInfo.objectType}\n---`;
        if (oidInfo.description) {
          hoverContent += `\n\n${oidInfo.description}`;
        }
        if (oidInfo.oid) {
          hoverContent += `\n\n**OID:** \`${oidInfo.oid}\``;
        }
        if (oidInfo.syntax) {
          // If object, expand values map
          if (oidInfo.syntax.constructor === Object) {
            const [syntax, valueMap] = Object.entries(oidInfo.syntax)[0];
            hoverContent += `\n\n**Syntax:** \`${syntax}\``;

            // Sizes is irrelevant for value mapping
            if (!Object.keys(valueMap).includes("sizes")) {
              hoverContent += "\n\n| Values map: | |\n| --- | --- |";
              Object.entries(valueMap).forEach(([k, v]) => (hoverContent += `\n| ${k} | ${v} |`));
            }
          } else {
            hoverContent += `\n\n**Syntax:** \`${oidInfo.syntax}\``;
          }
        }
        if (oidInfo.maxAccess) {
          hoverContent += `\n\n**Max access:** ${oidInfo.maxAccess}`;
        }
        if (oidInfo.source) {
          if (oidInfo.source.startsWith("http")) {
            hoverContent += `\n\n\n**Source:** [online database](${oidInfo.source})`;
          } else {
            const mibFileName = oidInfo.source.replace(/`/g, "").split("Local MIB file ")[1];
            const mibFileUri = encodeURIComponent(
              JSON.stringify([
                vscode.Uri.file(path.resolve(getMibStoragePath(), `${mibFileName}.mib`)),
              ]),
            );
            hoverContent += `\n\n\n**Source:** [${oidInfo.source}](command:vscode.open?${mibFileUri})`;
          }
        }

        const markdownString = new vscode.MarkdownString(hoverContent);
        markdownString.isTrusted = true;

        return new vscode.Hover(markdownString);
      }
    }

    return undefined;
  }
}
