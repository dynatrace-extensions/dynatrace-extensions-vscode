import * as assert from "assert";
import * as path from "path";
import * as dtExt from "../../extension";
import { existsSync, readFileSync, rmSync } from "fs";
import { testContext, testGlobalStorage, testWkspaceStorage } from "../mock/vscode";

/**
 * Simple test suite for extension tests.
 */
suite("Extension Test Suite", () => {

  /**
   * Tests the activation of the extension, along with storage creation.
   */
  test("Test extension activation", () => {
    dtExt.activate(testContext);

    const globalStoragePath = testContext.globalStorageUri.fsPath;
    const extensionWorkspacesJson = path.join(globalStoragePath, "extensionWorkspaces.json");
    const dynatraceEnvironmentsJson = path.join(globalStoragePath, "dynatraceEnvironments.json");

    assert.strictEqual(existsSync(globalStoragePath), true);
    assert.strictEqual(existsSync(extensionWorkspacesJson), true);
    assert.strictEqual(existsSync(dynatraceEnvironmentsJson), true);

    assert.strictEqual(readFileSync(extensionWorkspacesJson).toString(), "[]");
    assert.strictEqual(readFileSync(dynatraceEnvironmentsJson).toString(), "[]");

    rmSync(testGlobalStorage, { recursive: true, force: true});
    rmSync(testWkspaceStorage, { recursive: true, force: true});
  });
});
