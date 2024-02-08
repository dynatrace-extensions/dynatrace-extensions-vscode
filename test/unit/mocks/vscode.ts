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

export class MockCancellationToken implements vscode.CancellationToken {
  isCancellationRequested = false;
  onCancellationRequested = jest.fn();
}

export class MockProgress implements vscode.Progress<{ message?: string; increment?: number }> {
  report = jest.fn();
}

export class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
  [key: string]: unknown;

  get<T>(section: string): T | undefined {
    return this[section] as T;
  }

  has(section: string): boolean {
    return this[section] !== undefined;
  }

  inspect = jest.fn();

  update<T>(section: string, value: T) {
    this[section] = value;
    return Promise.resolve();
  }

  constructor(state: Record<string, unknown>) {
    Object.entries(state).forEach(([key, value]) => {
      this[key] = value;
    });
  }
}

export class MockUri implements vscode.Uri {
  path;
  fsPath;
  scheme = "";
  authority = "";
  query = "";
  fragment = "";
  with = jest.fn();
  toJSON = jest.fn();

  constructor(path?: string) {
    this.path = path ?? "";
    this.fsPath = path ?? "";
  }

  toString(): string {
    return this.fsPath;
  }
}

export class MockExtensionContext implements vscode.ExtensionContext {
  workspaceState = {
    keys: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  };

  globalState = {
    keys: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    setKeysForSync: jest.fn(),
  };

  secrets = {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
    onDidChange: jest.fn(),
  };

  extensionUri = new MockUri();
  extensionPath = "";
  environmentVariableCollection = {
    getScoped: jest.fn(),
    persistent: false,
    description: "",
    get: jest.fn(),
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    [Symbol.iterator]: jest.fn(),
  };

  asAbsolutePath = jest.fn();
  storageUri;
  storagePath;
  globalStorageUri;
  globalStoragePath;
  logUri;
  logPath = "";
  extensionMode = 3;
  extension = {
    id: "DynatracePlatformExtensions.dynatrace-extensions",
    extensionUri: new MockUri(),
    extensionPath: "",
    isActive: true,
    packageJSON: {},
    extensionKind: 2,
    exports: {},
    activate: jest.fn(),
  };

  subscriptions = [];

  constructor(globalStoragePath?: string, workspaceStoragePath?: string) {
    this.globalStoragePath = globalStoragePath ?? "";
    this.globalStorageUri = new MockUri(this.globalStoragePath);
    this.logUri = new MockUri(`${this.globalStoragePath}/logs`);

    this.storagePath = workspaceStoragePath;
    if (workspaceStoragePath) {
      this.storageUri = new MockUri(this.storagePath);
    }
  }
}
