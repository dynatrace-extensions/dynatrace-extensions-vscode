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
