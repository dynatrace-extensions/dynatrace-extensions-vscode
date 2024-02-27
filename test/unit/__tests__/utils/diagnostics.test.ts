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

import { readFileSync } from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import * as vscode from "vscode";
import { updateDiagnosticsCollection, getDiagnostics } from "../../../../src/utils/diagnostics";

describe("Extension YAML Diagnostics", () => {
  describe("Diagnostics", () => {
    test("test running diagnostics on sample extension", async () => {
      const yamlPath = path.resolve(
        __dirname,
        "..",
        "..",
        "test_data",
        "extension_yaml",
        "diagnostics.yaml",
      );
      const extensionFile = readFileSync(yamlPath, "utf-8");
      const textDocument = await vscode.workspace.openTextDocument({
        language: "text",
        content: extensionFile,
      });
      console.log(textDocument.getText());
      updateDiagnosticsCollection(textDocument).catch(err => {
        console.log(err);
      });
      const diagnostics = getDiagnostics(textDocument.uri);
    });
  });
});
