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

import * as path from "path";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { ExtensionStub } from "../../../../src/interfaces/extensionMeta";
import * as cachingUtils from "../../../../src/utils/caching";
import { updateDiagnosticsCollection, getDiagnostics } from "../../../../src/utils/diagnostics";
import { readTestDataFile } from "../../../shared/utils";
import { MockDiagnosticCollection } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

describe("Extension YAML Diagnostics", () => {
  beforeAll(() => {
    // Swap vscode DiagnosticCollection with our mock
    jest
      .spyOn(vscode.languages, "createDiagnosticCollection")
      .mockImplementation((name?: string) => new MockDiagnosticCollection(name ?? "Mock"));

    // Swap actual extension settings, with our mock that enables all diagnostics
    jest.spyOn(vscode.workspace, "getConfiguration").mockImplementation(() => {
      const settings: Record<string, unknown> = {
        "diagnostics": true,
        "diagnostics.extensionName": false,
        "diagnostics.metricKeys": true,
        "diagnostics.cardKeys": true,
        "diagnostics.variables": true,
        "diagnostics.snmp": true,
      };
      return {
        get: <T>(config: string) => settings[config] as T,
        has: jest.fn(),
        inspect: jest.fn(),
        update: jest.fn(),
      };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("updateDiagnosticsCollection", () => {
    let getCachedParsedExtensionSpy: jest.SpyInstance;

    beforeEach(() => {
      getCachedParsedExtensionSpy = jest.spyOn(cachingUtils, "getCachedParsedExtension");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should run against sample extension", async () => {
      // Diagnostics uses parsed extension from cache, so we must mock the cache
      getCachedParsedExtensionSpy.mockReturnValue(
        yaml.parse(
          readTestDataFile(path.join("manifests", "diagnostics-extension.yaml")),
        ) as ExtensionStub,
      );

      const textDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.file(
          path.resolve(
            __dirname,
            "..",
            "..",
            "test_data",
            "manifests",
            "diagnostics-extension.yaml",
          ),
        ),
      );

      await updateDiagnosticsCollection(textDocument);

      const diagnostics = getDiagnostics(textDocument.uri);

      expect(diagnostics.length).toBe(4);
    });
  });
});
