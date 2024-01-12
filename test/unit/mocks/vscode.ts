import * as vscode from "vscode";

const blankUri: vscode.Uri = {
  scheme: "",
  authority: "",
  path: "",
  query: "",
  fragment: "",
  fsPath: "",
  with: jest.fn(),
  toJSON: jest.fn(),
};

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

  extensionUri = blankUri;

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

  logUri = blankUri;

  logPath = "";

  extensionMode = 3;

  extension = {
    id: "DynatracePlatformExtensions.dynatrace-extensions",
    extensionUri: blankUri,
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
    this.globalStorageUri = { ...blankUri, fsPath: this.globalStoragePath } as vscode.Uri;
    this.storagePath = workspaceStoragePath ?? "";
    this.storageUri = { ...blankUri, fsPath: this.storagePath } as vscode.Uri;
  }
}
