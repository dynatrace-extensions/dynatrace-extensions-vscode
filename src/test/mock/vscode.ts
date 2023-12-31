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
import * as path from "path";
import * as os from "os";

export const testGlobalStorage = path.resolve(path.join(os.tmpdir(), "testGlobalStorage"));
export const testWkspaceStorage = path.resolve(path.join(os.tmpdir(), "testWkspaceStorage"));

export const testContext: vscode.ExtensionContext = {
  subscriptions: [],
  workspaceState: {
    keys: () => [""],
    get: () => "",
    update: (x, y) => Promise.resolve(),
  },
  globalState: {
    keys: () => [""],
    get: () => "",
    update: (x, y) => Promise.resolve(),
    setKeysForSync: () => {},
  },
  secrets: {
    get: (x) => Promise.resolve(""),
    delete: (x) => Promise.resolve(),
    store: (x, y) => Promise.resolve(),
    onDidChange: {} as vscode.Event<vscode.SecretStorageChangeEvent>,
  },
  extensionUri: vscode.Uri.file(""),
  extensionPath: "",
  environmentVariableCollection: {
    [Symbol.iterator]: () => ({} as Iterator<[string, vscode.EnvironmentVariableMutator]>),
    description: "",
    persistent: true,
    replace: (x) => {},
    append: (x) => {},
    prepend: (x) => {},
    get: (x) => ({} as vscode.EnvironmentVariableMutator),
    forEach: (x) => {},
    clear: () => {},
    delete: (x) => {},
    getScoped: (x) => ({
      [Symbol.iterator]: () => ({} as Iterator<[string, vscode.EnvironmentVariableMutator]>),
      description: "",
      persistent: true,
      replace: (x) => {},
      append: (x) => {},
      prepend: (x) => {},
      get: (x) => ({} as vscode.EnvironmentVariableMutator),
      forEach: (x) => {},
      clear: () => {},
      delete: (x) => {},
    })
  } as vscode.GlobalEnvironmentVariableCollection,
  asAbsolutePath: (x) => "",
  storageUri: vscode.Uri.file(path.join(testWkspaceStorage, "dtExtTest")),
  globalStorageUri: vscode.Uri.file(path.join(testGlobalStorage, "dtExtTest")),
  storagePath: path.join(testWkspaceStorage, "dtExtTest"),
  globalStoragePath: path.join(testGlobalStorage, "dtExtTest"),
  logUri: vscode.Uri.file(""),
  logPath: "",
  extensionMode: {} as vscode.ExtensionMode,
  extension: {} as vscode.Extension<String>,
};
