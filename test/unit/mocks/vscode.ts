import * as vscode from "vscode";

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
  logUri = new MockUri();
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

    this.storagePath = workspaceStoragePath;
    if (workspaceStoragePath) {
      this.storageUri = new MockUri(this.storagePath);
    }
  }
}
