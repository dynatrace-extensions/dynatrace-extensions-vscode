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

import { copyFileSync, existsSync, mkdirSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CachedData } from "../utils/dataCaching";
import { getSnmpDirPath } from "../utils/fileSystem";
import { notify } from "../utils/logging";

/**
 * Implementation of a Code Lens Provider to facilitate importing custom MIBs and keeping track of
 * SNMP operations that VSCode may perform behind the scenes.
 */
export class SnmpCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private cachedData: CachedData;

  constructor(cachedData: CachedData) {
    this.cachedData = cachedData;
    this.codeLenses = [];
    this.regex = /^(snmp:)/gm;
    vscode.commands.registerCommand("dynatrace-extensions.codelens.importMib", async () => {
      await this.importFiles();
    });
  }

  async importFiles() {
    const files = await vscode.window.showOpenDialog({
      canSelectFolders: false,
      canSelectMany: true,
      title: "Select MIB files",
    });
    if (!files) {
      notify("ERROR", "No files selected. Operation cancelled.");
      return;
    }
    const newFiles = files.filter(
      f =>
        this.cachedData.mibFilesLoaded.findIndex(
          file =>
            file.name.toLowerCase() === path.basename(f.fsPath).toLowerCase() ||
            file.filePath === f.fsPath,
        ) === -1,
    );
    if (newFiles.length > 0) {
      await this.cachedData.loadLocalMibFiles(newFiles.map(f => f.fsPath)).then(() => {
        const snmpDir = getSnmpDirPath();
        if (snmpDir) {
          if (!existsSync(snmpDir)) {
            mkdirSync(snmpDir);
          }
          newFiles.forEach(file => {
            copyFileSync(file.fsPath, path.resolve(snmpDir, path.basename(file.fsPath)));
          });
        }
      });
    } else {
      notify("INFO", "Selected files have already been imported.");
    }
  }

  /**
   * Provides the actual Code Lenses.
   * @param document document where provider was invoked
   * @param token cancellation token
   * @returns list of Code Lenses
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();

    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));

      if (range) {
        // File count lens
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: `${this.cachedData.mibFilesLoaded.length} MIB files`,
            tooltip: `${this.cachedData.mibFilesLoaded.length} MIB files detected in your snmp folder`,
            command: "",
          }),
        );
        // Actions lens
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Import file",
            tooltip:
              "Import a file from your system into the extension's snmp folder and use the data.",
            command: "dynatrace-extensions.codelens.importMib",
          }),
        );
      }
    }

    return this.codeLenses;
  }
}
