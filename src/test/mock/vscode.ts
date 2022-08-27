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
  environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
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
