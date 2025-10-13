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

import { SimulationLocation } from "@common";
import vscode from "vscode";
import { MinimalConfiguration } from "../treeViews/commands/environments";
import { getCachedEntityInstances, updateEntityInstances } from "../utils/caching";
import { getExtensionFilePath } from "../utils/fileSystem";
import { parseJSON } from "../utils/jsonParsing";

/**
 * Singleton access to ConfigurationCompletionProvider
 */
export const getConfigurationCompletionProvider = (() => {
  let instance: ConfigurationCompletionProvider | undefined;

  return () => {
    instance = instance === undefined ? new ConfigurationCompletionProvider() : instance;
    return instance;
  };
})();

/**
 * Provider for code auto-completions related to monitoring configuration files.
 */
class ConfigurationCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const completionItems: vscode.CompletionItem[] = [];
    const line = document.lineAt(position.line).text.substring(0, position.character);
    const extensionFilePath = getExtensionFilePath();
    if (!extensionFilePath) {
      return [];
    }
    const configObject: MinimalConfiguration = parseJSON(
      document.getText().replace(/^\/\/.*?$/gm, ""),
    );

    if (line.endsWith('"scope": "')) {
      switch (configObject.value.activationContext) {
        case SimulationLocation.Local:
          completionItems.push(...(await this.createLocalScopeCompletions()));
          break;
        case SimulationLocation.Remote:
          completionItems.push(...this.createRemoteScopeCompletions());
          break;
      }
    }

    return completionItems;
  }

  private async createLocalScopeCompletions(): Promise<vscode.CompletionItem[]> {
    const completions: vscode.CompletionItem[] = [];
    await updateEntityInstances(["host", "host_group"]);
    const hosts = getCachedEntityInstances("host") ?? [];
    const hostGroups = getCachedEntityInstances("host_group") ?? [];

    const localCompletion = new vscode.CompletionItem(
      "Local scope options",
      vscode.CompletionItemKind.Field,
    );
    localCompletion.insertText = new vscode.SnippetString();
    localCompletion.insertText.appendChoice([
      ...hosts.map(host => `Host ${host.displayName} (${host.entityId})`),
      ...hostGroups.map(hg => `Host group ${hg.displayName} (${hg.entityId})`),
      "environment",
    ]);

    completions.push(localCompletion);

    // management_zone

    return completions;
  }

  private createRemoteScopeCompletions(): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];

    // "ag_group"

    return completions;
  }
}
