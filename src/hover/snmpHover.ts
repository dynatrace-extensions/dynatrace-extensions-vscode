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

import * as vscode from "vscode";
import { CachedDataProducer } from "../utils/dataCaching";

/**
 * Simple hover provider to bring out details behind SNMP OIDs
 */
export class SnmpHoverProvider extends CachedDataProducer implements vscode.HoverProvider {
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover> {
    // Word range generally picks up YAML node values correctly
    const hoverText = document.getText(document.getWordRangeAtPosition(position));

    if (hoverText.startsWith("oid:")) {
      // .0 ending is only used in extension manifest notation
      const oid = hoverText.endsWith(".0")
        ? hoverText.slice(4, hoverText.length - 2)
        : hoverText.slice(4);

      await this.cachedData.updateSnmpOid(oid);
      const oidInfo = this.snmpData[oid];

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
          hoverContent += oidInfo.source.startsWith("http")
            ? `\n\n\n**Source:** [online database](${oidInfo.source})`
            : `\n\n\n**Source:** ${oidInfo.source}`;
        }

        return new vscode.Hover(new vscode.MarkdownString(hoverContent));
      }
    }
  }
}
